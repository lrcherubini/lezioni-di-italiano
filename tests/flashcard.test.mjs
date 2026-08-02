/* Flashcard — o baralho derivado dos chunks.

   Arquivo próprio: o cenário exercita speech.js (mostrar a carta fala) e o
   estado de módulo dele precisa entrar virgem, como nos outros cenários.

   Duas coisas se testam aqui. A DERIVAÇÃO — o baralho não é escrito à mão,
   ele sai dos chunks, e se `flashcardDeck` e `count_items` discordarem sobre
   quais chunks entram, o `conteggio` do manifest mente e a barra de
   progresso mente junto. E o BARALHO — que só uma carta esteja em jogo por
   vez, porque uma lista empilhada deixa o olho ler a resposta de baixo e o
   exercício deixa de medir recuperação.

   Sobre `hidden`: aqui ele é propriedade, e o shim de DOM não interpreta
   CSS. Quem garante que `hidden` de fato esconde na tela é
   `tests/css.test.mjs` — foi assim que o verso da carta nasceu visível
   apesar de todos estes testes passarem. */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { installDOM, installStorage } from './support/dom.mjs';
import { makeSpeechSynthesis, installUtterance, IT_VOICES } from './support/speech-stub.mjs';
import { flush, readContent, contentFiles } from './support/fixtures.mjs';

const synth = makeSpeechSynthesis({ voices: IT_VOICES });
installUtterance();
installDOM({ speechSynthesis: synth });
installStorage();

const { getExercise, flashcardDeck } = await import('../js/exercises/index.js');
const { TIPI_CARTA } = await import('../js/exercises/flashcard.js');
const speech = await import('../js/speech.js');
await speech.voicesReady();

const mod = getExercise('flashcard');

function montar(item) {
  const enviados = [];
  const ctx = { submit: (r) => enviados.push(r), lesson: '02', speak: speech.speak };
  const root = mod.render(item, ctx);
  return { root, enviados, rows: [...root._parts.rows.values()], q: (s) => root.querySelectorAll(s) };
}

/** A navegação do baralho não fica no `_parts` (não é canal entre render e
 *  check) — os testes a alcançam pelo texto do botão, como o aluno. */
function botao(root, texto) {
  return [...root.querySelectorAll('button')].find((b) => b.textContent.includes(texto));
}

const AULA = {
  id: '02',
  chunks: [
    { id: 'c1', it: 'il ceco', pt: 'o tcheco', chunkType: 'word', category: 'VOCABOLARIO' },
    { id: 'c2', it: 'un po\'', pt: 'um pouco', chunkType: 'collocation', category: 'ESPRESSIONE' },
    { id: 'c3', it: 'Dove abiti?', pt: 'Onde você mora?', chunkType: 'fixed', category: 'ESPRESSIONE' },
    { id: 'c4', it: 'Io parlo ___.', pt: 'Eu falo ___.', chunkType: 'semiFixed', category: 'VERBO' },
  ],
};

const DECK = flashcardDeck(AULA);

/* --- Derivação ------------------------------------------------------------ */

