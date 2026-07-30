/* ==========================================================================
   app.js — bootstrap, roteamento e montagem dos cards de exercício.

   Responsabilidades que ficam SÓ aqui:
     · carregar manifest e JSON de aula
     · montar o card em volta de cada exercício (número, chip, ações)
     · chamar check/feedback e reportar ao store
   Nenhum módulo de exercício conhece o store; nenhum conhece o roteador.
   ========================================================================== */

import * as speech from './speech.js';
import * as store from './store.js';
import { getExercise } from './exercises/index.js';
import {
  el, chip, speakButton, renderSection, renderObiettivi, renderStage,
} from './render.js';

const CONTENT = 'content/';

/* --- Fetch --------------------------------------------------------------- */

export async function loadJSON(path) {
  const res = await fetch(path, { cache: 'no-cache' });
  if (!res.ok) throw new Error(`${res.status} ao carregar ${path}`);
  return res.json();
}

/* --- Tema ---------------------------------------------------------------- */

function initTheme() {
  const saved = store.settings().theme;
  if (saved) document.documentElement.dataset.theme = saved;

  const btn = document.querySelector('[data-action="theme"]');
  if (!btn) return;

  const sync = () => {
    const current = document.documentElement.dataset.theme;
    const dark = current === 'dark'
      || (!current && window.matchMedia('(prefers-color-scheme: dark)').matches);
    btn.textContent = dark ? '☀️' : '🌙';
    btn.setAttribute('aria-label', dark ? 'Tema claro' : 'Tema escuro');
  };

  btn.addEventListener('click', () => {
    const current = document.documentElement.dataset.theme;
    const dark = current === 'dark'
      || (!current && window.matchMedia('(prefers-color-scheme: dark)').matches);
    const next = dark ? 'light' : 'dark';
    document.documentElement.dataset.theme = next;
    store.setSetting('theme', next);
    sync();
  });

  sync();
}

/* --- Banner de degradação de áudio --------------------------------------

   Caso real em alguns Linux e Android: o navegador não tem nenhuma voz
   it-IT instalada. O site continua utilizável — mas o aluno precisa saber
   por que não sai som, em vez de achar que está quebrado.               */

function initAudioBanner() {
  const slot = document.getElementById('audio-status');
  if (!slot) return;

  speech.onStatusChange((s) => {
    if (!s.ready) return;
    slot.innerHTML = '';
    if (!s.degraded) return;

    slot.append(
      el('div', { class: 'banner', role: 'alert' },
        el('span', {}, '🔇'),
        el('div', {},
          el('strong', {}, s.supported
            ? 'Nenhuma voz italiana instalada neste navegador. '
            : 'Este navegador não tem síntese de voz. '),
          el('span', { html:
            'Os exercícios continuam funcionando em <b>modo transcrição</b>: o texto aparece '
            + 'e a tarefa passa a ser de leitura e produção. Para ter áudio, instale uma voz '
            + 'italiana no sistema (no Windows: Configurações → Hora e Idioma → Voz) ou '
            + 'tente o Edge ou o Chrome.' })
        )
      )
    );
  });

  speech.voicesReady();
}

/* --- Card de exercício -------------------------------------------------- */

let exCounter = 0;

/** Zera a numeração. Chamado por quem monta uma página inteira de cards;
 *  sem isso o contador acumula entre renderizações e a segunda página
 *  começaria em "Ex. 16". */
export function resetExerciseCounter() {
  exCounter = 0;
}

/**
 * Monta o card em volta de um exercício e liga o ciclo
 * submit → check → feedback → store.record.
 *
 * opts.headTitle/headGloss/headLabel/countInIndex existem só para o
 * diálogo: ele tem título e gloss em italiano próprios (não um `consegna`
 * comum) e não deve entrar na numeração "Ex. NN" dos exercícios.
 */
