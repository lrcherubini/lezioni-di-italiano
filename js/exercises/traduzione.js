/* ==========================================================================
   traduzione.js — produzir a frase inteira em italiano, a partir do sentido.

   É o topo da escada de produção, e ela só faz sentido lida inteira:

     riordino    dá as palavras, o aluno acha a ordem
     scelta      dá as alternativas, o aluno decide entre elas
     slot-frame  dá o molde, o aluno troca uma peça
     traduzione  não dá nada além do sentido

   Todos os outros deixam alguma coisa na tela para o aluno reconhecer. Aqui
   a tela tem só português, e o italiano tem que sair da memória — que é
   exatamente o que acontece numa conversa e o que nenhum outro tipo cobrava.

   O feedback é DIFF POR PALAVRA, não certo/errado, e é por isso que este
   tipo existe separado do slot-frame: numa frase produzida do zero o aluno
   erra uma palavra no meio de sete, e dizer só «errado» apaga as seis que
   ele acertou. `renderDiff` já resolve isso desde o qa-transcribe.
   ========================================================================== */

import { el, speakButton, prose } from '../render.js';
import { checkAnswer, renderDiff, escapeHtml } from '../check.js';
import * as speech from '../speech.js';

export default {
  type: 'traduzione',

  subItemIds: (ex) => (ex.frasi ?? []).map((f) => f.id),

  render(item, ctx) {
    const root = el('div', { class: 'ex__body' });
    const rows = new Map();

    const ol = el('ol', { class: 'traduzione' });

    for (const frase of item.frasi ?? []) {
      const li = el('li', { class: 'traduzione__frase' });

      /* Só o português na tela. Nada de dica de tamanho, de primeira letra
         ou de contagem de palavras: qualquer uma delas devolveria a muleta
         que este tipo existe para tirar. */
      li.append(el('p', { class: 'traduzione__pt', html: frase.pt ?? '' }));

      const input = el('input', {
        type: 'text',
        autocomplete: 'off',
        autocapitalize: 'off',
        spellcheck: 'false',
        lang: 'it',
        class: 'traduzione__input',
        'aria-label': `Em italiano: ${frase.pt ?? ''}`,
        placeholder: 'em italiano…',
      });
      input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') ctx.submit(null);
      });
      li.append(input);

      const esito = el('div', { class: 'traduzione__esito', hidden: true });
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
        tolleranzaAccenti: row.frase.tolleranzaAccenti,
        /* Elisão é conteúdo (`l'amica`, `vent'anni`) e nunca se tolera por
           padrão. Uma frase que precise do contrário diz isso no JSON. */
        tolleranzaElisione: row.frase.tolleranzaElisione === true,
      });
      results.push({ id, ...row, ...r });
    }

    const hits = results.filter((r) => r.correct).length;
    const score = results.length ? hits / results.length : 0;
    return { correct: score === 1, score, level: score === 1 ? 'exact' : 'partial', results };
  },

  feedback(item, result, root) {
    const { feedback, modo } = root._parts;
    const tone = result.correct ? 'ok' : result.score >= 0.5 ? 'warn' : 'err';

    for (const r of result.results) {
      r.input.classList.toggle('traduzione__input--ok', r.correct);
      r.input.classList.toggle('traduzione__input--err', !r.correct);

      r.esito.hidden = false;
      r.esito.className = `traduzione__esito traduzione__esito--${r.correct ? 'ok' : 'err'}`;
      r.esito.innerHTML = '';

      /* Certo: a forma e o áudio, para fechar escreveu → conferiu → ouviu.
         Errado: o diff primeiro — ver QUAL palavra faltou é o que ensina. */
      if (!r.correct) {
        const { html } = renderDiff(r.frase.risposta, r.input.value);
        r.esito.append(el('p', { class: 'diff', html }));
      }

      r.esito.append(el('p', { class: 'traduzione__modello' },
        speakButton(r.frase.risposta),
        prose(r.correct
          ? (r.nota ?? `<b>${escapeHtml(r.frase.risposta)}</b>`)
          : `Era <b>${escapeHtml(r.frase.risposta)}</b>`, 'span', {}, modo)
      ));

      if (r.frase.nota) r.esito.append(prose(r.frase.nota, 'p', { class: 'traduzione__nota' }, modo));
    }

    feedback.hidden = false;
    feedback.className = `feedback feedback--${tone}`;
    feedback.innerHTML = '';
    feedback.append(
      el('div', { class: `feedback__title feedback__title--${tone}` },
        `${result.results.filter((r) => r.correct).length} de ${result.results.length} corretas`)
    );

    const tutte = result.results.map((r) => r.frase.risposta).filter(Boolean);
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
      row.input.value = row.frase.risposta;
      row.input.classList.add('traduzione__input--warn');
    }
  },
};
