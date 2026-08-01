/* ==========================================================================
   dictogloss.js — ouvir um texto curto e reconstruí-lo de memória.

   Quatro etapas, e a ordem é o método inteiro:

     1. pré-ensino — 2 ou 3 formas difíceis, com áudio, ANTES de ouvir
     2. três escutas — a 1ª sem escrever nada
     3. reconstrução — escrever o texto de memória
     4. análise — diff palavra a palavra contra o original

   Por que o pré-ensino vem primeiro: o aluno A1 falha em **decodificação e
   fronteira de palavra**, não em vocabulário. Se ele trava numa palavra que
   nunca viu escrita, perde o resto da frase atrás dela — e o exercício deixa
   de medir escuta e passa a medir sorte. Dar as formas difíceis de antemão
   não é entregar a resposta: é tirar do caminho a única variável que não
   interessa aqui.

   Por que a 1ª escuta não deixa escrever: se der para anotar desde o começo,
   o aluno transcreve palavra a palavra e nunca constrói sentido global. A
   mesma regra da passada 1 do diálogo, e pelo mesmo motivo.

   Reconstruir NÃO é transcrever. Espera-se a mesma mensagem, não as mesmas
   palavras — por isso a nota de corte é generosa e o feedback mostra o diff
   em vez de um X.
   ========================================================================== */

import { el, audioBar, speakButton, prose } from '../render.js';
import { checkAnswer, renderDiff, escapeHtml } from '../check.js';
import * as speech from '../speech.js';

/** A partir de quanto do texto reconstruído consideramos que a escuta
 *  funcionou. Mais baixo que o qa-transcribe (0.8) de propósito: lá se
 *  transcreve, aqui se reconstrói de memória. */
const SOGLIA = 0.65;

/** Quantas escutas antes de liberar a reconstrução. */
const ASCOLTI = 3;

