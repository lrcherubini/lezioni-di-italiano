/* ==========================================================================
   browser.mjs — dirige um Chrome de verdade, com ZERO dependência.

   Por que existe
   --------------
   A suíte de `tests/` roda sobre um DOM escrito à mão (`tests/support/dom.mjs`)
   que **nunca interpreta CSS**. Isso deixa uma classe inteira de defeito
   invisível: o verso do flashcard já nasceu visível com `hidden: true` no JS e
   `display: flex` numa classe do CSS — 599 testes verdes, resposta na tela
   antes de o aluno tentar. `tests/css.test.mjs` cobre aquele caso lendo a
   folha como texto, o que é pouco e o próprio arquivo admite.

   Aqui a pergunta é outra: **o navegador concorda?** Layout computado, cascata
   real, `@media`, `localStorage` de verdade, erro de console de verdade.

   Por que não Playwright
   ----------------------
   O invariante 4 do CLAUDE.md vale para as ferramentas: «se a resposta para um
   problema for `npm install`, ela está errada». Playwright são ~300 MB de
   node_modules mais um runtime de navegador baixado, num projeto cuja razão de
   ser é durar dois anos sem manutenção.

   O que ele faria aqui, o Node 24 já faz sozinho: `WebSocket` é global desde o
   Node 22, e o Chrome fala **CDP** — o mesmo protocolo que o Playwright usa por
   baixo. O que se perde é a camada de conveniência (auto-wait rico, seletores
   de texto, trace viewer). O que se ganha é não ter dependência nenhuma.

   O que ele NÃO cobre, e é honesto dizer
   --------------------------------------
   · **Não é teste visual.** Não há screenshot nem comparação de pixel. Ele
     afirma propriedade computada («isto está `display:none`»), não estética.
   · **Só Chromium.** Não diz nada sobre Firefox ou Safari.
   · **O áudio não é ouvido.** Dá para afirmar que a fila do
     `speechSynthesis` foi acionada e com que voz; não que o som saiu certo.

   Uso
   ---
       import { withPage, browserPath } from './browser.mjs';
       await withPage(async (page) => {
         await page.goto('/lezione.html?l=01');
         assert.equal(await page.count('.section'), 11);
       });

   Sem Chrome instalado, `browserPath()` devolve `null` e os testes que dependem
   dele se marcam como pulados — `node tools/test.mjs` continua verde em
   qualquer máquina.
   ========================================================================== */

import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { readFile, mkdtemp, rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { extname, join, normalize, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

/* Só os tipos que o site serve. Um `octet-stream` num .js faria o módulo ser
   recusado pelo navegador, e o sintoma seria uma página em branco sem erro
   óbvio — daí a lista ser explícita em vez de heurística. */
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
};

/** Onde procurar um Chromium, em ordem, quando `CHROME` não foi definido. */
const CANDIDATOS = [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
  '/usr/bin/chromium-browser',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
];

let cache;
/**
 * @returns {string|null} caminho do navegador, ou null se não houver nenhum.
 *
 * `CHROME` no ambiente é **decisivo**: se estiver definido e não existir, a
 * resposta é `null`, não «procura outro». Cair no Chrome do sistema depois de
 * alguém ter apontado um binário específico faria o teste rodar noutro
 * navegador que não o pedido, e o relatório mentiria sobre o que foi medido.
 * `CHROME=none` é, portanto, a maneira de forçar o caminho de skip.
 */
export function browserPath() {
  if (cache !== undefined) return cache;
  const forcado = process.env.CHROME;
  cache = forcado
    ? (existsSync(forcado) ? forcado : null)
    : (CANDIDATOS.find((p) => existsSync(p)) ?? null);
  return cache;
}

/* --- Servidor estático -----------------------------------------------------
   `fetch()` de JSON não roda em `file://` por CORS, então não dá para apontar
   o navegador para o disco: o site precisa mesmo ser servido. Porta 0 = o SO
   escolhe uma livre, para dois testes em paralelo não brigarem.             */
function servir() {
  return new Promise((resolve) => {
    const s = createServer(async (req, res) => {
      let p = decodeURIComponent(req.url.split('?')[0]);
      if (p === '/') p = '/index.html';
      const alvo = join(ROOT, normalize(p).replace(/^[/\\]+/, ''));
      // Path traversal: um `..` no URL não pode escapar da raiz do projeto.
      if (!alvo.startsWith(ROOT)) { res.writeHead(403); res.end('fora da raiz'); return; }
      try {
        const corpo = await readFile(alvo);
        res.writeHead(200, { 'content-type': MIME[extname(alvo)] ?? 'application/octet-stream' });
        res.end(corpo);
      } catch {
        res.writeHead(404); res.end('não encontrado');
      }
    });
    s.listen(0, '127.0.0.1', () => resolve({ servidor: s, porta: s.address().port }));
  });
}

/* --- Cliente CDP -----------------------------------------------------------
   O Chrome anuncia o endpoint WebSocket no stderr («DevTools listening on
   ws://…»). Pedir porta 0 e ler de lá evita escolher uma porta fixa que
   poderia estar ocupada.                                                    */
function conectar(ws) {
  let seq = 0;
  const pendentes = new Map();
  const ouvintes = new Set();

  ws.addEventListener('message', (e) => {
    const m = JSON.parse(e.data);
    if (m.id && pendentes.has(m.id)) {
      const { resolve, reject } = pendentes.get(m.id);
      pendentes.delete(m.id);
      m.error ? reject(new Error(`${m.error.message} (CDP)`)) : resolve(m.result);
    } else if (m.method) {
      for (const f of ouvintes) f(m);
    }
  });

  const enviar = (method, params = {}, sessionId) => new Promise((resolve, reject) => {
    const id = ++seq;
    pendentes.set(id, { resolve, reject });
    ws.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) }));
  });

  return { enviar, ouvintes };
}

