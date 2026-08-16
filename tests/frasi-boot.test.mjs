/* Bootstrap da página das frases: o DOMContentLoaded real, com o cabeçalho
   comum (tema, banner de áudio) que ela compartilha com as outras páginas.

   Arquivo próprio pelo mesmo motivo de ripasso-boot e notebook-boot: o
   bootstrap dispara uma vez por processo, e o teste do módulo em si
   (frasi.test.mjs) chama renderFrasi() à mão. Os dois caminhos precisam ser
   exercitados, e não cabem no mesmo processo. */

import { test, describe, before } from 'node:test';
import assert from 'node:assert/strict';
import { installDOM, installStorage } from './support/dom.mjs';
import { makeSpeechSynthesis, installUtterance, IT_VOICES } from './support/speech-stub.mjs';
import { installFetch, flush } from './support/fixtures.mjs';

const synth = makeSpeechSynthesis({ voices: IT_VOICES });
installUtterance();
const dom = installDOM({ speechSynthesis: synth });
installStorage();
installFetch();

const store = await import('../js/store.js');
await import('../js/frasi.js');

before(async () => {
  const mk = (tag, attrs) => {
    const n = dom.document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v);
    return n;
  };
  dom.document.body.append(
    mk('div', { id: 'audio-status' }),
    mk('button', { 'data-action': 'theme' }),
    mk('div', { id: 'frasi' })
  );

  dom.document.dispatchEvent({ type: 'DOMContentLoaded' });
  await flush(30);
});

describe('bootstrap', () => {
  test('carrega as frases sozinho, sem depender do app.js bootar', () => {
    const main = dom.document.getElementById('frasi');
    assert.ok(main.querySelectorAll('.funzione').length >= 2);
    assert.equal(main.querySelectorAll('.loading').length, 0, 'ficou no estado de carregando');
  });

  test('o botão de tema funciona, como nas outras páginas', () => {
    const btn = dom.document.querySelector('[data-action="theme"]');
    btn.click();
    assert.equal(dom.document.documentElement.dataset.theme, 'dark');
    assert.equal(store.settings().theme, 'dark');
  });

  test('sem banner de erro', () => {
    assert.equal(
      dom.document.getElementById('audio-status').querySelectorAll('.banner--err').length, 0);
  });
});
