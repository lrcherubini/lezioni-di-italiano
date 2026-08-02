/* Home: card «Continuar», blocos dobráveis, barra de progresso e os botões
   de exportar/importar.

   A asserção mais importante deste arquivo é a contagem de requisições: a
   home tem que ler SÓ o manifest. Antes ela baixava cada lezione-NN.json
   para contar itens, o que com 40 aulas seria ~1,6 MB por visita. */

import { test, describe, before } from 'node:test';
import assert from 'node:assert/strict';
import { installDOM, installStorage } from './support/dom.mjs';
import { makeSpeechSynthesis, installUtterance, IT_VOICES } from './support/speech-stub.mjs';
import { installFetch, homeSkeleton, flush, readContent, readText } from './support/fixtures.mjs';

const synth = makeSpeechSynthesis({ voices: IT_VOICES });
installUtterance();
const dom = installDOM({ speechSynthesis: synth });
installStorage();
const requisicoes = installFetch();

const store = await import('../js/store.js');
const { renderHome, countItems, initChrome } = await import('../js/app.js');
await import('../js/main.js');   // registra o DOMContentLoaded

const manifest = readContent('manifest.json');
let grid;

before(async () => {
  homeSkeleton(dom.document);
  dom.document.dispatchEvent({ type: 'DOMContentLoaded' });
  await flush(30);
  grid = dom.document.getElementById('lesson-grid');
});

describe('custo de carregamento', () => {
  test('a home faz UMA requisição — só o manifest', () => {
    // O invariante de escala do projeto. Se alguém voltar a buscar as
    // aulas aqui, com 40 delas a home fica inutilizável no celular.
    assert.deepEqual(requisicoes, ['content/manifest.json']);
  });

  test('o total de itens vem do conteggio do manifest', () => {
    for (const l of manifest.lezioni) {
      assert.equal(typeof l.conteggio, 'number',
        `manifest sem conteggio em ${l.id} — rode python tools/validate.py --fix`);
    }
  });
});

describe('esqueleto x HTML real', () => {
  test('os ids e data-actions do teste existem em index.html', () => {
    const html = readText('index.html');
    for (const marca of ['id="lesson-grid"', 'id="home-topo"', 'id="audio-status"',
      'data-action="theme"', 'data-action="export"', 'data-action="import"',
      'id="dati"', 'id="dati-conferma"', 'data-action="reset"',
      'data-action="reset-conferma"', 'data-action="reset-cancela"']) {
      assert.ok(html.includes(marca), `index.html perdeu ${marca}`);
    }
  });

  test('o painel «Seus dados» diz o que fica salvo, e onde', () => {
    // A promessa de privacidade do projeto é escrita, não implícita: se
    // alguém apagar o texto, some a única explicação que o aluno tem.
    const html = readText('index.html');
    assert.match(html, /localStorage/);
    assert.match(html, /não existe servidor/i);
    assert.match(html, /gravações de voz[\s\S]{0,120}não são salvas/i);
  });

  test('a confirmação de apagar nasce escondida', () => {
    const html = readText('index.html');
    assert.match(html, /id="dati-conferma"[^>]*hidden/,
      'sem hidden, a caixa vermelha aparece de saída e assusta sem motivo');
  });
});

describe('card «Continuar»', () => {
  test('sem histórico, aponta para a primeira aula', () => {
    const r = dom.document.getElementById('home-topo').querySelector('.resume');
    assert.ok(r, 'o card de retomada não renderizou');
    assert.equal(r.getAttribute('href'), `lezione.html?l=${manifest.lezioni[0].id}`);
    assert.match(r.textContent, /Continuar/);
  });

  test('depois de visitar uma aula, aponta para ela', async () => {
    store.markVisited('01');
    await renderHome();

    const r = dom.document.getElementById('home-topo').querySelector('.resume');
    assert.equal(r.getAttribute('href'), 'lezione.html?l=01');
    assert.match(r.textContent, /Lezione 1/);
  });
});

describe('chamada do Ripasso', () => {
  test('não aparece quando não há nada vencido', () => {
    assert.equal(dom.document.getElementById('home-topo').querySelectorAll('.ripasso-call').length, 0,
      'um card marcando zero seria ruído toda semana');
  });

  test('aparece com a contagem quando há item vencido', async () => {
    store.record('01', 'l01-e01', { correct: false, score: 0 });
    const raw = JSON.parse(store.exportJSON());
    raw.lessons['01'].items['l01-e01'].dueAt = new Date(Date.now() - 1000).toISOString();
    store.importJSON(JSON.stringify(raw));

    await renderHome();

    const call = dom.document.getElementById('home-topo').querySelector('.ripasso-call');
    assert.ok(call, 'a chamada do Ripasso não renderizou');
    assert.equal(call.getAttribute('href'), 'ripasso.html');
    assert.equal(call.querySelector('.ripasso-call__n').textContent, '1');
    assert.match(call.textContent, /item para revisar/);
  });

  test('pluraliza a partir de dois', async () => {
    store.record('01', 'l01-e02', { correct: false, score: 0 });
    const raw = JSON.parse(store.exportJSON());
    for (const it of Object.values(raw.lessons['01'].items)) {
      it.dueAt = new Date(Date.now() - 1000).toISOString();
    }
    store.importJSON(JSON.stringify(raw));

    await renderHome();

    const call = dom.document.getElementById('home-topo').querySelector('.ripasso-call');
    assert.equal(call.querySelector('.ripasso-call__n').textContent, '2');
    assert.match(call.textContent, /itens para revisar/);

    store.reset();
    await renderHome();
  });
});