export default {
  type: 'dictogloss',

  render(item, ctx) {
    const root = el('div', { class: 'ex__body' });
    const testo = item.testo ?? '';
    const tts = item.audio?.tts ?? testo;

    /* --- Etapa 1: pré-ensino ------------------------------------------ */
    if (item.preinsegnamento?.length) {
      const ul = el('ul', { class: 'items' });
      for (const p of item.preinsegnamento) {
        ul.append(el('li', { class: 'item' },
          speakButton(p.it),
          el('span', { class: 'item__text' },
            el('span', { class: 'item__it', html: `<b>${escapeHtml(p.it)}</b>` }),
            p.pt ? el('span', { class: 'item__pt', html: p.pt }) : null
          )
        ));
      }
      root.append(el('div', { class: 'block' },
        el('div', { class: 'block__title' }, 'Prima di ascoltare'),
        el('p', { class: 'stage__intro' },
          'Estas formas aparecem no áudio. Ouça cada uma antes de começar — '
          + 'travar numa palavra faz perder a frase inteira atrás dela.'),
        ul
      ));
    }

    /* --- Etapa 2: as escutas ------------------------------------------ */
    let ascolti = 0;
    const contatore = el('p', { class: 'dicto__conta', role: 'status', 'aria-live': 'polite' });

    const input = el('textarea', {
      rows: '4',
      lang: 'it',
      autocapitalize: 'off',
      spellcheck: 'false',
      class: 'dicto__input',
      'aria-label': 'Reconstrua o texto',
      placeholder: 'a primeira escuta é só escutar…',
      disabled: true,
    });

    const send = el('button', { class: 'btn btn--primary', type: 'button', disabled: true }, 'Verificar');

    const sincronizar = () => {
      const liberado = ascolti >= 1;
      // Depois da 1ª escuta o campo abre. Antes dela, não: escutar e
      // escrever ao mesmo tempo vira transcrição, não reconstrução.
      input.disabled = !liberado;
      send.disabled = !liberado;
      if (liberado) input.setAttribute('placeholder', 'escreva o que você entendeu, com suas palavras…');

      contatore.textContent = ascolti === 0
        ? `Escuta 1 de ${ASCOLTI}: só ouça. Nada de escrever.`
        : ascolti < ASCOLTI
          ? `Escuta ${ascolti} de ${ASCOLTI} feita. Agora escreva o que lembrar — pode ouvir de novo.`
          : `${ASCOLTI} escutas feitas. Pode continuar ouvindo à vontade.`;
    };

    root.append(audioBar({
      playLabel: 'Ouvir o testo',
      onPlay: (rate) => {
        ascolti += 1;
        sincronizar();
        return speech.speak(tts, { rate });
      },
    }));
    root.append(contatore);

    /* --- Etapa 3: reconstrução ---------------------------------------- */
    root.append(input);

    const hintBtn = item.aiuto ? el('button', { class: 'btn', type: 'button' }, '💡 Dica') : null;
    root.append(el('div', { class: 'ex__actions' }, send, hintBtn));

    const hint = prose(item.aiuto ?? '', 'div', { class: 'feedback', hidden: true }, ctx.modo ?? 'pt');
    if (hintBtn) {
      root.append(hint);
      hintBtn.addEventListener('click', () => { hint.hidden = !hint.hidden; });
    }

    const feedback = el('div', { class: 'feedback', role: 'status', 'aria-live': 'polite', hidden: true });
    root.append(feedback);

    send.addEventListener('click', () => ctx.submit(input.value));
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) ctx.submit(input.value);
    });

    sincronizar();

    root._parts = { input, feedback, contatore, ascolti: () => ascolti, modo: ctx.modo ?? 'pt' };
    return root;
  },

  check(item, response) {
    const alvo = item.testo ?? '';

    const exato = checkAnswer(response, alvo, {
      accettaAnche: item.accettaAnche,
      tolleranzaAccenti: item.tolleranzaAccenti,
    });
    if (exato.correct) return exato;

    // Reconstrução: pontua por palavra recuperada, não por igualdade.
    const { score } = renderDiff(alvo, response);
    return {
      correct: score >= SOGLIA,
      score,
      level: score >= SOGLIA ? 'partial' : 'none',
      similarity: score,
    };
  },

  /* --- Etapa 4: análise contra o original ----------------------------- */
  feedback(item, result, root) {
    const { feedback, input } = root._parts;
    const alvo = item.testo ?? '';
    const { html } = renderDiff(alvo, input.value);

    const tone = result.correct ? (result.level === 'exact' ? 'ok' : 'warn') : 'err';
    feedback.hidden = false;
    feedback.className = `feedback feedback--${tone}`;
    feedback.innerHTML = '';

    const titulos = {
      ok: 'Perfetto — palavra por palavra!',
      warn: 'A mensagem chegou',
      err: 'Vamos ouvir de novo',
    };
    feedback.append(el('div', { class: `feedback__title feedback__title--${tone}` }, titulos[tone]));

    feedback.append(el('p', {},
      `Você recuperou ${Math.round((result.score ?? 0) * 100)}% das palavras. `,
      el('del', {}, 'vermelho'), ' = faltou · ', el('ins', {}, 'verde'), ' = você acrescentou.'
    ));
    feedback.append(el('p', { class: 'diff', html }));

    // Num dictogloss, acrescentar palavra não é erro — é reformulação. Vale
    // dizer isso, senão o aluno "corrige" o que não estava errado.
    feedback.append(el('p', { class: 'item__nota' },
      'Reconstruir não é transcrever: se a mensagem ficou igual, você acertou. '
      + 'O verde só mostra onde você usou outras palavras.'));

    feedback.append(el('div', { class: 'block' },
      el('div', { class: 'block__title' }, 'Originale'),
      el('p', { class: 'item' },
        speakButton(alvo),
        el('span', { class: 'item__text' },
          el('span', { class: 'item__it', html: `<b>${escapeHtml(alvo)}</b>` }),
          item.pt ? el('span', { class: 'item__pt', html: item.pt }) : null
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
    feedback.append(el('div', { class: 'feedback__title feedback__title--warn' }, 'Originale'));
    feedback.append(el('p', { class: 'item' },
      speakButton(item.testo ?? ''),
      el('span', { class: 'item__text' },
        el('span', { class: 'item__it', html: `<b>${escapeHtml(item.testo ?? '')}</b>` }),
        item.pt ? el('span', { class: 'item__pt', html: item.pt }) : null
      )
    ));
  },
};
