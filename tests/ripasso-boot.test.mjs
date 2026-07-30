/* Bootstrap da página de revisão: o DOMContentLoaded real, com o cabeçalho
   comum (tema, banner de áudio) que ela compartilha com as outras páginas. */

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
await import('../js/ripasso.js');

before(async () => {
  const mk = (tag, attrs) => {
    const n = dom.document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v);
    return n;
  };
  dom.document.body.append(
    mk('div', { id: 'audio-status' }),
    mk('button', { 'data-action': 'theme' }),
    mk('div', { id: 'ripasso' })
  );

  store.record('01', 'l01-e01', { correct: false, score: 0 });
  const raw = JSON.parse(store.exportJSON());
  raw.lessons['01'].items['l01-e01'].dueAt = new Date(Date.now() - 1000).toISOString();
  store.importJSON(JSON.stringify(raw));

  dom.document.dispatchEvent({ type: 'DOMContentLoaded' });
  await flush(30);
});

describe('bootstrap', () => {
  test('monta a revisão sozinho, sem depender do app.js bootar', () => {
    const main = dom.document.getElementById('ripasso');
    assert.equal(main.querySelectorAll('.ex').length, 1);
    assert.match(main.querySelector('.stage__title').textContent, /Ripasso/);
  });

  test('o botão de tema funciona, como nas outras páginas', () => {
    const btn = dom.document.querySelector('[data-action="theme"]');
    btn.click();
    assert.equal(dom.document.documentElement.dataset.theme, 'dark');
    assert.equal(store.settings().theme, 'dark');
  });

  test('sem banner de erro', () => {
    assert.equal(dom.document.getElementById('audio-status').querySelectorAll('.banner--err').length, 0);
  });
});
