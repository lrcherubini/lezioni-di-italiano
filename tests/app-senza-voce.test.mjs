/* A página inteira num navegador sem voz italiana.

   O requisito é duro: o site continua utilizável, com um banner que explica
   por que não sai som e como instalar uma voz. Nunca tela branca, nunca
   erro no console, e os exercícios continuam funcionando como leitura. */

import { test, describe, before } from 'node:test';
import assert from 'node:assert/strict';
import { installDOM, installStorage } from './support/dom.mjs';
import { makeSpeechSynthesis, installUtterance, NO_IT_VOICES } from './support/speech-stub.mjs';
import { installFetch, lessonSkeleton, flush, readContent } from './support/fixtures.mjs';

const synth = makeSpeechSynthesis({ voices: NO_IT_VOICES });
installUtterance();
const dom = installDOM({ speechSynthesis: synth, search: '?l=01' });
installStorage();
installFetch();

const store = await import('../js/store.js');
await import('../js/main.js');

const aula = readContent('lezione-01.json');

before(async () => {
  lessonSkeleton(dom.document);
  dom.document.dispatchEvent({ type: 'DOMContentLoaded' });
  await flush(30);
});

describe('banner de degradação', () => {
  test('aparece, com role de alerta', () => {
    const banner = dom.document.getElementById('audio-status').querySelector('.banner');
    assert.ok(banner, 'sem banner o aluno acha que o site está quebrado');
    assert.equal(banner.getAttribute('role'), 'alert');
  });

  test('diz que faltam vozes — não que falta a API', () => {
    const t = dom.document.getElementById('audio-status').textContent;
    assert.match(t, /Nenhuma voz italiana instalada/);
    assert.ok(!t.includes('não tem síntese de voz'));
  });

  test('explica o modo transcrição e como instalar voz no Windows', () => {
    const html = dom.document.getElementById('audio-status').innerHTML;
    assert.match(html, /modo transcrição/);
    assert.match(html, /Hora e Idioma/);
  });
});

describe('o site continua inteiro', () => {
  test('todas as etapas renderizaram', () => {
    const main = dom.document.getElementById('lesson');
    assert.equal(main.querySelectorAll('.stage').length, 6);
    assert.equal(main.querySelectorAll('.section').length, aula.sections.length);
  });

  test('os botões de áudio continuam lá, só não produzem som', () => {
    const main = dom.document.getElementById('lesson');
    assert.ok(main.querySelectorAll('.speak').length > 50);

    main.querySelectorAll('.speak')[0].click();
    assert.equal(synth.spoken.length, 0);
  });

  test('a correção dos exercícios funciona normalmente', () => {
    const ex = aula.esercizi[0];
    const body = dom.document.getElementById(ex.id).querySelector('.ex__body');
    body._parts.input.value = ex.risposta;
    body._parts.send.click();

    assert.equal(store.getItem('01', ex.id).correct, 1);
    assert.equal(dom.document.getElementById(ex.id).dataset.state, 'correct');
  });

  test('o player do diálogo destrava a passada 2 mesmo sem áudio', async () => {
    // Sem isto o aluno ficaria preso na passada 1 para sempre: o destrave
    // acontece no onDone da sequência, que no modo degradado é imediato.
    const body = dom.document.getElementById(aula.dialogo.id).querySelector('.ex__body');
    body.querySelectorAll('.player button')[0].click();
    await flush(20);

    assert.equal(body.querySelectorAll('.dialogo__passate button')[1].disabled, false);
  });
});