/**
 * Sobe servidor + navegador, entrega uma `page` e limpa tudo ao fim.
 *
 * @param {(page: Page) => Promise<void>} fn
 * @param {{viewport?: [number, number], theme?: 'dark'|'light'}} [opts]
 */
export async function withPage(fn, opts = {}) {
  const exe = browserPath();
  if (!exe) throw new Error('nenhum Chromium encontrado — defina CHROME=/caminho/do/chrome');

  const { servidor, porta } = await servir();
  const perfil = await mkdtemp(join(tmpdir(), 'ldi-cdp-'));

  const chrome = spawn(exe, [
    '--headless=new',
    '--remote-debugging-port=0',
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-gpu',
    '--disable-dev-shm-usage',
    // Sem isto o Chrome pode adiar timers de aba em segundo plano e o
    // `waitFor` expiraria sem o site ter culpa nenhuma.
    '--disable-background-timer-throttling',
    `--user-data-dir=${perfil}`,
    'about:blank',
  ], { stdio: ['ignore', 'ignore', 'pipe'] });

  let ws;
  try {
    const wsUrl = await new Promise((resolve, reject) => {
      let buf = '';
      const t = setTimeout(() => reject(new Error('o Chrome não anunciou o DevTools em 20s')), 20_000);
      chrome.on('error', (e) => { clearTimeout(t); reject(e); });
      chrome.stderr.on('data', (d) => {
        buf += d;
        const m = buf.match(/ws:\/\/\S+/);
        if (m) { clearTimeout(t); resolve(m[0]); }
      });
    });

    ws = new WebSocket(wsUrl);
    await new Promise((resolve, reject) => {
      ws.addEventListener('open', resolve, { once: true });
      ws.addEventListener('error', () => reject(new Error('WebSocket do CDP recusou')), { once: true });
    });

    const { enviar, ouvintes } = conectar(ws);
    const { targetId } = await enviar('Target.createTarget', { url: 'about:blank' });
    const { sessionId } = await enviar('Target.attachToTarget', { targetId, flatten: true });

    await enviar('Page.enable', {}, sessionId);
    await enviar('Runtime.enable', {}, sessionId);

    const erros = [];
    ouvintes.add((m) => {
      if (m.sessionId !== sessionId) return;
      // Erro de verdade: exceção não capturada, ou console.error.
      if (m.method === 'Runtime.exceptionThrown') {
        erros.push(m.params.exceptionDetails.exception?.description
          ?? m.params.exceptionDetails.text);
      } else if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') {
        erros.push(m.params.args.map((a) => a.value ?? a.description ?? '?').join(' '));
      }
    });

    const page = criarPage({ enviar, sessionId, porta, erros });

    if (opts.viewport) await page.viewport(...opts.viewport);
    if (opts.theme) await page.tema(opts.theme);

    await fn(page);
  } finally {
    try { ws?.close(); } catch { /* já fechado */ }
    chrome.kill();
    servidor.close();
    await rm(perfil, { recursive: true, force: true }).catch(() => {});
  }
}

/**
 * @typedef {ReturnType<typeof criarPage>} Page
 */
