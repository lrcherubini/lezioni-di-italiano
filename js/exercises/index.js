/* ==========================================================================
   index.js — registry de tipos de exercício.

   Para adicionar um tipo novo: crie o módulo, importe aqui, some ao mapa.
   Nada mais no core precisa mudar — é isso que permite acrescentar aula
   nova mexendo apenas em content/.

   Contrato que todo módulo implementa:
     type      string — casa com o campo "type" no JSON
     render(item, ctx) → HTMLElement      (ctx.submit(resposta) envia)
     check(item, response, root) → {correct, score, level, ...}
     feedback(item, result, root) → HTMLElement   (opcional)
     reveal(item, root) → void                    (opcional)

   O root devolvido por render() pode carregar `_parts` com as referências
   de DOM que check/feedback/reveal precisarem. É o canal entre os métodos.
   ========================================================================== */

import gapAudio from './gap-audio.js';
import qaTranscribe from './qa-transcribe.js';
import dialogue from './dialogue.js';
import paradigmFill from './paradigm-fill.js';

/* Fase 2, já especificados em PRD.md / DESIGN.md:
   import dictogloss from './dictogloss.js';
   import minimalPair from './minimal-pair.js';
   import slotFrame from './slot-frame.js';
   import flashcard from './flashcard.js';                                */

const registry = new Map([
  [gapAudio.type, gapAudio],
  [qaTranscribe.type, qaTranscribe],
  [dialogue.type, dialogue],
  [paradigmFill.type, paradigmFill],
]);

export function getExercise(type) {
  return registry.get(type) ?? null;
}

export function knownTypes() {
  return [...registry.keys()];
}
