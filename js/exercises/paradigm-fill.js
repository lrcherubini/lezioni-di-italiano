/* ==========================================================================
   paradigm-fill.js — completar células de uma tabela de paradigma.

   Gerado a partir do mesmo dado que a seção de estudo exibe: as tabelas de
   4 formas (masc/fem × sing/plur). Cada célula oculta tem id próprio, para
   o progresso saber exatamente qual forma você errou — e não só "errou o
   paradigma de brasiliano".
   ========================================================================== */

import { el, speakButton, prose } from '../render.js';
import { checkAnswer, escapeHtml } from '../check.js';

export default {
  type: 'paradigm-fill',

  /** Cada célula OCULTA é um item de progresso; as dadas são só âncora. */
  countItems: (ex) => (ex.righe ?? []).reduce((n, r) => n + (r.nascondi ?? []).length, 0),

  render(item, ctx) {
    const root = el('div', { class: 'ex__body' });
    const cells = new Map();

    const thead = el('tr', {},
      el('th', {}, 'Português'),
      ...(item.colonne ?? []).map((c) =>
        el('th', {}, el('span', { class: 'cell' }, speakButton(c), el('span', {}, c)))
      )
    );
    const tbody = el('tbody');

    for (const row of item.righe ?? []) {
      const hidden = new Set(row.nascondi ?? []);
      const tr = el('tr', { 'data-eccezione': row.eccezione ? 'true' : null });
      tr.append(el('td', { class: 'pt-col' }, row.pt ?? ''));

      (row.forme ?? []).forEach((forma, idx) => {
        if (hidden.has(idx)) {
          const id = `${row.id}-c${idx}`;
          const input = el('input', {
            type: 'text',
            autocomplete: 'off',
            autocapitalize: 'off',
            spellcheck: 'false',
            lang: 'it',
            size: '16',
            'aria-label': `${row.pt} — ${item.colonne?.[idx] ?? `coluna ${idx + 1}`}`,
          });
          cells.set(id, { input, expected: forma, row, idx });
          tr.append(el('td', {}, input));
        } else {
          // Célula dada: serve de âncora, e continua audível.
          tr.append(el('td', {},
            el('span', { class: 'cell' }, speakButton(forma), el('span', { html: forma }))
          ));
        }
      });

      if (row.nota) {
        tr.append(prose(row.nota, 'td', { class: 'item__nota' }));
      }
      tbody.append(tr);
    }

    root.append(el('div', { class: 'table-wrap' },
      el('table', { class: 'paradigma' }, el('thead', {}, thead), tbody)
    ));

    const send = el('button', { class: 'btn btn--primary', type: 'button' }, 'Verificar');
    send.addEventListener('click', () => ctx.submit(null));
    root.append(el('div', { class: 'ex__actions' }, send));

    // Enter em qualquer célula envia a tabela inteira.
    for (const [, { input }] of cells) {
      input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') ctx.submit(null);
      });
    }

    const feedback = el('div', { class: 'feedback', role: 'status', 'aria-live': 'polite', hidden: true });
    root.append(feedback);

    root._parts = { cells, feedback };
    return root;
  },

  check(item, _response, root) {
    const results = [];
    for (const [id, cell] of root._parts.cells) {
      // O artigo faz parte da resposta (l'amico, gli amici), então o
      // apóstrofo importa e a elisão NÃO é tolerada aqui.
      const r = checkAnswer(cell.input.value, cell.expected, { tolleranzaElisione: false });
      results.push({ id, ...cell, ...r });
    }
    const hits = results.filter((r) => r.correct).length;
    const score = results.length ? hits / results.length : 0;
    return { correct: score === 1, score, level: score === 1 ? 'exact' : 'partial', results };
  },

  feedback(item, result, root) {
    const { feedback } = root._parts;
    const tone = result.correct ? 'ok' : result.score >= 0.5 ? 'warn' : 'err';

    // Marca cada célula individualmente — o feedback tem que ser local.
    for (const r of result.results) {
      r.input.style.borderColor = r.correct ? 'var(--ok)' : 'var(--err)';
      r.input.style.background = r.correct ? 'var(--ok-bg)' : 'var(--err-bg)';
    }

    feedback.hidden = false;
    feedback.className = `feedback feedback--${tone}`;
    feedback.innerHTML = '';
    feedback.append(
      el('div', { class: `feedback__title feedback__title--${tone}` },
        `${result.results.filter((r) => r.correct).length} de ${result.results.length} corretas`)
    );

    const wrong = result.results.filter((r) => !r.correct);
    const noted = result.results.filter((r) => r.correct && r.nota);

    if (wrong.length) {
      const ul = el('ul', { class: 'items' });
      for (const r of wrong) {
        ul.append(el('li', { class: 'item' },
          speakButton(r.expected),
          el('span', { class: 'item__text' },
            el('span', { class: 'item__it', html: `<b>${escapeHtml(r.expected)}</b>` }),
            el('span', { class: 'item__pt' },
              `${r.row.pt} · ${item.colonne?.[r.idx] ?? ''}`,
              r.input.value ? ` — você escreveu «${r.input.value}»` : ' — em branco'
            )
          )
        ));
      }
      feedback.append(ul);
    }

    for (const r of noted) feedback.append(el('p', { html: r.nota }));

    return feedback;
  },

  reveal(item, root) {
    for (const [, cell] of root._parts.cells) {
      cell.input.value = cell.expected;
      cell.input.style.borderColor = 'var(--warn)';
      cell.input.style.background = 'var(--warn-bg)';
    }
  },
};
