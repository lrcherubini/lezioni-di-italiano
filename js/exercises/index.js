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
     subItemIds(item) → string[]                  (opcional)

   `subItemIds` é obrigatório para todo tipo cujo `check` devolve `results`
   com vários sub-itens. Devolve os ids que aquele exercício grava no
   progresso — e é a fonte ÚNICA da verdade sobre eles:

     · js/app.js countItems() mede esta lista para o `conteggio` do manifest;
     · js/ripasso.js indexById() resolve cada id de volta para o card.

   Foi assim porque não foi: enquanto cada um dos dois enumerava os tipos
   por conta própria, `scelta`, `riordino`, `abbinamento` e `slot-frame`
   entraram só na contagem. Resultado: 140 dos 272 ids rastreáveis venciam
   no progresso e nunca apareciam na revisão, sem erro nenhum. Derive daqui;
   não reescreva a lista em outro arquivo.

   O espelho em Python é `SUBITEM_FIELD` / `count_items` em
   tools/validate.py — esse não tem como importar daqui, então mudou aqui,
   mude lá.

   O root devolvido por render() pode carregar `_parts` com as referências
   de DOM que check/feedback/reveal precisarem. É o canal entre os métodos.
   ========================================================================== */

import gapAudio from './gap-audio.js';
import qaTranscribe from './qa-transcribe.js';
import dialogue from './dialogue.js';
import paradigmFill from './paradigm-fill.js';
import scelta from './scelta.js';
import riordino from './riordino.js';
import abbinamento from './abbinamento.js';
import slotFrame from './slot-frame.js';
import flashcard, { TIPI_CARTA } from './flashcard.js';
import dictogloss from './dictogloss.js';

/* Ainda não implementado (ver PRD.md):
   import minimalPair from './minimal-pair.js';
   Bloqueado por speech.js: HVPT pede ciclagem de várias vozes, e voiceFor()
   só expõe dois slots — o eixo `speaker` A/B, já usado pelo diálogo.      */

const registry = new Map([
  [gapAudio.type, gapAudio],
  [qaTranscribe.type, qaTranscribe],
  [dialogue.type, dialogue],
  [paradigmFill.type, paradigmFill],
  [scelta.type, scelta],
  [riordino.type, riordino],
  [abbinamento.type, abbinamento],
  [slotFrame.type, slotFrame],
  [flashcard.type, flashcard],
  [dictogloss.type, dictogloss],
]);

export function getExercise(type) {
  return registry.get(type) ?? null;
}

export function knownTypes() {
  return [...registry.keys()];
}

/* --- Baralho de flashcards ------------------------------------------------

   O baralho não é escrito à mão em `esercizi`: ele é DERIVADO dos `chunks`
   da aula, que já existem, já têm id imutável e já são validados. Construir
   aqui, num lugar só, é o que mantém `app.js` (que renderiza) e `ripasso.js`
   (que resolve id → card) enxergando exatamente o mesmo baralho.           */

/**
 * @param {object} lesson conteúdo de um lezione-NN.json
 * @returns {object|null} item montável do tipo `flashcard`, ou null se a
 *   aula não tiver nenhum chunk elegível (a Aula 0, por exemplo).
 */
export function flashcardDeck(lesson) {
  const carte = (lesson.chunks ?? []).filter((c) => TIPI_CARTA.has(c.chunkType));
  if (!carte.length) return null;
  return {
    id: `l${lesson.id}-lex`,
    type: 'flashcard',
    category: 'VOCABOLARIO',
    consegna: 'Lembre o italiano antes de virar a carta. Marque com honestidade — '
            + 'o que você não lembrar volta antes na revisão.',
    carte,
  };
}