describe('flashcardDeck', () => {
  test('inclui word, collocation e fixed', () => {
    assert.deepEqual(DECK.carte.map((c) => c.id), ['c1', 'c2', 'c3']);
  });

  test('EXCLUI semiFixed — tem lacuna, logo não tem verso', () => {
    assert.ok(!DECK.carte.some((c) => c.chunkType === 'semiFixed'));
    assert.ok(!TIPI_CARTA.has('semiFixed'));
  });

  test('o id do sub-item é o id do CHUNK, que é imutável', () => {
    assert.deepEqual(mod.subItemIds(DECK), ['c1', 'c2', 'c3']);
  });

  test('aula sem chunk elegível não gera baralho', () => {
    assert.equal(flashcardDeck({ id: '00', chunks: [{ id: 'x', chunkType: 'semiFixed' }] }), null);
    assert.equal(flashcardDeck({ id: '00', chunks: [] }), null);
    assert.equal(flashcardDeck({ id: '00' }), null);
  });

  test('a consegna não promete um gesto que não existe', () => {
    // A primeira versão dizia «antes de virar a carta» e não havia nada
    // para virar. Copy que descreve um gesto inexistente é bug de UI.
    assert.ok(!/virar/i.test(DECK.consegna), DECK.consegna);
    assert.match(DECK.consegna, /Mostrar/);
  });

  test('todas as aulas reais rendem um baralho coerente', () => {
    for (const f of contentFiles().filter((x) => x.startsWith('lezione-'))) {
      const lesson = readContent(f);
      const deck = flashcardDeck(lesson);
      if (!deck) continue;
      const esperado = lesson.chunks.filter((c) => TIPI_CARTA.has(c.chunkType)).length;
      assert.equal(deck.carte.length, esperado, f);
      // Nenhum id de carta pode colidir com id de exercício.
      const exIds = new Set((lesson.esercizi ?? []).map((e) => e.id));
      for (const c of deck.carte) assert.ok(!exIds.has(c.id), `${f}: id ${c.id} colide`);
    }
  });
});

/* --- O baralho ------------------------------------------------------------ */

describe('uma carta por vez', () => {
  test('só a primeira está em jogo — as outras nem existem na tela', () => {
    const { rows } = montar(DECK);
    assert.deepEqual(rows.map((r) => r.li.hidden), [false, true, true]);
  });

  test('o contador diz onde você está', () => {
    const { root } = montar(DECK);
    assert.equal(root._parts.conta.textContent, 'Carta 1 de 3');
  });

  test('«Próxima ›» avança e «‹ Voltar» volta', () => {
    const { root, rows } = montar(DECK);
    botao(root, 'Próxima').dispatchEvent({ type: 'click' });
    assert.deepEqual(rows.map((r) => r.li.hidden), [true, false, true]);
    assert.equal(root._parts.conta.textContent, 'Carta 2 de 3');

    botao(root, 'Voltar').dispatchEvent({ type: 'click' });
    assert.deepEqual(rows.map((r) => r.li.hidden), [false, true, true]);
  });

  test('na primeira carta não há para onde voltar', () => {
    const { root } = montar(DECK);
    assert.equal(botao(root, 'Voltar').disabled, true);
    botao(root, 'Próxima').dispatchEvent({ type: 'click' });
    assert.equal(botao(root, 'Voltar').disabled, false);
  });

  test('«Registrar revisão» só aparece na última carta', () => {
    // Carta não votada conta como não lembrada: enviar no meio do baralho
    // reprovaria em bloco tudo o que o aluno ainda nem viu.
    const { root } = montar(DECK);
    const send = botao(root, 'Registrar revisão');
    assert.equal(send.hidden, true);

    botao(root, 'Próxima').dispatchEvent({ type: 'click' });
    assert.equal(send.hidden, true);
    botao(root, 'Próxima').dispatchEvent({ type: 'click' });
    assert.equal(send.hidden, false);
    assert.equal(botao(root, 'Próxima').hidden, true, 'não há próxima depois da última');
  });

  test('enviar chama o ctx.submit uma vez', () => {
    const { root, enviados } = montar(DECK);
    botao(root, 'Próxima').dispatchEvent({ type: 'click' });
    botao(root, 'Próxima').dispatchEvent({ type: 'click' });
    botao(root, 'Registrar revisão').dispatchEvent({ type: 'click' });
    assert.equal(enviados.length, 1);
  });
});

