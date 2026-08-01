/* ==========================================================================
   qa-transcribe.js — ouvir pergunta + resposta, transcrever a RESPOSTA.

   Os dois turnos usam vozes diferentes (ou pitches diferentes, se só houver
   uma voz it-IT), para que se ouça que são duas pessoas.

   O feedback é um diff palavra a palavra: numa transcrição, saber QUAL
   palavra você não ouviu é a informação útil — "errado" não ensina nada.
   ========================================================================== */

import { el, audioBar, speakButton, prose } from '../render.js';
import { checkAnswer, renderDiff, escapeHtml } from '../check.js';
import * as speech from '../speech.js';

export default {
  type: 'qa-transcribe',

  render(item, ctx) {
    const root = el('div', { class: 'ex__body' });

    const playPair = (rate) =>
      speech.speakSequence(
        [
          { speaker: 'A', it: item.domanda.tts ?? item.domanda.testo },
          { speaker: 'B', it: item.risposta.tts ?? item.risposta.testo },
        ],
        { rate }
      );

    const onlyAnswer = el('button', { class: 'btn', type: 'button', title: 'Ouvir só a resposta' }, '↳ Só a resposta');
    onlyAnswer.addEventListener('click', () =>
      speech.speak(item.risposta.tts ?? item.risposta.testo, { speaker: 'B' })
    );

    root.append(audioBar({
      playLabel: 'Ouvir pergunta e resposta',
      onPlay: playPair,
      extra: [onlyAnswer],
    }));

    root.append(el('p', { class: 'stage__intro' },
      'Transcreva ', el('b', {}, 'apenas a resposta'), '. Pontuação e maiúsculas não contam.'
    ));

    const input = el('textarea', {
      rows: '2',
      lang: 'it',
      autocapitalize: 'off',
      spellcheck: 'false',
      'aria-label': 'Transcreva a resposta',
      placeholder: 'escreva o que você ouviu…',
    });
    root.append(input);

    const send = el('button', { class: 'btn btn--primary', type: 'button' }, 'Verificar');
    const hintBtn = item.aiuto ? el('button', { class: 'btn', type: 'button' }, '💡 Dica') : null;
    root.append(el('div', { class: 'ex__actions' }, send, hintBtn));

    const hint = prose(item.aiuto ?? '', 'div', { class: 'feedback', hidden: true });
    if (hintBtn) {
      root.append(hint);
      hintBtn.addEventListener('click', () => { hint.hidden = !hint.hidden; });
    }

    const feedback = el('div', { class: 'feedback', role: 'status', 'aria-live': 'polite', hidden: true });
    root.append(feedback);

    send.addEventListener('click', () => ctx.submit(input.value));
    // Ctrl+Enter envia; Enter puro insere linha, como se espera de textarea.
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) ctx.submit(input.value);
    });

    root._parts = { input, feedback };
    return root;
  },

  check(item, response) {
    const target = item.risposta.testo;
    const exact = checkAnswer(response, target, {
      accettaAnche: item.accettaAnche,
      tolleranzaAccenti: item.tolleranzaAccenti,
    });
    if (exact.correct) return exact;

    // Não bateu inteiro: pontua por tokens acertados. A partir de 80% das
    // palavras consideramos que a audição funcionou e o resto é ortografia.
    const { score } = renderDiff(target, response);
    return { correct: score >= 0.8, score, level: score >= 0.8 ? 'partial' : 'none' };
  },

  feedback(item, result, root) {
    const { feedback, input } = root._parts;
    const target = item.risposta.testo;
    const { html } = renderDiff(target, input.value);

    const tone = result.correct ? (result.level === 'exact' ? 'ok' : 'warn') : 'err';
    feedback.hidden = false;
    feedback.className = `feedback feedback--${tone}`;
    feedback.innerHTML = '';

    const titles = { ok: 'Perfetto!', warn: 'Quase — a audição pegou', err: 'Vamos de novo' };
    feedback.append(el('div', { class: `feedback__title feedback__title--${tone}` }, titles[tone]));

    if (result.nota) feedback.append(el('p', { html: result.nota }));

    if (result.level !== 'exact') {
      feedback.append(el('p', {},
        `Você acertou ${Math.round((result.score ?? 0) * 100)}% das palavras. `,
        el('del', {}, 'vermelho'), ' = faltou · ', el('ins', {}, 'verde'), ' = sobrou.'
      ));
      feedback.append(el('p', { class: 'diff', html }));
    }

    feedback.append(el('div', { class: 'block' },
      el('div', { class: 'block__title' }, 'Original'),
      el('p', { class: 'item' },
        speakButton(target, { speaker: 'B' }),
        el('span', { class: 'item__text' },
          el('span', { class: 'item__it', html: `<b>${escapeHtml(target)}</b>` }),
          item.risposta.pt ? el('span', { class: 'item__pt', html: item.risposta.pt }) : null
        )
      )
    ));

    return feedback;
  },

  reveal(item, root) {
    const { feedback } = root._parts;
    feedback.hidden = false;
    feedback.className = 'feedback feedback--warn';
    feedback.innerHTML = '';
    feedback.append(el('div', { class: 'feedback__title feedback__title--warn' }, 'Resposta'));
    feedback.append(el('p', { class: 'item' },
      speakButton(item.risposta.testo, { speaker: 'B' }),
      el('span', { class: 'item__text' },
        el('span', { class: 'item__it', html: `<b>${escapeHtml(item.risposta.testo)}</b>` }),
        item.risposta.pt ? el('span', { class: 'item__pt', html: item.risposta.pt }) : null
      )
    ));
  },
};
