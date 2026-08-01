/* ==========================================================================
   riordino.js — remontar a frase com as palavras fora de ordem.

   É o «Riordina le parole» do Compito 2. O valor didático é específico:
   testa ordem e concordância sem exigir que o aluno produza a grafia, então
   isola exatamente o que a Lição 2 quer treinar — onde entra o verbo, onde
   entra `in`/`a`, qual desinência combina com qual sujeito.

   Clique, não arrastar. Arrastar é ruim no celular, inacessível por teclado
   e impossível de testar sem um navegador de verdade — e o site não tem
   navegador de verdade na suíte, por decisão de arquitetura.
   ========================================================================== */

import { el, speakButton } from '../render.js';
import { checkAnswer, escapeHtml } from '../check.js';
import { mescola } from './shuffle.js';

export default {
  type: 'riordino',

  countItems: (ex) => (ex.frasi ?? []).length,

  render(item, ctx) {
    const root = el('div', { class: 'ex__body' });
    const rows = new Map();

    for (const frase of item.frasi ?? []) {
      const blocco = el('div', { class: 'riordino' });

      if (frase.pt) blocco.append(el('p', { class: 'riordino__pt', html: frase.pt }));

      const linea = el('div', { class: 'riordino__linea', 'aria-label': 'Sua frase' });
      const pool = el('div', { class: 'riordino__pool', 'aria-label': 'Palavras disponíveis' });

      /* `scelte` é a fonte da verdade; os dois contêineres são só desenho.
         Redesenhar tudo a cada clique é mais barato que mover nós, e o DOM
         mínimo da suíte não implementa node.remove(). */
      const scelte = [];
      const parole = mescola(frase.parole ?? [], frase.id ?? '');

      const disegna = () => {
        linea.innerHTML = '';
        pool.innerHTML = '';

        scelte.forEach((idx, posto) => {
          const b = el('button', { class: 'parola parola--in', type: 'button' }, parole[idx]);
          b.addEventListener('click', () => {
            scelte.splice(posto, 1);
            disegna();
          });
          linea.append(b);
        });

        if (!scelte.length) {
          linea.append(el('span', { class: 'riordino__vuoto' }, 'Toque nas palavras na ordem certa…'));
        }

        parole.forEach((p, idx) => {
          if (scelte.includes(idx)) return;
          const b = el('button', { class: 'parola', type: 'button' }, p);
          b.addEventListener('click', () => {
            scelte.push(idx);
            disegna();
          });
          pool.append(b);
        });
      };

      disegna();

      const azzera = el('button', { class: 'btn btn--ghost btn--sm', type: 'button' }, '↺ Limpar');
      azzera.addEventListener('click', () => {
        scelte.length = 0;
        disegna();
      });

      const esito = el('p', { class: 'riordino__esito', hidden: true });

      blocco.append(linea, pool, el('div', { class: 'ex__row' }, azzera), esito);
      rows.set(frase.id, { frase, parole, scelte, esito, disegna });
      root.append(blocco);
    }

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
      const dato = row.scelte.map((i) => row.parole[i]).join(' ');
      /* Elisão não se tolera: as peças já vêm com o apóstrofo pronto, então
         escrever `l'` em vez de `lo` aqui seria escolher a peça errada, não
         um deslize de grafia. */
      const r = checkAnswer(dato, row.frase.risposta, {
        accettaAnche: row.frase.accettaAnche,
        tolleranzaElisione: false,
      });
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
      r.esito.hidden = false;
      r.esito.className = `riordino__esito riordino__esito--${r.correct ? 'ok' : 'err'}`;
      r.esito.innerHTML = '';
      r.esito.append(
        speakButton(r.frase.risposta),
        el('span', { html: r.correct
          ? `<b>${escapeHtml(r.frase.risposta)}</b>${r.frase.nota ? ` — ${r.frase.nota}` : ''}`
          : (r.dato
            ? `Você montou «${escapeHtml(r.dato)}».`
            : 'Nenhuma palavra escolhida.') })
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
      /* Reconstrói a ordem certa em termos de índices do pool embaralhado:
         para cada palavra do gabarito, consome a primeira ocorrência ainda
         não usada — palavras repetidas («e», «in») exigem esse cuidado. */
      const usati = new Set();
      row.scelte.length = 0;

      for (const parola of tokens(row.frase.risposta)) {
        const idx = row.parole.findIndex(
          (p, i) => !usati.has(i) && confronta(p) === confronta(parola)
        );
        if (idx >= 0) {
          usati.add(idx);
          row.scelte.push(idx);
        }
      }
      row.disegna();
    }
  },
};

function tokens(frase) {
  return String(frase ?? '').split(/\s+/).filter(Boolean);
}

/** Comparação frouxa peça×gabarito: a peça é «Io» e o gabarito traz «Io»,
 *  mas o gabarito também traz o ponto final em «brasiliano.». */
function confronta(s) {
  return String(s).replace(/[.,;:!?]/g, '').toLowerCase();
}

