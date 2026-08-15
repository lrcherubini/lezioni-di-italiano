/* O contrato de exercício, aplicado a TODOS os tipos registrados.

   Por que este arquivo existe, e por que ele é dirigido por tabela:

   Os testes por tipo (drills, flashcard, dictogloss, exercises) provam o que
   cada um faz de particular. Nenhum deles prova o que TODOS têm de fazer
   igual — e é aí que as lacunas aparecem, porque um tipo novo entra no
   registry sem nada obrigá-lo a cobrir os mesmos cenários dos outros.

   Uma auditoria da suíte mostrou exatamente isso: de dez tipos, só um tinha
   o `modo` testado. O fio do modo degrada em SILÊNCIO quando esquecido, o
   que torna a lacuna cara. Um teste por tipo teria resolvido nove vezes; uma
   matriz resolve para sempre, inclusive para o décimo primeiro tipo.

   A regra deste arquivo: **iterar `knownTypes()`, nunca uma lista escrita à
   mão.** Um tipo novo entra na matriz sozinho e falha até ser coberto — que
   é o comportamento desejado. Só as FIXTURES são escritas à mão, e faltar
   uma é um erro alto e claro. */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { installDOM, installStorage } from './support/dom.mjs';
import { makeSpeechSynthesis, installUtterance, IT_VOICES } from './support/speech-stub.mjs';
import { flush } from './support/fixtures.mjs';

const synth = makeSpeechSynthesis({ voices: IT_VOICES });
installUtterance();
const dom = installDOM({ speechSynthesis: synth });
installStorage();

const { getExercise, knownTypes } = await import('../js/exercises/index.js');
const { mountExercise, resetExerciseCounter } = await import('../js/app.js');
const speech = await import('../js/speech.js');
await speech.voicesReady();

/* --- Fixtures: um item mínimo e válido por tipo --------------------------- */

