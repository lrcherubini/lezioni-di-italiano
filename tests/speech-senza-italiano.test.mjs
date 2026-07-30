/* Navegador com síntese de voz, mas NENHUMA voz it-IT instalada.

   Caso real em vários Linux e Android. É o modo degradado: o site entra em
   "transcrição-primeiro" — banner de aviso, texto revelado, a tarefa vira
   leitura e produção. O que ele nunca pode virar é tela branca ou erro. */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { installDOM } from './support/dom.mjs';
import { makeSpeechSynthesis, installUtterance, NO_IT_VOICES } from './support/speech-stub.mjs';

const synth = makeSpeechSynthesis({ voices: NO_IT_VOICES });
installUtterance();
installDOM({ speechSynthesis: synth });

const speech = await import('../js/speech.js');
await speech.voicesReady();

describe('modo degradado', () => {
  test('detecta a ausência de voz italiana', () => {
    const st = speech.status();
    assert.equal(st.supported, true, 'a API existe; o que falta é voz');
    assert.equal(st.ready, true);
    assert.equal(st.degraded, true);
    assert.equal(st.voiceCount, 0);
    assert.equal(speech.isDegraded(), true);
  });

  test('speak() não fala, mas resolve e chama onEnd', async () => {
    // Silêncio não é erro aqui: a UI já revelou a transcrição. O que não
    // pode acontecer é o onEnd nunca vir e o botão ficar preso em "falando".
    let terminou = false;
    await speech.speak('Ciao!', { onEnd: () => { terminou = true; } });
    assert.equal(synth.spoken.length, 0);
    assert.equal(terminou, true);
  });

  test('speakSequence() não fala, mas chama onDone', async () => {
    let fim = false;
    await speech.speakSequence(
      [{ speaker: 'A', it: 'Ciao' }, { speaker: 'B', it: 'Buongiorno' }],
      { onDone: () => { fim = true; } }
    );
    assert.equal(synth.spoken.length, 0);
    assert.equal(fim, true);
  });

  test('voiceFor devolve null sem quebrar', () => {
    assert.equal(speech.voiceFor('A'), null);
    assert.equal(speech.voiceFor(), null);
  });

  test('o banner recebe degraded: true pelo onStatusChange', () => {
    // É por este callback que app.js decide mostrar o aviso ao aluno.
    let visto = null;
    speech.onStatusChange((s) => { visto = s; });
    assert.equal(visto.ready, true);
    assert.equal(visto.degraded, true);
  });

  test('cancel() é seguro mesmo sem nada tocando', () => {
    assert.doesNotThrow(() => speech.cancel());
  });
});
