/* Ripasso com aulas de MODOS DIFERENTES na mesma página.

   Este é o teste que justifica a decisão de arquitetura mais importante do
   mecanismo de modo: ele viaja por parâmetro, por ITEM, e não em estado de
   módulo do render.js.

   O Ripasso mistura aulas por construção — é o ponto dele. Com um `modo`
   global em render.js, uma sessão que trouxesse um item da Lezione 01 (em
   português) e outro de uma aula futura (em italiano) renderizaria um dos
   dois com a polaridade errada, e NÃO existe ordem de setMode() que resolva:
   os dois cards coexistem na mesma árvore ao mesmo tempo.

   Escrito mesmo sem termos cometido o erro, porque é o guarda que impede
   alguém de "simplificar" o threading mais tarde. */

import { test, describe, before } from 'node:test';
import assert from 'node:assert/strict';
import { installDOM, installStorage } from './support/dom.mjs';
import { makeSpeechSynthesis, installUtterance, IT_VOICES } from './support/speech-stub.mjs';
import { installFetch, flush } from './support/fixtures.mjs';

/** Duas aulas mínimas, idênticas em tudo menos no modo. */
const aula = (id, modo, consegna) => ({
  id,
  numero: Number(id),
  modo,
  titolo: `Lezione ${id}`,
  gloss: 'aula de teste',
  header: { comunicazione: [], lessico: [], grammatica: [] },
  sections: [],
  chunks: [],
  esercizi: [{
    id: `l${id}-e01`,
    type: 'scelta',
    category: 'GRAMMATICA',
    consegna,
    domande: [{
      id: `l${id}-e01-q1`,
      testo: 'Io ___ italiano.',
      opzioni: ['parlo', 'parli'],
      risposta: 'parlo',
    }],
  }],
});

const AULA_PT = aula('80', 'pt', 'Escolha a forma de <it>parlare</it>.');
const AULA_IT = aula('81', 'it', 'Scegli la forma corretta di parlare.');

const synth = makeSpeechSynthesis({ voices: IT_VOICES });
installUtterance();
const dom = installDOM({ speechSynthesis: synth });
installStorage();
installFetch({
  overrides: {
    'content/lezione-80.json': AULA_PT,
    'content/lezione-81.json': AULA_IT,
  },
});

const store = await import('../js/store.js');
const { collectDue, renderRipasso } = await import('../js/ripasso.js');

/** Marca um item como vencido sem esperar um dia passar. */
function vencer(lessonId, itemId) {
  store.record(lessonId, itemId, { correct: false, score: 0 });
  const raw = JSON.parse(store.exportJSON());
  raw.lessons[lessonId].items[itemId].dueAt = new Date(Date.now() - 1000).toISOString();
  store.importJSON(JSON.stringify(raw));
}

let main;

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

  // Um sub-item vencido de cada aula. Sub-item de propósito: é o caminho que
  // estava quebrado antes do subItemIds, então isto cobre as duas correções.
  vencer('80', 'l80-e01-q1');
  vencer('81', 'l81-e01-q1');

  await renderRipasso();
  await flush();
  main = dom.document.getElementById('ripasso');
});

describe('collectDue carrega o modo junto com o item', () => {
  test('cada item vem com o modo da SUA aula', async () => {
    const lista = await collectDue();
    const porAula = Object.fromEntries(lista.map((x) => [x.lessonId, x.modo]));
    assert.equal(porAula['80'], 'pt');
    assert.equal(porAula['81'], 'it');
  });
});

describe('os dois cards convivem, cada um com sua polaridade', () => {
  test('a sessão trouxe os dois', () => {
    const cards = main.querySelectorAll('.ex');
    assert.equal(cards.length, 2, 'um card por aula vencida');
  });

  test('o card da aula em «pt» usa botão inline, e só na forma citada', () => {
    const card = main.querySelector('#l80-e01');
    const consegna = card.querySelector('.ex__consegna');
    assert.equal(consegna.querySelectorAll('.speak--inline').length, 1);
    assert.equal(consegna.querySelectorAll('.speak--para').length, 0);
    assert.match(consegna.textContent, /Escolha a forma/);
  });

  test('o card da aula em «it» usa botão de parágrafo', () => {
    const card = main.querySelector('#l81-e01');
    const consegna = card.querySelector('.ex__consegna');
    assert.equal(consegna.querySelectorAll('.speak--para').length, 1);
    assert.equal(consegna.querySelectorAll('.speak--inline').length, 0);
  });

  test('um card não contamina o outro — é o que um modo global quebraria', () => {
    const pt = main.querySelector('#l80-e01');
    const it = main.querySelector('#l81-e01');
    assert.equal(pt.querySelectorAll('.speak--para').length, 0);
    assert.equal(it.querySelectorAll('.speak--inline').length, 0);
  });

  test('a ordem de renderização não muda o resultado', async () => {
    // Se houvesse estado global, quem renderizasse por último venceria.
    // Re-renderizar deve dar exatamente o mesmo DOM.
    const antes = main.querySelector('#l80-e01').querySelectorAll('.speak--inline').length;
    await renderRipasso();
    await flush();
    const depois = dom.document.getElementById('ripasso')
      .querySelector('#l80-e01').querySelectorAll('.speak--inline').length;
    assert.equal(depois, antes);
  });
});
