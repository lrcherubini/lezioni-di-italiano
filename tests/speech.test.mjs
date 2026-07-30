/* Síntese de voz, caminho feliz: existem vozes it-IT.
   Cada cenário de speech.js precisa de estado de módulo limpo (a promise de
   vozes é cacheada de propósito), e `node --test` roda cada ARQUIVO num
   processo próprio — por isso os cenários degradados moram em arquivos
   separados, não em describes daqui. */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { installDOM } from './support/dom.mjs';
import { makeSpeechSynthesis, installUtterance, IT_VOICES } from './support/speech-stub.mjs';
import { flush } from './support/fixtures.mjs';

const synth = makeSpeechSynthesis({ voices: IT_VOICES, lazy: true });
installUtterance();
const dom = installDOM({ speechSynthesis: synth });

const speech = await import('../js/speech.js');

describe('descoberta de vozes', () => {
  test('getVoices vazio na primeira chamada resolve em voiceschanged', async () => {
    // O bug clássico do Chrome: 0 vozes imediatamente, N depois do evento.
    assert.equal(synth.getVoices().length, 0);

    const p = speech.voicesReady();
    synth.emitVoicesChanged();
    const st = await p;

    assert.equal(st.ready, true);
    assert.equal(st.degraded, false);
    assert.equal(st.voiceCount, 2, 'só it-IT e it_IT contam; pt-BR não');
  });

  test('voicesReady é idempotente — a promise é cacheada', async () => {
    assert.equal(speech.voicesReady(), speech.voicesReady());
  });

  test('lang com underscore (it_IT) conta como italiano', () => {
    assert.deepEqual(
      speech.status().voices.map((v) => v.uri),
      ['it-elsa', 'it-cosimo']
    );
  });

  test('não está degradado', () => {
    assert.equal(speech.isDegraded(), false);
  });
});

describe('seleção de voz por falante', () => {
  test('com 2+ vozes, cada falante ganha a sua', () => {
    assert.equal(speech.voiceFor('A').voiceURI, 'it-elsa');
    assert.equal(speech.voiceFor('B').voiceURI, 'it-cosimo');
  });

  test('sem falante, usa a primeira', () => {
    assert.equal(speech.voiceFor().voiceURI, 'it-elsa');
    assert.equal(speech.voiceFor(null).voiceURI, 'it-elsa');
  });

  test('falante desconhecido cai no índice 0', () => {
    assert.equal(speech.voiceFor('C').voiceURI, 'it-elsa');
  });
});

describe('speak', () => {
  test('fala, aplica lang/rate e dispara onStart e onEnd', async () => {
    const eventos = [];
    await speech.speak('Ciao!', {
      rate: 0.7,
      onStart: () => eventos.push('start'),
      onEnd: () => eventos.push('end'),
    });

    const u = synth.spoken.at(-1);
    assert.equal(u.text, 'Ciao!');
    assert.equal(u.lang, 'it-IT');
    assert.equal(u.rate, 0.7);
    assert.equal(u.voice.voiceURI, 'it-elsa');
    assert.deepEqual(eventos, ['start', 'end']);
  });

  test('remove markup antes de falar — o TTS não lê tags', async () => {
    await speech.speak('<b>il</b> cane &amp; la penna «x»');
    assert.equal(synth.spoken.at(-1).text, 'il cane & la penna x');
  });

  test('texto vazio ou só markup não fala nada', async () => {
    const antes = synth.spoken.length;
    await speech.speak('');
    await speech.speak('   ');
    await speech.speak('<b></b>');
    assert.equal(synth.spoken.length, antes);
  });

  test('quebra por sentença — Chrome corta utterance longo', async () => {
    const antes = synth.spoken.length;
    await speech.speak('Ciao! Come stai? Bene. Grazie');
    const novos = synth.spoken.slice(antes).map((u) => u.text);
    assert.deepEqual(novos, ['Ciao!', 'Come stai?', 'Bene.', 'Grazie']);
  });

  test('cancela a fila antes de falar', async () => {
    const antes = synth.cancels;
    await speech.speak('Ciao');
    assert.equal(synth.cancels, antes + 1);
  });

  test('usa a velocidade corrente quando não recebe rate', async () => {
    speech.setRate(speech.RATES.lento);
    await speech.speak('Ciao');
    assert.equal(synth.spoken.at(-1).rate, 0.7);
    speech.setRate(speech.RATES.normale);
    assert.equal(speech.getRate(), 1.0);
  });
});

