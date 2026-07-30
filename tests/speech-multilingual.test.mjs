/* Vozes "Multilingual" do Windows 11 / Edge convivendo com uma voz italiana
   monolíngue.

   Por que este cenário merece arquivo próprio: as vozes multilíngues
   identificam o idioma pelo TEXTO e trocam de sotaque sozinhas, ignorando
   o `lang` e o `voice` do utterance. Na prática isso fazia «Dire
   l'alfabeto» sair em francês e «I digrammi GN, GL, SC, CH, GH» sair em
   inglês — o detector via "Dire l'…" como francês e não via italiano
   nenhum na lista de dígrafos.

   A defesa é de ordenação: monolíngue sempre antes de multilíngue. */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { installDOM } from './support/dom.mjs';
import { makeSpeechSynthesis, installUtterance } from './support/speech-stub.mjs';

// Ordem de propósito hostil: a multilíngue vem ANTES da monolíngue, que é
// como o Windows 11 costuma devolver. Sem a reordenação, italian[0] seria
// a multilíngue.
const VOCI = [
  { name: 'Microsoft Giuseppe Multilingual Online (Natural)', lang: 'it-IT', voiceURI: 'it-giuseppe-ml' },
  { name: 'Microsoft Elsa', lang: 'it-IT', voiceURI: 'it-elsa' },
  { name: 'Microsoft Diego Multilingual', lang: 'it-IT', voiceURI: 'it-diego-ml' },
  { name: 'Microsoft Cosimo', lang: 'it_IT', voiceURI: 'it-cosimo' },
  { name: 'Microsoft Maria', lang: 'pt-BR', voiceURI: 'pt-maria' },
];

const synth = makeSpeechSynthesis({ voices: VOCI });
installUtterance();
installDOM({ speechSynthesis: synth });

const speech = await import('../js/speech.js');
await speech.voicesReady();

describe('preferência por voz monolíngue', () => {
  test('a narração pega a monolíngue, não a multilíngue que vinha primeiro', () => {
    assert.equal(speech.voiceFor().voiceURI, 'it-elsa');
  });

  test('o segundo falante do diálogo também é monolíngue', () => {
    assert.equal(speech.voiceFor('B').voiceURI, 'it-cosimo');
  });

  test('as multilíngues continuam disponíveis, mas por último', () => {
    const uris = speech.status().voices.map((v) => v.uri);
    assert.deepEqual(uris, ['it-elsa', 'it-cosimo', 'it-giuseppe-ml', 'it-diego-ml']);
  });

  test('nenhuma voz não-italiana entra na lista', () => {
    const uris = speech.status().voices.map((v) => v.uri);
    assert.ok(!uris.includes('pt-maria'));
  });

  test('o texto que disparava o bug sai com voz italiana monolíngue', async () => {
    const antes = synth.spoken.length;
    await speech.speak("I digrammi GN, GL, SC, CH, GH");
    const u = synth.spoken.slice(antes).at(-1);
    assert.equal(u.voice.voiceURI, 'it-elsa');
    assert.equal(u.lang, 'it-IT');
  });
});
