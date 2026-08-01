/* ==========================================================================
   notebook.js — o Lexical Notebook.

   A ideia que sustenta isto: um chunk só vira memória quando ele passa por
   um contexto que é SEU. A tradução já está no `content/` e reler não fixa
   nada — o que fixa é escrever uma frase própria com aquela forma.

   Por isso a página tem exatamente um campo por entrada, e ele é livre. Não
   há correção, não há gabarito e não há nota: corrigir a frase do aluno
   exigiria um professor, e o site não é isso. O que ele oferece é o lugar
   para escrever e o áudio do modelo ao lado.

   Como ripasso.js, este módulo não se autoinicializa por engano: ele importa
   `initChrome` e `fail` de app.js, que por decisão não dispara nada sozinho.
   ========================================================================== */

import * as store from './store.js';
import { el, speakButton, renderStage } from './render.js';
import { initChrome, fail } from './app.js';
import { escapeHtml } from './check.js';

/** Agrupa por aula de origem, preservando a ordem de entrada no caderno. */
function porAula(entradas) {
  const grupos = new Map();
  for (const e of entradas) {
    const chave = e.lesson ?? '—';
    if (!grupos.has(chave)) grupos.set(chave, []);
    grupos.get(chave).push(e);
  }
  return [...grupos.entries()].sort((a, b) => String(a[0]).localeCompare(String(b[0])));
}

function vazio() {
  return el('div', { class: 'ripasso-vuoto' },
    el('p', {}, 'O caderno está vazio.'),
    el('p', { html:
      'Na etapa <b>Lessico</b> de cada aula, use <b>＋ caderno</b> nas formas que você '
      + 'quer fixar. Depois volte aqui e escreva uma frase sua com cada uma — '
      + 'é a frase própria que fixa, não a tradução.' })
  );
}

function cartaoNotebook(entrada, onRemove) {
  const box = el('article', { class: 'nota-lex', id: `nb-${entrada.id}` });

  box.append(el('div', { class: 'nota-lex__head' },
    speakButton(entrada.it),
    el('span', { class: 'item__it', html: `<b>${escapeHtml(entrada.it)}</b>` }),
    entrada.pt ? el('span', { class: 'item__pt', html: entrada.pt }) : null
  ));

  const campo = el('textarea', {
    rows: '2',
    lang: 'it',
    autocapitalize: 'off',
    spellcheck: 'false',
    class: 'nota-lex__mio',
    'aria-label': `Sua frase com «${entrada.it}»`,
    placeholder: 'escreva uma frase sua com esta forma…',
  });
  campo.value = entrada.myExample ?? '';

  const estado = el('span', { class: 'nota-lex__stato', role: 'status', 'aria-live': 'polite' });

  // Grava ao sair do campo, não a cada tecla: escrever é pensar, e um
  // "salvo" piscando a cada letra atrapalha mais do que tranquiliza.
  const salvar = () => {
    store.setMyExample(entrada.id, campo.value);
    estado.textContent = campo.value.trim() ? '✓ salvo' : '';
  };
  campo.addEventListener('blur', salvar);
  campo.addEventListener('change', salvar);

  const tirar = el('button', { class: 'btn btn--ghost btn--sm', type: 'button' }, '✕ Tirar do caderno');
  tirar.addEventListener('click', () => {
    store.removeFromNotebook(entrada.id);
    onRemove();
  });

  box.append(campo, el('div', { class: 'ex__row' }, tirar, estado));
  return box;
}

export function renderNotebook() {
  const main = document.getElementById('notebook');
  main.innerHTML = '';

  const entradas = store.notebook();

  if (!entradas.length) {
    main.append(renderStage(
      { id: 'notebook', kicker: 'Léxico', title: 'Il mio quaderno', intro: '' },
      vazio()
    ));
    return;
  }

  const comFrase = entradas.filter((e) => (e.myExample ?? '').trim()).length;
  const intro = `${entradas.length} ${entradas.length === 1 ? 'forma guardada' : 'formas guardadas'}. `
    + (comFrase === entradas.length
      ? 'Todas já têm uma frase sua.'
      : `${comFrase} com frase sua, ${entradas.length - comFrase} ainda sem.`)
    + ' Escrever a sua frase é o que transforma a forma em memória.';

  const grupos = porAula(entradas).map(([aula, itens]) =>
    el('section', { class: 'nota-lex__gruppo' },
      el('h3', { class: 'block__title' }, aula === '—' ? 'Sem aula' : `Lezione ${Number(aula)}`),
      ...itens.map((e) => cartaoNotebook(e, () => renderNotebook()))
    )
  );

  main.append(renderStage(
    { id: 'notebook', kicker: 'Léxico', title: 'Il mio quaderno', intro },
    ...grupos
  ));
}

/* --- Bootstrap ------------------------------------------------------------ */

document.addEventListener('DOMContentLoaded', () => {
  initChrome();
  try {
    renderNotebook();
  } catch (err) {
    fail(err);
  }
});