describe('a carta esconde o verso até você tentar', () => {
  test('o italiano nasce oculto — senão não há recuperação, só leitura', () => {
    const { rows } = montar(DECK);
    for (const row of rows) {
      assert.equal(row.verso.hidden, true);
      assert.equal(row.giusto.hidden, true, 'não dá para votar antes de ver');
      assert.equal(row.sbagliato.hidden, true);
      assert.equal(row.guardar.hidden, true, 'nem guardar antes de saber o que é');
    }
  });

  test('o português aparece de saída, e sem áudio', () => {
    const { q } = montar(DECK);
    const frentes = q('.carta__pt');
    assert.equal(frentes.length, 3);
    for (const f of frentes) assert.equal(f.querySelectorAll('.speak').length, 0);
  });

  test('Mostrar revela o verso, libera o voto e fala em italiano', async () => {
    const { rows } = montar(DECK);
    const [row] = rows;
    row.mostrar.dispatchEvent({ type: 'click' });
    await flush();

    assert.equal(row.verso.hidden, false);
    assert.equal(row.mostrar.hidden, true);
    assert.equal(row.giusto.hidden, false);
    assert.equal(row.guardar.hidden, false);
    assert.equal(synth.spoken.at(-1).text, 'il ceco');
    assert.equal(synth.spoken.at(-1).lang, 'it-IT');
  });

  test('Mostrar abre SÓ a carta corrente', () => {
    const { rows } = montar(DECK);
    rows[0].mostrar.dispatchEvent({ type: 'click' });
    assert.deepEqual(rows.map((r) => r.verso.hidden), [false, true, true]);
  });
});

describe('autoavaliação', () => {
  test('«Lembrei» avança sozinho — não há mais nada a fazer ali', () => {
    const { root, rows } = montar(DECK);
    rows[0].giusto.dispatchEvent({ type: 'click' });
    assert.equal(root._parts.conta.textContent, 'Carta 2 de 3');
  });

  test('«Não lembrei» FICA, e explica por quê', () => {
    // É o único momento em que guardar no caderno vale a pena; avançar
    // tiraria a oportunidade justo quando ela aparece.
    const { root, rows } = montar(DECK);
    rows[0].sbagliato.dispatchEvent({ type: 'click' });
    assert.equal(root._parts.conta.textContent, 'Carta 1 de 3');
    assert.equal(rows[0].dica.hidden, false);
    assert.match(rows[0].dica.textContent, /caderno/);
  });

  test('na última carta, «Lembrei» não tem para onde avançar', () => {
    const { root, rows } = montar(DECK);
    root._parts.ir(2);
    rows[2].giusto.dispatchEvent({ type: 'click' });
    assert.equal(root._parts.conta.textContent, 'Carta 3 de 3');
    assert.equal(rows[2].giusto.getAttribute('aria-pressed'), 'true');
  });

  test('votar «lembrei» exclui «não lembrei» e vice-versa', () => {
    const { rows } = montar(DECK);
    const [row] = rows;
    row.giusto.dispatchEvent({ type: 'click' });
    assert.equal(row.giusto.getAttribute('aria-pressed'), 'true');
    assert.equal(row.sbagliato.getAttribute('aria-pressed'), 'false');

    row.sbagliato.dispatchEvent({ type: 'click' });
    assert.equal(row.giusto.getAttribute('aria-pressed'), 'false');
    assert.equal(row.sbagliato.getAttribute('aria-pressed'), 'true');
  });

  test('o voto sobrevive ao ir e voltar', () => {
    const { root, rows } = montar(DECK);
    rows[0].giusto.dispatchEvent({ type: 'click' });   // avança para a 2
    botao(root, 'Voltar').dispatchEvent({ type: 'click' });
    assert.equal(rows[0].giusto.getAttribute('aria-pressed'), 'true');
    assert.equal(rows[0].li.hidden, false);
  });

  test('o voto de uma carta não afeta as outras', () => {
    const { rows } = montar(DECK);
    rows[0].giusto.dispatchEvent({ type: 'click' });
    assert.equal(rows[1].giusto.getAttribute('aria-pressed'), 'false');
  });

  test('check devolve um result por carta, com o id do chunk', () => {
    const { root, rows } = montar(DECK);
    rows[0].giusto.dispatchEvent({ type: 'click' });
    rows[1].sbagliato.dispatchEvent({ type: 'click' });
    // a terceira fica sem voto de propósito.

    const r = mod.check(DECK, null, root);
    assert.deepEqual(r.results.map((x) => x.id), ['c1', 'c2', 'c3']);
    assert.deepEqual(r.results.map((x) => x.correct), [true, false, false]);
    assert.equal(r.score, 1 / 3);
  });

  test('carta nunca vista conta como NÃO lembrada — o lado seguro', () => {
    const { root } = montar(DECK);
    const r = mod.check(DECK, null, root);
    assert.equal(r.score, 0);
    assert.equal(r.results.every((x) => !x.votou), true);
  });

  test('tudo lembrado é acerto total', () => {
    const { root, rows } = montar(DECK);
    for (const row of rows) row.giusto.dispatchEvent({ type: 'click' });
    const r = mod.check(DECK, null, root);
    assert.equal(r.correct, true);
    assert.equal(r.level, 'exact');
  });
});

