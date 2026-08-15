/* ==========================================================================
   trasformazione.js — converter a frase de modo: afirmativa ⇄ negativa ⇄
   interrogativa.

   O que este drill treina não é vocabulário nem escolha, é FLEXIBILIDADE: o
   aluno já produz `Io sono italiano` e trava em `Non sono italiano?` porque
   nunca moveu as peças da frase que ele mesmo acabou de dizer. Partir de uma
   frase pronta e mexer só no modo é o que isola essa operação.

   A frase de partida vem audível: ela é italiano exibido, e o aluno precisa
   ouvir o ponto de saída para perceber que a transformação é sobretudo
   prosódica — em italiano a interrogativa não inverte nada, só sobe no fim,
   e é justamente isso que o lusófono não espera vindo do inglês.

   O aluno escreve a frase INTEIRA, pela mesma razão do slot-frame: o que se
   automatiza é o molde, e o molde só se automatiza passando inteiro.
   ========================================================================== */

import { el, speakButton, subChip, prose } from '../render.js';
import { checkAnswer, escapeHtml } from '../check.js';
import * as speech from '../speech.js';

/** O rótulo do alvo. Italiano com glosa portuguesa: são quase cognatos, mas
 *  «affermativa» sem glosa faria o aluno adivinhar o que se pede dele. */
const VERSI = new Map([
  ['affermativa', 'afirmativa'],
  ['negativa', 'negativa'],
  ['interrogativa', 'interrogativa'],
]);

/** `checkAnswer` descarta pontuação final, e para todo outro tipo isso está
 *  certo — pontuação não é o conteúdo. Aqui é: em italiano a interrogativa
 *  NÃO inverte nada, e `Tu sei italiano?` difere de `Tu sei italiano.` só
 *  pelo ponto. Sem esta checagem à parte, copiar a frase de partida passaria
 *  como acerto e o drill não exercitaria nada.
 *
 *  A regra é simétrica de propósito: falta de `?` reprova a interrogativa, e
 *  sobra de `?` reprova as outras duas. */
const perguntou = (s) => /\?\s*$/.test(String(s ?? ''));

function pontuacaoBate(verso, resposta) {
  return perguntou(resposta) === (verso === 'interrogativa');
}

export default {
  type: 'trasformazione',

  subItemIds: (ex) => (ex.frasi ?? []).map((f) => f.id),

  render(item, ctx) {
    const root = el('div', { class: 'ex__body' });
    const rows = new Map();

    const ol = el('ol', { class: 'trasformazione' });

    for (const frase of item.frasi ?? []) {
      const li = el('li', { class: 'trasformazione__frase' });

      li.append(el('div', { class: 'trasformazione__partenza' },
        speakButton(frase.partenza ?? ''),
        el('span', { class: 'item__it', html: escapeHtml(frase.partenza ?? '') }),
        subChip(`→ ${frase.verso ?? ''}`)
      ));

      const gloss = VERSI.get(frase.verso);
      if (gloss && gloss !== frase.verso) {
        li.append(el('p', { class: 'trasformazione__gloss' }, gloss));
      }

      const input = el('input', {
        type: 'text',
        autocomplete: 'off',
        autocapitalize: 'off',
        spellcheck: 'false',
        lang: 'it',
        class: 'trasformazione__input',
        'aria-label': `Na forma ${frase.verso ?? ''}: ${frase.partenza ?? ''}`,
        placeholder: 'a frase inteira…',
      });
      input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') ctx.submit(null);
      });
      li.append(input);

      const esito = el('p', { class: 'trasformazione__esito', hidden: true });
      li.append(esito);

      rows.set(frase.id, { frase, input, esito });
      ol.append(li);
    }

    root.append(ol);

    const send = el('button', { class: 'btn btn--primary', type: 'button' }, 'Verificar');
    send.addEventListener('click', () => ctx.submit(null));
    root.append(el('div', { class: 'ex__actions' }, send));

    const feedback = el('div', { class: 'feedback', role: 'status', 'aria-live': 'polite', hidden: true });
    root.append(feedback);

    root._parts = { rows, feedback, modo: ctx.modo ?? 'pt' };
    return root;
  },

  check(item, _response, root) {
    const results = [];

    for (const [id, row] of root._parts.rows) {
      const r = checkAnswer(row.input.value, row.frase.risposta, {
        accettaAnche: row.frase.accettaAnche,
        tolleranzaElisione: false,
      });

      // As palavras podem estar certas e a frase continuar não sendo a forma
      // pedida — é o caso de copiar a partida numa interrogativa.
      const pontuacao = pontuacaoBate(row.frase.verso, row.input.value);
      const ok = r.correct && pontuacao;

      results.push({
        id,
        ...row,
        ...r,
        correct: ok,
        score: ok ? r.score : 0,
        pontuacao,
        nota: !pontuacao && r.correct
          ? (row.frase.verso === 'interrogativa'
            ? 'As palavras estão certas — falta o <b>?</b>. Em italiano é ele (e a entonação) que faz a pergunta.'
            : 'As palavras estão certas, mas isso é uma pergunta. Tire o <b>?</b>.')
          : r.nota,
      });
    }

    const hits = results.filter((r) => r.correct).length;
    const score = results.length ? hits / results.length : 0;
    return { correct: score === 1, score, level: score === 1 ? 'exact' : 'partial', results };
  },

  feedback(item, result, root) {
    const { feedback, modo } = root._parts;
    const tone = result.correct ? 'ok' : result.score >= 0.5 ? 'warn' : 'err';

    for (const r of result.results) {
      r.input.classList.toggle('trasformazione__input--ok', r.correct);
      r.input.classList.toggle('trasformazione__input--err', !r.correct);

      r.esito.hidden = false;
      r.esito.className = `trasformazione__esito trasformazione__esito--${r.correct ? 'ok' : 'err'}`;
      r.esito.innerHTML = '';
      r.esito.append(
        speakButton(r.frase.risposta),
        prose(r.correct
          ? (r.nota ?? r.frase.nota ?? `<b>${escapeHtml(r.frase.risposta)}</b>`)
          : `Era <b>${escapeHtml(r.frase.risposta)}</b>. ${r.frase.nota ?? ''}`,
        'span', {}, modo)
      );
    }

    feedback.hidden = false;
    feedback.className = `feedback feedback--${tone}`;
    feedback.innerHTML = '';
    feedback.append(
      el('div', { class: `feedback__title feedback__title--${tone}` },
        `${result.results.filter((r) => r.correct).length} de ${result.results.length} corretas`)
    );

    /* Partida e chegada em sequência: ouvir o par é o que deixa audível o que
       mudou — em italiano, muitas vezes só a entonação. */
    const coppie = result.results.flatMap((r) => [
      { it: r.frase.partenza, speaker: 'A' },
      { it: r.frase.risposta, speaker: 'B' },
    ].filter((t) => t.it));

    if (coppie.length) {
      const play = el('button', { class: 'btn btn--sm', type: 'button' }, '▶︎ Ouvir os pares');
      play.addEventListener('click', () => speech.speakSequence(coppie));
      feedback.append(play);
    }

    return feedback;
  },

  reveal(item, root) {
    for (const [, row] of root._parts.rows) {
      row.input.value = row.frase.risposta;
      row.input.classList.add('trasformazione__input--warn');
    }
  },
};
