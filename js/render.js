/* ==========================================================================
   render.js — renderiza o conteúdo de estudo (não os exercícios).
   Seções, chips, blocos, tabelas, paradigmas e notas.

   Todo texto italiano ganha um botão 🔊. Foi decisão explícita de design:
   é exatamente o afordance que falta no material de áudio comercial.
   ========================================================================== */

import * as speech from './speech.js';
import { escapeHtml } from './check.js';

/* --- Helpers ------------------------------------------------------------- */

export function el(tag, attrs = {}, ...children) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === null || v === undefined || v === false) continue;
    if (k === 'class') node.className = v;
    else if (k === 'html') node.innerHTML = v;
    else if (k.startsWith('on') && typeof v === 'function') node.addEventListener(k.slice(2).toLowerCase(), v);
    else node.setAttribute(k, v === true ? '' : String(v));
  }
  for (const c of children.flat()) {
    if (c === null || c === undefined || c === false) continue;
    node.append(typeof c === 'string' || typeof c === 'number' ? String(c) : c);
  }
  return node;
}

/** Botão de áudio. O texto pode conter marcação — speech.js a remove. */
export function speakButton(text, opts = {}) {
  const label = opts.label ?? `Ouvir: ${stripTags(text)}`;
  const btn = el('button', {
    class: opts.class ?? 'speak',
    type: 'button',
    'aria-label': label,
    title: 'Ouvir',
  }, '🔊');

  btn.addEventListener('click', () => {
    speech.speak(text, {
      speaker: opts.speaker,
      onStart: () => btn.setAttribute('data-speaking', 'true'),
      onEnd: () => btn.removeAttribute('data-speaking'),
    });
  });
  return btn;
}

function stripTags(s) {
  return String(s).replace(/<[^>]*>/g, '');
}

/** Remove asides entre parênteses do texto a ser falado. Neste conteúdo,
 *  parênteses guardam sempre glosa em português ou abreviação (masc./fem.),
 *  nunca conteúdo italiano que precise ser ouvido — por isso é seguro
 *  aplicar isso a qualquer célula antes de gerar o áudio. */
function stripParens(text) {
  return text.replace(/\s*\([^)]*\)/g, '').replace(/\s+/g, ' ').trim();
}

/** Normaliza uma célula de tabella: string simples = italiano (ganha 🔊);
 *  { html, pt: true } = não-italiano (cabeçalho/descrição em português),
 *  sem botão. Ver CLAUDE.md. */
function normalizeCell(cell) {
  if (cell && typeof cell === 'object') return { html: cell.html ?? '', pt: Boolean(cell.pt) };
  return { html: cell ?? '', pt: false };
}

function cellPlainText(cell) {
  return stripTags(normalizeCell(cell).html).trim();
}

function renderCell(tag, cell) {
  const c = normalizeCell(cell);
  const plain = stripTags(c.html).trim();
  if (c.pt || !plain) return el(tag, { html: c.html });
  const spoken = stripParens(plain) || plain;
  return el(tag, {}, el('span', { class: 'cell' }, speakButton(spoken), el('span', { html: c.html })));
}

/* --- Prosa bilíngue -------------------------------------------------------

   `spiegazione`, `nota.testo`, `consegna`, `bilancio` e companhia são texto
   corrido — e o único lugar onde a língua minoritária aparecia sem 🔊.

   A regra é uma só, a mesma do `pt: true` das tabelas: **marque a minoria.**
   O que muda de aula para aula é QUEM é a minoria, e é isso que o `modo`
   diz. O curso caminha do português para o italiano:

     modo 'pt'            prosa é portuguesa  → marque italiano com <it>
     modo 'misto' | 'it'  prosa é italiana    → marque português com <pt>

   A tag da língua majoritária é inerte no modo em que ela é maioria: escrever
   <it> numa aula em modo 'it' é redundante, e o validador reprova para não
   deixar a intenção ambígua.

   `<pt>` NUNCA ganha botão, e isso não é esquecimento. Uma voz italiana
   monolíngue leria português com fonologia italiana; uma multilíngue faria a
   troca de idioma por detecção de conteúdo, que é o bug de produção
   documentado lá em cima em speech.js. O desenho é seguro porque nunca faz
   ao speech.js uma pergunta que ele não sabe responder — não existe voz
   portuguesa neste site, por decisão.

   A afordância de áudio muda de UNIDADE junto com o modo, porque a unidade
   de estudo muda. Em modo 'pt' a prosa *cita* uma forma: botão por forma,
   depois dela. Em modo italiano a prosa *é* o insumo: um botão por parágrafo,
   antes dele, falando só os trechos não-portugueses.

   A troca é feita na STRING, antes de virar nó. Tem que ser assim: o DOM
   mínimo da suíte guarda innerHTML como texto e não o parseia, então
   percorrer a árvore depois de atribuir innerHTML não acharia nada.       */