/* --- Figura --------------------------------------------------------------- */

describe('carta com figura', () => {
  const COM_FIGURA = {
    id: 'x-lex', type: 'flashcard',
    carte: [
      { id: 'f1', it: 'la macchina', pt: 'o carro', chunkType: 'word', figura: '🚗' },
      { id: 'f2', it: 'la penna', pt: 'a caneta', chunkType: 'word',
        figura: '<svg viewBox="0 0 64 64"><path d="M8 56 L56 8"/></svg>' },
    ],
  };

  test('a frente mostra a figura NO LUGAR do português', () => {
    // Com a tradução na tela o caminho vira PT → IT; sem ela, vira
    // conceito → IT, que é o que trava numa conversa.
    const { q } = montar(COM_FIGURA);
    assert.equal(q('.carta__figura').length, 2);
    assert.equal(q('.carta__pt').length, 0);
    assert.equal(q('.carta__figura')[0].textContent, '🚗');
  });

  test('a figura tem nome acessível — degrada para a carta de texto', () => {
    const { q } = montar(COM_FIGURA);
    const fig = q('.carta__figura')[0];
    assert.equal(fig.getAttribute('role'), 'img');
    assert.equal(fig.getAttribute('aria-label'), 'o carro');
  });

  test('SVG inline entra como marcação, emoji entra como texto', () => {
    const { q } = montar(COM_FIGURA);
    assert.match(q('.carta__figura')[1].innerHTML, /^<svg /);
    assert.ok(!q('.carta__figura')[0].innerHTML.includes('<'), 'emoji não vira marcação');
  });

  test('o verso confirma com o português — 🚗 não distingue macchina de auto', () => {
    const { q, rows } = montar(COM_FIGURA);
    rows[0].mostrar.dispatchEvent({ type: 'click' });
    assert.equal(q('.carta__gloss').length, 2);
    assert.equal(q('.carta__gloss')[0].innerHTML, 'o carro');
    assert.match(rows[0].verso.textContent, /la macchina/);
  });

  test('sem figura, nada muda: verso sem glossa repetida', () => {
    const { q } = montar(DECK);
    assert.equal(q('.carta__gloss').length, 0);
    assert.equal(q('.carta__figura').length, 0);
  });
});

/* --- Fecho ---------------------------------------------------------------- */

describe('feedback', () => {
  test('avisa quantas cartas ficaram sem voto', () => {
    const { root, rows } = montar(DECK);
    rows[0].giusto.dispatchEvent({ type: 'click' });
    const fb = mod.feedback(DECK, mod.check(DECK, null, root), root);
    assert.match(fb.textContent, /1 de 3 lembradas/);
    assert.match(fb.textContent, /2 carta\(s\) sem voto/);
  });

  test('sem cartas erradas, não oferece o replay', () => {
    const { root, rows } = montar(DECK);
    for (const row of rows) row.giusto.dispatchEvent({ type: 'click' });
    const fb = mod.feedback(DECK, mod.check(DECK, null, root), root);
    assert.equal(fb.querySelectorAll('.btn--sm').length, 0);
  });

  test('«ouvir as que faltaram» fala só as erradas, em ordem', async () => {
    const { root, rows } = montar(DECK);
    rows[0].giusto.dispatchEvent({ type: 'click' });
    const fb = mod.feedback(DECK, mod.check(DECK, null, root), root);

    const antes = synth.spoken.length;
    fb.querySelectorAll('.btn--sm')[0].dispatchEvent({ type: 'click' });
    // Duas erradas, encadeadas por onend + pausa.
    const limite = Date.now() + 3000;
    while (synth.spoken.length < antes + 2 && Date.now() < limite) {
      await new Promise((res) => setTimeout(res, 20));
    }
    const ditos = synth.spoken.slice(antes).map((u) => u.text);
    assert.deepEqual(ditos.slice(0, 2), ["un po'", 'Dove abiti?']);
  });
});

