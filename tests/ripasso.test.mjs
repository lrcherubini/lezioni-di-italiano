/* Ripasso — revisão espaçada atravessando aulas.

   O ponto delicado é o mapeamento de id: o progresso rastreia células de
   paradigma e perguntas de diálogo, que têm id próprio mas não se
   renderizam sozinhas. Quem monta é o exercício que as contém. */

import { test, describe, before, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { installDOM, installStorage } from './support/dom.mjs';
import { makeSpeechSynthesis, installUtterance, IT_VOICES } from './support/speech-stub.mjs';
import { installFetch, flush, readContent, readText } from './support/fixtures.mjs';

const synth = makeSpeechSynthesis({ voices: IT_VOICES });
installUtterance();
const dom = installDOM({ speechSynthesis: synth });
installStorage();
const requisicoes = installFetch();

const store = await import('../js/store.js');
const { indexById, collectDue, renderRipasso } = await import('../js/ripasso.js');

const aula01 = readContent('lezione-01.json');
const aula00 = readContent('lezione-00.json');

/** Marca um item como vencido sem esperar um dia passar. */
function vencer(lessonId, itemId, errRate = 1) {
  store.record(lessonId, itemId, { correct: errRate < 1, score: errRate < 1 ? 1 : 0 });
  const raw = JSON.parse(store.exportJSON());
  raw.lessons[lessonId].items[itemId].dueAt = new Date(Date.now() - 1000).toISOString();
  store.importJSON(JSON.stringify(raw));
}

before(() => {
  const mk = (tag, attrs) => {
    const n = dom.document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v);
    return n;
  };
  dom.document.body.append(
    mk('div', { id: 'audio-status' }),
    mk('button', { 'data-action': 'theme' }),
    mk('div', { id: 'ripasso' })
  );
});

beforeEach(() => {
  installStorage();
  store.reset();
});

describe('esqueleto x HTML real', () => {
  test('ripasso.html tem os ids que o módulo procura', () => {
    const html = readText('ripasso.html');
    for (const marca of ['id="ripasso"', 'id="audio-status"', 'data-action="theme"',
      'src="js/ripasso.js"']) {
      assert.ok(html.includes(marca), `ripasso.html perdeu ${marca}`);
    }
  });
});

describe('indexById', () => {
  const idx = indexById(aula01);

  test('mapeia cada exercício pelo próprio id', () => {
    for (const ex of aula01.esercizi) {
      assert.equal(idx.get(ex.id)?.id, ex.id, ex.id);
    }
  });

  test('célula de paradigma cai no exercício que a contém', () => {
    // É o caso que motivou a função: `l01-e13-r1-c1` tem progresso próprio,
    // mas o card é a tabela inteira.
    const pf = aula01.esercizi.find((e) => e.type === 'paradigm-fill');
    const row = pf.righe[0];
    const cellId = `${row.id}-c${row.nascondi[0]}`;

    assert.notEqual(cellId, pf.id, 'o id da célula não é o do exercício');
    assert.equal(idx.get(cellId)?.id, pf.id);
  });

  test('pergunta de diálogo cai no diálogo, já com type', () => {
    const detail = aula01.dialogo.passate.find((p) => p.focus === 'detail');
    for (const q of detail.domande) {
      const item = idx.get(q.id);
      assert.equal(item?.id, aula01.dialogo.id, q.id);
      assert.equal(item.type, 'dialogue', 'sem type o registry não acha o módulo');
    }
  });

  test('o próprio id do diálogo também mapeia', () => {
    assert.equal(idx.get(aula01.dialogo.id)?.type, 'dialogue');
  });

  test('id desconhecido devolve undefined, sem lançar', () => {
    assert.equal(idx.get('l99-e99'), undefined);
  });

  test('aula sem diálogo nem paradigma não quebra', () => {
    assert.doesNotThrow(() => indexById({ esercizi: [{ id: 'x', type: 'gap-audio' }] }));
    assert.doesNotThrow(() => indexById({}));
  });
});

