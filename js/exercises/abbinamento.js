/* ==========================================================================
   abbinamento.js — associar pergunta e resposta.

   É o «Abbina domande e risposte» do Compito 1. Diferente dos outros drills,
   este não treina forma: treina reconhecer o que a pergunta pede. `Di dove
   sei?` e `Quanti anni hai?` são gramaticalmente parecidas e pedem respostas
   completamente diferentes — e é aí que o aluno A1 trava numa conversa real.

   `<select>`, não arrastar: funciona com teclado e leitor de tela, funciona
   no celular sem gesto fino, e é o único controle de associação que o DOM
   mínimo da suíte consegue exercitar de verdade.
   ========================================================================== */

import { el, speakButton } from '../render.js';
import { escapeHtml } from '../check.js';
import { mescola } from './shuffle.js';

/* Valor da opção vazia. String vazia por decisão: assim o padrão do
   `<select>` real (primeira opção) e o do DOM da suíte (`value === ''`)
   coincidem, e "não respondeu" é o mesmo estado nos dois. */
const VUOTO = '';

export default {
  type: 'abbinamento',

  countItems: (ex) => (ex.coppie ?? []).length,

  render(item, ctx) {
    const root = el('div', { class: 'ex__body' });
    const rows = new Map();

    const coppie = item.coppie ?? [];
    /* As alternativas são TODAS as respostas do exercício, embaralhadas —
       é o que obriga a ler todas antes de decidir. */
    const alternative = mescola(coppie.map((c) => c.destra), item.id ?? '');

    const ol = el('ol', { class: 'abbina' });

    for (const coppia of coppie) {
      const li = el('li', { class: 'abbina__riga' });

      li.append(el('div', { class: 'abbina__sinistra' },
        speakButton(coppia.sinistra),
        el('span', { html: coppia.sinistra })
      ));

      const select = el('select', {
        class: 'abbina__select',
        'aria-label': `Resposta para: ${coppia.sinistra}`,
      });
      select.append(el('option', { value: VUOTO }, '— escolha —'));
      for (const alt of alternative) {
        select.append(el('option', { value: alt }, alt));
      }

      li.append(select);

      const esito = el('p', { class: 'abbina__esito', hidden: true });
      li.append(esito);

      rows.set(coppia.id, { coppia, select, esito });
      ol.append(li);
    }

    root.append(ol);

    const send = el('button', { class: 'btn btn--primary', type: 'button' }, 'Verificar');
    send.addEventListener('click', () => ctx.submit(null));
    root.append(el('div', { class: 'ex__actions' }, send));

    const feedback = el('div', { class: 'feedback', role: 'status', 'aria-live': 'polite', hidden: true });
    root.append(feedback);

    root._parts = { rows, feedback, alternative };
    return root;
  },

  check(item, _response, root) {
    const results = [];

    for (const [id, row] of root._parts.rows) {
      const dato = row.select.value ?? VUOTO;
      /* Comparação literal, sem checkAnswer: o aluno não digitou nada, ele
         escolheu uma string que o próprio exercício forneceu. Tolerância de
         acento aqui só mascararia um bug de conteúdo. */
      const correct = dato !== VUOTO && dato === row.coppia.destra;
      results.push({ id, ...row, dato, correct, score: correct ? 1 : 0 });
    }

    const hits = results.filter((r) => r.correct).length;
    const score = results.length ? hits / results.length : 0;
    return { correct: score === 1, score, level: score === 1 ? 'exact' : 'partial', results };
  },

  feedback(item, result, root) {
    const { feedback } = root._parts;
    const tone = result.correct ? 'ok' : result.score >= 0.5 ? 'warn' : 'err';

    for (const r of result.results) {
      r.select.classList.toggle('abbina__select--ok', r.correct);
      r.select.classList.toggle('abbina__select--err', !r.correct);

      r.esito.hidden = false;
      r.esito.className = `abbina__esito abbina__esito--${r.correct ? 'ok' : 'err'}`;
      r.esito.innerHTML = '';
      r.esito.append(
        speakButton(r.coppia.destra),
        el('span', { html: r.correct
          ? `<b>${escapeHtml(r.coppia.destra)}</b>${r.coppia.pt ? ` — ${r.coppia.pt}` : ''}`
          : `Era <b>${escapeHtml(r.coppia.destra)}</b>${r.coppia.pt ? ` — ${r.coppia.pt}` : ''}` })
      );
    }

    feedback.hidden = false;
    feedback.className = `feedback feedback--${tone}`;
    feedback.innerHTML = '';
    feedback.append(
      el('div', { class: `feedback__title feedback__title--${tone}` },
        `${result.results.filter((r) => r.correct).length} de ${result.results.length} corretas`)
    );
    return feedback;
  },

  reveal(item, root) {
    for (const [, row] of root._parts.rows) {
      row.select.value = row.coppia.destra;
      row.select.classList.add('abbina__select--ok');
    }
  },
};
