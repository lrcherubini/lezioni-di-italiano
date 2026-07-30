/* ==========================================================================
   dialogue.js — diálogo curto em passadas múltiplas.

   O núcleo pedagógico do site, e o mais opinativo:

   · MESMO áudio, tarefa DIFERENTE em cada passada.
   · Passada 1 é só escuta: o input fica DESABILITADO e a transcrição
     ESCONDIDA. Isso é deliberado — se der para ler ou anotar na primeira
     vez, a escuta global não acontece.
   · A transcrição só libera na passada 3, e cada linha tem seu próprio
     botão de repetição.
   · As passadas destravam em ordem; não há como pular para a 3.
   ========================================================================== */

import { el, audioBar, speakButton } from '../render.js';
import { checkAnswer, escapeHtml } from '../check.js';
import * as speech from '../speech.js';

export default {
  type: 'dialogue',

  render(item, ctx) {
    const root = el('div', { class: 'ex__body dialogo' });
    let current = 0;

    const passate = item.passate ?? [];
    const battute = item.battute ?? [];

    /* --- Navegação entre passadas --- */
    const tabs = el('div', { class: 'dialogo__passate', role: 'group', 'aria-label': 'Passadas' });
    const tabButtons = passate.map((_, i) =>
      el('button', {
        class: 'btn btn--sm',
        type: 'button',
        disabled: i > 0,
        'aria-pressed': i === 0 ? 'true' : 'false',
      }, `Passada ${i + 1}`)
    );
    tabButtons.forEach((b, i) => {
      b.addEventListener('click', () => show(i));
      tabs.append(b);
    });
    root.append(tabs);

    /* --- Instrução da passada --- */
    const istruzione = el('div', { class: 'passata' });
    root.append(istruzione);

    /* --- Player: toca o diálogo inteiro, destacando o turno atual --- */
    const play = (rate) =>
      speech.speakSequence(battute, {
        rate,
        onTurn: (turn) => {
          for (const li of transcript.querySelectorAll('.battuta')) {
            li.style.outline = li.dataset.it === turn.it ? '2px solid var(--accent)' : '';
          }
        },
        onDone: () => {
          for (const li of transcript.querySelectorAll('.battuta')) li.style.outline = '';
          if (current === 0) unlock(1);
        },
      });

    root.append(audioBar({ playLabel: 'Ouvir o diálogo', onPlay: play }));

    /* --- Transcrição: escondida até a passada que a libera --- */
    const transcript = el('ul', { class: 'battute', hidden: true });
    for (const b of battute) {
      const li = el('li', { class: 'battuta', 'data-speaker': b.speaker });
      li.dataset.it = b.it;
      li.append(
        speakButton(b.it, { speaker: b.speaker }),
        el('span', { class: 'battuta__nome' }, b.nome ?? b.speaker),
        el('span', { class: 'item__text' },
          el('span', { class: 'item__it', html: b.it }),
          b.pt ? el('span', { class: 'item__pt', html: b.pt }) : null
        )
      );
      transcript.append(li);
    }
    root.append(transcript);

    const revealBtn = el('button', { class: 'btn', type: 'button', hidden: true }, '👁 Mostrar transcrição');
    revealBtn.addEventListener('click', () => {
      transcript.hidden = !transcript.hidden;
      revealBtn.textContent = transcript.hidden ? '👁 Mostrar transcrição' : '🙈 Esconder transcrição';
    });
    root.append(revealBtn);

    /* --- Área de anotação (passada 2) --- */
    const noteWrap = el('div', { class: 'block', hidden: true },
      el('div', { class: 'block__title' }, 'Suas anotações'),
      el('textarea', {
        rows: '3',
        'aria-label': 'Anotações da escuta',
        placeholder: 'anote só o que pediram…',
      })
    );
    const noteArea = noteWrap.querySelector('textarea');
    root.append(noteWrap);

    /* --- Perguntas (passada 3) --- */
    const domandeWrap = el('div', { class: 'block', hidden: true });
    const inputs = new Map();
    const detailPassata = passate.find((p) => p.focus === 'detail');

    if (detailPassata?.domande?.length) {
      domandeWrap.append(el('div', { class: 'block__title' }, 'Perguntas'));
      const ul = el('ul', { class: 'domande' });
      for (const d of detailPassata.domande) {
        const input = el('input', {
          type: 'text',
          autocomplete: 'off',
          autocapitalize: 'off',
          spellcheck: 'false',
          lang: 'it',
          'aria-label': d.domanda,
        });
        inputs.set(d.id, { input, domanda: d });
        ul.append(
          el('li', {},
            el('label', { class: 'domanda__label' }, d.domanda),
            input
          )
        );
      }
      domandeWrap.append(ul);

      const send = el('button', { class: 'btn btn--primary', type: 'button' }, 'Verificar respostas');
      send.addEventListener('click', () => ctx.submit(null));
      domandeWrap.append(el('div', { class: 'ex__actions' }, send));
    }
    root.append(domandeWrap);

    const feedback = el('div', { class: 'feedback', role: 'status', 'aria-live': 'polite', hidden: true });
    root.append(feedback);

    /* --- Máquina de estados das passadas --- */
    function unlock(i) {
      if (i < tabButtons.length && tabButtons[i].disabled) {
        tabButtons[i].disabled = false;
        tabButtons[i].classList.add('btn--primary');
      }
    }

    function show(i) {
      current = i;
      const p = passate[i];
      speech.cancel();

      tabButtons.forEach((b, k) => b.setAttribute('aria-pressed', k === i ? 'true' : 'false'));

      istruzione.innerHTML = '';
      istruzione.append(
        el('span', { class: 'passata__n' }, `Passada ${i + 1} · foco: ${p.focus}`),
        el('div', { html: p.istruzione })
      );

      // A regra que dá sentido ao exercício: na passada 1 não se escreve
      // nem se lê. As duas coisas ficam indisponíveis, não só ocultas.
      const locked = p.inputBloccato === true;

      noteWrap.hidden = p.focus !== 'note';
      if (noteArea) noteArea.disabled = locked;

      domandeWrap.hidden = p.focus !== 'detail';

      const canRead = p.focus === 'detail';
      revealBtn.hidden = !canRead;
      if (!canRead) {
        transcript.hidden = true;
        revealBtn.textContent = '👁 Mostrar transcrição';
      }

      // Chegar na passada 2 ou 3 já libera a seguinte: o aluno controla o ritmo.
      if (i + 1 < passate.length && i > 0) unlock(i + 1);
    }

    show(0);

    root._parts = { inputs, feedback, transcript, revealBtn, show };
    return root;
  },

  /* Um diálogo tem várias respostas; devolvemos a média e a lista por item,
     para que app.js possa registrar cada pergunta separadamente. */
  check(item, _response, root) {
    const results = [];
    for (const [id, { input, domanda }] of root._parts.inputs) {
      const r = checkAnswer(input.value, domanda.risposta, {
        accettaAnche: domanda.accettaAnche,
      });
      results.push({ id, domanda, given: input.value, ...r });
    }
    const score = results.length ? results.filter((r) => r.correct).length / results.length : 0;
    return { correct: score === 1, score, level: score === 1 ? 'exact' : 'partial', results };
  },

  feedback(item, result, root) {
    const { feedback, transcript, revealBtn } = root._parts;
    const tone = result.correct ? 'ok' : result.score >= 0.5 ? 'warn' : 'err';

    feedback.hidden = false;
    feedback.className = `feedback feedback--${tone}`;
    feedback.innerHTML = '';
    feedback.append(
      el('div', { class: `feedback__title feedback__title--${tone}` },
        `${result.results.filter((r) => r.correct).length} de ${result.results.length} corretas`)
    );

    const ul = el('ul', { class: 'items' });
    for (const r of result.results) {
      ul.append(
        el('li', { class: 'item' },
          el('span', {}, r.correct ? '✅' : '❌'),
          el('span', { class: 'item__text' },
            el('span', { html: `<b>${escapeHtml(r.domanda.domanda)}</b>` }),
            el('span', { class: 'item__pt' },
              r.correct
                ? (r.nota ? '' : 'certo')
                : `você escreveu «${escapeHtml(r.given || '—')}» · resposta: `
            ),
            r.correct
              ? (r.nota ? el('span', { class: 'item__nota', html: r.nota }) : null)
              : el('span', { class: 'item__nota', html: `<b>${escapeHtml(r.domanda.risposta)}</b>` })
          )
        )
      );
    }
    feedback.append(ul);

    // Erro em pergunta de detalhe é sinal para ouvir de novo com o texto à vista.
    if (!result.correct) {
      feedback.append(el('p', { html:
        'Abra a transcrição e use o 🔊 de cada linha para reouvir só o trecho que te escapou.' }));
      transcript.hidden = false;
      revealBtn.hidden = false;
      revealBtn.textContent = '🙈 Esconder transcrição';
    }

    return feedback;
  },

  reveal(item, root) {
    const { transcript, revealBtn, inputs } = root._parts;
    transcript.hidden = false;
    revealBtn.hidden = false;
    revealBtn.textContent = '🙈 Esconder transcrição';
    for (const [, { input, domanda }] of inputs) input.value = domanda.risposta;
  },
};
