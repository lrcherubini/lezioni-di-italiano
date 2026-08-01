/* ==========================================================================
   slot-frame.js — drill de substituição sobre frase semifixa.

   O tipo que faltava para o método lexical funcionar de verdade. A frase
   semifixa (`Io parlo ___.`) já estava no conteúdo desde a Lição 1, no campo
   `chunks`, mas nada a exercitava: ela era só um dado à espera de um drill.

   O desenho é o do drill de substituição clássico — modelo primeiro, depois
   repetição trocando UM elemento por vez. Repetir a frase inteira a cada
   giro é o ponto, não desperdício: o que se automatiza é o molde, e o molde
   só se automatiza se ele passar inteiro pela cabeça a cada volta. Se o
   aluno digitasse só o slot, ele treinaria vocabulário e não estrutura.

   O modelo (primeiro giro) vem preenchido e audível de saída. Isso não é
   entregar resposta: sem ouvir a forma alvo antes, o aluno reproduz a
   prosódia do português.
   ========================================================================== */

import { el, speakButton, audioBar, prose } from '../render.js';
import { checkAnswer, escapeHtml } from '../check.js';
import * as speech from '../speech.js';

export default {
  type: 'slot-frame',

  countItems: (ex) => (ex.giri ?? []).length,

  render(item, ctx) {
    const root = el('div', { class: 'ex__body' });
    const rows = new Map();

    /* --- Molde ---------------------------------------------------------- */
    root.append(el('div', { class: 'frame' },
      el('p', {
        class: 'frame__it',
        html: escapeHtml(item.frame?.it ?? '').replace(/_{2,}/g, '<span class="gap"></span>'),
      }),
      item.frame?.pt ? el('p', { class: 'frame__pt', html: item.frame.pt }) : null
    ));

    /* --- Modelo audível -------------------------------------------------- */
    const modello = item.modello ?? item.giri?.[0]?.risposta ?? '';
    if (modello) {
      root.append(el('div', { class: 'frame__modello' },
        el('span', { class: 'frame__etichetta' }, 'Modello'),
        speakButton(modello),
        el('span', { class: 'item__it', html: `<b>${escapeHtml(modello)}</b>` })
      ));
    }

    root.append(audioBar({
      playLabel: 'Ouvir o modelo',
      onPlay: (rate) => speech.speak(modello, { rate }),
    }));

    /* --- Giros ----------------------------------------------------------- */
    const ol = el('ol', { class: 'giri' });

    for (const giro of item.giri ?? []) {
      const li = el('li', { class: 'giro' });

      /* O prompt é em português: o aluno tem que PRODUZIR o italiano, não
         reconhecê-lo. Um prompt em italiano transformaria o drill em cópia. */
      li.append(el('span', { class: 'giro__prompt', html: giro.pt ?? giro.slot ?? '' }));

      const input = el('input', {
        type: 'text',
        autocomplete: 'off',
        autocapitalize: 'off',
        spellcheck: 'false',
        lang: 'it',
        class: 'giro__input',
        'aria-label': `Frase completa para: ${giro.pt ?? giro.slot ?? ''}`,
        placeholder: 'a frase inteira…',
      });
      input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') ctx.submit(null);
      });

      li.append(input);

      const esito = el('p', { class: 'giro__esito', hidden: true });
      li.append(esito);

      rows.set(giro.id, { giro, input, esito });
      ol.append(li);
    }

    root.append(ol);

    const send = el('button', { class: 'btn btn--primary', type: 'button' }, 'Verificar');
    send.addEventListener('click', () => ctx.submit(null));
    root.append(el('div', { class: 'ex__actions' }, send));

    const feedback = el('div', { class: 'feedback', role: 'status', 'aria-live': 'polite', hidden: true });
    root.append(feedback);

    root._parts = { rows, feedback, modello };
    return root;
  },

  check(item, _response, root) {
    const results = [];

    for (const [id, row] of root._parts.rows) {
      const r = checkAnswer(row.input.value, row.giro.risposta, {
        accettaAnche: row.giro.accettaAnche,
        /* A elisão é conteúdo em várias dessas frases (`vent'anni`,
           `l'inglese`), então nunca se tolera aqui — tolerar apagaria
           justamente o que o drill quer automatizar. */
        tolleranzaElisione: false,
      });
      results.push({ id, ...row, ...r });
    }

    const hits = results.filter((r) => r.correct).length;
    const score = results.length ? hits / results.length : 0;
    return { correct: score === 1, score, level: score === 1 ? 'exact' : 'partial', results };
  },

  feedback(item, result, root) {
    const { feedback } = root._parts;
    const tone = result.correct ? 'ok' : result.score >= 0.5 ? 'warn' : 'err';

    for (const r of result.results) {
      r.input.classList.toggle('giro__input--ok', r.correct);
      r.input.classList.toggle('giro__input--err', !r.correct);

      r.esito.hidden = false;
      r.esito.className = `giro__esito giro__esito--${r.correct ? 'ok' : 'err'}`;
      r.esito.innerHTML = '';
      r.esito.append(
        speakButton(r.giro.risposta),
        prose(r.correct
          ? (r.nota ?? `<b>${escapeHtml(r.giro.risposta)}</b>`)
          : `Era <b>${escapeHtml(r.giro.risposta)}</b>`, 'span')
      );
    }

    feedback.hidden = false;
    feedback.className = `feedback feedback--${tone}`;
    feedback.innerHTML = '';
    feedback.append(
      el('div', { class: `feedback__title feedback__title--${tone}` },
        `${result.results.filter((r) => r.correct).length} de ${result.results.length} corretas`)
    );

    /* Ouvir a série inteira de uma vez é o fecho do drill de substituição:
       é onde o molde fica audível COMO molde, com só uma peça mudando. */
    const serie = result.results.map((r) => r.giro.risposta).filter(Boolean);
    if (serie.length) {
      const play = el('button', { class: 'btn btn--sm', type: 'button' }, '▶︎ Ouvir a série');
      play.addEventListener('click', () => {
        speech.speakSequence(serie.map((it) => ({ it, speaker: 'A' })));
      });
      feedback.append(play);
    }

    return feedback;
  },

  reveal(item, root) {
    for (const [, row] of root._parts.rows) {
      row.input.value = row.giro.risposta;
      row.input.classList.add('giro__input--warn');
    }
  },
};
