/* Bootstrap da home: cards de aula, barra de progresso e os botões de
   exportar/importar. */

import { test, describe, before } from 'node:test';
import assert from 'node:assert/strict';
import { installDOM, installStorage } from './support/dom.mjs';
import { makeSpeechSynthesis, installUtterance, IT_VOICES } from './support/speech-stub.mjs';
import { installFetch, homeSkeleton, flush, readContent, readText } from './support/fixtures.mjs';

const synth = makeSpeechSynthesis({ voices: IT_VOICES });
installUtterance();
const dom = installDOM({ speechSynthesis: synth });
installStorage();
installFetch();

const store = await import('../js/store.js');
await import('../js/app.js');

const manifest = readContent('manifest.json');
let grid;

before(async () => {
  homeSkeleton(dom.document);
  dom.document.dispatchEvent({ type: 'DOMContentLoaded' });
  await flush(30);
  grid = dom.document.getElementById('lesson-grid');
});

describe('esqueleto x HTML real', () => {
  test('os ids e data-actions do teste existem em index.html', () => {
    const html = readText('index.html');
    for (const marca of ['id="lesson-grid"', 'id="audio-status"',
      'data-action="theme"', 'data-action="export"', 'data-action="import"']) {
      assert.ok(html.includes(marca), `index.html perdeu ${marca}`);
    }
  });
});

describe('cards de aula', () => {
  test('um card por aula do manifest, na ordem', () => {
    const cards = grid.querySelectorAll('.lesson-card');
    assert.equal(cards.length, manifest.lezioni.length);
    assert.deepEqual(
      grid.querySelectorAll('.lesson-card__num').map((n) => n.textContent),
      manifest.lezioni.map((l) => `Lezione ${l.numero}`)
    );
  });

  test('o título é italiano: tem 🔊 e link para a aula', () => {
    const h2 = grid.querySelectorAll('.lesson-card__title')[0];
    assert.equal(h2.querySelectorAll('.speak').length, 1);
    assert.equal(h2.querySelector('a').getAttribute('href'), `lezione.html?l=${manifest.lezioni[0].id}`);
  });

  test('chips e temas vêm do manifest', () => {
    const card = grid.querySelectorAll('.lesson-card')[0];
    assert.equal(card.querySelectorAll('.chip').length, manifest.lezioni[0].categorie.length);
    assert.equal(card.querySelectorAll('.lesson-card__temi li').length, manifest.lezioni[0].temi.length);
  });
});

describe('barra de progresso', () => {
  test('começa em 0% com o total real de itens da aula', () => {
    const label = grid.querySelectorAll('.progress__label')[1].textContent;
    const [feito, total] = label.split('/').map(Number);
    assert.equal(feito, 0);
    assert.ok(total > 0, 'o total tem que contar os itens rastreáveis da aula');
    assert.equal(grid.querySelectorAll('.progress__bar')[1].getAttribute('style'), 'width:0%');
  });

  test('o total conta células de paradigma e perguntas do diálogo, não os exercícios', () => {
    // countItems: um paradigm-fill vale N células ocultas, não 1.
    const aula = readContent('lezione-01.json');
    const esperado =
      aula.esercizi.reduce((n, ex) => n + (ex.type === 'paradigm-fill'
        ? ex.righe.reduce((m, r) => m + r.nascondi.length, 0)
        : 1), 0)
      + aula.dialogo.passate.find((p) => p.focus === 'detail').domande.length;

    const total = Number(grid.querySelectorAll('.progress__label')[1].textContent.split('/')[1]);
    assert.equal(total, esperado);
  });

  test('acertar um item redesenha a home pelo evento ldi:progress', async () => {
    const aula = readContent('lezione-01.json');
    store.record('01', aula.esercizi[0].id, { correct: true, score: 1 });

    dom.window.dispatchEvent({ type: 'ldi:progress' });
    await flush(20);

    const label = dom.document.getElementById('lesson-grid')
      .querySelectorAll('.progress__label')[1].textContent;
    assert.equal(Number(label.split('/')[0]), 1);
  });
});

describe('exportar e importar progresso', () => {
  test('exportar dispara o download do JSON', () => {
    let baixou = false;
    globalThis.Blob = class { constructor(p) { this.p = p; } };
    globalThis.URL = { createObjectURL: () => { baixou = true; return 'blob:x'; }, revokeObjectURL() {} };

    dom.document.querySelector('[data-action="export"]').click();
    assert.equal(baixou, true);
  });

  test('importar um export válido recarrega a página', async () => {
    const dump = store.exportJSON();
    let escolhido = null;

    const orig = dom.document.createElement.bind(dom.document);
    dom.document.createElement = (tag) => {
      const n = orig(tag);
      if (tag === 'input') {
        n.click = () => {
          n.files = [{ text: async () => dump }];
          n.dispatchEvent({ type: 'change' });
        };
        escolhido = n;
      }
      return n;
    };

    dom.document.querySelector('[data-action="import"]').click();
    await flush(10);
    dom.document.createElement = orig;

    assert.ok(escolhido, 'o botão deveria criar um <input type=file>');
    assert.equal(escolhido.getAttribute('accept'), 'application/json,.json');
    assert.equal(dom.location.reloaded, 1);
  });

  test('importar arquivo inválido avisa em vez de quebrar', async () => {
    const orig = dom.document.createElement.bind(dom.document);
    dom.document.createElement = (tag) => {
      const n = orig(tag);
      if (tag === 'input') {
        n.click = () => {
          n.files = [{ text: async () => '{"nada":1}' }];
          n.dispatchEvent({ type: 'change' });
        };
      }
      return n;
    };

    dom.document.querySelector('[data-action="import"]').click();
    await flush(10);
    dom.document.createElement = orig;

    assert.equal(dom.alerts.length, 1);
    assert.match(dom.alerts[0], /Não foi possível importar/);
    assert.equal(dom.location.reloaded, 1, 'não recarrega quando falha');
  });

  test('cancelar a escolha do arquivo não faz nada', async () => {
    const antes = dom.alerts.length;
    const orig = dom.document.createElement.bind(dom.document);
    dom.document.createElement = (tag) => {
      const n = orig(tag);
      if (tag === 'input') n.click = () => n.dispatchEvent({ type: 'change' });
      return n;
    };

    dom.document.querySelector('[data-action="import"]').click();
    await flush(10);
    dom.document.createElement = orig;

    assert.equal(dom.alerts.length, antes);
  });
});
