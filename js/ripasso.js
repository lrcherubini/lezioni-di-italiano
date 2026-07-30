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
import { el, renderStage } from './render.js';
import {
  loadJSON, mountExercise, resetExerciseCounter, initChrome, fail,
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

    // Paradigma: cada célula oculta é um item de progresso próprio, mas
    // não se renderiza sozinha — o card é a tabela inteira.
    if (ex.type === 'paradigm-fill') {
      for (const row of ex.righe ?? []) {
        for (const i of row.nascondi ?? []) mapa.set(`${row.id}-c${i}`, ex);
      }
    }
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
  for (const id of new Set(due.map((d) => d.lessonId))) {
    try {
      aulas.set(id, indexById(await loadJSON(`${CONTENT}lezione-${id}.json`)));
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

    out.push({ lessonId: d.lessonId, item, errRate: d.errRate });
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
    ...lista.map(({ item, lessonId }) => {
      const card = mountExercise(item, lessonId, item.type === 'dialogue'
        ? { headLabel: 'Dialogo', headTitle: item.titolo, headGloss: item.gloss, countInIndex: false }
        : {});
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