const IT_INLINE = /<it>([\s\S]*?)<\/it>/g;
const PT_INLINE = /<pt>([\s\S]*?)<\/pt>/g;

/** Prosa em italiano? `misto` e `it` renderizam igual — a diferença entre
 *  eles é editorial (quanto português sobra), não mecânica. */
const proseIsItalian = (modo) => modo === 'it' || modo === 'misto';

/**
 * Fatia o texto em trechos, marcando qual é da língua MINORITÁRIA daquele
 * modo. `minoria: true` = o trecho veio de dentro da tag viva.
 */
function splitProse(html, modo) {
  const re = proseIsItalian(modo) ? PT_INLINE : IT_INLINE;
  const parts = [];
  let last = 0;
  let m;
  re.lastIndex = 0;
  while ((m = re.exec(html)) !== null) {
    if (m.index > last) parts.push({ minoria: false, html: html.slice(last, m.index) });
    parts.push({ minoria: true, html: m[1] });
    last = m.index + m[0].length;
  }
  if (last < html.length) parts.push({ minoria: false, html: html.slice(last) });
  return parts;
}

/**
 * Texto corrido com áudio na língua-alvo.
 *
 * @param {string} html conteúdo, podendo conter `<it>` ou `<pt>`
 * @param {string} tag elemento externo ('p' por padrão)
 * @param {object} attrs atributos do elemento externo
 * @param {'pt'|'misto'|'it'} modo língua da prosa; default 'pt'
 */
export function prose(html, tag = 'p', attrs = {}, modo = 'pt') {
  const raw = String(html ?? '');
  const parts = splitProse(raw, modo);

  return proseIsItalian(modo)
    ? proseItaliana(parts, raw, tag, attrs)
    : prosePortoghese(parts, raw, tag, attrs);
}

/** Modo 'pt': a minoria é italiana e ganha botão próprio, depois do texto. */
function prosePortoghese(parts, raw, tag, attrs) {
  if (parts.length <= 1 && !parts[0]?.minoria) {
    // Sem marca nenhuma, devolve o mesmo nó de sempre: sem custo, sem nó
    // extra, e sem quebrar nenhum teste anterior à existência do modo.
    return el(tag, { ...attrs, html: raw });
  }

  return el(tag, attrs, ...parts.map((p) => {
    const plain = p.minoria ? stripTags(p.html).trim() : '';
    // `<it>` sem texto legível não vira botão: um 🔊 mudo é pior que nenhum.
    if (!p.minoria || !plain) return el('span', { html: p.html });
    return el('span', { class: 'it-inline' },
      el('span', { class: 'it-inline__text', html: p.html }),
      speakButton(stripParens(plain) || plain, { class: 'speak speak--inline' })
    );
  }));
}

/** Modo italiano: um botão para o parágrafo, falando só o que não é `<pt>`. */
function proseItaliana(parts, raw, tag, attrs) {
  const falado = parts
    .filter((p) => !p.minoria)
    .map((p) => stripParens(stripTags(p.html).trim()))
    .filter(Boolean)
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();

  const corpo = parts.map((p) => (p.minoria
    ? el('span', { class: 'pt-inline', html: p.html })
    : el('span', { html: p.html })));

  // Parágrafo inteiramente português (uma nota de compreensão, por exemplo)
  // não recebe botão — não há italiano para ouvir.
  if (!falado) return el(tag, attrs, ...corpo);

  return el(tag, attrs,
    speakButton(falado, { class: 'speak speak--para' }),
    ...corpo
  );
}

