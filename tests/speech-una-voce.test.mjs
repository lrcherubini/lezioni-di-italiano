/* Exatamente UMA voz it-IT, e o navegador nunca dispara `voiceschanged`.

   Dois degraus da estratégia de voz caem aqui:
     · a rede de segurança de 2s (alguns navegadores só populam getVoices()
       e nunca emitem o evento)
     · diferenciar os dois falantes do diálogo por PITCH, já que não há uma
       segunda voz para dar ao interlocutor
*/

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { installDOM } from './support/dom.mjs';
import { makeSpeechSynthesis, installUtterance } from './support/speech-stub.mjs';

const UMA = [{ name: 'Elsa', lang: 'it-IT', voiceURI: 'it-elsa' }];

// lazy: getVoices() começa vazio e nunca chega o voiceschanged — só o
// timeout resolve. Depois do timeout, `voices` já responde.
const synth = makeSpeechSynthesis({ voices: UMA, lazy: true });
synth.getVoices = () => (Date.now() >= liberaEm ? UMA : []);
const liberaEm = Date.now() + 50;

installUtterance();
installDOM({ speechSynthesis: synth });

const speech = await import('../js/speech.js');

describe('rede de segurança do voiceschanged', () => {
  test('resolve pelo timeout quando o evento nunca vem', async () => {
    const st = await speech.voicesReady();
    assert.equal(st.ready, true);
    assert.equal(st.degraded, false);
    assert.equal(st.voiceCount, 1);
  });
});

describe('um falante só disponível', () => {
  test('os dois papéis usam a mesma voz', () => {
    assert.equal(speech.voiceFor('A').voiceURI, 'it-elsa');
    assert.equal(speech.voiceFor('B').voiceURI, 'it-elsa');
  });

  test('mas com pitch diferente, para o diálogo não virar monólogo', async () => {
    const antes = synth.spoken.length;
    await speech.speakSequence([
      { speaker: 'A', it: 'Ciao!' },
      { speaker: 'B', it: 'Buongiorno!' },
    ]);
    const [a, b] = synth.spoken.slice(antes);
    assert.equal(a.pitch, 1.05);
    assert.equal(b.pitch, 0.85);
    assert.notEqual(a.pitch, b.pitch);
  });
});
