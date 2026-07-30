/* ==========================================================================
   speech.js — camada única sobre a Web Speech API.
   Todo o áudio do site passa por aqui. Nenhum outro módulo toca em
   speechSynthesis diretamente.

   Este arquivo concentra as armadilhas conhecidas da API:
     · getVoices() volta vazio na primeira chamada (resolve em voiceschanged)
     · iOS Safari só fala depois de um gesto do usuário
     · Chrome corta utterances longos (~15s) → quebramos por sentença
     · a fila trava se você empilhar speak() sem cancel()
     · pode não existir NENHUMA voz it-IT → modo transcrição-primeiro
   ========================================================================== */

const LANG = 'it-IT';

/** Velocidades expostas. Teto em 1.0 por decisão pedagógica: para A1,
 *  acelerar áudio derruba a compreensão. Ver DESIGN.md. */
export const RATES = { lento: 0.7, normale: 1.0 };

const state = {
  supported: typeof window !== 'undefined' && 'speechSynthesis' in window,
  voices: [],
  italian: [],
  ready: false,
  unlocked: false,
  currentRate: RATES.normale,
  /** Quando true, nenhuma voz it-IT existe: a UI cai para transcrição-primeiro. */
  degraded: false,
};

const listeners = new Set();

function emit() {
  for (const fn of listeners) fn(status());
}

/** Assina mudanças de status (usado para renderizar o banner de degradação). */
export function onStatusChange(fn) {
  listeners.add(fn);
  fn(status());
  return () => listeners.delete(fn);
}

export function status() {
  return {
    supported: state.supported,
    ready: state.ready,
    degraded: state.degraded,
    voiceCount: state.italian.length,
    voices: state.italian.map((v) => ({ name: v.name, uri: v.voiceURI })),
    rate: state.currentRate,
  };
}

/* --- Descoberta de vozes -------------------------------------------------

   getVoices() é síncrono na assinatura mas assíncrono na prática: no
   Chrome ele retorna [] até o evento voiceschanged disparar. Resolvemos
   uma única promise e cacheamos.                                         */

/* As vozes neurais "Multilingual" do Windows 11 (e as online do Edge)
   identificam o idioma pelo TEXTO e trocam de sotaque sozinhas — o `lang`
   e o `voice` do utterance não as demovem. O efeito prático: «Dire
   l'alfabeto» sai em francês (o detector vê "Dire l'…") e «I digrammi GN,
   GL, SC, CH, GH» sai em inglês (nenhuma palavra italiana para detectar).
   Uma voz italiana monolíngue não tem detector e sempre lê em italiano,
   então ela vem primeiro. A multilíngue fica como último recurso: é melhor
   que silêncio, e num texto italiano corrido ela acerta. */
const isMultilingual = (v) => /multiling/i.test(v.name || '');

const isItalian = (v) => (v.lang || '').replace('_', '-').toLowerCase().startsWith('it');

/** Vozes italianas, monolíngues primeiro. A ordem importa: `voiceFor()`
 *  entrega [0] para narração e [1] para o segundo falante do diálogo. */
function pickItalian(voices) {
  const italian = voices.filter(isItalian);
  const mono = italian.filter((v) => !isMultilingual(v));
  const multi = italian.filter(isMultilingual);
  return [...mono, ...multi];
}

let readyPromise = null;

export function voicesReady() {
  if (readyPromise) return readyPromise;

  readyPromise = new Promise((resolve) => {
    if (!state.supported) {
      state.degraded = true;
      state.ready = true;
      emit();
      resolve(status());
      return;
    }

    let settled = false;

    const collect = () => {
      const voices = window.speechSynthesis.getVoices() || [];
      if (!voices.length && !settled) return false;

      state.voices = voices;
      state.italian = pickItalian(voices);
      state.degraded = state.italian.length === 0;
      state.ready = true;
      settled = true;
      emit();
      resolve(status());
      return true;
    };

    if (collect()) return;

    window.speechSynthesis.addEventListener('voiceschanged', collect, { once: false });

    // Rede de segurança: alguns navegadores nunca disparam voiceschanged.
    // Depois de 2s aceitamos o que houver, inclusive lista vazia.
    setTimeout(() => {
      if (settled) return;
      settled = true;
      const voices = window.speechSynthesis.getVoices() || [];
      state.voices = voices;
      state.italian = pickItalian(voices);
      state.degraded = state.italian.length === 0;
      state.ready = true;
      emit();
      resolve(status());
    }, 2000);
  });

  return readyPromise;
}

/* --- Desbloqueio por gesto ----------------------------------------------

   iOS Safari ignora speak() que não venha de um handler de gesto. Um
   utterance vazio no primeiro toque destrava a sessão inteira.          */

export function unlock() {
  if (!state.supported || state.unlocked) return;
  try {
    const u = new SpeechSynthesisUtterance('');
    u.volume = 0;
    window.speechSynthesis.speak(u);
    state.unlocked = true;
  } catch {
    /* Se falhar, o primeiro speak() real ainda tem chance de funcionar. */
  }
}