describe('blocos de aulas', () => {
  test('abaixo de 10 aulas há um bloco só, e ele nasce aberto', () => {
    const blocos = grid.querySelectorAll('.bloco');
    assert.ok(manifest.lezioni.length <= 10, 'premissa deste teste');
    assert.equal(blocos.length, 1);
    assert.equal(blocos[0].getAttribute('data-inicio'), '0');
    assert.equal(blocos[0].hasAttribute('open'), true, 'a home não pode nascer vazia');
    assert.match(blocos[0].querySelector('.bloco__titolo').textContent, /Aulas 0–9/);
  });

  test('o resumo do bloco conta as aulas completas', () => {
    // Total derivado do manifest: uma aula nova não pode quebrar este teste.
    const total = manifest.lezioni.length;
    assert.match(grid.querySelector('.bloco__conta').textContent, new RegExp(`0/${total} completas`));
  });

  test('um card por aula do manifest, na ordem', () => {
    const cards = grid.querySelectorAll('.lesson-card');
    assert.equal(cards.length, manifest.lezioni.length);
    assert.deepEqual(
      grid.querySelectorAll('.lesson-card__num').map((n) => n.textContent),
      manifest.lezioni.map((l) => `Lezione ${l.numero}`)
    );
  });

  test('o título é italiano: tem 🔊 e link para a aula', () => {
    const h2 = grid.querySelectorAll('.lesson-card__title')[0];
    assert.equal(h2.querySelectorAll('.speak').length, 1);
    assert.equal(h2.querySelector('a').getAttribute('href'), `lezione.html?l=${manifest.lezioni[0].id}`);
  });

  test('chips e temas vêm do manifest', () => {
    const card = grid.querySelectorAll('.lesson-card')[0];
    assert.equal(card.querySelectorAll('.chip').length, manifest.lezioni[0].categorie.length);
    assert.equal(card.querySelectorAll('.lesson-card__temi li').length, manifest.lezioni[0].temi.length);
  });
});

describe('barra de progresso', () => {
  test('começa em 0% com o total vindo do manifest', () => {
    const label = grid.querySelectorAll('.progress__label')[1].textContent;
    const [feito, total] = label.split('/').map(Number);
    assert.equal(feito, 0);
    assert.equal(total, manifest.lezioni[1].conteggio);
    assert.equal(grid.querySelectorAll('.progress__bar')[1].getAttribute('style'), 'width:0%');
  });

  test('o conteggio do manifest bate com a conta real da aula', () => {
    // countItems() em app.js e count_items() em validate.py são a mesma
    // conta escrita duas vezes. Este teste é o que impede as duas de
    // divergirem em silêncio.
    for (const l of manifest.lezioni) {
      assert.equal(countItems(readContent(l.file)), l.conteggio, `aula ${l.id}`);
    }
  });

  test('acertar itens move a barra', async () => {
    const aula = readContent('lezione-01.json');
    store.record('01', aula.esercizi[0].id, { correct: true, score: 1 });
    await renderHome();

    const label = dom.document.getElementById('lesson-grid')
      .querySelectorAll('.progress__label')[1].textContent;
    assert.equal(Number(label.split('/')[0]), 1);
  });
});

