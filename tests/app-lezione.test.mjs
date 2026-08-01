/* Bootstrap completo da página de aula, com o conteúdo REAL de content/.

   Este é o teste que mais se aproxima de abrir o site: sobe o DOM, dá um
   fetch nos JSONs de verdade, dispara DOMContentLoaded e depois interage
   com os cards como um aluno faria. Se uma aula nova quebrar a renderização,
   quebra aqui — o validate.py checa o schema, isto checa que o schema vira
   página. */

import { test, describe, before } from 'node:test';
import assert from 'node:assert/strict';
import { installDOM, installStorage } from './support/dom.mjs';
import { makeSpeechSynthesis, installUtterance, IT_VOICES } from './support/speech-stub.mjs';
import { installFetch, lessonSkeleton, flush, readContent, readText } from './support/fixtures.mjs';

const synth = makeSpeechSynthesis({ voices: IT_VOICES });
installUtterance();
const dom = installDOM({ speechSynthesis: synth, search: '?l=01' });
installStorage();
installFetch();

const store = await import('../js/store.js');
await import('../js/main.js');

const aula = readContent('lezione-01.json');
let main;

before(async () => {
  lessonSkeleton(dom.document);
  dom.document.dispatchEvent({ type: 'DOMContentLoaded' });
  await flush(30);
  main = dom.document.getElementById('lesson');
});

describe('esqueleto x HTML real', () => {
  test('os ids e data-actions do teste existem em lezione.html', () => {
    // Sem isto, o esqueleto de teste poderia divergir da página real e os
    // testes continuariam verdes com o site quebrado.
    const html = readText('lezione.html');
    for (const marca of ['id="lesson"', 'id="audio-status"', 'data-action="theme"']) {
      assert.ok(html.includes(marca), `lezione.html perdeu ${marca}`);
    }
  });
});

