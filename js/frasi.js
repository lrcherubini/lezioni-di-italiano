/* ==========================================================================
   frasi.js — as frases que fazem a aula andar.

   Terceira página fora da sequência de aulas, depois de ripasso e notebook,
   e pelo mesmo motivo das outras duas: o que atravessa todas as aulas não
   cabe dentro de nenhuma. «Pode repetir?» é a frase de que o aluno mais
   precisa e era a mais longe da mão — vivia enterrada na Aula 0, e ninguém
   volta à Aula 0 no meio da Aula 12.

   A divisão em dois grupos é o conteúdo inteiro. O primeiro o aluno PRODUZ:
   decora e diz. O segundo ele só RECONHECE — chegam faladas, rápido e sem
   aviso, e é aí que travam. Um livro imprime essa metade e manda ouvir um
   CD; aqui o 🔊 já está em cada linha, a 0.7 e a 1.0.

   Não grava progresso, e isso é a mesma decisão que `funzioni` já tomou
   dentro da aula: função é leitura organizada, quem mede recuperação é o
   baralho. O que esta página tem é o «＋ caderno» — leia organizado aqui,
   guarde o que travou, escreva a sua frase lá.

   Como ripasso.js e notebook.js, não se autoinicializa por engano: importa
   `initChrome` e `fail` de app.js, que por decisão não dispara nada sozinho.
   ========================================================================== */

import { el, renderStage, renderFunzioni, prose } from './render.js';
import { loadJSON, initChrome, fail, notebookCtx } from './app.js';

const CONTENT = 'content/';

/**
 * Um grupo = uma etapa visual, com a sua própria explicação e os seus cards
 * de função. `renderFunzioni` espera `{funzioni, chunks}`, então o grupo
 * empresta os chunks do arquivo inteiro — eles são um inventário só, como
 * dentro de uma aula.
 */
function grupo(g, chunks, notebook) {
  const corpo = [];

  for (const p of g.spiegazione ?? []) {
    corpo.push(prose(p, 'p', { class: 'spiegazione' }));
  }
  corpo.push(renderFunzioni({ funzioni: g.funzioni, chunks }, 'pt', notebook));

  return renderStage(
    { id: g.id, kicker: g.gloss ?? '', title: g.titolo, intro: '' },
    ...corpo
  );
}

export async function renderFrasi() {
  const main = document.getElementById('frasi');
  const dati = await loadJSON(`${CONTENT}frasi.json`);

  main.innerHTML = '';

  /* `lesson: null` de propósito: estas frases não pertencem a aula nenhuma,
     e o caderno agrupa por aula de origem. Elas caem no grupo «Sem aula»,
     que é exatamente o que são. */
  const notebook = notebookCtx(null);

  const cabeca = el('header', { class: 'frasi__head' },
    el('h1', { class: 'stage__title' }, dati.titolo),
    dati.gloss ? el('p', { class: 'section__gloss' }, dati.gloss) : null,
    dati.intro ? prose(dati.intro, 'p', { class: 'spiegazione' }) : null
  );

  main.append(cabeca, ...(dati.gruppi ?? []).map((g) => grupo(g, dati.chunks ?? [], notebook)));
}

/* --- Bootstrap ------------------------------------------------------------ */

document.addEventListener('DOMContentLoaded', async () => {
  initChrome();
  try {
    await renderFrasi();
  } catch (err) {
    fail(err);
  }
});