describe('speakSequence', () => {
  test('fala os turnos em ordem, alternando as vozes', async () => {
    const antes = synth.spoken.length;
    const turnos = [];

    await speech.speakSequence(
      [
        { speaker: 'A', it: 'Ciao!' },
        { speaker: 'B', it: 'Buongiorno!' },
      ],
      { onTurn: (t) => turnos.push(t.it), onDone: () => turnos.push('fim') }
    );

    const ditos = synth.spoken.slice(antes);
    assert.deepEqual(ditos.map((u) => u.text), ['Ciao!', 'Buongiorno!']);
    assert.deepEqual(ditos.map((u) => u.voice.voiceURI), ['it-elsa', 'it-cosimo']);
    assert.deepEqual(turnos, ['Ciao!', 'Buongiorno!', 'fim']);
  });

  test('cancela UMA vez só, no início — não uma por turno', async () => {
    // Regressão: speak() cancelava por dentro e a sequência se
    // autointerrompia no segundo turno. Daí existir o _utter() interno.
    const antes = synth.cancels;
    await speech.speakSequence([
      { speaker: 'A', it: 'Uno' },
      { speaker: 'B', it: 'Due' },
      { speaker: 'A', it: 'Tre' },
    ]);
    assert.equal(synth.cancels, antes + 1);
  });

  test('cancel() no meio aborta o resto da sequência', async () => {
    const antes = synth.spoken.length;
    const p = speech.speakSequence([
      { speaker: 'A', it: 'Uno' },
      { speaker: 'B', it: 'Due' },
      { speaker: 'A', it: 'Tre' },
    ], { onDone: () => assert.fail('onDone não deveria rodar após cancel') });

    await flush(0);
    speech.cancel();
    await p;

    assert.ok(synth.spoken.length - antes < 3, 'a sequência deveria ter parado no meio');
  });
});

describe('rate e status', () => {
  test('setRate notifica os assinantes', () => {
    const vistos = [];
    const off = speech.onStatusChange((s) => vistos.push(s.rate));
    assert.equal(vistos.length, 1, 'onStatusChange emite o estado atual na assinatura');

    speech.setRate(0.7);
    assert.equal(vistos.at(-1), 0.7);

    off();
    speech.setRate(1.0);
    assert.equal(vistos.at(-1), 0.7, 'após unsubscribe não deveria mais receber');
  });

  test('RATES não expõe velocidade acima de 1.0', () => {
    // Decisão pedagógica: para A1, acelerar derruba a compreensão.
    assert.deepEqual(speech.RATES, { lento: 0.7, normale: 1.0 });
    assert.ok(Math.max(...Object.values(speech.RATES)) <= 1.0);
  });
});

describe('unlock por gesto (iOS Safari)', () => {
  test('o primeiro pointerdown na janela destrava com utterance vazio', () => {
    const antes = synth.spoken.length;
    dom.window.dispatchEvent({ type: 'pointerdown' });
    const u = synth.spoken.at(-1);
    assert.equal(synth.spoken.length, antes + 1);
    assert.equal(u.text, '');
    assert.equal(u.volume, 0);
  });

  test('unlock só roda uma vez', () => {
    const antes = synth.spoken.length;
    speech.unlock();
    dom.window.dispatchEvent({ type: 'pointerdown' });
    assert.equal(synth.spoken.length, antes);
  });
});
