/* ==========================================================================
   scelta.js — escolha da forma correta entre alternativas.

   É o formato do «Scegli la parola corretta» do Compito 2, e o drill certo
   para o que se decora por contraste e não por regra: `in` contra `a`,
   `il` contra `lo`, `-i` contra `-e`. Digitar não acrescenta nada aqui —
   o aluno já sabe escrever a palavra, o que ele não sabe é qual escolher.

   Várias perguntas por exercício, cada uma com id próprio: o progresso
   precisa saber que você erra `lo` e acerta `il`, não que "errou artigos".
   ========================================================================== */

import { el, speakButton } from '../render.js';
import { checkAnswer, escapeHtml } from '../check.js';
import * as speech from '../speech.js';

export default {
  type: 'scelta',

  countItems: (ex) => (ex.domande ?? []).length,

  render(item, ctx) {
    const root = el('div', { class: 'ex__body' });
    const rows = new Map();

    const ol = el('ol', { class: 'scelta' });

    for (const q of item.domande ?? []) {
      const li = el('li', { class: 'scelta__q' });

      /* O enunciado mostra a lacuna, nunca a resposta. */
      li.append(el('p', {
        class: 'scelta__testo',
        html: escapeHtml(q.testo).replace(/_{2,}/g, '<span class="gap"></span>'),
      }));

      const opts = el('div', { class: 'scelta__opzioni' });
      const buttons = [];

      for (const opzione of q.opzioni ?? []) {
        const btn = el('button', {
          class: 'opzione',
          type: 'button',
          'data-valore': opzione,
          'aria-pressed': 'false',
        }, opzione);

        btn.addEventListener('click', () => {
          /* Seleção exclusiva: marcar uma desmarca as outras da MESMA
             pergunta — por isso o loop é sobre `buttons`, não sobre o
             exercício inteiro. */
          for (const b of buttons) {
            const on = b === btn;
            b.setAttribute('aria-pressed', on ? 'true' : 'false');
            b.classList.toggle('opzione--on', on);
          }
        });

        buttons.push(btn);
        opts.append(btn);
      }

      li.append(opts);

      if (q.pt) li.append(el('p', { class: 'scelta__pt', html: q.pt }));

      const esito = el('p', { class: 'scelta__esito', hidden: true });
      li.append(esito);

      rows.set(q.id, { q, buttons, esito });
      ol.append(li);
    }

    root.append(ol);

    const send = el('button', { class: 'btn btn--primary', type: 'button' }, 'Verificar');
    send.addEventListener('click', () => ctx.submit(null));
    root.append(el('div', { class: 'ex__actions' }, send));

    const feedback = el('div', { class: 'feedback', role: 'status', 'aria-live': 'polite', hidden: true });
    root.append(feedback);

    root._parts = { rows, feedback };
    return root;
  },

  check(item, _response, root) {
    const results = [];

    for (const [id, row] of root._parts.rows) {
      const scelto = row.buttons.find((b) => b.getAttribute('aria-pressed') === 'true');
      const dato = scelto ? scelto.getAttribute('data-valore') : '';
      const r = checkAnswer(dato, row.q.risposta, { tolleranzaElisione: false });
      results.push({ id, ...row, dato, ...r });
    }

    const hits = results.filter((r) => r.correct).length;
    const score = results.length ? hits / results.length : 0;
    return { correct: score === 1, score, level: score === 1 ? 'exact' : 'partial', results };
  },

  feedback(item, result, root) {
    const { feedback } = root._parts;
    const tone = result.correct ? 'ok' : result.score >= 0.5 ? 'warn' : 'err';

    for (const r of result.results) {
      /* Marca a alternativa certa e, se houver, a errada que foi clicada.
         Ver as duas lado a lado é o que ensina o contraste. */
      for (const b of r.buttons) {
        const v = b.getAttribute('data-valore');
        b.classList.toggle('opzione--giusta', v === r.q.risposta);
        b.classList.toggle('opzione--sbagliata', !r.correct && v === r.dato && Boolean(r.dato));
        b.disabled = true;
      }

      r.esito.hidden = false;
      r.esito.className = `scelta__esito scelta__esito--${r.correct ? 'ok' : 'err'}`;
      r.esito.innerHTML = '';
      r.esito.append(
        speakButton(frase(r.q)),
        el('span', { html: r.correct
          ? (r.q.nota ?? 'Esatto.')
          : (r.dato
            ? `Você marcou <b>${escapeHtml(r.dato)}</b>. ${r.q.nota ?? ''}`
            : `Em branco. ${r.q.nota ?? ''}`) })
      );
    }

    feedback.hidden = false;
    feedback.className = `feedback feedback--${tone}`;
    feedback.innerHTML = '';
    feedback.append(
      el('div', { class: `feedback__title feedback__title--${tone}` },
        `${result.results.filter((r) => r.correct).length} de ${result.results.length} corretas`)
    );

    /* Ouvir as frases certas em sequência fecha o ciclo: o aluno acabou de
       decidir por escrito, agora escuta a forma que escolheu. */
    const tutte = result.results.map((r) => frase(r.q));
    if (tutte.length) {
      const play = el('button', { class: 'btn btn--sm', type: 'button' }, '▶︎ Ouvir todas');
      play.addEventListener('click', () => {
        speech.speakSequence(tutte.map((it) => ({ it, speaker: 'A' })));
      });
      feedback.append(play);
    }

    return feedback;
  },

  reveal(item, root) {
    for (const [, row] of root._parts.rows) {
      for (const b of row.buttons) {
        const on = b.getAttribute('data-valore') === row.q.risposta;
        b.setAttribute('aria-pressed', on ? 'true' : 'false');
        b.classList.toggle('opzione--on', on);
        b.classList.toggle('opzione--giusta', on);
      }
    }
  },
};

/** A frase completa, com a lacuna preenchida — é o que se ouve e o que
 *  fica na memória, não a alternativa solta. */
function frase(q) {
  return String(q.testo ?? '').replace(/_{2,}/g, q.risposta ?? '');
}
