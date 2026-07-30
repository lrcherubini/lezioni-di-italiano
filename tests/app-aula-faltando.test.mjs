/* Manifest que aponta para um arquivo de aula que não existe.

   É o erro de digitação mais provável do passo 8 da checklist ("acrescente
   a entrada em manifest.json"). A home não pode ficar em branco por causa
   disso: o card aparece, só sem contagem de progresso. */

import { test, describe, before } from 'node:test';
import assert from 'node:assert/strict';
import { installDOM, installStorage } from './support/dom.mjs';
import { makeSpeechSynthesis, installUtterance, IT_VOICES } from './support/speech-stub.mjs';
import { homeSkeleton, flush } from './support/fixtures.mjs';

const MANIFEST = {
  lezioni: [
    { id: '00', numero: 0, file: 'lezione-inexistente.json', titolo: "L'alfabeto", gloss: 'o alfabeto', categorie: ['PRONUNCIA'], temi: ['alfabeto'] },
  ],
};

const synth = makeSpeechSynthesis({ voices: IT_VOICES });
installUtterance();
const dom = installDOM({ speechSynthesis: synth });
installStorage();

globalThis.fetch = async (path) => (path.endsWith('manifest.json')
  ? { ok: true, status: 200, json: async () => MANIFEST }
  : { ok: false, status: 404, json: async () => ({}) });

await import('../js/app.js');

before(async () => {
  homeSkeleton(dom.document);
  dom.document.dispatchEvent({ type: 'DOMContentLoaded' });
  await flush(20);
});

describe('aula listada mas ausente', () => {
  test('o card aparece mesmo assim', () => {
    const grid = dom.document.getElementById('lesson-grid');
    assert.equal(grid.querySelectorAll('.lesson-card').length, 1);
    assert.match(grid.textContent, /L'alfabeto/);
  });

  test('o progresso mostra 0/0 em vez de quebrar a home', () => {
    const grid = dom.document.getElementById('lesson-grid');
    assert.equal(grid.querySelector('.progress__label').textContent, '0/0');
    assert.equal(grid.querySelector('.progress__bar').getAttribute('style'), 'width:0%');
  });

  test('nenhum banner de erro — a home carregou', () => {
    assert.equal(dom.document.getElementById('audio-status').querySelectorAll('.banner--err').length, 0);
  });
});