export function mountExercise(item, lessonId, opts = {}) {
  const mod = getExercise(item.type);
  if (opts.countInIndex !== false) exCounter += 1;

  if (!mod) {
    return el('div', { class: 'ex' },
      el('p', {}, `Tipo de exercício não registrado: «${item.type}». Ver js/exercises/index.js.`)
    );
  }

  const card = el('div', { class: 'ex', id: item.id, 'data-type': item.type });

  const head = el('div', { class: 'ex__head' },
    el('span', { class: 'ex__num' }, opts.headLabel ?? `Ex. ${String(exCounter).padStart(2, '0')}`),
    opts.headTitle
      ? el('span', { class: 'ex__consegna' }, speakButton(opts.headTitle), ' ', el('span', { html: opts.headTitle }))
      : el('span', { class: 'ex__consegna', html: item.consegna ?? '' }),
    opts.headGloss ? el('span', { class: 'section__gloss', html: opts.headGloss }) : null,
    item.category ? chip(item.category) : null
  );
  card.append(head);

  let answered = false;

  const ctx = {
    submit(response) {
      const result = mod.check(item, response, body);

      // Um diálogo ou paradigma tem vários sub-itens; registramos cada um
      // pelo seu id para o progresso ser granular.
      if (Array.isArray(result.results) && result.results.length) {
        for (const r of result.results) {
          store.record(lessonId, r.id, { correct: r.correct, score: r.correct ? 1 : 0 });
        }
      } else {
        store.record(lessonId, item.id, { correct: result.correct, score: result.score });
      }

      card.dataset.state = result.correct
        ? (result.level === 'exact' ? 'correct' : 'partial')
        : 'wrong';

      mod.feedback?.(item, result, body);
      answered = true;
      revealBtn.disabled = false;
      window.dispatchEvent(new CustomEvent('ldi:progress'));
    },
    speak: speech.speak,
    lesson: lessonId,
  };

  const body = mod.render(item, ctx);
  card.append(body);

  const revealBtn = el('button', {
    class: 'btn btn--ghost btn--sm',
    type: 'button',
    disabled: true,
    title: 'Disponível depois de uma tentativa',
  }, 'Mostrar resposta');

  // A resposta só libera depois de tentar. Sem isso, o exercício de audição
  // vira exercício de leitura.
  revealBtn.addEventListener('click', () => {
    if (!answered) return;
    mod.reveal?.(item, body);
    revealBtn.disabled = true;
  });

  card.append(el('div', { class: 'ex__actions' }, revealBtn));
  return card;
}

/* --- Home ----------------------------------------------------------------

   A home carrega SÓ o manifest. A contagem de itens de cada aula vem do
   campo `conteggio`, gravado lá por `tools/validate.py --fix` e conferido
   pelo validador a cada rodada.

   Antes ela baixava todo `lezione-NN.json` só para contar itens: com 40
   aulas isso seria ~1,6 MB e 40 requisições a cada visita. O dado derivado
   no manifest troca isso por uma requisição só.                        */

/** Quantas aulas por bloco dobrável. 10 dá blocos que cabem numa tela. */
const BLOCO = 10;

function lessonCard(entry) {
  const prog = store.lessonProgress(entry.id, entry.conteggio ?? 0);

  return el('li', {},
    el('article', { class: 'lesson-card', 'data-completa': prog.pct === 100 ? 'true' : null },
      el('div', { class: 'lesson-card__body' },
        el('div', { class: 'lesson-card__num' }, `Lezione ${entry.numero}`),
        el('h2', { class: 'lesson-card__title' },
          speakButton(entry.titolo),
          ' ',
          el('a', { href: `lezione.html?l=${entry.id}` }, entry.titolo)
        ),
        el('p', { class: 'lesson-card__gloss' }, entry.gloss),
        el('div', { class: 'lesson-card__chips' }, ...(entry.categorie ?? []).map(chip)),
        el('ul', { class: 'lesson-card__temi' }, ...(entry.temi ?? []).map((t) => el('li', {}, t)))
      ),
      el('div', { class: 'lesson-card__foot' },
        el('div', { class: 'progress' },
          el('div', { class: 'progress__bar', style: `width:${prog.pct}%` })
        ),
        el('span', { class: 'progress__label' }, `${prog.done}/${prog.total}`)
      )
    )
  );
}

/** Card de retomada. Sem ele, com 40 aulas o aluno abre a home e tem que
 *  lembrar onde parou. */
