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

/* --- Italiano dentro de prosa --------------------------------------------

   `spiegazione`, `nota.testo` e o `prompt` do riscaldamento são texto
   corrido, e até aqui eram o único lugar onde uma forma italiana aparecia
   sem 🔊 — justamente onde ela costuma aparecer pela primeira vez, dentro
   da explicação que a introduz.

   A marcação é `<it>…</it>`, e não `<em>`: `<em>` já é ênfase genérica
   neste conteúdo e cai também sobre palavra portuguesa, então pendurar
   áudio nele faria o site oferecer voz italiana para «capricho».

   A troca é feita na STRING, antes de virar nó. Tem que ser assim: o DOM
   mínimo da suíte guarda innerHTML como texto e não o parseia, então
   percorrer a árvore depois de atribuir innerHTML não acharia nada.       */

const IT_INLINE = /<it>([\s\S]*?)<\/it>/g;

function splitProse(html) {
  const parts = [];
  let last = 0;
  let m;
  IT_INLINE.lastIndex = 0;
  while ((m = IT_INLINE.exec(html)) !== null) {
    if (m.index > last) parts.push({ it: false, html: html.slice(last, m.index) });
    parts.push({ it: true, html: m[1] });
    last = m.index + m[0].length;
  }
  if (last < html.length) parts.push({ it: false, html: html.slice(last) });
  return parts;
}

/**
 * Texto corrido com áudio nas formas marcadas `<it>…</it>`.
 * Sem nenhuma marca, devolve exatamente o que devolvia antes — um nó só
 * com innerHTML, sem custo nem nó extra.
 *
 * @param {string} html conteúdo, podendo conter `<it>`
 * @param {string} tag elemento externo ('p' por padrão)
 * @param {object} attrs atributos do elemento externo
 */
export function prose(html, tag = 'p', attrs = {}) {
  const raw = String(html ?? '');
  const parts = splitProse(raw);

  if (parts.length <= 1 && !parts[0]?.it) {
    return el(tag, { ...attrs, html: raw });
  }

  return el(tag, attrs, ...parts.map((p) => {
    const plain = p.it ? stripTags(p.html).trim() : '';
    // `<it>` sem texto legível não vira botão: um 🔊 mudo é pior que nenhum.
    if (!p.it || !plain) return el('span', { html: p.html });
    return el('span', { class: 'it-inline' },
      el('span', { class: 'it-inline__text', html: p.html }),
      speakButton(stripParens(plain) || plain, { class: 'speak speak--inline' })
    );
  }));
}

export function chip(category) {
  return el('span', { class: `chip chip--${category}` }, category);
}

export function subChip(text) {
  return el('span', { class: 'chip chip--sub' }, text);
}

/* --- Blocos -------------------------------------------------------------- */

function renderLista(block) {
  const ul = el('ul', { class: 'items' });
  for (const item of block.items ?? []) {
    ul.append(
      el('li', { class: 'item' },
        speakButton(item.it),
        el('div', { class: 'item__text' },
          el('span', { class: 'item__it', html: item.it }),
          item.pt ? el('span', { class: 'item__pt', html: item.pt }) : null,
          item.nota ? prose(item.nota, 'span', { class: 'item__nota' }) : null
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

function renderContrasto(block) {
  const wrap = el('div', { class: 'contrasto' });
  for (const g of block.gruppi ?? []) {
    wrap.append(
      el('div', { class: 'contrasto__group' },
        el('div', { class: 'contrasto__head' },
          el('div', { class: 'contrasto__label', html: g.etichetta }),
          g.gloss ? el('div', { class: 'contrasto__gloss', html: g.gloss }) : null
        ),
        renderLista({ items: g.esempi })
      )
    );
  }
  return wrap;
}

function renderParadigma(block) {
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
    if (row.nota) wrap.append(prose(row.nota, 'p', { class: 'item__nota' }));
  }

  if (block.righe?.some((r) => r.eccezione)) {
    wrap.append(
      el('p', { class: 'item__nota', html: '⚠ = forma irregular; veja a nota abaixo da tabela.' })
    );
  }
  return wrap;
}

function renderNota(block) {
  const tono = block.tono ?? 'info';
  return el('aside', { class: `nota nota--${tono}`, role: 'note' },
    block.titolo ? el('div', { class: 'nota__title', html: block.titolo }) : null,
    prose(block.testo, 'div')
  );
}

const BLOCKS = {
  lista: renderLista,
  tabella: renderTabella,
  contrasto: renderContrasto,
  paradigma: renderParadigma,
  nota: renderNota,
};

export function renderBlock(block) {
  const fn = BLOCKS[block.type];
  if (!fn) {
    return el('p', { class: 'item__nota' }, `[bloco desconhecido: ${escapeHtml(block.type)}]`);
  }
  const body = fn(block);
  // Notas não levam título de bloco — elas já têm o seu próprio.
  if (block.type === 'nota') return body;
  return el('div', { class: 'block' },
    block.titolo ? el('div', { class: 'block__title', html: block.titolo }) : null,
    body
  );
}

/* --- Seção --------------------------------------------------------------- */

export function renderSection(section) {
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
    for (const p of section.spiegazione) sp.append(prose(p));
    body.append(sp);
  }

  for (const block of section.blocks ?? []) body.append(renderBlock(block));

  return el('section', { class: 'section', id: section.id }, head, body);
}

/* --- Cabeçalho de objetivos --------------------------------------------- */

export function renderObiettivi(header) {
  if (!header) return null;
  // header.comunicazione/lessico/grammatica são frases em italiano — cada
  // uma ganha 🔊, como qualquer outro texto italiano do site.
  const col = (title, items) =>
    el('div', {},
      el('h2', {}, title),
      el('ul', {}, ...(items ?? []).map((i) =>
        el('li', {}, speakButton(i), el('span', { html: i }))
      ))
    );

  return el('div', { class: 'obiettivi' },
    col('Comunicazione', header.comunicazione),
    col('Lessico', header.lessico),
    col('Grammatica', header.grammatica)
  );
}

/* --- Etapa (stage) ------------------------------------------------------- */

export function renderStage({ id, kicker, title, intro }, ...children) {
  return el('section', { class: 'stage', id },
    el('div', { class: 'stage__head' },
      el('div', { class: 'stage__kicker' }, kicker),
      el('h2', { class: 'stage__title' }, title),
      intro ? prose(intro, 'p', { class: 'stage__intro' }) : null
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