describe('cabeçalho da aula', () => {
  test('o título da aba vira "Lezione N · titolo"', () => {
    assert.equal(dom.document.title, `Lezione ${aula.numero} · ${aula.titolo}`);
  });

  test('o título italiano é audível', () => {
    const h1 = main.querySelector('h1');
    assert.equal(h1.querySelectorAll('.speak').length, 1);
    assert.match(h1.textContent, new RegExp(aula.titolo.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  });

  test('os objetivos do header têm 🔊 em cada frase', () => {
    const ob = main.querySelector('.obiettivi');
    const esperado = [
      ...aula.header.comunicazione, ...aula.header.lessico, ...aula.header.grammatica,
    ].length;
    assert.equal(ob.querySelectorAll('.speak').length, esperado);
  });

  test('a visita fica registrada no progresso', () => {
    assert.equal(store.lessonProgress('01', 1).visited, true);
  });
});

describe('trilha de etapas', () => {
  test('lista só as etapas que a aula realmente tem', () => {
    const labels = main.querySelectorAll('.rail a').map((a) => a.textContent);
    assert.deepEqual(labels,
      ['Riscaldamento', 'Studio', 'Lessico', 'Ascolto', 'Esercizi', 'Produzione', 'Bilancio']);
  });

  test('cada link aponta para uma âncora que existe', () => {
    for (const a of main.querySelectorAll('.rail a')) {
      const id = a.getAttribute('href').slice(1);
      assert.ok(dom.document.getElementById(id), `âncora #${id} não existe`);
    }
  });

  test('o IntersectionObserver marca a etapa visível', () => {
    const obs = dom.observers.at(-1);
    // Uma entrada por etapa da trilha — derivado, para uma etapa nova não
    // obrigar a mexer num número mágico aqui.
    assert.equal(obs.observed.length, main.querySelectorAll('.rail a').length);

    obs.trigger(dom.document.getElementById('esercizi'), true);
    const marcados = main.querySelectorAll('.rail a').filter((a) => a.getAttribute('aria-current'));
    assert.equal(marcados.length, 1);
    assert.equal(marcados[0].textContent, 'Esercizi');

    // Trocar de etapa move a marca, não acumula.
    obs.trigger(dom.document.getElementById('studio'), true);
    assert.equal(main.querySelectorAll('.rail a[aria-current="true"]').length, 1);
  });

  test('entrada não-intersectante é ignorada', () => {
    const obs = dom.observers.at(-1);
    const antes = main.querySelector('.rail a[aria-current="true"]').textContent;
    obs.trigger(dom.document.getElementById('bilancio'), false);
    assert.equal(main.querySelector('.rail a[aria-current="true"]').textContent, antes);
  });
});

describe('etapas', () => {
  test('Studio renderiza uma seção por section do JSON', () => {
    const secoes = dom.document.getElementById('studio').querySelectorAll('.section');
    assert.equal(secoes.length, aula.sections.length);
    for (const s of aula.sections) {
      assert.ok(dom.document.getElementById(s.id), `seção ${s.id} não renderizou`);
    }
  });

  test('toda seção tem explicação visível — é o que torna o site autocontido', () => {
    for (const s of aula.sections) {
      const nó = dom.document.getElementById(s.id);
      assert.ok(nó.querySelector('.spiegazione'), `${s.id} sem spiegazione na tela`);
    }
  });

  test('Produzione lista as consegnas com os ids do JSON', () => {
    const lis = dom.document.getElementById('produzione').querySelectorAll('.produzione li');
    assert.equal(lis.length, aula.produzione.length);
    assert.equal(lis[0].getAttribute('id'), aula.produzione[0].id);
  });

  test('Bilancio vira checkboxes que persistem', () => {
    const inputs = dom.document.getElementById('bilancio').querySelectorAll('input');
    assert.equal(inputs.length, aula.bilancio.length);

    inputs[1].checked = true;
    inputs[1].dispatchEvent({ type: 'change' });
    assert.deepEqual(store.getBilancio('01'), [1]);

    inputs[1].checked = false;
    inputs[1].dispatchEvent({ type: 'change' });
    assert.deepEqual(store.getBilancio('01'), []);
  });

  test('a navegação entre aulas aponta para a aula anterior', () => {
    // Sem número mágico de links: a aula 1 deixa de ser a última assim que
    // uma aula 2 entra no manifest, e o teste não pode quebrar por isso.
    const hrefs = main.querySelector('.lesson-nav')
      .querySelectorAll('a')
      .map((a) => a.getAttribute('href'));
    assert.ok(hrefs.includes('lezione.html?l=00'), 'tem link para a aula anterior');
    assert.ok(hrefs.every((h) => h !== 'lezione.html?l=01'), 'não aponta para si mesma');
  });
});

describe('numeração dos exercícios', () => {
  test('os cards são numerados em sequência a partir de Ex. 01', () => {
    const nums = dom.document.getElementById('esercizi').querySelectorAll('.ex__num').map((n) => n.textContent);
    assert.equal(nums.length, aula.esercizi.length);
    assert.deepEqual(nums, aula.esercizi.map((_, i) => `Ex. ${String(i + 1).padStart(2, '0')}`));
  });

  test('o diálogo tem cabeçalho próprio e NÃO entra na numeração', () => {
    // Regressão: o diálogo era montado com o header genérico "Ex. NN",
    // perdia o gloss e ainda empurrava a numeração dos exercícios em 1.
    const card = dom.document.getElementById(aula.dialogo.id);
    assert.equal(card.querySelector('.ex__num').textContent, 'Dialogo');

    const consegna = card.querySelector('.ex__consegna');
    assert.equal(consegna.querySelectorAll('.speak').length, 1, 'o título italiano é audível');
    assert.match(consegna.textContent, /Piacere/);
    assert.match(card.querySelector('.section__gloss').innerHTML, new RegExp(aula.dialogo.gloss));
  });
});

describe('ciclo submit → check → feedback → store', () => {
  test('a resposta só libera depois de uma tentativa', () => {
    const card = dom.document.getElementById(aula.esercizi[0].id);
    const reveal = card.querySelector('.ex__actions button');
    assert.equal(reveal.disabled, true);
    assert.equal(reveal.getAttribute('title'), 'Disponível depois de uma tentativa');

    // Clicar travado não pode revelar nada.
    reveal.click();
    assert.equal(card.querySelector('.ex__body')._parts.input.value, '');
  });

  test('acertar marca o card, grava o progresso e destrava a resposta', () => {
    const ex = aula.esercizi[0];
    const card = dom.document.getElementById(ex.id);
    const body = card.querySelector('.ex__body');

    body._parts.input.value = ex.risposta;
    body._parts.send.click();

    assert.equal(card.dataset.state, 'correct');
    assert.equal(body._parts.feedback.hidden, false);
    assert.equal(store.getItem('01', ex.id).correct, 1);
    assert.equal(card.querySelector('.ex__actions button').disabled, false);
  });

  test('errar marca wrong e registra a tentativa sem acerto', () => {
    const ex = aula.esercizi[1];
    const card = dom.document.getElementById(ex.id);
    const body = card.querySelector('.ex__body');

    body._parts.input.value = 'zzz-resposta-errada';
    body._parts.send.click();

    assert.equal(card.dataset.state, 'wrong');
    assert.equal(store.getItem('01', ex.id).attempts, 1);
    assert.equal(store.getItem('01', ex.id).correct, 0);
  });

  test('depois de tentar, "Mostrar resposta" revela e se desabilita', () => {
    const ex = aula.esercizi[1];
    const card = dom.document.getElementById(ex.id);
    const reveal = card.querySelector('.ex__actions button');

    reveal.click();
    assert.equal(card.querySelector('.ex__body')._parts.input.value, ex.risposta);
    assert.equal(reveal.disabled, true, 'não faz sentido revelar duas vezes');
  });

  test('exercício com sub-itens grava cada um pelo seu id', () => {
    const pf = aula.esercizi.find((e) => e.type === 'paradigm-fill');
    const body = dom.document.getElementById(pf.id).querySelector('.ex__body');

    const cells = [...body._parts.cells.entries()];
    cells[0][1].input.value = cells[0][1].expected;
    body.querySelector('.ex__actions button').click();

    assert.equal(store.getItem('01', cells[0][0]).correct, 1, `${cells[0][0]} deveria estar correto`);
    assert.equal(store.getItem('01', cells[1][0]).correct, 0);
    assert.equal(store.getItem('01', pf.id), null, 'o id do exercício não é rastreado; as células é que são');
  });

  test('acerto parcial no diálogo marca o card como partial', () => {
    const d = aula.dialogo;
    const detail = d.passate.find((p) => p.focus === 'detail');
    const card = dom.document.getElementById(d.id);
    const body = card.querySelector('.ex__body');

    for (const [id, { input }] of body._parts.inputs) {
      const q = detail.domande.find((x) => x.id === id);
      input.value = q.risposta;
    }
    body.querySelector('.domande').parentNode.querySelector('.ex__actions button').click();

    assert.equal(card.dataset.state, 'correct');
    for (const q of detail.domande) {
      assert.equal(store.getItem('01', q.id).correct, 1, `${q.id}`);
    }
  });
});

describe('tema', () => {
  test('o botão alterna claro/escuro e persiste a escolha', () => {
    const btn = dom.document.querySelector('[data-action="theme"]');
    assert.equal(btn.textContent, '🌙');

    btn.click();
    assert.equal(dom.document.documentElement.dataset.theme, 'dark');
    assert.equal(store.settings().theme, 'dark');
    assert.equal(btn.textContent, '☀️');
    assert.equal(btn.getAttribute('aria-label'), 'Tema claro');

    btn.click();
    assert.equal(dom.document.documentElement.dataset.theme, 'light');
    assert.equal(store.settings().theme, 'light');
    assert.equal(btn.textContent, '🌙');
  });
});

describe('banner de áudio', () => {
  test('com voz italiana disponível, nenhum banner aparece', () => {
    assert.equal(dom.document.getElementById('audio-status').innerHTML, '');
  });
});
