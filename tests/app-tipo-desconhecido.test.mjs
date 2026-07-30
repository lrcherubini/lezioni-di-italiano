/* Aula que usa um tipo de exercício que não está no registry.

   Acontece de verdade no loop de autoria: o CLAUDE.md lista dictogloss,
   minimal-pair e slot-frame como fase 2, e é fácil escrever um deles no
   JSON antes de o módulo existir. O validate.py pega isso — mas se passar,
   a página não pode morrer junto: os outros exercícios têm que renderizar. */

import { test, describe, before } from 'node:test';
import assert from 'node:assert/strict';
import { installDOM, installStorage } from './support/dom.mjs';
import { makeSpeechSynthesis, installUtterance, IT_VOICES } from './support/speech-stub.mjs';
import { lessonSkeleton, flush } from './support/fixtures.mjs';

const AULA = {
  id: '99', numero: 99, titolo: 'Prova', gloss: 'teste',
  sections: [{
    id: 'l99-s01', category: 'VERBO', titolo: 'T', gloss: 'g',
    spiegazione: ['a', 'b'], blocks: [],
  }],
  esercizi: [
    {
      id: 'l99-e01', type: 'dictogloss', category: 'VERBO',
      consegna: 'Tipo de fase 2, ainda sem módulo.',
    },
    {
      id: 'l99-e02', type: 'gap-audio', category: 'VERBO',
      consegna: 'Este funciona.',
      audio: { tts: 'Io sono qui.', src: null },
      testo: 'Io ___ qui.', risposta: 'sono', pt: 'Eu estou aqui.',
    },
  ],
};

const MANIFEST = { lezioni: [{ id: '99', numero: 99, file: 'lezione-99.json', titolo: 'Prova', gloss: 'teste' }] };

const synth = makeSpeechSynthesis({ voices: IT_VOICES });
installUtterance();
const dom = installDOM({ speechSynthesis: synth, search: '?l=99' });
installStorage();

globalThis.fetch = async (path) => ({
  ok: true,
  status: 200,
  json: async () => (path.endsWith('manifest.json') ? MANIFEST : AULA),
});

await import('../js/app.js');

before(async () => {
  lessonSkeleton(dom.document);
  dom.document.dispatchEvent({ type: 'DOMContentLoaded' });
  await flush(20);
});

describe('tipo não registrado', () => {
  test('vira um aviso que aponta para o registry', () => {
    const esercizi = dom.document.getElementById('esercizi');
    assert.match(esercizi.textContent, /Tipo de exercício não registrado: «dictogloss»/);
    assert.match(esercizi.textContent, /js\/exercises\/index\.js/);
  });

  test('não derruba a página nem os outros exercícios', () => {
    const card = dom.document.getElementById('l99-e02');
    assert.ok(card, 'o exercício válido tem que renderizar do mesmo jeito');
    assert.equal(card.querySelector('.ex__num').textContent, 'Ex. 02');
    assert.ok(dom.document.getElementById('l99-s01'), 'a seção de estudo continua lá');
  });
});

describe('aula mínima', () => {
  test('a trilha lista só as etapas existentes', () => {
    const labels = dom.document.getElementById('lesson')
      .querySelectorAll('.rail a').map((a) => a.textContent);
    assert.deepEqual(labels, ['Studio', 'Esercizi']);
  });

  test('sem próxima nem anterior, a navegação fica vazia mas presente', () => {
    const nav = dom.document.getElementById('lesson').querySelector('.lesson-nav');
    assert.equal(nav.querySelectorAll('a').length, 0);
    assert.equal(nav.children.length, 2, 'os dois espaçadores mantêm o layout');
  });
});