describe('collectDue', () => {
  test('sem nada vencido, devolve lista vazia e não busca aula nenhuma', async () => {
    const antes = requisicoes.length;
    assert.deepEqual(await collectDue(), []);
    assert.equal(requisicoes.length, antes, 'não deveria ter feito fetch');
  });

  test('carrega SÓ as aulas que têm item vencido', async () => {
    // Com 40 aulas, buscar todas para montar uma revisão de 10 itens
    // seria o mesmo erro que a home tinha.
    vencer('01', aula01.esercizi[0].id);
    const antes = requisicoes.length;

    await collectDue();

    const buscadas = requisicoes.slice(antes);
    assert.deepEqual(buscadas, ['content/lezione-01.json']);
  });

  test('atravessa aulas diferentes', async () => {
    vencer('00', aula00.esercizi[0].id);
    vencer('01', aula01.esercizi[0].id);

    const lista = await collectDue();
    assert.deepEqual(new Set(lista.map((x) => x.lessonId)), new Set(['00', '01']));
  });

  test('os mais errados vêm primeiro', async () => {
    vencer('01', aula01.esercizi[1].id, 0);   // acertou
    vencer('01', aula01.esercizi[0].id, 1);   // errou

    const lista = await collectDue();
    assert.equal(lista[0].item.id, aula01.esercizi[0].id);
    assert.equal(lista[0].errRate, 1);
  });

  test('duas células do mesmo paradigma viram UM card', async () => {
    const pf = aula01.esercizi.find((e) => e.type === 'paradigm-fill');
    const row = pf.righe[0];
    for (const i of row.nascondi) vencer('01', `${row.id}-c${i}`);

    const lista = await collectDue();
    assert.equal(lista.length, 1, 'deduplicado por exercício');
    assert.equal(lista[0].item.id, pf.id);
  });

  test('respeita o teto de itens por sessão', async () => {
    for (const ex of aula01.esercizi) vencer('01', ex.id);
    assert.ok(store.dueCount() > 3);
    assert.equal((await collectDue(3)).length, 3);
  });

  test('item de aula que sumiu é ignorado, sem derrubar o resto', async () => {
    vencer('42', 'l42-e01');
    vencer('01', aula01.esercizi[0].id);

    const lista = await collectDue();
    assert.equal(lista.length, 1);
    assert.equal(lista[0].lessonId, '01');
  });

  test('id órfão dentro de uma aula existente é ignorado', async () => {
    vencer('01', 'l01-e-que-nao-existe-mais');
    assert.deepEqual(await collectDue(), []);
  });
});

describe('renderRipasso', () => {
  test('estado vazio explica quando a revisão aparece', async () => {
    await renderRipasso();
    const main = dom.document.getElementById('ripasso');

    assert.ok(main.querySelector('.ripasso-vuoto'));
    assert.match(main.textContent, /Nada vencido/);
    assert.match(main.innerHTML, /index\.html/, 'oferece um próximo passo');
    assert.equal(main.querySelectorAll('.ex').length, 0);
  });

  test('monta os cards e diz de onde cada um veio', async () => {
    vencer('01', aula01.esercizi[0].id);
    vencer('00', aula00.esercizi[0].id);
    await renderRipasso();

    const main = dom.document.getElementById('ripasso');
    assert.equal(main.querySelectorAll('.ex').length, 2);

    const fontes = main.querySelectorAll('.ripasso-fonte a').map((a) => a.getAttribute('href'));
    assert.ok(fontes.some((h) => h.startsWith('lezione.html?l=01#')));
    assert.ok(fontes.some((h) => h.startsWith('lezione.html?l=00#')));
  });

  test('a numeração recomeça em Ex. 01 a cada sessão', async () => {
    vencer('01', aula01.esercizi[0].id);
    await renderRipasso();
    await renderRipasso();   // segunda montagem não pode continuar de onde parou

    const nums = dom.document.getElementById('ripasso')
      .querySelectorAll('.ex__num').map((n) => n.textContent);
    assert.deepEqual(nums, ['Ex. 01']);
  });

  test('o cabeçalho diz quantos ficaram para a próxima sessão', async () => {
    for (const ex of aula01.esercizi) vencer('01', ex.id);
    await renderRipasso();

    const intro = dom.document.getElementById('ripasso').querySelector('.stage__intro').textContent;
    assert.match(intro, /itens vencidos/);
    assert.match(intro, /ficam para a próxima/);
  });

  test('responder na revisão grava o progresso normalmente', async () => {
    const ex = aula01.esercizi[0];
    vencer('01', ex.id);
    const antes = store.getItem('01', ex.id).attempts;

    await renderRipasso();

    const body = dom.document.getElementById(ex.id).querySelector('.ex__body');
    body._parts.input.value = ex.risposta;
    body._parts.send.click();

    assert.equal(store.getItem('01', ex.id).attempts, antes + 1);
    assert.equal(store.getItem('01', ex.id).correct, 1);
  });

  test('o diálogo vem com cabeçalho próprio, não «Ex. NN»', async () => {
    const detail = aula01.dialogo.passate.find((p) => p.focus === 'detail');
    vencer('01', detail.domande[0].id);
    await renderRipasso();

    const card = dom.document.getElementById(aula01.dialogo.id);
    assert.ok(card, 'a pergunta de diálogo deveria montar o diálogo');
    assert.equal(card.querySelector('.ex__num').textContent, 'Dialogo');
    assert.match(card.querySelector('.ex__consegna').textContent, /Piacere/);
  });
});
