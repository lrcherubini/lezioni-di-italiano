/* A página das frases de aula, montada a partir do content/frasi.json REAL.

   Como os testes de aula, e pelo mesmo motivo: o validate.py checa que o
   schema está certo, isto checa que o schema vira página. */

import { test, describe, before } from 'node:test';
import assert from 'node:assert/strict';
import { installDOM, installStorage } from './support/dom.mjs';
import { makeSpeechSynthesis, installUtterance, IT_VOICES } from './support/speech-stub.mjs';
import { installFetch, readContent, readText, flush } from './support/fixtures.mjs';

const synth = makeSpeechSynthesis({ voices: IT_VOICES });
installUtterance();
const dom = installDOM({ speechSynthesis: synth });
installStorage();
installFetch();

const store = await import('../js/store.js');
const { renderFrasi } = await import('../js/frasi.js');

const dati = readContent('frasi.json');
let main;

before(async () => {
  const div = dom.document.createElement('div');
  div.setAttribute('id', 'frasi');
  dom.document.body.append(div);
  main = dom.document.getElementById('frasi');
  await renderFrasi();
  await flush(10);
});

describe('frasi — a página', () => {
  test('um bloco por grupo, com o id do grupo como âncora', () => {
    const stages = main.querySelectorAll('.stage');
    assert.equal(stages.length, dati.gruppi.length);
    assert.deepEqual(stages.map((s) => s.id), dati.gruppi.map((g) => g.id));
  });

  test('a divisão «tu dici» × «l\'insegnante dice» está na página', () => {
    // É o conteúdo inteiro desta página: a primeira metade se produz, a
    // segunda só se reconhece. Perder a divisão é perder o motivo dela.
    assert.equal(dati.gruppi.length, 2);
    assert.ok(main.querySelector('#tu-dici'), 'falta o grupo do que o aluno diz');
    assert.ok(main.querySelector('#insegnante-dice'), 'falta o grupo do que ele só ouve');
  });

  test('todo grupo explica o porquê antes de listar', () => {
    for (const g of dati.gruppi) {
      const stage = main.querySelector(`#${g.id}`);
      assert.ok(stage.querySelectorAll('.spiegazione').length >= 1,
        `grupo ${g.id} lista frases sem dizer por que estão separadas`);
    }
  });

  test('toda funzione do arquivo renderiza e resolve seus chunks', () => {
    for (const g of dati.gruppi) {
      for (const f of g.funzioni) {
        const card = dom.document.getElementById(f.id);
        assert.ok(card, `funzione ${f.id} não renderizou`);
        assert.equal(card.querySelectorAll('.funzione__riga').length, f.chunks.length);
      }
    }
  });

  test('toda linha italiana tem 🔊 — é a metade receptiva do conteúdo', () => {
    // Sem áudio, «L'insegnante dice» vira uma lista para ler, que é
    // exatamente o que ela não é: são frases que chegam faladas.
    const grupo = main.querySelector('#insegnante-dice');
    const righe = grupo.querySelectorAll('.funzione__riga');
    for (const r of righe) {
      assert.ok(r.querySelector('.speak'), `linha sem botão de áudio: ${r.textContent}`);
    }
  });

  test('cada linha oferece ＋ caderno, visível de saída', () => {
    const bts = main.querySelectorAll('.funzione__caderno');
    const esperado = dati.gruppi
      .flatMap((g) => g.funzioni)
      .reduce((n, f) => n + f.chunks.length, 0);
    assert.equal(bts.length, esperado);
    assert.equal(bts[0].hasAttribute('hidden'), false);
  });

  test('guardar daqui grava sem aula de origem', () => {
    // Estas frases não pertencem a aula nenhuma, e o caderno agrupa por
    // aula: elas caem em «Sem aula», que é o que de fato são.
    const antes = store.notebook().length;
    main.querySelector('.funzione__caderno').click();
    assert.equal(store.notebook().length, antes + 1);
    assert.equal(store.notebook().at(-1).lesson, null);
  });
});

describe('frasi — o contrato com o conteúdo', () => {
  test('id reusado carrega o texto idêntico ao da aula de origem', () => {
    // O preço de reusar `l00-c03` em vez de criar um id novo é o texto
    // duplicado; o que paga esse preço é o caderno não guardar a mesma
    // frase duas vezes. O validate.py reprova divergência — aqui só
    // confirmamos que o caso existe de fato no conteúdo.
    const reusados = dati.chunks.filter((c) => !c.id.startsWith('fr-'));
    assert.ok(reusados.length > 0, 'nenhum id reusado — a checagem não estaria exercitada');

    const aula0 = readContent('lezione-00.json');
    const orig = aula0.chunks.find((c) => c.id === 'l00-c03');
    const aqui = dati.chunks.find((c) => c.id === 'l00-c03');
    assert.equal(aqui.it, orig.it);
    assert.equal(aqui.pt, orig.pt);
  });

  test('não entra no léxico: o i+1 dos diálogos não pode se autoautorizar', () => {
    const lessico = readContent('lessico.json').forme;
    // «attimo» só existe aqui; se aparecesse no léxico, um diálogo poderia
    // usá-lo sem aviso de escopo.
    assert.ok(dati.chunks.some((c) => /attimo/i.test(c.it)));
    assert.equal(Object.hasOwn(lessico, 'attimo'), false,
      'frasi.json vazou para o léxico cumulativo');
  });

  test('o esqueleto do teste bate com frasi.html', () => {
    const html = readText('frasi.html');
    assert.match(html, /id="frasi"/);
    assert.match(html, /id="audio-status"/);
    assert.match(html, /js\/frasi\.js/);
  });

  test('as quatro outras páginas linkam para cá', () => {
    // O ponto da página é estar a um toque de dentro de qualquer aula.
    for (const pagina of ['index.html', 'lezione.html', 'ripasso.html', 'notebook.html']) {
      assert.match(readText(pagina), /href="frasi\.html"/, `${pagina} não linka as Frasi`);
    }
  });
});