function resumeCard(entry) {
  const prog = store.lessonProgress(entry.id, entry.conteggio ?? 0);

  return el('a', { class: 'resume', href: `lezione.html?l=${entry.id}` },
    el('div', { class: 'resume__kicker' }, '▶ Continuar'),
    el('div', { class: 'resume__title' }, `Lezione ${entry.numero} · ${entry.titolo}`),
    el('div', { class: 'resume__gloss' }, entry.gloss),
    el('div', { class: 'resume__foot' },
      el('div', { class: 'progress' },
        el('div', { class: 'progress__bar', style: `width:${prog.pct}%` })
      ),
      el('span', { class: 'progress__label' }, `${prog.done}/${prog.total}`)
    )
  );
}

/** Agrupa em blocos de BLOCO aulas, pelo `numero`. */
function blocos(lezioni) {
  const mapa = new Map();
  for (const l of lezioni) {
    const inicio = Math.floor(l.numero / BLOCO) * BLOCO;
    if (!mapa.has(inicio)) mapa.set(inicio, []);
    mapa.get(inicio).push(l);
  }
  return [...mapa.entries()].sort((a, b) => a[0] - b[0]);
}

export async function renderHome() {
  const manifest = await loadJSON(`${CONTENT}manifest.json`);
  const lezioni = manifest.lezioni ?? [];

  const grid = document.getElementById('lesson-grid');
  grid.innerHTML = '';

  /* Retomada: a última aula visitada, ou a primeira se nunca visitou. */
  const ultimaId = store.lastVisited();
  const retomar = lezioni.find((l) => l.id === ultimaId) ?? lezioni[0];

  const topo = document.getElementById('home-topo');
  if (topo) {
    topo.innerHTML = '';
    if (retomar) topo.append(resumeCard(retomar));

    // Ripasso: só aparece quando há o que revisar. Um card permanente
    // dizendo "0 itens" seria ruído toda semana.
    const vencidos = store.dueCount();
    if (vencidos > 0) {
      topo.append(
        el('a', { class: 'ripasso-call', href: 'ripasso.html' },
          el('span', { class: 'ripasso-call__n' }, String(vencidos)),
          el('span', {},
            el('strong', {}, vencidos === 1 ? 'item para revisar' : 'itens para revisar'),
            el('span', { class: 'ripasso-call__gloss' },
              ' — de todas as aulas, os que você mais erra primeiro')
          )
        )
      );
    }
  }

  const grupos = blocos(lezioni);

  for (const [inicio, aulas] of grupos) {
    const completas = aulas.filter(
      (l) => store.lessonProgress(l.id, l.conteggio ?? 0).pct === 100
    ).length;

    // Só o bloco da aula em retomada abre. Com um bloco só (início do
    // curso) ele abre de qualquer jeito, para a home não nascer vazia.
    const contemRetomada = retomar && aulas.some((l) => l.id === retomar.id);
    const aberto = grupos.length === 1 || contemRetomada;

    const fim = inicio + BLOCO - 1;
    const ul = el('ul', { class: 'lesson-grid' }, ...aulas.map(lessonCard));

    grid.append(
      el('details', { class: 'bloco', open: aberto || null, 'data-inicio': String(inicio) },
        el('summary', { class: 'bloco__head' },
          el('span', { class: 'bloco__titolo' }, `Aulas ${inicio}–${fim}`),
          el('span', { class: 'bloco__conta' }, `${completas}/${aulas.length} completas`)
        ),
        ul
      )
    );
  }
}

/**
 * Conta itens rastreáveis: sub-itens quando existem, senão o exercício.
 *
 * Esta é a conta que vai para `conteggio` no manifest — `tools/validate.py`
 * reproduz a mesma lógica e reprova se os dois divergirem. Mudou aqui,
 * mude lá.
 */
export function countItems(lesson) {
  let n = 0;
  for (const ex of lesson.esercizi ?? []) {
    if (ex.type === 'paradigm-fill') {
      for (const r of ex.righe ?? []) n += (r.nascondi ?? []).length;
    } else {
      n += 1;
    }
  }
  const detail = lesson.dialogo?.passate?.find((p) => p.focus === 'detail');
  n += detail?.domande?.length ?? 0;
  return n;
}

/* --- Página de aula ----------------------------------------------------- */

