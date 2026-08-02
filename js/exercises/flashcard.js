/* ==========================================================================
   flashcard.js — revisão do léxico da aula, uma carta por vez.

   O baralho sai dos `chunks` da própria aula. Até aqui esse array existia em
   todo `content/lezione-NN.json` e **nada em js/ o lia** — era inventário
   catalogado e nunca usado. É o que este tipo resolve.

   Quatro decisões que valem explicar:

   1. **Uma carta por vez, não uma lista.** A primeira versão empilhava as
      cartas numa `<ol>`, e isso destruía o exercício por um caminho bobo: o
      olho lê a carta de baixo enquanto tenta a de cima. Um baralho só é um
      baralho se a próxima estiver fora de vista.

   2. **O aluno se autoavalia.** Não há campo de digitação. Um flashcard mede
      *recuperação de memória*, e digitar mede ortografia — que já é medida
      em toda a outra metade do site. Pedir para digitar aqui transformaria
      uma revisão de trinta segundos numa sessão de dez minutos, e o aluno
      pararia de fazer. A honestidade da autoavaliação é problema do aluno,
      e ele é o único usuário: não há nota, não há ranking, mentir só
      atrapalha ele mesmo.

   3. **Frente em português (ou em figura), verso em italiano.** É a direção
      difícil — produção, não reconhecimento. Ver `il ceco` e lembrar «o
      tcheco» é quase automático para lusófono; o caminho inverso é o que
      trava numa conversa. Com `figura`, a frente deixa de ter até a muleta
      da tradução: o caminho vira conceito → italiano, direto.

   4. **«Lembrei» avança sozinho; «Não lembrei» fica.** A assimetria é de
      propósito. Numa carta que você sabia não há mais nada a fazer; numa
      que você errou há duas — ouvir de novo e guardar no caderno — e é
      exatamente o momento em que guardar vale a pena. Avançar ali tiraria a
      oportunidade justo quando ela aparece.

   Só `word`, `collocation` e `fixed` entram — `semiFixed` tem lacuna por
   definição (`Io sono ___`) e não tem verso. Ele é matéria do slot-frame.
   ========================================================================== */

import { el, speakButton } from '../render.js';
import { escapeHtml } from '../check.js';
import * as speech from '../speech.js';

/** chunkTypes que viram carta. Ver CLAUDE.md. */
export const TIPI_CARTA = new Set(['word', 'collocation', 'fixed']);

/** `figura` aceita duas formas: um emoji (o caso comum) ou um SVG inline
 *  (a exceção, quando não existe emoji que sirva). O validador garante que
 *  é uma das duas e que o SVG não traz script nem referência externa — aqui
 *  só decidimos como pintar. */
const ehSvg = (fig) => typeof fig === 'string' && fig.trimStart().startsWith('<svg');

/** A frente da carta: a figura quando existe, senão o português.
 *
 *  A figura vai com `role="img"` e a glossa portuguesa como nome acessível.
 *  Para quem usa leitor de tela a carta degrada exatamente para a carta de
 *  texto — o que é honesto: estímulo visual não tem substituto textual que
 *  não seja a própria tradução. */
function frente(carta) {
  if (!carta.figura) return el('p', { class: 'carta__pt', html: carta.pt ?? '' });

  const fig = el('div', {
    class: 'carta__figura', role: 'img', 'aria-label': carta.pt ?? '',
  });
  if (ehSvg(carta.figura)) fig.innerHTML = carta.figura;
  else fig.textContent = carta.figura;
  return fig;
}

