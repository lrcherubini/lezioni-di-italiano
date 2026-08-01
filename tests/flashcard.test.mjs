/* Flashcard — o baralho derivado dos chunks.

   Arquivo próprio: o cenário exercita speech.js (virar carta fala) e o
   estado de módulo dele precisa entrar virgem, como nos outros cenários.

   O que se testa aqui é sobretudo a DERIVAÇÃO: o baralho não é escrito à
   mão, ele sai dos chunks. Se `flashcardDeck` e `count_items` discordarem
   sobre quais chunks entram, o `conteggio` do manifest mente e a barra de
   progresso mente junto. */

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
  return { root: mod.render(item, ctx), enviados };
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

/* --- Comportamento -------------------------------------------------------- */

describe('a carta esconde o verso até você tentar', () => {
  test('o italiano nasce oculto — senão não há recuperação, só leitura', () => {
    const { root } = montar(DECK);
    for (const row of root._parts.rows.values()) {
      assert.equal(row.verso.hidden, true);
      assert.equal(row.giusto.hidden, true, 'não dá para votar antes de ver');
      assert.equal(row.sbagliato.hidden, true);
    }
  });

  test('o português aparece de saída, e sem áudio', () => {
    const { root } = montar(DECK);
    const frentes = root.querySelectorAll('.carta__pt');
    assert.equal(frentes.length, 3);
    for (const f of frentes) assert.equal(f.querySelectorAll('.speak').length, 0);
  });

  test('Mostrar revela o verso, libera o voto e fala em italiano', async () => {
    const { root } = montar(DECK);
    const [row] = [...root._parts.rows.values()];
    row.mostrar.dispatchEvent({ type: 'click' });
    await flush();

    assert.equal(row.verso.hidden, false);
    assert.equal(row.mostrar.hidden, true);
    assert.equal(row.giusto.hidden, false);
    assert.equal(synth.spoken.at(-1).text, 'il ceco');
    assert.equal(synth.spoken.at(-1).lang, 'it-IT');
  });
});

describe('autoavaliação', () => {
  test('votar «lembrei» exclui «não lembrei» e vice-versa', () => {
    const { root } = montar(DECK);
    const [row] = [...root._parts.rows.values()];
    row.giusto.dispatchEvent({ type: 'click' });
    assert.equal(row.giusto.getAttribute('aria-pressed'), 'true');
    assert.equal(row.sbagliato.getAttribute('aria-pressed'), 'false');

    row.sbagliato.dispatchEvent({ type: 'click' });
    assert.equal(row.giusto.getAttribute('aria-pressed'), 'false');
    assert.equal(row.sbagliato.getAttribute('aria-pressed'), 'true');
  });

  test('o voto de uma carta não afeta as outras', () => {
    const { root } = montar(DECK);
    const [a, b] = [...root._parts.rows.values()];
    a.giusto.dispatchEvent({ type: 'click' });
    assert.equal(b.giusto.getAttribute('aria-pressed'), 'false');
  });

  test('check devolve um result por carta, com o id do chunk', () => {
    const { root } = montar(DECK);
    const [a, b, c] = [...root._parts.rows.values()];
    a.giusto.dispatchEvent({ type: 'click' });
    b.sbagliato.dispatchEvent({ type: 'click' });
    // c fica sem voto de propósito.

    const r = mod.check(DECK, null, root);
    assert.deepEqual(r.results.map((x) => x.id), ['c1', 'c2', 'c3']);
    assert.deepEqual(r.results.map((x) => x.correct), [true, false, false]);
    assert.equal(r.score, 1 / 3);
  });

  test('carta sem voto conta como NÃO lembrada — o lado seguro', () => {
    const { root } = montar(DECK);
    const r = mod.check(DECK, null, root);
    assert.equal(r.score, 0);
    assert.equal(r.results.every((x) => !x.votou), true);
  });

  test('tudo lembrado é acerto total', () => {
    const { root } = montar(DECK);
    for (const row of root._parts.rows.values()) row.giusto.dispatchEvent({ type: 'click' });
    const r = mod.check(DECK, null, root);
    assert.equal(r.correct, true);
    assert.equal(r.level, 'exact');
  });
});

describe('feedback', () => {
  test('avisa quantas cartas ficaram sem voto', () => {
    const { root } = montar(DECK);
    const [a] = [...root._parts.rows.values()];
    a.giusto.dispatchEvent({ type: 'click' });
    const fb = mod.feedback(DECK, mod.check(DECK, null, root), root);
    assert.match(fb.textContent, /1 de 3 lembradas/);
    assert.match(fb.textContent, /2 carta\(s\) sem voto/);
  });

  test('sem cartas erradas, não oferece o replay', () => {
    const { root } = montar(DECK);
    for (const row of root._parts.rows.values()) row.giusto.dispatchEvent({ type: 'click' });
    const fb = mod.feedback(DECK, mod.check(DECK, null, root), root);
    assert.equal(fb.querySelectorAll('.btn--sm').length, 0);
  });

  test('«ouvir as que faltaram» fala só as erradas, em ordem', async () => {
    const { root } = montar(DECK);
    const [a] = [...root._parts.rows.values()];
    a.giusto.dispatchEvent({ type: 'click' });
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
  test('abre todas as cartas sem votar por você', () => {
    const { root } = montar(DECK);
    mod.reveal(DECK, root);
    for (const row of root._parts.rows.values()) {
      assert.equal(row.verso.hidden, false);
      assert.equal(row.giusto.getAttribute('aria-pressed'), 'false',
        'reveal mostra a resposta; quem avalia continua sendo o aluno');
    }
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
  test('não quebra check nem feedback', () => {
    const vazio = { id: 'x', type: 'flashcard', carte: [] };
    const { root } = montar(vazio);
    const r = mod.check(vazio, null, root);
    assert.equal(r.score, 0);
    assert.equal(r.results.length, 0);
    assert.doesNotThrow(() => mod.feedback(vazio, r, root));
  });
});
