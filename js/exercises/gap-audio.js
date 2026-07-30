/* ==========================================================================
   gap-audio.js — frase com lacuna, completada de ouvido.

   Passada única, mas com repetição livre e controle de velocidade. O texto
   NÃO revela a palavra que falta, e a transcrição completa só aparece
   depois de uma tentativa — se aparecesse antes, o exercício deixaria de
   ser de audição.
   ========================================================================== */

import { el, audioBar, speakButton } from '../render.js';
import { checkAnswer, escapeHtml } from '../check.js';
import * as speech from '../speech.js';

export default {
  type: 'gap-audio',

  render(item, ctx) {
    const root = el('div', { class: 'ex__body' });

    root.append(audioBar({
      playLabel: 'Ouvir a frase',
      onPlay: (rate) => speech.speak(item.audio?.tts ?? '', { rate }),
    }));

    // A lacuna é um marcador visual; o valor vive no input abaixo.
    const prompt = el('p', {
      class: 'ex__prompt',
      html: escapeHtml(item.testo).replace(/_{2,}/g, '<span class="gap"></span>'),
    });
    root.append(prompt);

    const input = el('input', {
      type: 'text',
      autocomplete: 'off',
      autocapitalize: 'off',
      spellcheck: 'false',
      lang: 'it',
      'aria-label': 'Sua resposta',
      placeholder: 'a palavra que falta…',
    });

    const send = el('button', { class: 'btn btn--primary', type: 'button' }, 'Verificar');
    const hintBtn = item.aiuto ? el('button', { class: 'btn', type: 'button' }, '💡 Dica') : null;

    root.append(el('div', { class: 'ex__row' }, input, send, hintBtn));

    const hint = el('div', { class: 'feedback', hidden: true, html: item.aiuto ?? '' });
    if (hintBtn) {
      root.append(hint);
      hintBtn.addEventListener('click', () => {
        hint.hidden = !hint.hidden;
      });
    }

    const feedback = el('div', { class: 'feedback', role: 'status', 'aria-live': 'polite', hidden: true });
    root.append(feedback);

    const submit = () => ctx.submit(input.value);
    send.addEventListener('click', submit);
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') submit();
    });

    root._parts = { input, feedback, send };
    return root;
  },

  check(item, response) {
    return checkAnswer(response, item.risposta, {
      accettaAnche: item.accettaAnche,
      tolleranzaAccenti: item.tolleranzaAccenti,
      tolleranzaElisione: item.tolleranzaElisione,
    });
  },

  feedback(item, result, root) {
    const { feedback } = root._parts;
    feedback.hidden = false;
    feedback.className = 'feedback ' + (result.correct ? (result.nota ? 'feedback--warn' : 'feedback--ok') : 'feedback--err');
    feedback.innerHTML = '';

    if (result.correct) {
      feedback.append(
        el('div', { class: `feedback__title feedback__title--${result.nota ? 'warn' : 'ok'}` },
          result.nota ? 'Quase perfeito' : 'Esatto!')
      );
      if (result.nota) feedback.append(el('p', { html: result.nota }));
      feedback.append(fullSentence(item));
    } else {
      feedback.append(el('div', { class: 'feedback__title feedback__title--err' }, 'Non ancora'));
      feedback.append(el('p', { html:
        result.similarity > 0.6
          ? 'Você está perto. Ouça de novo em <b>Lento</b> e repare no fim da palavra.'
          : 'Ouça de novo em <b>Lento</b>. Se precisar, use a dica.' }));
    }
    return feedback;
  },

  reveal(item, root) {
    const { feedback, input } = root._parts;
    feedback.hidden = false;
    feedback.className = 'feedback feedback--warn';
    feedback.innerHTML = '';
    feedback.append(el('div', { class: 'feedback__title feedback__title--warn' }, 'Resposta'));
    feedback.append(fullSentence(item));
    input.value = item.risposta;
  },
};

/** A transcrição completa, com áudio e tradução — o "feedback além de
 *  certo/errado" que a pesquisa de audição pede. */
function fullSentence(item) {
  const full = item.testo.replace(/_{2,}/g, item.risposta);
  return el('div', {},
    el('p', { class: 'item' },
      speakButton(full),
      el('span', { class: 'item__text' },
        el('span', { class: 'item__it', html: `<b>${escapeHtml(full)}</b>` }),
        item.pt ? el('span', { class: 'item__pt', html: item.pt }) : null
      )
    )
  );
}
