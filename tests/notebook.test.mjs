/* Lexical Notebook — camada de dados + página.

   Arquivo próprio porque a página é um bootstrap inteiro (installDOM +
   DOMContentLoaded), e porque o store guarda cache de módulo.

   O ponto do caderno é a frase do ALUNO. Por isso boa parte do que se testa
   aqui é persistência: uma frase perdida num F5 é pior do que não ter o
   campo — o aluno escreve uma vez, perde, e não escreve de novo. */

import { test, describe, before } from 'node:test';
import assert from 'node:assert/strict';
import { installDOM, installStorage } from './support/dom.mjs';
import { makeSpeechSynthesis, installUtterance, IT_VOICES } from './support/speech-stub.mjs';
import { flush, readText } from './support/fixtures.mjs';

const synth = makeSpeechSynthesis({ voices: IT_VOICES });
installUtterance();
const dom = installDOM({ speechSynthesis: synth });
installStorage();

const store = await import('../js/store.js');
const { renderNotebook } = await import('../js/notebook.js');

const CARTA = { id: 'l02-c26', it: 'il ceco', pt: 'o tcheco', chunkType: 'word', lesson: '02' };
const OUTRA = { id: 'l01-c25', it: "vent'anni", pt: 'vinte anos', chunkType: 'collocation', lesson: '01' };

let main;

before(() => {
  const mk = (tag, attrs) => {
    const n = dom.document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v);
    return n;
  };
  dom.document.body.append(
    mk('div', { id: 'audio-status' }),
    mk('button', { 'data-action': 'theme' }),
    mk('div', { id: 'notebook' })
  );
  main = dom.document.getElementById('notebook');
});

/* --- Camada de dados ------------------------------------------------------ */

describe('store — caderno', () => {
  test('adiciona, não duplica, e devolve false na segunda vez', () => {
    assert.equal(store.addToNotebook(CARTA), true);
    assert.equal(store.addToNotebook(CARTA), false);
    assert.equal(store.notebook().length, 1);
    assert.equal(store.inNotebook(CARTA.id), true);
  });

  test('setMyExample grava e sobrevive a um round-trip de export/import', () => {
    assert.equal(store.setMyExample(CARTA.id, 'Il ceco parla ceco.'), true);
    const dump = store.exportJSON();
    store.reset();
    assert.equal(store.notebook().length, 0, 'reset limpou');
    store.importJSON(dump);
    assert.equal(store.notebook()[0].myExample, 'Il ceco parla ceco.');
  });

  test('setMyExample num id ausente devolve false em vez de criar entrada', () => {
    assert.equal(store.setMyExample('nao-existe', 'x'), false);
    assert.equal(store.notebook().length, 1);
  });

  test('remove devolve true, e false quando já não estava lá', () => {
    store.addToNotebook(OUTRA);
    assert.equal(store.removeFromNotebook(OUTRA.id), true);
    assert.equal(store.removeFromNotebook(OUTRA.id), false);
    assert.equal(store.inNotebook(OUTRA.id), false);
  });

  test('o caderno é independente do progresso de exercícios', () => {
    // Um item pode estar no caderno sem nunca ter sido respondido, e
    // vice-versa: são dois eixos, e misturá-los daria falso progresso.
    assert.equal(store.lessonProgress('02', 10).attempted, 0);
    assert.equal(store.notebook().length, 1);
  });
});

/* --- Página --------------------------------------------------------------- */

describe('página do caderno', () => {
  test('o esqueleto do teste bate com notebook.html', () => {
    const html = readText('notebook.html');
    for (const marca of ['id="notebook"', 'id="audio-status"', 'data-action="theme"']) {
      assert.ok(html.includes(marca), `notebook.html perdeu ${marca}`);
    }
    assert.ok(html.includes('js/notebook.js'), 'notebook.html não carrega o módulo');
  });

  test('rende uma entrada por forma guardada, agrupada por aula', () => {
    store.addToNotebook(OUTRA);
    renderNotebook();
    assert.equal(main.querySelectorAll('.nota-lex').length, 2);
    assert.equal(main.querySelectorAll('.nota-lex__gruppo').length, 2, 'aula 01 e aula 02');
  });

  test('o italiano é audível, o português não', () => {
    renderNotebook();
    const head = main.querySelector('.nota-lex__head');
    assert.equal(head.querySelectorAll('.speak').length, 1);
    assert.match(main.textContent, /o tcheco/);
  });

  test('o campo vem preenchido com a frase já salva', () => {
    renderNotebook();
    const campo = main.querySelector('#nb-l02-c26 .nota-lex__mio');
    assert.equal(campo.value, 'Il ceco parla ceco.');
  });

  test('sair do campo salva; o texto sobrevive a um novo render', () => {
    renderNotebook();
    const campo = main.querySelector('#nb-l01-c25 .nota-lex__mio');
    campo.value = "Ho vent'anni.";
    campo.dispatchEvent({ type: 'blur' });

    assert.equal(store.notebook().find((e) => e.id === OUTRA.id).myExample, "Ho vent'anni.");
    renderNotebook();
    assert.equal(main.querySelector('#nb-l01-c25 .nota-lex__mio').value, "Ho vent'anni.");
  });

  test('«tirar do caderno» remove e a página se redesenha sem ele', () => {
    renderNotebook();
    const card = main.querySelector('#nb-l01-c25');
    card.querySelectorAll('.btn--ghost')[0].dispatchEvent({ type: 'click' });

    assert.equal(store.inNotebook(OUTRA.id), false);
    assert.equal(main.querySelector('#nb-l01-c25'), null, 'sumiu da tela');
    assert.equal(main.querySelectorAll('.nota-lex').length, 1);
  });

  test('o resumo conta quantas ainda estão sem frase própria', () => {
    store.addToNotebook(OUTRA);
    renderNotebook();
    assert.match(main.querySelector('.stage__intro').textContent, /1 com frase sua, 1 ainda sem/);
    store.removeFromNotebook(OUTRA.id);
  });

  test('caderno vazio mostra como enchê-lo, não uma tela em branco', () => {
    store.removeFromNotebook(CARTA.id);
    renderNotebook();
    assert.equal(main.querySelectorAll('.nota-lex').length, 0);
    assert.ok(main.querySelector('.ripasso-vuoto'));
    assert.match(main.textContent, /Lessico/, 'diz onde guardar');
  });

  test('o estado vazio cita os DOIS caminhos que existem', () => {
    // Enquanto ele só citava a etapa, mentia: na Lessico o único botão vivia
    // escondido atrás do «Mostrar» de uma carta. Agora há botão na linha da
    // Frase utile também, e o texto tem que descrever o que existe de fato —
    // é a instrução que o aluno segue quando o caderno está vazio.
    renderNotebook();
    const t = main.textContent;
    assert.match(t, /＋ caderno/, 'nomeia o botão como ele aparece na tela');
    assert.match(t, /Frase utile/i, 'o caminho novo: a linha das Frasi utili');
    assert.match(t, /carta/i, 'o caminho antigo: o verso da carta');
  });
});
