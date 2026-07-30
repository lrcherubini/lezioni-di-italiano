/* localStorage com lixo dentro. Cenário real: uma release anterior gravou
   algo quebrado, ou o usuário editou à mão. O site não pode virar tela
   branca por causa disso — o progresso é conveniência, não requisito. */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { installDOM, installStorage } from './support/dom.mjs';

installDOM();
installStorage({ seed: { 'ldi:v1': '{{{ isto não é JSON' } });

const store = await import('../js/store.js');

describe('estado corrompido', () => {
  test('cai para estado vazio em vez de lançar', () => {
    const s = JSON.parse(store.exportJSON());
    assert.deepEqual(s.lessons, {});
    assert.equal(s.version, 1);
  });

  test('e a partir daí funciona normalmente', () => {
    store.record('01', 'a', { correct: true, score: 1 });
    assert.equal(store.getItem('01', 'a').correct, 1);
    assert.equal(JSON.parse(localStorage.getItem('ldi:v1')).lessons['01'].items.a.correct, 1);
  });
});