if (typeof window !== 'undefined') {
  const once = () => {
    unlock();
    voicesReady();
    window.removeEventListener('pointerdown', once);
    window.removeEventListener('keydown', once);
  };
  window.addEventListener('pointerdown', once, { once: true });
  window.addEventListener('keydown', once, { once: true });
}

/* --- Seleção de voz -----------------------------------------------------

   Diálogos têm dois falantes e a Web Speech API não tem noção de
   "personagem". Estratégia em três degraus:
     2+ vozes it-IT → uma voz distinta por falante
     1 voz it-IT    → mesma voz, pitch diferente
     0 vozes it-IT  → modo degradado, a UI revela a transcrição         */

export function voiceFor(speaker) {
  if (!state.italian.length) return null;
  if (!speaker) return state.italian[0];
  const idx = speaker === 'B' ? 1 : 0;
  return state.italian[idx] || state.italian[0];
}

function pitchFor(speaker) {
  if (state.italian.length >= 2) return 1;
  return speaker === 'B' ? 0.85 : 1.05;
}

/* --- Fala ---------------------------------------------------------------- */

/** Chrome corta utterances longos. Quebrar em sentenças mantém tudo audível
 *  e de bônus dá pausas naturais entre frases. */
function splitSentences(text) {
  return String(text)
    .split(/(?<=[.!?…:])\s+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

/** Remove marcação HTML que existe só para o olho — o TTS não deve ler tags. */
function stripMarkup(text) {
  return String(text)
    .replace(/<[^>]*>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/[«»]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/* Contador de geração. cancel() incrementa; toda fala em andamento compara
   a geração que capturou e desiste se ficou obsoleta. Uma sequência de
   diálogo captura a geração UMA vez e a repassa para cada turno — por isso
   _utter() não cancela nada por conta própria. */
let generation = 0;

/* O Chrome pode coletar o SpeechSynthesisUtterance como lixo antes de ele
   terminar de tocar — e aí onend/onerror nunca disparam e a corrente de
   sentenças trava no meio. Manter uma referência viva até o fim resolve.
   Ver talkrapp.com/speechSynthesis.html. */
const speaking = new Set();

/** Fala um trecho já limpo, sem cancelar a fila. Interno. */
function _utter(text, { rate, speaker, gen, onStart }) {
  const voice = voiceFor(speaker);
  const pitch = pitchFor(speaker);
  const chunks = splitSentences(text);

  return new Promise((resolve) => {
    let i = 0;
    let started = false;

    const next = () => {
      if (gen !== generation) return resolve();
      if (i >= chunks.length) return resolve();

      const u = new SpeechSynthesisUtterance(chunks[i++]);
      u.lang = LANG;
      u.rate = rate;
      u.pitch = pitch;
      if (voice) u.voice = voice;

      u.onstart = () => {
        if (!started) {
          started = true;
          onStart?.();
        }
      };
      u.onend = () => {
        speaking.delete(u);
        next();
      };
      u.onerror = () => {
        speaking.delete(u);
        // "interrupted"/"canceled" são esperados quando o usuário troca de áudio.
        if (gen === generation) next();
        else resolve();
      };

      speaking.add(u);
      window.speechSynthesis.speak(u);
    };

    next();
  });
}

/**
 * Fala um texto em italiano. Interrompe o que estiver tocando.
 * @param {string} text
 * @param {{rate?: number, speaker?: string, onStart?: Function, onEnd?: Function}} opts
 * @returns {Promise<void>} resolve quando termina (ou imediatamente se degradado)
 */
export async function speak(text, opts = {}) {
  const clean = stripMarkup(text);
  if (!clean) return;

  // Sem isso, um clique antes da lista de vozes chegar fala com a voz
  // padrão do sistema, no idioma padrão do SO — não em it-IT.
  if (!state.ready) await voicesReady();

  if (!state.supported || state.degraded) {
    // Nada a tocar. Não é erro: neste modo a UI já revela a transcrição.
    opts.onEnd?.();
    return;
  }

  cancel(); // sem isso a fila do Chrome trava
  const gen = generation;

  await _utter(clean, {
    rate: opts.rate ?? state.currentRate,
    speaker: opts.speaker,
    gen,
    onStart: opts.onStart,
  });

  if (gen === generation) opts.onEnd?.();
}

/** Fala uma sequência de turnos, cada um com sua voz. Usado pelo diálogo. */
export async function speakSequence(turns, opts = {}) {
  if (!state.ready) await voicesReady();

  if (!state.supported || state.degraded) {
    opts.onDone?.();
    return;
  }

  cancel();
  const gen = generation;
  const rate = opts.rate ?? state.currentRate;

  for (const turn of turns) {
    if (gen !== generation) return;
    opts.onTurn?.(turn);
    await _utter(stripMarkup(turn.it), { rate, speaker: turn.speaker, gen });
    if (gen !== generation) return;
    await pause(220);
  }

  if (gen === generation) opts.onDone?.();
}

function pause(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

export function cancel() {
  generation++;
  speaking.clear();
  if (!state.supported) return;
  try {
    window.speechSynthesis.cancel();
  } catch {
    /* ignora */
  }
}

export function setRate(rate) {
  state.currentRate = rate;
  emit();
}

export function getRate() {
  return state.currentRate;
}

export function isDegraded() {
  return state.degraded;
}