describe('reveal', () => {
  test('abre o baralho inteiro sem votar por você', () => {
    const { root, rows } = montar(DECK);
    mod.reveal(DECK, root);
    for (const row of rows) {
      assert.equal(row.li.hidden, false, 'reveal desfaz o baralho');
      assert.equal(row.verso.hidden, false);
      assert.equal(row.giusto.getAttribute('aria-pressed'), 'false',
        'reveal mostra a resposta; quem avalia continua sendo o aluno');
    }
    assert.equal(root._parts.nav.hidden, true, 'não há mais o que navegar');
  });
});

describe('botão «＋ caderno»', () => {
  /** ctx com um caderno de mentira: o módulo NUNCA fala com o store. */
  function comCaderno(dentro = new Set()) {
    const eventos = [];
    const ctx = {
      submit: () => {},
      lesson: '02',
      speak: speech.speak,
      notebook: {
        has: (id) => dentro.has(id),
        toggle(carta) {
          eventos.push(carta.id);
          if (dentro.has(carta.id)) { dentro.delete(carta.id); return false; }
          dentro.add(carta.id);
          return true;
        },
      },
    };
    return { root: mod.render(DECK, ctx), dentro, eventos };
  }

  test('nasce «＋» quando a carta não está no caderno', () => {
    const { root } = comCaderno();
    const b = root.querySelectorAll('.carta__caderno')[0];
    assert.equal(b.getAttribute('aria-pressed'), 'false');
    assert.equal(b.textContent, '＋ caderno');
  });

  test('nasce «✓» quando já está — o estado vem do store, não da sessão', () => {
    const { root } = comCaderno(new Set(['c1']));
    const b = root.querySelectorAll('.carta__caderno')[0];
    assert.equal(b.getAttribute('aria-pressed'), 'true');
    assert.match(b.textContent, /no caderno/);
  });

  test('clicar alterna nos dois sentidos, e avisa o app uma vez por clique', () => {
    const { root, dentro, eventos } = comCaderno();
    const b = root.querySelectorAll('.carta__caderno')[0];

    b.dispatchEvent({ type: 'click' });
    assert.equal(dentro.has('c1'), true);
    assert.equal(b.getAttribute('aria-pressed'), 'true');

    b.dispatchEvent({ type: 'click' });
    assert.equal(dentro.has('c1'), false);
    assert.equal(b.getAttribute('aria-pressed'), 'false');

    assert.deepEqual(eventos, ['c1', 'c1']);
  });

  test('sem ctx.notebook o botão não quebra a carta', () => {
    // O Ripasso monta o mesmo tipo; se um dia esquecer de passar o caderno,
    // o card tem que continuar utilizável em vez de estourar no clique.
    const { root } = montar(DECK);
    const b = root.querySelectorAll('.carta__caderno')[0];
    assert.doesNotThrow(() => b.dispatchEvent({ type: 'click' }));
    assert.equal(b.getAttribute('aria-pressed'), 'false');
  });
});

describe('baralho vazio', () => {
  test('não quebra check nem feedback, e não vira tela travada', () => {
    const vazio = { id: 'x', type: 'flashcard', carte: [] };
    const { root } = montar(vazio);
    const r = mod.check(vazio, null, root);
    assert.equal(r.score, 0);
    assert.equal(r.results.length, 0);
    assert.doesNotThrow(() => mod.feedback(vazio, r, root));
    assert.doesNotThrow(() => mod.reveal(vazio, root));
    assert.equal(botao(root, 'Registrar revisão').hidden, false, 'dá para sair dele');
    assert.equal(root._parts.nav.hidden, true);
  });
});