describe('exportar e importar progresso', () => {
  test('exportar dispara o download do JSON', () => {
    let baixou = false;
    globalThis.Blob = class { constructor(p) { this.p = p; } };
    globalThis.URL = { createObjectURL: () => { baixou = true; return 'blob:x'; }, revokeObjectURL() {} };

    dom.document.querySelector('[data-action="export"]').click();
    assert.equal(baixou, true);
  });

  test('importar um export válido recarrega a página', async () => {
    const dump = store.exportJSON();
    let escolhido = null;

    const orig = dom.document.createElement.bind(dom.document);
    dom.document.createElement = (tag) => {
      const n = orig(tag);
      if (tag === 'input') {
        n.click = () => {
          n.files = [{ text: async () => dump }];
          n.dispatchEvent({ type: 'change' });
        };
        escolhido = n;
      }
      return n;
    };

    dom.document.querySelector('[data-action="import"]').click();
    await flush(10);
    dom.document.createElement = orig;

    assert.ok(escolhido, 'o botão deveria criar um <input type=file>');
    assert.equal(escolhido.getAttribute('accept'), 'application/json,.json');
    assert.equal(dom.location.reloaded, 1);
  });

  test('importar arquivo inválido avisa em vez de quebrar', async () => {
    const orig = dom.document.createElement.bind(dom.document);
    dom.document.createElement = (tag) => {
      const n = orig(tag);
      if (tag === 'input') {
        n.click = () => {
          n.files = [{ text: async () => '{"nada":1}' }];
          n.dispatchEvent({ type: 'change' });
        };
      }
      return n;
    };

    dom.document.querySelector('[data-action="import"]').click();
    await flush(10);
    dom.document.createElement = orig;

    assert.equal(dom.alerts.length, 1);
    assert.match(dom.alerts[0], /Não foi possível importar/);
    assert.equal(dom.location.reloaded, 1, 'não recarrega quando falha');
  });

  test('cancelar a escolha do arquivo não faz nada', async () => {
    const antes = dom.alerts.length;
    const orig = dom.document.createElement.bind(dom.document);
    dom.document.createElement = (tag) => {
      const n = orig(tag);
      if (tag === 'input') n.click = () => n.dispatchEvent({ type: 'change' });
      return n;
    };

    dom.document.querySelector('[data-action="import"]').click();
    await flush(10);
    dom.document.createElement = orig;

    assert.equal(dom.alerts.length, antes);
  });

  test('os botões repetidos no painel também estão ligados', () => {
    // O painel «Seus dados» repete exportar/importar por extenso. Com
    // `querySelector` (singular) só o da toolbar ficaria vivo, e o do painel
    // seria um botão morto — sem erro nenhum que denunciasse.
    const exports = dom.document.querySelectorAll('[data-action="export"]');
    assert.ok(exports.length >= 2, 'o teste perdeu o sentido se não houver repetição');

    let baixou = 0;
    globalThis.Blob = class { constructor(p) { this.p = p; } };
    globalThis.URL = { createObjectURL: () => { baixou += 1; return 'blob:x'; }, revokeObjectURL() {} };

    for (const b of exports) b.dispatchEvent({ type: 'click' });
    assert.equal(baixou, exports.length, 'algum botão de exportar ficou sem listener');
  });
});

/* --- Apagar -------------------------------------------------------------

   Fica por último de propósito: `store.reset()` zera o progresso, e os
   testes acima dependem dele. */

describe('apagar os dados', () => {
  const $ = (sel) => dom.document.querySelector(sel);

  test('o primeiro clique não apaga nada — só abre a confirmação', () => {
    store.record('01', 'x1', { correct: true, score: 1 });
    const antes = dom.location.reloaded;

    $('[data-action="reset"]').dispatchEvent({ type: 'click' });

    assert.equal($('#dati-conferma').hidden, false, 'a confirmação tem que aparecer');
    assert.equal($('[data-action="reset"]').hidden, true, 'o gatilho sai de cena');
    assert.equal(dom.location.reloaded, antes, 'não recarregou');
    assert.ok(store.getItem('01', 'x1'), 'o progresso continua lá');
  });

  test('cancelar fecha a caixa e devolve o botão, sem tocar em nada', () => {
    $('[data-action="reset-cancela"]').dispatchEvent({ type: 'click' });

    assert.equal($('#dati-conferma').hidden, true);
    assert.equal($('[data-action="reset"]').hidden, false);
    assert.ok(store.getItem('01', 'x1'), 'cancelar não pode apagar');
  });

  test('a caixa oferece baixar uma cópia ANTES de apagar', () => {
    // É o último momento em que ainda dá tempo, e não há backup em lugar
    // nenhum: não existe servidor de onde restaurar.
    const dentro = $('#dati-conferma').querySelectorAll('[data-action="export"]');
    assert.equal(dentro.length, 1, 'sem saída de emergência dentro da confirmação');
  });

  test('confirmar apaga tudo e recarrega', () => {
    store.addToNotebook({ id: 'n1', it: 'ciao', pt: 'oi' });
    const antes = dom.location.reloaded;

    $('[data-action="reset"]').dispatchEvent({ type: 'click' });
    $('[data-action="reset-conferma"]').dispatchEvent({ type: 'click' });

    assert.equal(store.getItem('01', 'x1'), null, 'o progresso tinha que sumir');
    assert.deepEqual(store.notebook(), [], 'o caderno também some — a promessa é «tudo»');
    assert.equal(store.dueCount(), 0, 'a agenda de revisão junto');
    assert.equal(dom.location.reloaded, antes + 1);
  });

  test('sem os elementos na página, nada quebra', () => {
    // O Ripasso e o Caderno chamam o mesmo initChrome e NÃO têm o painel.
    assert.doesNotThrow(() => initChrome());
  });
});
