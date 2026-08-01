/* ==========================================================================
   flashcard.js — revisão do léxico da aula, com autoavaliação.

   O baralho sai dos `chunks` da própria aula. Até aqui esse array existia em
   todo `content/lezione-NN.json` e **nada em js/ o lia** — era inventário
   catalogado e nunca usado. É o que este tipo resolve.

   Duas decisões que valem explicar:

   1. **O aluno se autoavalia.** Não há campo de digitação. Um flashcard mede
      *recuperação de memória*, e digitar mede ortografia — que já é medida
      em toda a outra metade do site. Pedir para digitar aqui transformaria
      uma revisão de trinta segundos numa sessão de dez minutos, e o aluno
      pararia de fazer. A honestidade da autoavaliação é problema do aluno,
      e ele é o único usuário: não há nota, não há ranking, mentir só
      atrapalha ele mesmo.

   2. **Frente em português, verso em italiano.** É a direção difícil
      (produção), não a fácil (reconhecimento). Ver `il ceco` e lembrar «o
      tcheco» é quase automático para lusófono; o caminho inverso é o que
      trava numa conversa.

   Só `word`, `collocation` e `fixed` entram — `semiFixed` tem lacuna por
   definição (`Io sono ___`) e não tem verso. Ele é matéria do slot-frame.
   ========================================================================== */

import { el, speakButton } from '../render.js';
import { escapeHtml } from '../check.js';
import * as speech from '../speech.js';

/** chunkTypes que viram carta. Ver CLAUDE.md. */
export const TIPI_CARTA = new Set(['word', 'collocation', 'fixed']);

export default {
  type: 'flashcard',

  subItemIds: (ex) => (ex.carte ?? []).map((c) => c.id),

  render(item, ctx) {
    const root = el('div', { class: 'ex__body' });
    const rows = new Map();

    const ol = el('ol', { class: 'carte' });

    for (const carta of item.carte ?? []) {
      const li = el('li', { class: 'carta' });

      // Frente: o português. Sem 🔊 — não existe voz portuguesa aqui.
      li.append(el('p', { class: 'carta__pt', html: carta.pt ?? '' }));

      // Verso: escondido até o aluno tentar lembrar. Se aparecesse junto,
      // não haveria recuperação nenhuma — só leitura.
      const verso = el('p', { class: 'carta__it', hidden: true },
        speakButton(carta.it),
        el('span', { html: `<b>${escapeHtml(carta.it)}</b>` })
      );

      const mostrar = el('button', { class: 'btn btn--sm', type: 'button' }, '👁 Mostrar');
      const sbagliato = el('button', {
        class: 'btn btn--sm carta__voto', type: 'button',
        'data-voto': 'no', 'aria-pressed': 'false', hidden: true,
      }, '✗ Não lembrei');
      const giusto = el('button', {
        class: 'btn btn--sm carta__voto', type: 'button',
        'data-voto': 'si', 'aria-pressed': 'false', hidden: true,
      }, '✓ Lembrei');

      mostrar.addEventListener('click', () => {
        verso.hidden = false;
        mostrar.hidden = true;
        sbagliato.hidden = false;
        giusto.hidden = false;
        speech.speak(carta.it);
      });

      const votar = (escolhido) => {
        for (const b of [sbagliato, giusto]) {
          const on = b === escolhido;
          b.setAttribute('aria-pressed', on ? 'true' : 'false');
          b.classList.toggle('carta__voto--on', on);
        }
      };
      sbagliato.addEventListener('click', () => votar(sbagliato));
      giusto.addEventListener('click', () => votar(giusto));

      /* Caderno léxico: guardar o chunk para escrever a SUA frase com ele
         depois. O botão vive aqui porque é aqui que o aluno descobre que
         não lembrava — que é exatamente quando vale a pena guardar. */
      const guardar = el('button', {
        class: 'btn btn--sm carta__caderno', type: 'button',
        'aria-pressed': ctx.notebook?.has(carta.id) ? 'true' : 'false',
      }, ctx.notebook?.has(carta.id) ? '✓ no caderno' : '＋ caderno');

      guardar.addEventListener('click', () => {
        const dentro = ctx.notebook?.toggle?.(carta);
        guardar.setAttribute('aria-pressed', dentro ? 'true' : 'false');
        guardar.textContent = dentro ? '✓ no caderno' : '＋ caderno';
      });

      li.append(verso, el('div', { class: 'ex__row' }, mostrar, sbagliato, giusto, guardar));

      rows.set(carta.id, { carta, verso, mostrar, sbagliato, giusto, guardar });
      ol.append(li);
    }

    root.append(ol);

    const send = el('button', { class: 'btn btn--primary', type: 'button' }, 'Registrar revisão');
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
      // Carta não votada conta como não lembrada. É o lado seguro: um item
      // que o aluno pulou volta antes, e voltar cedo demais custa trinta
      // segundos — enquanto não voltar custa a palavra.
      const correct = row.giusto.getAttribute('aria-pressed') === 'true';
      const votou = correct || row.sbagliato.getAttribute('aria-pressed') === 'true';
      results.push({ id, ...row, correct, votou, score: correct ? 1 : 0 });
    }

    const hits = results.filter((r) => r.correct).length;
    const score = results.length ? hits / results.length : 0;
    return { correct: score === 1, score, level: score === 1 ? 'exact' : 'partial', results };
  },

  feedback(item, result, root) {
    const { feedback } = root._parts;
    const tone = result.correct ? 'ok' : result.score >= 0.5 ? 'warn' : 'err';
    const naoVotadas = result.results.filter((r) => !r.votou).length;

    feedback.hidden = false;
    feedback.className = `feedback feedback--${tone}`;
    feedback.innerHTML = '';
    feedback.append(
      el('div', { class: `feedback__title feedback__title--${tone}` },
        `${result.results.filter((r) => r.correct).length} de ${result.results.length} lembradas`)
    );

    if (naoVotadas) {
      feedback.append(el('p', {},
        `${naoVotadas} carta(s) sem voto contam como não lembradas — elas voltam antes na revisão.`));
    }

    const revisar = result.results.filter((r) => !r.correct).map((r) => r.carta.it);
    if (revisar.length) {
      const play = el('button', { class: 'btn btn--sm', type: 'button' }, '▶︎ Ouvir as que faltaram');
      play.addEventListener('click', () => {
        speech.speakSequence(revisar.map((it) => ({ it, speaker: 'A' })));
      });
      feedback.append(play);
    }

    return feedback;
  },

  reveal(item, root) {
    for (const [, row] of root._parts.rows) {
      row.verso.hidden = false;
      row.mostrar.hidden = true;
      row.sbagliato.hidden = false;
      row.giusto.hidden = false;
    }
  },
};