export default {
  type: 'flashcard',

  subItemIds: (ex) => (ex.carte ?? []).map((c) => c.id),

  render(item, ctx) {
    const root = el('div', { class: 'ex__body' });
    const rows = new Map();
    const carte = item.carte ?? [];

    const conta = el('p', { class: 'carta__conta', role: 'status', 'aria-live': 'polite' });
    const ol = el('ol', { class: 'carte carte--mazzo' });

    for (const carta of carte) {
      // tabindex=-1 para o foco poder ir para a carta ao virar de página:
      // sem isso o leitor de tela não percebe que a tela inteira mudou.
      const li = el('li', { class: 'carta', tabindex: '-1', hidden: true });

      li.append(frente(carta));

      /* Verso: escondido até o aluno tentar lembrar. Com figura, o verso
         traz também o português — 🚗 sozinho não distingue `la macchina` de
         `l'auto`, e o aluno precisa saber se acertou. */
      const verso = el('p', { class: 'carta__it', hidden: true },
        speakButton(carta.it),
        el('span', { html: `<b>${escapeHtml(carta.it)}</b>` }),
        carta.figura ? el('span', { class: 'carta__gloss', html: carta.pt ?? '' }) : null
      );

      const mostrar = el('button', { class: 'btn btn--sm btn--primary', type: 'button' }, '👁 Mostrar');
      const sbagliato = el('button', {
        class: 'btn btn--sm carta__voto', type: 'button',
        'data-voto': 'no', 'aria-pressed': 'false', hidden: true,
      }, '✗ Não lembrei');
      const giusto = el('button', {
        class: 'btn btn--sm carta__voto', type: 'button',
        'data-voto': 'si', 'aria-pressed': 'false', hidden: true,
      }, '✓ Lembrei');

      /* Caderno léxico: guardar o chunk para escrever a SUA frase com ele
         depois. O botão vive aqui porque é aqui que o aluno descobre que
         não lembrava — que é exatamente quando vale a pena guardar. */
      const guardar = el('button', {
        class: 'btn btn--sm carta__caderno', type: 'button', hidden: true,
        'aria-pressed': ctx.notebook?.has(carta.id) ? 'true' : 'false',
      }, ctx.notebook?.has(carta.id) ? '✓ no caderno' : '＋ caderno');

      const dica = el('p', { class: 'carta__dica', hidden: true },
        'Ouça de novo, guarde no caderno se quiser — depois siga com «Próxima ›».');

      mostrar.addEventListener('click', () => {
        verso.hidden = false;
        mostrar.hidden = true;
        sbagliato.hidden = false;
        giusto.hidden = false;
        guardar.hidden = false;
        speech.speak(carta.it);
      });

      const votar = (escolhido) => {
        for (const b of [sbagliato, giusto]) {
          const on = b === escolhido;
          b.setAttribute('aria-pressed', on ? 'true' : 'false');
          b.classList.toggle('carta__voto--on', on);
        }
      };

      giusto.addEventListener('click', () => {
        votar(giusto);
        dica.hidden = true;
        avancar();
      });
      sbagliato.addEventListener('click', () => {
        votar(sbagliato);
        dica.hidden = false;
      });

      guardar.addEventListener('click', () => {
        const dentro = ctx.notebook?.toggle?.(carta);
        guardar.setAttribute('aria-pressed', dentro ? 'true' : 'false');
        guardar.textContent = dentro ? '✓ no caderno' : '＋ caderno';
      });

      li.append(verso, el('div', { class: 'ex__row' }, mostrar, sbagliato, giusto, guardar), dica);

      rows.set(carta.id, { carta, li, verso, mostrar, sbagliato, giusto, guardar, dica });
      ol.append(li);
    }

    /* --- Navegação do baralho ---------------------------------------- */

    const voltar = el('button', { class: 'btn btn--sm', type: 'button' }, '‹ Voltar');
    const avanti = el('button', { class: 'btn btn--sm', type: 'button' }, 'Próxima ›');
    const nav = el('div', { class: 'ex__row carta__nav' }, voltar, avanti);

    /* «Registrar revisão» só aparece na última carta. Não é rigor gratuito:
       carta não votada conta como não lembrada, então enviar no meio do
       baralho reprovaria em bloco tudo o que o aluno ainda nem viu. */
    const send = el('button', { class: 'btn btn--primary', type: 'button', hidden: true }, 'Registrar revisão');
    send.addEventListener('click', () => ctx.submit(null));

    const lista = [...rows.values()];
    let atual = 0;

    function ir(i) {
      atual = Math.max(0, Math.min(lista.length - 1, i));
      lista.forEach((r, k) => { r.li.hidden = k !== atual; });
      conta.textContent = `Carta ${atual + 1} de ${lista.length}`;
      voltar.disabled = atual === 0;
      const ultima = atual === lista.length - 1;
      avanti.hidden = ultima;
      send.hidden = !ultima;
      lista[atual].li.focus?.();
    }

    function avancar() {
      if (atual < lista.length - 1) ir(atual + 1);
    }

    voltar.addEventListener('click', () => ir(atual - 1));
    avanti.addEventListener('click', () => ir(atual + 1));

    root.append(conta, ol, nav);

    if (lista.length) {
      ir(0);
    } else {
      // Baralho vazio não acontece por `flashcardDeck` (ele devolve null),
      // mas acontece por item escrito à mão e não pode virar tela travada.
      conta.textContent = 'Nenhuma carta nesta aula.';
      nav.hidden = true;
      send.hidden = false;
    }

    const feedback = el('div', { class: 'feedback', role: 'status', 'aria-live': 'polite', hidden: true });
    root.append(el('div', { class: 'ex__actions' }, send), feedback);

    root._parts = { rows, feedback, conta, nav, ir, atual: () => atual };
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

  /** «Mostrar resposta» abre o baralho inteiro de uma vez: aqui já não há
   *  o que proteger — o app.js só libera este botão depois do envio. */
  reveal(item, root) {
    const { rows, conta, nav } = root._parts;
    for (const [, row] of rows) {
      row.li.hidden = false;
      row.verso.hidden = false;
      row.mostrar.hidden = true;
      row.sbagliato.hidden = false;
      row.giusto.hidden = false;
      row.guardar.hidden = false;
    }
    nav.hidden = true;
    if (rows.size) conta.textContent = `${rows.size} carta(s) — baralho aberto`;
  },
};