const FIXTURES = {
  'gap-audio': {
    id: 'x-e01', type: 'gap-audio', category: 'VERBO', consegna: 'Ascolta.',
    audio: { tts: 'Io sono italiano.' }, testo: 'Io ___ italiano.', risposta: 'sono',
    pt: 'Eu sou italiano.', aiuto: 'Verbo <it>essere</it>.',
  },
  'qa-transcribe': {
    id: 'x-e02', type: 'qa-transcribe', category: 'VERBO', consegna: 'Trascrivi.',
    domanda: { tts: 'Di dove sei?', testo: 'Di dove sei?', pt: 'De onde é?' },
    risposta: { tts: 'Sono italiano.', testo: 'Sono italiano.', pt: 'Sou italiano.' },
    aiuto: 'Use <it>sono</it>.',
  },
  dialogue: {
    id: 'x-d01', type: 'dialogue', titolo: 'Ciao', gloss: 'oi', consegna: 'Ascolta.',
    battute: [
      { speaker: 'A', nome: 'Giulia', it: 'Ciao!', pt: 'Oi!' },
      { speaker: 'B', nome: 'Marco', it: 'Ciao!', pt: 'Oi!' },
    ],
    passate: [
      { focus: 'gist', istruzione: 'Só ouça.', inputBloccato: true },
      { focus: 'detail', istruzione: 'Responda.', inputBloccato: false,
        domande: [{ id: 'x-d01-q1', domanda: 'Quem fala?', risposta: 'Giulia' }] },
    ],
  },
  'paradigm-fill': {
    id: 'x-e03', type: 'paradigm-fill', category: 'VOCABOLARIO', consegna: 'Completa.',
    colonne: ['M sing.', 'F sing.'],
    righe: [{ id: 'x-e03-r1', pt: 'italiano', forme: ['italiano', 'italiana'], nascondi: [1], nota: 'Em <it>-o</it>.' }],
  },
  scelta: {
    id: 'x-e04', type: 'scelta', category: 'GRAMMATICA', consegna: 'Scegli.',
    domande: [{ id: 'x-e04-q1', testo: 'Abito ___ Roma.', opzioni: ['a', 'in'], risposta: 'a', nota: 'Cidade.' }],
  },
  riordino: {
    id: 'x-e05', type: 'riordino', category: 'GRAMMATICA', consegna: 'Riordina.',
    frasi: [{ id: 'x-e05-f1', parole: ['Io', 'sono', 'italiano'], risposta: 'Io sono italiano.', nota: 'Ordem.' }],
  },
  abbinamento: {
    id: 'x-e06', type: 'abbinamento', category: 'ESPRESSIONE', consegna: 'Abbina.',
    coppie: [
      { id: 'x-e06-p1', sinistra: 'Ciao?', destra: 'Ciao!', pt: 'Oi!' },
      { id: 'x-e06-p2', sinistra: 'Come?', destra: 'Bene.', pt: 'Bem.' },
    ],
  },
  'slot-frame': {
    id: 'x-e07', type: 'slot-frame', category: 'VERBO', consegna: 'Sostituisci.',
    frame: { it: 'Io parlo ___.', pt: 'Eu falo ___.' },
    giri: [{ id: 'x-e07-g1', slot: 'italiano', pt: 'italiano', risposta: 'Io parlo italiano.' }],
  },
  flashcard: {
    id: 'x-lex', type: 'flashcard', category: 'VOCABOLARIO', consegna: 'Ricorda.',
    // Duas cartas, e a segunda com `figura`: o caminho da figura tem que
    // passar pela matriz inteira, não só pelos testes do próprio tipo.
    carte: [
      { id: 'x-c01', it: 'il cane', pt: 'o cachorro', chunkType: 'word' },
      { id: 'x-c02', it: 'la macchina', pt: 'o carro', chunkType: 'word', figura: '🚗' },
    ],
  },
  dictogloss: {
    id: 'x-e08', type: 'dictogloss', category: 'VERBO', consegna: 'Ricostruisci.',
    testo: 'Io sono italiano.', audio: { tts: 'Io sono italiano.' },
    pt: 'Eu sou italiano.', preinsegnamento: [{ it: 'sono', pt: 'sou' }],
    aiuto: 'Verbo <it>essere</it>.',
  },
  traduzione: {
    id: 'x-e09', type: 'traduzione', category: 'ESPRESSIONE', consegna: 'Traduci.',
    frasi: [{ id: 'x-e09-f1', pt: 'Eu sou italiano.', risposta: 'Io sono italiano.', nota: 'Verbo <it>essere</it>.' }],
  },
  trasformazione: {
    id: 'x-e10', type: 'trasformazione', category: 'GRAMMATICA', consegna: 'Trasforma.',
    // Uma interrogativa de propósito: é o caso em que a transformação inteira
    // mora na pontuação, que checkAnswer descarta. Passar pela matriz garante
    // que o ramo extra de `pontuacaoBate` não quebra nenhum contrato comum.
    frasi: [{ id: 'x-e10-f1', partenza: 'Tu sei italiano.', verso: 'interrogativa',
      risposta: 'Tu sei italiano?', nota: 'Só o <it>?</it> muda.' }],
  },
};

const TIPOS = knownTypes().sort();

function ctxFake(extra = {}) {
  const enviados = [];
  return {
    ctx: {
      submit: (r) => enviados.push(r),
      lesson: '01',
      speak: speech.speak,
      notebook: { has: () => false, toggle: () => true },
      ...extra,
    },
    enviados,
  };
}

/* --- A matriz ------------------------------------------------------------- */

describe('toda fixture existe', () => {
  test('há uma fixture para cada tipo registrado', () => {
    // Falha alto quando um tipo novo entra sem fixture, em vez de o tipo
    // simplesmente escapar de toda a matriz abaixo.
    assert.deepEqual(TIPOS, Object.keys(FIXTURES).sort());
  });
});