export function chip(category) {
  return el('span', { class: `chip chip--${category}` }, category);
}

export function subChip(text) {
  return el('span', { class: 'chip chip--sub' }, text);
}

/* --- Blocos -------------------------------------------------------------- */

function renderLista(block, modo = 'pt') {
  const ul = el('ul', { class: 'items' });
  for (const item of block.items ?? []) {
    ul.append(
      el('li', { class: 'item' },
        speakButton(item.it),
        el('div', { class: 'item__text' },
          el('span', { class: 'item__it', html: item.it }),
          item.pt ? el('span', { class: 'item__pt', html: item.pt }) : null,
          item.nota ? prose(item.nota, 'span', { class: 'item__nota' }, modo) : null
        )
      )
    );
  }
  return ul;
}

function renderTabella(block) {
  const heads = block.intestazioni ?? [];
  const hasHeads = heads.some((h) => cellPlainText(h));

  const thead = hasHeads
    ? el('thead', {}, el('tr', {}, ...heads.map((h) => renderCell('th', h))))
    : null;

  const tbody = el('tbody');
  for (const row of block.righe ?? []) {
    tbody.append(el('tr', {}, ...row.map((cell) => renderCell('td', cell))));
  }

  return el('div', { class: 'table-wrap' }, el('table', {}, thead, tbody));
}

function renderContrasto(block, modo = 'pt') {
  const wrap = el('div', { class: 'contrasto' });
  for (const g of block.gruppi ?? []) {
    wrap.append(
      el('div', { class: 'contrasto__group' },
        el('div', { class: 'contrasto__head' },
          el('div', { class: 'contrasto__label', html: g.etichetta }),
          g.gloss ? el('div', { class: 'contrasto__gloss', html: g.gloss }) : null
        ),
        renderLista({ items: g.esempi }, modo)
      )
    );
  }
  return wrap;
}

function renderParadigma(block, modo = 'pt') {
  const thead = el('tr', {},
    el('th', {}, 'Português'),
    ...(block.colonne ?? []).map((c) =>
      el('th', {}, el('span', { class: 'cell' }, speakButton(c), el('span', {}, c)))
    )
  );

  const tbody = el('tbody');
  for (const row of block.righe ?? []) {
    const tr = el('tr', { 'data-eccezione': row.eccezione ? 'true' : null });
    tr.append(el('td', { class: 'pt-col' }, row.pt ?? ''));
    for (const forma of row.forme ?? []) {
      tr.append(
        el('td', {},
          el('span', { class: 'cell' }, speakButton(forma), el('span', { html: forma }))
        )
      );
    }
    tbody.append(tr);
  }

  const table = el('table', { class: 'paradigma' }, el('thead', {}, thead), tbody);
  const wrap = el('div', { class: 'table-wrap' }, table);

  for (const row of block.righe ?? []) {
    if (row.nota) wrap.append(prose(row.nota, 'p', { class: 'item__nota' }, modo));
  }

  if (block.righe?.some((r) => r.eccezione)) {
    wrap.append(
      el('p', { class: 'item__nota', html: '⚠ = forma irregular; veja a nota abaixo da tabela.' })
    );
  }
  return wrap;
}

function renderNota(block, modo = 'pt') {
  const tono = block.tono ?? 'info';
  return el('aside', { class: `nota nota--${tono}`, role: 'note' },
    block.titolo ? el('div', { class: 'nota__title', html: block.titolo }) : null,
    prose(block.testo, 'div', {}, modo)
  );
}

const BLOCKS = {
  lista: renderLista,
  tabella: renderTabella,
  contrasto: renderContrasto,
  paradigma: renderParadigma,
  nota: renderNota,
};

