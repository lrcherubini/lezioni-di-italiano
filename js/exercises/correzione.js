/* ==========================================================================
   correzione.js — ler uma frase errada e reescrevê-la certa.

   O que este drill treina é MONITORAMENTO, que não é a mesma coisa que
   produção. O aluno que escreve `Lui legge il giornale` sem hesitar pode
   passar direto por `Lui legge i giornale` num texto seu, porque produzir e
   revisar usam atenções diferentes. Nenhum dos seis drills da escada cobria
   isso: todos partem de material certo.

   O aluno reescreve a frase INTEIRA, e o campo nasce vazio. Prefixá-lo com
   a frase errada faria a tarefa virar edição de uma palavra; aqui vale a
   mesma razão do slot-frame e do trasformazione — o que se automatiza é o
   molde, e o molde só se automatiza passando inteiro.

   ⚠ A ARMADILHA DESTE ARQUIVO, e ela é única no projeto.

   `sbagliata` é o ÚNICO texto italiano do site que não deve ser ensinado.
   Todo o resto assume a equivalência «italiano exibido ⇒ 🔊 ⇒ entra no
   léxico» (invariante 7.1 do CLAUDE.md), e aqui ela se quebra nas duas
   pontas de propósito:

     · NÃO ganha botão de áudio. Ouvir a forma errada em voz italiana é
       exatamente o jeito de gravá-la como se fosse boa.
     · NÃO entra em content/lessico.json. Se entrasse, a checagem do i+1
       passaria a autorizar um diálogo a usar a forma errada.

   Só a `risposta` é audível, e só depois de responder — como em todo lugar.
   ========================================================================== */

import { el, speakButton, subChip, prose } from '../render.js';
import { checkAnswer, normalize, escapeHtml } from '../check.js';
import * as speech from '../speech.js';

export default {
  type: 'correzione',

  subItemIds: (ex) => (ex.frasi ?? []).map((f) => f.id),

  render(item, ctx) {
    const root = el('div', { class: 'ex__body' });
    const rows = new Map();

    const ol = el('ol', { class: 'correzione' });

    for (const frase of item.frasi ?? []) {
      const li = el('li', { class: 'correzione__frase' });

      /* Sem speakButton, e o `✗ errata` é textual de propósito: quem usa
         leitor de tela precisa saber que a frase está errada, e cor não é
         canal de informação (DESIGN §1.8). */
      li.append(el('div', { class: 'correzione__sbagliata' },
        subChip('✗ errata'),
        el('span', { class: 'correzione__testo', html: escapeHtml(frase.sbagliata ?? '') })
      ));

      if (frase.pt) {
        li.append(el('p', { class: 'correzione__gloss', html: frase.pt }));
      }

      const input = el('input', {
        type: 'text',
        autocomplete: 'off',
        autocapitalize: 'off',
        spellcheck: 'false',
        lang: 'it',
        class: 'correzione__input',
        'aria-label': `Reescreva certa: ${frase.sbagliata ?? ''}`,
        placeholder: 'a frase inteira, corrigida…',
      });
      input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') ctx.submit(null);
      });
      li.append(input);

      const esito = el('p', { class: 'correzione__esito', hidden: true });
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
        tolleranzaElisione: false,
      });

      // Copiar a frase errada é o engano previsível deste tipo, e merece
      // uma resposta melhor que «errado»: o aluno não achou o erro.
      const copiou = !r.correct
        && normalize(row.input.value) === normalize(row.frase.sbagliata ?? '');

      results.push({
        id,
        ...row,
        ...r,
        copiou,
        nota: copiou
          ? 'Você repetiu a frase como ela estava. Leia de novo devagar — há <b>uma</b> coisa fora do lugar.'
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
      r.input.classList.toggle('correzione__input--ok', r.correct);
      r.input.classList.toggle('correzione__input--err', !r.correct);

      r.esito.hidden = false;
      r.esito.className = `correzione__esito correzione__esito--${r.correct ? 'ok' : 'err'}`;
      r.esito.innerHTML = '';
      // Só aqui a forma certa vira áudio. A errada nunca.
      r.esito.append(
        speakButton(r.frase.risposta),
        prose(r.correct
          ? (r.nota ?? r.frase.nota ?? `<b>${escapeHtml(r.frase.risposta)}</b>`)
          : `Era <b>${escapeHtml(r.frase.risposta)}</b>. ${r.nota ?? r.frase.nota ?? ''}`,
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

    /* Só as formas CERTAS entram na sequência de áudio. O par
       errada→certa seria tentador aqui, e é justamente o que não se pode
       fazer: metade do que o aluno ouviria seria italiano errado. */
    const certe = result.results.map((r) => ({ it: r.frase.risposta })).filter((t) => t.it);
    if (certe.length) {
      const play = el('button', { class: 'btn btn--sm', type: 'button' }, '▶︎ Ouvir as formas certas');
      play.addEventListener('click', () => speech.speakSequence(certe));
      feedback.append(play);
    }

    return feedback;
  },

  reveal(item, root) {
    for (const [, row] of root._parts.rows) {
      row.input.value = row.frase.risposta;
      row.input.classList.add('correzione__input--warn');
    }
  },
};