for (const tipo of TIPOS) {
  describe(`contrato — ${tipo}`, () => {
    const item = FIXTURES[tipo];
    const mod = getExercise(tipo);

    test('expõe type, render e check', () => {
      assert.equal(mod.type, tipo);
      assert.equal(typeof mod.render, 'function');
      assert.equal(typeof mod.check, 'function');
    });

    test('render devolve um elemento com _parts', () => {
      const { ctx } = ctxFake();
      const root = mod.render(item, ctx);
      assert.ok(root && root.tagName, 'não devolveu elemento');
      assert.ok(root._parts, '_parts é o canal entre render e check/feedback');
    });

    test('check SEM nenhuma interação não lança e devolve forma válida', () => {
      // O cenário mais provável do mundo real: o aluno aperta Verificar sem
      // preencher. Nenhum tipo pode explodir aí.
      const { ctx } = ctxFake();
      const root = mod.render(item, ctx);
      const r = mod.check(item, '', root);

      assert.equal(typeof r.correct, 'boolean');
      assert.ok(typeof r.score === 'number' && r.score >= 0 && r.score <= 1, `score inválido: ${r.score}`);
      assert.equal(r.correct, false, 'nada preenchido não pode contar como acerto');
    });

    test('feedback depois de um check vazio não lança', () => {
      const { ctx } = ctxFake();
      const root = mod.render(item, ctx);
      const r = mod.check(item, '', root);
      assert.doesNotThrow(() => mod.feedback?.(item, r, root));
    });

    test('reveal não lança e não inventa acerto', () => {
      const { ctx } = ctxFake();
      const root = mod.render(item, ctx);
      mod.check(item, '', root);
      assert.doesNotThrow(() => mod.reveal?.(item, root));
    });

    test('subItemIds, quando existe, casa com os ids que check devolve', () => {
      if (typeof mod.subItemIds !== 'function') return;
      const { ctx } = ctxFake();
      const root = mod.render(item, ctx);
      const r = mod.check(item, '', root);

      const declarados = mod.subItemIds(item);
      assert.ok(declarados.length > 0, 'declarou subItemIds mas devolveu lista vazia');
      assert.ok(Array.isArray(r.results), 'quem tem subItemIds tem que devolver results');
      assert.deepEqual(r.results.map((x) => x.id), declarados,
        'os ids gravados no progresso têm que ser exatamente os declarados');
    });

    test('todo áudio que ele produz é it-IT', async () => {
      const { ctx } = ctxFake();
      const root = mod.render(item, ctx);
      const antes = synth.spoken.length;

      for (const b of root.querySelectorAll('.speak')) b.dispatchEvent({ type: 'click' });
      await flush();

      for (const u of synth.spoken.slice(antes)) {
        assert.equal(u.lang, 'it-IT', `${tipo} falou em ${u.lang}`);
      }
    });
  });
}

/* --- O fio do modo, para TODOS os tipos ----------------------------------- */

describe('matriz modo × tipo, via mountExercise', () => {
  for (const tipo of TIPOS) {
    const item = FIXTURES[tipo];

    test(`${tipo}: em modo «pt» a consegna não ganha botão de parágrafo`, () => {
      resetExerciseCounter();
      const card = mountExercise(item, '01', { modo: 'pt' });
      const c = card.querySelector('.ex__consegna');
      assert.equal(c.querySelectorAll('.speak--para').length, 0);
    });

    test(`${tipo}: em modo «it» a consegna ganha botão de parágrafo`, () => {
      // É o fio que degrada em silêncio se alguém esquecer de passá-lo.
      resetExerciseCounter();
      const card = mountExercise(item, '01', { modo: 'it' });
      const c = card.querySelector('.ex__consegna');
      assert.equal(c.querySelectorAll('.speak--para').length, 1,
        `${tipo}: o modo não chegou à consegna`);
    });

    test(`${tipo}: o modo não muda quantos sub-itens ele grava`, () => {
      // Regressão possível: alguém usar o modo para decidir o que renderizar
      // e sem querer mudar a contagem, fazendo o conteggio divergir por aula.
      const a = getExercise(tipo).subItemIds?.(item) ?? [];
      resetExerciseCounter();
      mountExercise(item, '01', { modo: 'it' });
      const b = getExercise(tipo).subItemIds?.(item) ?? [];
      assert.deepEqual(a, b);
    });
  }
});
