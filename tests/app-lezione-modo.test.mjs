/* Aula em modo «it», de ponta a ponta.

   Este é o teste de maior valor do mecanismo de modo, e existe por um motivo
   preciso: o modo viaja por PARÂMETRO explícito, de renderLesson até cada
   prose(). Parâmetro explícito tem exatamente um modo de falha — um fio
   esquecido em alguma chamada — e esse fio esquecido **degrada em silêncio
   para «pt»**. Nada estoura, nada avisa; o parágrafo só fica sem áudio.

   Só um teste que sobe a página inteira e confere os quatro pontos mais
   distantes da origem (spiegazione, consegna de exercício, produzione e
   bilancio) pega isso. Arquivo próprio porque o cenário é uma aula sintética
   servida por override, e installDOM/installFetch são estado de processo.

   A aula é sintética de propósito: hoje não existe nenhuma aula em modo «it»
   em content/, e inventar uma só para o teste poluiria o conteúdo real. */

import { test, describe, before } from 'node:test';
import assert from 'node:assert/strict';
import { installDOM, installStorage } from './support/dom.mjs';
import { makeSpeechSynthesis, installUtterance, IT_VOICES } from './support/speech-stub.mjs';
import { installFetch, lessonSkeleton, flush } from './support/fixtures.mjs';

const AULA = {
  id: '90',
  numero: 90,
  modo: 'it',
  titolo: 'Lezione in italiano',
  gloss: 'aula em modo italiano',
  header: { comunicazione: ['Capire una spiegazione'], lessico: [], grammatica: [] },
  riscaldamento: {
    prompt: 'Leggi ad alta voce. <pt>Leia em voz alta.</pt>',
    spiegazione: ['Il riscaldamento serve a questo.'],
  },
  sections: [{
    id: 'l90-s01',
    category: 'GRAMMATICA',
    titolo: 'Il presente',
    gloss: 'o presente',
    spiegazione: [
      'Il presente indicativo è regolare. <pt>é regular</pt>',
      'Le desinenze sono sei, una per persona.',
    ],
    blocks: [{ type: 'nota', tono: 'info', titolo: 'Attenzione', testo: 'La desinenza cambia.' }],
  }],
  chunks: [],
  esercizi: [{
    id: 'l90-e01',
    type: 'scelta',
    category: 'GRAMMATICA',
    consegna: 'Scegli la forma corretta.',
    domande: [{
      id: 'l90-e01-q1',
      testo: 'Io ___ italiano.',
      opzioni: ['parlo', 'parli'],
      risposta: 'parlo',
    }],
  }],
  produzione: [{ id: 'l90-p01', consegna: 'Scrivi tre frasi al presente.' }],
  bilancio: ['So coniugare il presente.'],
};

const MANIFEST = {
  corso: { titolo: 'Lezioni di italiano', livello: 'A1' },
  lezioni: [{
    id: '90', numero: 90, file: 'lezione-90.json',
    titolo: 'Lezione in italiano', gloss: 'aula em modo italiano',
    categorie: ['GRAMMATICA'], temi: [], conteggio: 1,
  }],
};

const synth = makeSpeechSynthesis({ voices: IT_VOICES });
installUtterance();
const dom = installDOM({ speechSynthesis: synth, search: '?l=90' });
installStorage();
installFetch({
  overrides: {
    'content/manifest.json': MANIFEST,
    'content/lezione-90.json': AULA,
  },
});

await import('../js/main.js');

let main;

before(async () => {
  lessonSkeleton(dom.document);
  dom.document.dispatchEvent({ type: 'DOMContentLoaded' });
  await flush(30);
  main = dom.document.getElementById('lesson');
});

/** Botões de parágrafo dentro de um nó — a marca de que o modo chegou. */
const paraButtons = (node) => node.querySelectorAll('.speak--para');

describe('o modo chega a todos os pontos de prosa', () => {
  test('a página renderizou', () => {
    assert.ok(main.querySelector('.lesson-header'), 'cabeçalho da aula');
  });

  test('spiegazione da seção — o fio mais curto', () => {
    // `.section__body .spiegazione` e não `.spiegazione`: a primeira da
    // página é a do riscaldamento, que é outro fio (renderStage → children).
    const sp = main.querySelector('.section__body .spiegazione');
    assert.equal(paraButtons(sp).length, 2, 'um botão por parágrafo');
  });

  test('spiegazione do riscaldamento — fio próprio, monta em app.js', () => {
    const sp = main.querySelectorAll('.spiegazione')[0];
    assert.equal(paraButtons(sp).length, 1);
  });

  test('nota dentro de bloco — o fio passa por renderSection → renderBlock', () => {
    const nota = main.querySelector('.nota');
    assert.equal(paraButtons(nota).length, 1);
  });

  test('consegna de exercício — o fio passa por mountExercise/ctx.modo', () => {
    const consegna = main.querySelector('.ex__consegna');
    assert.equal(paraButtons(consegna).length, 1);
  });

  test('produzione — um dos dois fios mais fáceis de esquecer', () => {
    const li = main.querySelector('.produzione li');
    assert.equal(paraButtons(li).length, 1);
  });

  test('bilancio — o outro', () => {
    const label = main.querySelector('.bilancio label');
    assert.equal(paraButtons(label).length, 1);
  });

  test('intro de etapa (renderStage) recebe o modo', () => {
    // O prompt do riscaldamento chega a prose() via renderStage.intro.
    const intro = main.querySelector('.stage__intro');
    assert.equal(paraButtons(intro).length, 1);
  });
});

describe('o português continua visível e mudo', () => {
  test('<pt> vira .pt-inline, não some da tela', () => {
    const glosas = main.querySelectorAll('.pt-inline');
    assert.ok(glosas.length >= 2, `esperava 2+ glosas, veio ${glosas.length}`);
    assert.match(main.textContent, /é regular/);
    assert.match(main.textContent, /Leia em voz alta/);
  });

  test('nenhuma glosa portuguesa ganhou botão de áudio', () => {
    for (const g of main.querySelectorAll('.pt-inline')) {
      assert.equal(g.querySelectorAll('.speak').length, 0);
    }
  });

  test('nenhuma pseudo-tag vazou como texto para a tela', () => {
    assert.ok(!main.textContent.includes('<pt>'), 'tag crua na tela');
    assert.ok(!main.textContent.includes('</pt>'));
    assert.ok(!main.textContent.includes('<it>'));
  });
});

describe('o áudio continua italiano', () => {
  test('clicar num botão de parágrafo fala it-IT sem a glosa', async () => {
    const btn = paraButtons(main.querySelector('.section__body .spiegazione'))[0];
    btn.dispatchEvent({ type: 'click' });
    await flush();

    const u = synth.spoken.at(-1);
    assert.equal(u.lang, 'it-IT');
    assert.equal(u.text, 'Il presente indicativo è regolare.');
    assert.ok(!u.text.includes('é regular'), 'a glosa portuguesa não pode ser falada');
  });
});