async function renderLesson() {
  resetExerciseCounter();

  const params = new URLSearchParams(location.search);
  const id = params.get('l') ?? '00';

  const manifest = await loadJSON(`${CONTENT}manifest.json`);
  const entry = manifest.lezioni.find((l) => l.id === id);
  if (!entry) throw new Error(`Aula «${id}» não existe no manifest.`);

  const lesson = await loadJSON(`${CONTENT}${entry.file}`);
  store.markVisited(id);

  document.title = `Lezione ${lesson.numero} · ${lesson.titolo}`;

  const main = document.getElementById('lesson');
  main.innerHTML = '';

  /* Cabeçalho */
  main.append(
    el('header', { class: 'lesson-header' },
      el('div', { class: 'lesson-header__chips' },
        el('span', { class: 'lesson-card__num' }, `Lezione ${lesson.numero}`),
        ...(entry.categorie ?? []).map(chip)
      ),
      el('h1', {}, speakButton(lesson.titolo), ' ', lesson.titolo),
      el('p', { class: 'lesson-header__gloss' }, lesson.gloss)
    )
  );

  const obiettivi = renderObiettivi(lesson.header);
  if (obiettivi) main.append(obiettivi);

  /* Trilha sticky — só com as etapas que a aula realmente tem */
  const stages = [
    ['riscaldamento', 'Riscaldamento', Boolean(lesson.riscaldamento)],
    ['studio', 'Studio', Boolean(lesson.sections?.length)],
    ['ascolto', 'Ascolto', Boolean(lesson.dialogo)],
    ['esercizi', 'Esercizi', Boolean(lesson.esercizi?.length)],
    ['produzione', 'Produzione', Boolean(lesson.produzione?.length)],
    ['bilancio', 'Bilancio', Boolean(lesson.bilancio?.length)],
  ].filter(([, , has]) => has);

  main.append(
    el('nav', { class: 'rail', 'aria-label': 'Etapas da aula' },
      el('ul', {}, ...stages.map(([anchor, label]) =>
        el('li', {}, el('a', { href: `#${anchor}` }, label))
      ))
    )
  );

  /* Riscaldamento */
  if (lesson.riscaldamento) {
    const r = lesson.riscaldamento;
    main.append(renderStage(
      { id: 'riscaldamento', kicker: 'Etapa 1', title: 'Riscaldamento', intro: r.prompt },
      ...(r.spiegazione ?? []).map((p) =>
        el('div', { class: 'spiegazione' }, el('p', { html: p }))
      )
    ));
  }

  /* Studio */
  if (lesson.sections?.length) {
    main.append(renderStage(
      {
        id: 'studio',
        kicker: 'Etapa 2',
        title: 'Studio',
        intro: 'Cada linha em italiano tem 🔊. Ouça antes de ler a tradução — '
             + 'e leia a explicação, não só a tabela.',
      },
      ...lesson.sections.map(renderSection)
    ));
  }

  /* Ascolto */
  if (lesson.dialogo) {
    const d = lesson.dialogo;

    // O diálogo usa o mesmo caminho de montagem dos exercícios, mas com
    // cabeçalho próprio (título+gloss em italiano, com áudio) em vez do
    // "Ex. NN" genérico — e sem entrar na numeração dos exercícios.
    main.append(renderStage(
      { id: 'ascolto', kicker: 'Etapa 3', title: 'Ascolto', intro: d.consegna ?? '' },
      mountExercise({ ...d, type: 'dialogue' }, id, {
        headLabel: 'Dialogo',
        headTitle: d.titolo,
        headGloss: d.gloss,
        countInIndex: false,
      })
    ));
  }

  /* Esercizi */
  if (lesson.esercizi?.length) {
    main.append(renderStage(
      {
        id: 'esercizi',
        kicker: 'Etapa 4',
        title: 'Esercizi',
        intro: 'A resposta só libera depois de você tentar. Use <b>Lento</b> à vontade — '
             + 'repetir não é trapaça, é o método.',
      },
      ...lesson.esercizi.map((ex) => mountExercise(ex, id))
    ));
  }

  /* Produzione */
  if (lesson.produzione?.length) {
    main.append(renderStage(
      {
        id: 'produzione',
        kicker: 'Etapa 5',
        title: 'Produzione',
        intro: 'Sem gabarito, e de propósito: aqui você produz. '
             + 'Se travar em algo, é exatamente isso que vale levar para a próxima aula.',
      },
      el('ol', { class: 'produzione' },
        ...lesson.produzione.map((p) => el('li', { id: p.id, html: p.consegna }))
      )
    ));
  }

  /* Bilancio */
  if (lesson.bilancio?.length) {
    const ul = el('ul', { class: 'bilancio' });
    const checked = new Set(store.getBilancio(id));

    lesson.bilancio.forEach((b, i) => {
      const input = el('input', { type: 'checkbox', checked: checked.has(i) || null });
      input.addEventListener('change', () => store.setBilancio(id, i, input.checked));
      ul.append(el('li', {}, el('label', {}, input, el('span', { html: b }))));
    });

    main.append(renderStage(
      {
        id: 'bilancio',
        kicker: 'Etapa 6',
        title: 'Bilancio',
        intro: 'Marque com honestidade. O que ficar desmarcado é o seu roteiro de revisão.',
      },
      ul
    ));
  }

  /* Navegação entre aulas */
  const idx = manifest.lezioni.findIndex((l) => l.id === id);
  const prev = manifest.lezioni[idx - 1];
  const next = manifest.lezioni[idx + 1];
  main.append(
    el('nav', { class: 'lesson-nav' },
      prev ? el('a', { class: 'btn', href: `lezione.html?l=${prev.id}` }, `← Lezione ${prev.numero}`) : el('span'),
      next ? el('a', { class: 'btn', href: `lezione.html?l=${next.id}` }, `Lezione ${next.numero} →`) : el('span')
    )
  );

  initRail();
}

