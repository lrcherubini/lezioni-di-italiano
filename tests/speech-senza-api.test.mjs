/* Navegador sem Web Speech API nenhuma. Mais radical que o "sem voz
   italiana": aqui `speechSynthesis` não existe no window. Nada pode
   lançar — nem no import do módulo, que registra listeners no topo. */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { installDOM } from './support/dom.mjs';

const dom = installDOM();          // sem speechSynthesis de propósito
const speech = await import('../js/speech.js');

describe('sem Web Speech API', () => {
  test('o módulo importa sem lançar e se marca como não suportado', () => {
    assert.equal(speech.status().supported, false);
  });

  test('voicesReady resolve como degradado, sem esperar evento nenhum', async () => {
    const st = await speech.voicesReady();
    assert.equal(st.ready, true);
    assert.equal(st.degraded, true);
    assert.equal(st.voiceCount, 0);
  });

  test('speak e speakSequence resolvem chamando os callbacks', async () => {
    let fim = 0;
    await speech.speak('Ciao', { onEnd: () => { fim += 1; } });
    await speech.speakSequence([{ speaker: 'A', it: 'Ciao' }], { onDone: () => { fim += 1; } });
    assert.equal(fim, 2);
  });

  test('unlock e cancel não lançam', () => {
    assert.doesNotThrow(() => speech.unlock());
    assert.doesNotThrow(() => speech.cancel());
  });

  test('o gesto do usuário não quebra a página', () => {
    assert.doesNotThrow(() => dom.window.dispatchEvent({ type: 'keydown' }));
  });
});