function criarPage({ enviar, sessionId, porta, erros }) {
  const cdp = (m, p) => enviar(m, p, sessionId);

  /** Avalia expressão no navegador e devolve o valor por cópia. */
  async function avaliar(expr) {
    const r = await cdp('Runtime.evaluate', {
      expression: expr, returnByValue: true, awaitPromise: true,
    });
    if (r.exceptionDetails) {
      throw new Error(`erro ao avaliar no navegador: ${r.exceptionDetails.text} — ${expr.slice(0, 80)}`);
    }
    return r.result.value;
  }

  /* Espera ativa em vez de `setTimeout` fixo. Sleep fixo é a origem número um
     de teste intermitente: curto demais falha em máquina lenta, longo demais
     faz a suíte arrastar. */
  async function esperar(expr, { timeout = 10_000, intervalo = 50 } = {}) {
    const limite = Date.now() + timeout;
    let ultimo;
    for (;;) {
      try {
        ultimo = await avaliar(expr);
        if (ultimo) return ultimo;
      } catch (e) { ultimo = e.message; }
      if (Date.now() > limite) {
        throw new Error(`esperei ${timeout}ms e «${expr.slice(0, 70)}» não ficou verdadeiro (último: ${JSON.stringify(ultimo)?.slice(0, 80)})`);
      }
      await new Promise((r) => setTimeout(r, intervalo));
    }
  }

  return {
    /** Navega e espera o site ter montado o `<main>`. */
    async goto(caminho, { esperarPor = 'document.querySelector("main")?.children.length > 0' } = {}) {
      erros.length = 0;
      await cdp('Page.navigate', { url: `http://127.0.0.1:${porta}${caminho}` });
      await esperar('document.readyState === "complete"');
      if (esperarPor) await esperar(esperarPor);
    },

    eval: avaliar,
    esperar,

    /** Quantos elementos casam com o seletor. */
    count: (sel) => avaliar(`document.querySelectorAll(${JSON.stringify(sel)}).length`),

    /** Texto do primeiro casamento, ou null. */
    text: (sel) => avaliar(`document.querySelector(${JSON.stringify(sel)})?.textContent?.trim() ?? null`),

    /** Propriedade **computada** — o ponto cego inteiro do DOM da suíte. */
    css: (sel, prop) => avaliar(
      `(() => { const e = document.querySelector(${JSON.stringify(sel)});
         return e ? getComputedStyle(e).getPropertyValue(${JSON.stringify(prop)}) : null; })()`
    ),

    /**
     * Quantos elementos do seletor estão **realmente renderizados**.
     *
     * Use isto, não `getComputedStyle(e).display !== 'none'`. `display` é
     * propriedade do próprio elemento e **não herda**: um filho de um pai
     * `display:none` continua computando `display:block`, e uma asserção
     * ingênua conclui que a transcrição do diálogo está na tela quando o
     * contêiner inteiro está oculto. Custou quatro falhas falsas para
     * aparecer. `checkVisibility()` é a pergunta certa.
     */
    visiveis: (sel) => avaliar(
      `[...document.querySelectorAll(${JSON.stringify(sel)})].filter((e) => e.checkVisibility()).length`
    ),

    click: (sel) => avaliar(
      `(() => { const e = document.querySelector(${JSON.stringify(sel)});
         if (!e) throw new Error('sem elemento: ' + ${JSON.stringify(sel)});
         e.click(); return true; })()`
    ),

    /** Preenche um campo disparando o `input` que o site escuta. */
    fill: (sel, valor) => avaliar(
      `(() => { const e = document.querySelector(${JSON.stringify(sel)});
         if (!e) throw new Error('sem campo: ' + ${JSON.stringify(sel)});
         e.value = ${JSON.stringify(valor)};
         e.dispatchEvent(new Event('input', { bubbles: true }));
         return true; })()`
    ),

    viewport: (largura, altura) => cdp('Emulation.setDeviceMetricsOverride', {
      width: largura, height: altura, deviceScaleFactor: 1, mobile: largura < 500,
    }),

    tema: (valor) => cdp('Emulation.setEmulatedMedia', {
      features: [{ name: 'prefers-color-scheme', value: valor }],
    }),

    midia: (valor) => cdp('Emulation.setEmulatedMedia', { media: valor }),

    /** Erros de console e exceções desde o último `goto`. */
    erros: () => [...erros],

    /**
     * Troca `speechSynthesis.getVoices` **antes** de qualquer script da página
     * rodar. É como se testa o modo degradado sem depender da máquina: em
     * `Page.addScriptToEvaluateOnNewDocument` o script entra antes do site.
     */
    vozes(lista) {
      return cdp('Page.addScriptToEvaluateOnNewDocument', {
        source: `(() => {
          const vs = ${JSON.stringify(lista)}.map((v) => ({ ...v, default: false, localService: true, voiceURI: v.name }));
          Object.defineProperty(window.speechSynthesis, 'getVoices', { value: () => vs, configurable: true });
          window.speechSynthesis.dispatchEvent?.(new Event('voiceschanged'));
        })();`,
      });
    },
  };
}
