/* Migração de schema do progresso.

   Arquivo separado de propósito: a migração roda uma vez só, no primeiro
   load() do módulo. `node --test` dá um processo por arquivo, que é a forma
   limpa de ter estado de módulo virgem — reimportar com query string
   funciona, mas cria um script distinto para a contagem de cobertura. */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { installDOM, installStorage } from './support/dom.mjs';

const KEY = 'ldi:v1';

// Progresso salvo por uma versão anterior, sem campo `version`.
const V0 = {
  lessons: {
    '01': { visitedAt: '2026-01-01T00:00:00.000Z', items: { 'l01-e01': { attempts: 3, correct: 3 } } },
  },
};

installDOM();
installStorage({ seed: { [KEY]: JSON.stringify(V0) } });

const store = await import('../js/store.js');

describe('v0 → v1', () => {
  test('sobe a versão sem perder o progresso existente', () => {
    const s = JSON.parse(store.exportJSON());
    assert.equal(s.version, 1);
    assert.equal(s.lessons['01'].items['l01-e01'].attempts, 3);
    assert.equal(s.lessons['01'].visitedAt, '2026-01-01T00:00:00.000Z');
  });

  test('preenche os campos que a v0 não tinha', () => {
    const s = JSON.parse(store.exportJSON());
    assert.deepEqual(s.notebook, []);
    assert.equal(s.settings.rate, 1.0);
    assert.equal(s.settings.theme, null);
  });

  test('item sem ease/interval não quebra o agendamento', () => {
    // Regressão: o item v0 existe mas não tem `ease` nem `interval`, e os
    // defaults só entravam quando o item era inteiramente novo. Resultado:
    // NaN no intervalo, data inválida e RangeError no primeiro exercício
    // respondido depois de migrar.
    const it = store.record('01', 'l01-e01', { correct: true, score: 1 });
    assert.equal(it.attempts, 4);
    assert.equal(it.ease, 2.6);
    assert.equal(it.interval, 1);
    assert.ok(Number.isFinite(new Date(it.dueAt).getTime()));
    assert.equal(store.lessonProgress('01', 1).done, 1);
  });

  test('importJSON também passa pela migração', () => {
    store.importJSON(JSON.stringify(V0));
    assert.equal(JSON.parse(store.exportJSON()).version, 1);
  });
});
