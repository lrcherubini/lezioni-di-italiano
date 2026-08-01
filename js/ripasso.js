/* ==========================================================================
   ripasso.js — revisão espaçada, atravessando todas as aulas.

   Com duas aulas isso era enfeite. Com trinta ou quarenta é o que separa
   um curso de trinta páginas soltas: sem revisão, a Aula 3 nunca mais volta.

   O desenho aproveita o que já existe em vez de inventar:
     · store.dueItems() já ordena por vencimento e taxa de erro
     · mountExercise() de app.js já faz submit → check → feedback → store

   O trabalho de verdade é um só: os ids que o progresso rastreia nem sempre
   são exercícios. Uma célula de paradigma (`l01-e13-r1-c1`) e uma pergunta
   de diálogo (`l01-d01-q1`) têm id próprio, mas quem se renderiza é o
   exercício que as contém. É o que indexById() resolve.
   ========================================================================== */

import * as store from './store.js';
import { flashcardDeck } from './exercises/index.js';
import { el, renderStage } from './render.js';
import {
  loadJSON, mountExercise, resetExerciseCounter, initChrome, fail, subItemIds,
} from './app.js';

const CONTENT = 'content/';

/** Teto de exercícios por sessão. Revisão longa não é revisão, é aula. */
const LIMITE = 10;

/** Quantos itens vencidos consultar antes de deduplicar por exercício.
 *  Folga sobre o LIMITE porque vários ids podem cair no mesmo card. */
const JANELA = 60;

/**
 * Mapeia TODO id rastreável de uma aula para o exercício que o contém.
 *
 * @param {object} lesson conteúdo de um lezione-NN.json
 * @returns {Map<string, object>} id → item montável (já com `type`)
 */
export function indexById(lesson) {
  const mapa = new Map();

  for (const ex of lesson.esercizi ?? []) {
    mapa.set(ex.id, ex);

    // Sub-item não se renderiza sozinho: uma célula de paradigma, uma
    // pergunta de escolha ou um giro de substituição só existem dentro do
    // card inteiro. Todos apontam para o mesmo exercício.
    //
    // Quem sabe quais ids um tipo produz é o módulo do tipo. Enumerar aqui
    // por `if (ex.type === …)` foi exatamente o bug que deixou os sub-itens
    // das quatro drills novas órfãos — vencidos no progresso, invisíveis na
    // revisão, e sem nenhum sinal de erro.
    for (const id of subItemIds(ex)) mapa.set(id, ex);
  }

  // O baralho de flashcards não está em `esercizi` — é derivado dos chunks.
  // Sem isto, cada carta revisada venceria no progresso e nunca voltaria.
  const deck = flashcardDeck(lesson);
  if (deck) {
    mapa.set(deck.id, deck);
    for (const cid of subItemIds(deck)) mapa.set(cid, deck);
  }

  const d = lesson.dialogo;
  if (d) {
    const item = { ...d, type: 'dialogue' };
    mapa.set(d.id, item);
    for (const p of d.passate ?? []) {
      for (const q of p.domande ?? []) mapa.set(q.id, item);
    }
  }

  return mapa;
}

/**
 * Resolve os itens vencidos em exercícios montáveis.
 *
 * Carrega SÓ as aulas que têm item vencido — não o manifest inteiro. Numa
 * revisão típica isso são duas ou três aulas, não quarenta.
 *
 * @returns {Promise<Array<{lessonId, item, errRate}>>}
 */
export async function collectDue(limite = LIMITE) {
  const due = store.dueItems(JANELA);
  if (!due.length) return [];

  const aulas = new Map();
  const modos = new Map();
  for (const id of new Set(due.map((d) => d.lessonId))) {
    try {
      const lesson = await loadJSON(`${CONTENT}lezione-${id}.json`);
      aulas.set(id, indexById(lesson));
      // O modo viaja COM o item, não com a página: esta lista mistura aulas,
      // e uma delas pode ser em português enquanto outra é em italiano.
      modos.set(id, lesson.modo ?? 'pt');
    } catch {
      // Aula sumiu ou foi renomeada: o progresso dela fica órfão, mas a
      // revisão das outras não pode parar por isso.
    }
  }

  const out = [];
  const vistos = new Set();

  for (const d of due) {
    const item = aulas.get(d.lessonId)?.get(d.itemId);
    if (!item) continue;

    const chave = `${d.lessonId}:${item.id}`;
    if (vistos.has(chave)) continue;
    vistos.add(chave);

    out.push({ lessonId: d.lessonId, item, errRate: d.errRate, modo: modos.get(d.lessonId) ?? 'pt' });
    if (out.length >= limite) break;
  }

  return out;
}

/* --- Render --------------------------------------------------------------- */

function vazio(total) {
  return el('div', { class: 'ripasso-vuoto' },
    el('p', {}, total === 0
      ? 'Nada vencido por enquanto. '
      : 'Tudo em dia. '),
    el('p', { html:
      'A revisão aparece aqui conforme os itens vencem — quanto mais você erra um item, '
      + 'mais cedo ele volta. Enquanto isso, siga para a <a href="index.html">próxima aula</a>.' })
  );
}

export async function renderRipasso() {
  const main = document.getElementById('ripasso');
  main.innerHTML = '';

  const total = store.dueCount();
  const lista = await collectDue();

  if (!lista.length) {
    main.append(renderStage(
      { id: 'ripasso', kicker: 'Revisão', title: 'Ripasso', intro: '' },
      vazio(total)
    ));
    return;
  }

  resetExerciseCounter();

  const restam = total - lista.length;
  const intro = `${total} ${total === 1 ? 'item vencido' : 'itens vencidos'}, `
    + `de ${new Set(lista.map((x) => x.lessonId)).size} aula(s). `
    + (restam > 0
      ? `Esta sessão traz ${lista.length}; os outros ${restam} ficam para a próxima.`
      : 'Todos cabem nesta sessão.')
    + ' Os que você mais erra vêm primeiro.';

  main.append(renderStage(
    { id: 'ripasso', kicker: 'Revisão', title: 'Ripasso', intro },
    ...lista.map(({ item, lessonId, modo }) => {
      const card = mountExercise(item, lessonId, item.type === 'dialogue'
        ? { headLabel: 'Dialogo', headTitle: item.titolo, headGloss: item.gloss, countInIndex: false, modo }
        : { modo });
      // De onde veio: numa revisão que mistura aulas, isso é a diferença
      // entre reconhecer o item e ficar perdido.
      card.append(el('div', { class: 'ripasso-fonte' },
        el('a', { href: `lezione.html?l=${lessonId}#${item.id}` }, `↗ Lezione ${Number(lessonId)}`)
      ));
      return card;
    })
  ));
}

/* --- Bootstrap ------------------------------------------------------------ */

document.addEventListener('DOMContentLoaded', async () => {
  initChrome();
  try {
    await renderRipasso();
  } catch (err) {
    fail(err);
  }
});