export function renderBlock(block, modo = 'pt') {
  const fn = BLOCKS[block.type];
  if (!fn) {
    return el('p', { class: 'item__nota' }, `[bloco desconhecido: ${escapeHtml(block.type)}]`);
  }
  const body = fn(block, modo);
  // Notas não levam título de bloco — elas já têm o seu próprio.
  if (block.type === 'nota') return body;
  return el('div', { class: 'block' },
    block.titolo ? el('div', { class: 'block__title', html: block.titolo }) : null,
    body
  );
}

/* --- Seção --------------------------------------------------------------- */

export function renderSection(section, modo = 'pt') {
  const head = el('div', { class: 'section__head' },
    el('div', { class: 'section__chips' },
      chip(section.category),
      section.sottotitolo ? subChip(section.sottotitolo) : null
    ),
    el('h3', { class: 'section__titolo' },
      speakButton(section.titolo),
      el('span', { html: section.titolo })
    ),
    section.gloss ? el('div', { class: 'section__gloss', html: section.gloss }) : null
  );

  const body = el('div', { class: 'section__body' });

  // A explicação vem primeiro: é o que torna o site independente dos slides.
  if (section.spiegazione?.length) {
    const sp = el('div', { class: 'spiegazione' });
    for (const p of section.spiegazione) sp.append(prose(p, 'p', {}, modo));
    body.append(sp);
  }

  for (const block of section.blocks ?? []) body.append(renderBlock(block, modo));

  return el('section', { class: 'section', id: section.id }, head, body);
}

/* --- Cabeçalho de objetivos --------------------------------------------- */

export function renderObiettivi(header) {
  if (!header) return null;
  // header.comunicazione/lessico/grammatica são frases em italiano — cada
  // uma ganha 🔊, como qualquer outro texto italiano do site.
  //
  // O item é string OU { it, sezione }, o mesmo idioma da célula de tabella.
  // Com `sezione` o texto vira link para o ponto da página: este bloco é o
  // sumário da aula, e sumário que não leva a lugar nenhum é texto morto.
  // O 🔊 fica FORA do link — clicar no alto-falante toca o áudio, não navega.
  const col = (title, items) =>
    el('div', {},
      el('h2', {}, title),
      el('ul', {}, ...(items ?? []).map((raw) => {
        const it = typeof raw === 'string' ? raw : raw.it;
        const alvo = typeof raw === 'string' ? null : raw.sezione;
        return el('li', {},
          speakButton(it),
          alvo
            ? el('a', { class: 'obiettivi__link', href: `#${alvo}`, html: it })
            : el('span', { html: it })
        );
      }))
    );

  return el('div', { class: 'obiettivi' },
    col('Comunicazione', header.comunicazione),
    col('Lessico', header.lessico),
    col('Grammatica', header.grammatica)
  );
}

/* --- Frasi utili: chunks agrupados por intenção comunicativa ------------- */

/** As funções agrupam chunks POR REFERÊNCIA de id, nunca copiando o texto.
 *  `chunks` continua sendo o inventário lexical único da aula — se o texto
 *  fosse duplicado aqui, uma edição no chunk deixaria o agrupamento mentindo,
 *  e um id repetido misturaria dois históricos de progresso.
 *
 *  Nada aqui grava progresso: `funzioni` é leitura organizada, e é o baralho
 *  logo abaixo que testa a recuperação. */
export function renderFunzioni(lesson, modo = 'pt', notebook = null) {
  if (!lesson?.funzioni?.length) return null;

  const perId = new Map((lesson.chunks ?? []).map((c) => [c.id, c]));

  const cards = lesson.funzioni.map((f) => {
    const righe = (f.chunks ?? [])
      .map((cid) => perId.get(cid))
      .filter(Boolean)
      .map((c) => el('li', { class: 'funzione__riga' },
        speakButton(c.it),
        el('span', { class: 'funzione__it', html: `<b>${escapeHtml(c.it)}</b>` }),
        el('span', { class: 'funzione__pt', html: c.pt ?? '' }),
        notebook ? notebookToggle(c, notebook) : null
      ));

    return el('section', { class: 'funzione', id: f.id },
      el('div', { class: 'funzione__head' },
        f.figura ? figuraFor(f.figura, f.gloss ?? f.quando) : null,
        el('h3', { class: 'funzione__quando' },
          speakButton(f.quando),
          el('span', { html: f.quando })
        ),
        f.gloss ? el('p', { class: 'funzione__gloss', html: f.gloss }) : null
      ),
      el('ul', { class: 'funzione__righe' }, ...righe)
    );
  });

  return el('div', { class: 'funzioni' }, ...cards);
}