/** Marca na trilha a etapa visível. IntersectionObserver evita listener de scroll. */
function initRail() {
  const links = [...document.querySelectorAll('.rail a')];
  const byId = new Map(links.map((a) => [a.getAttribute('href').slice(1), a]));

  const obs = new IntersectionObserver((entries) => {
    for (const e of entries) {
      if (!e.isIntersecting) continue;
      for (const a of links) a.removeAttribute('aria-current');
      byId.get(e.target.id)?.setAttribute('aria-current', 'true');
    }
  }, { rootMargin: '-30% 0px -60% 0px' });

  for (const id of byId.keys()) {
    const node = document.getElementById(id);
    if (node) obs.observe(node);
  }
}

/* --- Exportar / importar progresso -------------------------------------- */

function initDataButtons() {
  document.querySelector('[data-action="export"]')?.addEventListener('click', () => store.download());

  const importBtn = document.querySelector('[data-action="import"]');
  if (!importBtn) return;

  importBtn.addEventListener('click', () => {
    const input = el('input', { type: 'file', accept: 'application/json,.json' });
    input.addEventListener('change', async () => {
      const file = input.files?.[0];
      if (!file) return;
      try {
        store.importJSON(await file.text());
        location.reload();
      } catch (err) {
        alert(`Não foi possível importar: ${err.message}`);
      }
    });
    input.click();
  });
}

/* --- Bootstrap ---------------------------------------------------------- */

export function fail(err) {
  console.error(err);
  const slot = document.getElementById('audio-status') ?? document.body;
  slot.prepend(
    el('div', { class: 'banner banner--err', role: 'alert' },
      el('span', {}, '⚠️'),
      el('div', {},
        el('strong', {}, 'Não foi possível carregar o conteúdo. '),
        el('span', { html:
          `<code>${String(err.message ?? err)}</code><br>`
          + 'Se você abriu o arquivo com duplo clique, é isso: o navegador bloqueia '
          + '<code>fetch()</code> em <code>file://</code>. Rode <code>python -m http.server 8000</code> '
          + 'na raiz do projeto e acesse <code>http://localhost:8000</code>.' })
      )
    )
  );
}

/** Cabeçalho comum a todas as páginas: tema, banner de áudio e os botões
 *  de progresso. `ripasso.js` chama isto para não duplicar nada. */
export function initChrome() {
  initTheme();
  initAudioBanner();
  initDataButtons();
}

/**
 * Sobe a página. Quem dispara é `js/main.js` — este módulo NÃO se
 * autoinicializa de propósito: `ripasso.js` importa daqui para reusar
 * `mountExercise` e `initChrome`, e se o import trouxesse junto um
 * bootstrap, as duas páginas rodariam ao mesmo tempo e os listeners da
 * toolbar sairiam duplicados.
 */
export async function boot() {
  initChrome();

  try {
    if (document.getElementById('lesson-grid')) {
      await renderHome();
    } else if (document.getElementById('lesson')) {
      await renderLesson();
    }
  } catch (err) {
    fail(err);
  }
}
