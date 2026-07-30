/* ==========================================================================
   speech-stub.mjs — dublê da Web Speech API.

   Reproduz os comportamentos que speech.js existe para domar:
     · getVoices() vazio na primeira chamada, populado só depois de
       voiceschanged (o bug clássico do Chrome)
     · utterances que disparam onstart/onend de forma assíncrona
     · cancel() que interrompe a fila
   ========================================================================== */

export class UtteranceStub {
  constructor(text) {
    this.text = text;
    this.lang = '';
    this.rate = 1;
    this.pitch = 1;
    this.volume = 1;
    this.voice = null;
  }
}

/**
 * @param {object} opts
 * @param {Array} opts.voices vozes finais
 * @param {boolean} opts.lazy se true, getVoices() começa vazio e só popula
 *                            depois de emitVoicesChanged()
 */
export function makeSpeechSynthesis({ voices = [], lazy = false } = {}) {
  let current = lazy ? [] : voices;
  const listeners = [];

  const synth = {
    spoken: [],       // todos os utterances que passaram por speak()
    cancels: 0,
    speaking: false,

    getVoices: () => current,

    speak(u) {
      synth.spoken.push(u);
      synth.speaking = true;
      // Assíncrono de propósito: é assim que o navegador se comporta, e é
      // o que expõe bugs de ordem na fila do speech.js.
      queueMicrotask(() => {
        if (u._canceled) return;
        u.onstart?.({});
        queueMicrotask(() => {
          if (u._canceled) return;
          synth.speaking = false;
          u.onend?.({});
        });
      });
    },

    cancel() {
      synth.cancels += 1;
      synth.speaking = false;
      for (const u of synth.spoken) u._canceled = true;
    },

    addEventListener(type, fn) {
      if (type === 'voiceschanged') listeners.push(fn);
    },
    removeEventListener(type, fn) {
      const i = listeners.indexOf(fn);
      if (i >= 0) listeners.splice(i, 1);
    },

    /** Só para os testes: simula o evento tardio do Chrome. */
    emitVoicesChanged() {
      current = voices;
      for (const fn of [...listeners]) fn({});
    },

    /** Texto de tudo que foi falado, para asserção legível. */
    texts: () => synth.spoken.map((u) => u.text),
  };

  return synth;
}

export const IT_VOICES = [
  { name: 'Elsa', lang: 'it-IT', voiceURI: 'it-elsa' },
  { name: 'Cosimo', lang: 'it_IT', voiceURI: 'it-cosimo' },
  { name: 'Maria', lang: 'pt-BR', voiceURI: 'pt-maria' },
];

export const NO_IT_VOICES = [
  { name: 'Maria', lang: 'pt-BR', voiceURI: 'pt-maria' },
  { name: 'David', lang: 'en-US', voiceURI: 'en-david' },
];

/** Instala o utterance global. Deve rodar antes de importar speech.js. */
export function installUtterance() {
  globalThis.SpeechSynthesisUtterance = UtteranceStub;
  return UtteranceStub;
}