/**
 * Botão de guardar no caderno, idêntico ao do verso do flashcard.
 *
 * Aqui ele é visível de saída — não atrás de um «Mostrar». É a porta de
 * entrada do caderno: era o único ponto do site que sabia guardar uma forma,
 * e nascia escondido, o que fazia o caderno parecer não existir.
 *
 * O `notebook` vem por parâmetro, como no `ctx` dos exercícios: render.js
 * não fala com o store — quem grava é o app.js.
 */
function notebookToggle(chunk, notebook) {
  const dentro = () => Boolean(notebook.has?.(chunk.id));
  const rotulo = (on) => (on ? '✓ no caderno' : '＋ caderno');

  const btn = el('button', {
    class: 'btn btn--sm btn--ghost funzione__caderno',
    type: 'button',
    'aria-pressed': dentro() ? 'true' : 'false',
    title: `Guardar «${chunk.it}» para escrever uma frase sua`,
  }, rotulo(dentro()));

  btn.addEventListener('click', () => {
    const on = Boolean(notebook.toggle?.(chunk));
    btn.setAttribute('aria-pressed', on ? 'true' : 'false');
    btn.textContent = rotulo(on);
  });

  return btn;
}

/** Mesma regra do flashcard: emoji por padrão, SVG inline por exceção, e
 *  sempre `role="img"` com a glossa portuguesa como nome acessível. */
function figuraFor(fig, label) {
  const node = el('div', { class: 'funzione__figura', role: 'img', 'aria-label': label });
  if (String(fig).trimStart().startsWith('<svg')) node.innerHTML = fig;
  else node.textContent = fig;
  return node;
}

/* --- Etapa (stage) ------------------------------------------------------- */

export function renderStage({ id, kicker, title, intro, modo = 'pt' }, ...children) {
  return el('section', { class: 'stage', id },
    el('div', { class: 'stage__head' },
      el('div', { class: 'stage__kicker' }, kicker),
      el('h2', { class: 'stage__title' }, title),
      intro ? prose(intro, 'p', { class: 'stage__intro' }, modo) : null
    ),
    ...children
  );
}

/* --- Player compartilhado ------------------------------------------------ */

/**
 * Barra de áudio com repetição e controle de velocidade.
 * Corrige as três falhas documentadas de players de curso: sem controle de
 * velocidade, sem repetir, sem repetir UM trecho.
 */
export function audioBar({ onPlay, extra = [], playLabel = 'Ouvir' }) {
  const bar = el('div', { class: 'player' });

  const play = el('button', { class: 'btn btn--primary', type: 'button' }, `▶ ${playLabel}`);
  const again = el('button', { class: 'btn', type: 'button', title: 'Ouvir de novo' }, '↻ De novo');
  const stop = el('button', { class: 'btn btn--ghost', type: 'button', title: 'Parar' }, '■');

  play.addEventListener('click', () => onPlay(speech.getRate()));
  again.addEventListener('click', () => onPlay(speech.getRate()));
  stop.addEventListener('click', () => speech.cancel());

  const rates = el('div', { class: 'player__rate', role: 'group', 'aria-label': 'Velocidade' });
  const buttons = [];
  for (const [label, value] of [['Lento', speech.RATES.lento], ['Normal', speech.RATES.normale]]) {
    const b = el('button', {
      class: 'btn btn--sm',
      type: 'button',
      'aria-pressed': speech.getRate() === value ? 'true' : 'false',
    }, label);
    b.addEventListener('click', () => {
      speech.setRate(value);
      for (const other of buttons) other.setAttribute('aria-pressed', 'false');
      b.setAttribute('aria-pressed', 'true');
    });
    buttons.push(b);
    rates.append(b);
  }

  bar.append(play, again, stop, ...extra, rates);
  return bar;
}
