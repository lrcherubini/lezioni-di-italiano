/* O caminho de falha do carregamento.

   O erro mais provável na vida real deste site é o aluno abrir o
   index.html com duplo clique: fetch() em file:// morre por CORS. O banner
   precisa explicar exatamente isso, porque a alternativa é uma página em
   branco que parece bug do site. */

import { test, describe, before } from 'node:test';
import assert from 'node:assert/strict';
import { installDOM, installStorage } from './support/dom.mjs';
import { makeSpeechSynthesis, installUtterance, IT_VOICES } from './support/speech-stub.mjs';
import { lessonSkeleton, flush } from './support/fixtures.mjs';

const synth = makeSpeechSynthesis({ voices: IT_VOICES });
installUtterance();
const dom = installDOM({ speechSynthesis: synth, search: '?l=01' });
installStorage();

// fetch que sempre falha, como em file://
globalThis.fetch = async () => { throw new TypeError('Failed to fetch'); };

// console.error é esperado aqui; silencia para o relatório do teste ficar limpo.
const erros = [];
console.error = (e) => erros.push(e);

await import('../js/app.js');

before(async () => {
  lessonSkeleton(dom.document);
  dom.document.dispatchEvent({ type: 'DOMContentLoaded' });
  await flush(20);
});

describe('conteúdo que não carrega', () => {
  test('mostra banner de erro em vez de página em branco', () => {
    const banner = dom.document.getElementById('audio-status').querySelector('.banner--err');
    assert.ok(banner, 'nenhum banner de erro renderizado');
    assert.equal(banner.getAttribute('role'), 'alert');
  });

  test('o banner explica o caso do file:// e como resolver', () => {
    const banner = dom.document.getElementById('audio-status').querySelector('.banner--err');
    assert.match(banner.innerHTML, /file:\/\//);
    assert.match(banner.innerHTML, /http\.server 8000/);
    assert.match(banner.innerHTML, /Failed to fetch/, 'a mensagem original ajuda a diagnosticar');
  });

  test('o erro também vai para o console', () => {
    assert.equal(erros.length, 1);
  });

  test('a página não fica pela metade — nada de lesson renderizado', () => {
    assert.equal(dom.document.getElementById('lesson').querySelectorAll('.stage').length, 0);
  });
});
