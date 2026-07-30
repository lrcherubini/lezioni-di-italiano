/* Progresso. O contrato mais delicado do projeto: ids de item são a chave
   do histórico, e o site tem que continuar utilizável mesmo com o
   localStorage indisponível. */

import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { installDOM, installStorage } from './support/dom.mjs';

const KEY = 'ldi:v1';

installDOM();
installStorage();

// Import dinâmico: precisa vir depois dos globais existirem.
const store = await import('../js/store.js');

beforeEach(() => {
  installStorage();
  store.reset();
});

describe('estado inicial e persistência', () => {
  test('começa vazio e grava no localStorage', () => {
    assert.deepEqual(JSON.parse(store.exportJSON()).lessons, {});
    store.markVisited('01');
    const raw = JSON.parse(localStorage.getItem(KEY));
    assert.equal(raw.version, 1);
    assert.ok(raw.lessons['01'].visitedAt);
  });

  test('settings tem os defaults documentados', () => {
    const s = store.settings();
    assert.equal(s.rate, 1.0);
    assert.equal(s.glossVisible, true);
    assert.equal(s.theme, null);
  });

  test('setSetting persiste', () => {
    store.setSetting('theme', 'dark');
    assert.equal(store.settings().theme, 'dark');
    assert.equal(JSON.parse(localStorage.getItem(KEY)).settings.theme, 'dark');
  });
});

describe('record e SRS', () => {
  test('primeira tentativa correta agenda revisão no futuro', () => {
    const it = store.record('01', 'l01-e01', { correct: true, score: 1 });
    assert.equal(it.attempts, 1);
    assert.equal(it.correct, 1);
    assert.equal(it.interval, 1);
    assert.ok(new Date(it.dueAt).getTime() > Date.now());
  });

  test('acertos seguidos alargam o intervalo', () => {
    store.record('01', 'x', { correct: true, score: 1 });
    const segundo = store.record('01', 'x', { correct: true, score: 1 });
    assert.ok(segundo.interval > 1, `intervalo não cresceu: ${segundo.interval}`);
    assert.ok(segundo.ease > 2.5, 'ease deveria subir com score >= 0.95');
  });

  test('erro derruba o ease e volta o intervalo para 1', () => {
    store.record('01', 'y', { correct: true, score: 1 });
    store.record('01', 'y', { correct: true, score: 1 });
    const erro = store.record('01', 'y', { correct: false, score: 0 });
    assert.equal(erro.interval, 1);
    assert.ok(erro.ease < 2.6);
    assert.equal(erro.attempts, 3);
    assert.equal(erro.correct, 2);
  });

  test('ease tem piso 1.3', () => {
    for (let i = 0; i < 20; i++) store.record('01', 'z', { correct: false, score: 0 });
    assert.equal(store.getItem('01', 'z').ease, 1.3);
  });

  test('ease tem teto 3.0', () => {
    for (let i = 0; i < 20; i++) store.record('01', 'w', { correct: true, score: 1 });
    assert.equal(store.getItem('01', 'w').ease, 3.0);
  });

  test('o intervalo tem teto — sem ele o Date estoura e record() lança', () => {
    // Regressão: o intervalo crescia por fator ~3 a cada acerto. Por volta
    // do 23º acerto seguido passava do range de Date, toISOString() lançava
    // RangeError e derrubava o submit inteiro do exercício.
    let it;
    for (let i = 0; i < 40; i++) {
      it = store.record('01', 'maratona', { correct: true, score: 1 });
    }
    assert.equal(it.interval, 365);
    assert.ok(Number.isFinite(new Date(it.dueAt).getTime()), 'dueAt precisa ser data válida');
  });

  test('score 0.85 (acerto com nota) não sobe o ease mas alarga o intervalo', () => {
    // Acertou com ressalva de acento: não é motivo para espaçar mais
    // agressivamente, mas também não é erro.
    const r = store.record('01', 'acc', { correct: true, score: 0.85 });
    assert.equal(r.ease, 2.5);
    assert.equal(r.interval, 1);
  });

  test('sem score, cai no correct booleano', () => {
    assert.equal(store.record('01', 'nb', { correct: true }).interval, 1);
    assert.equal(store.record('01', 'nb2', { correct: false }).interval, 1);
  });

  test('getItem devolve null para item nunca tentado', () => {
    assert.equal(store.getItem('01', 'inexistente'), null);
  });
});

describe('lessonProgress', () => {
  test('conta só itens já acertados ao menos uma vez', () => {
    store.record('01', 'a', { correct: true, score: 1 });
    store.record('01', 'b', { correct: false, score: 0 });

    const p = store.lessonProgress('01', 4);
    assert.equal(p.attempted, 2);
    assert.equal(p.done, 1);
    assert.equal(p.total, 4);
    assert.equal(p.pct, 25);
    assert.equal(p.visited, false);
  });

  test('total zero não divide por zero', () => {
    assert.equal(store.lessonProgress('99', 0).pct, 0);
  });

  test('markVisited marca a aula', () => {
    store.markVisited('01');
    assert.equal(store.lessonProgress('01', 1).visited, true);
  });
});

describe('dueItems', () => {
  test('devolve vencidos, mais errados primeiro', () => {
    store.record('01', 'muito-errado', { correct: false, score: 0 });
    store.record('01', 'meio-errado', { correct: true, score: 1 });
    store.record('01', 'meio-errado', { correct: false, score: 0 });

    // Força o vencimento sem esperar um dia.
    const raw = JSON.parse(store.exportJSON());
    for (const it of Object.values(raw.lessons['01'].items)) {
      it.dueAt = new Date(Date.now() - 1000).toISOString();
    }
    store.importJSON(JSON.stringify(raw));

    const due = store.dueItems();
    assert.equal(due.length, 2);
    assert.equal(due[0].itemId, 'muito-errado');
    assert.equal(due[0].errRate, 1);
    assert.ok(due[1].errRate < 1);
  });

  test('itens não vencidos ficam de fora', () => {
    store.record('01', 'novo', { correct: true, score: 1 });
    assert.equal(store.dueItems().length, 0);
  });

  test('respeita o limite', () => {
    const raw = JSON.parse(store.exportJSON());
    raw.lessons['01'] = { items: {} };
    for (let i = 0; i < 30; i++) {
      raw.lessons['01'].items[`i${i}`] = {
        attempts: 1, correct: 0, dueAt: new Date(Date.now() - 1000).toISOString(),
      };
    }
    store.importJSON(JSON.stringify(raw));
    assert.equal(store.dueItems().length, 20);
    assert.equal(store.dueItems(3).length, 3);
  });
});

describe('bilancio', () => {
  test('marca, desmarca e não duplica', () => {
    store.setBilancio('01', 0, true);
    store.setBilancio('01', 0, true);
    store.setBilancio('01', 2, true);
    assert.deepEqual(store.getBilancio('01'), [0, 2]);

    store.setBilancio('01', 0, false);
    assert.deepEqual(store.getBilancio('01'), [2]);
  });

  test('aula sem bilancio devolve lista vazia', () => {
    assert.deepEqual(store.getBilancio('42'), []);
  });
});

describe('notebook', () => {
  test('adiciona uma vez só, por id', () => {
    assert.equal(store.addToNotebook({ id: 'c1', it: 'Ciao' }), true);
    assert.equal(store.addToNotebook({ id: 'c1', it: 'Ciao' }), false);
    assert.equal(store.notebook().length, 1);
    assert.equal(store.inNotebook('c1'), true);
    assert.equal(store.inNotebook('c2'), false);
    assert.equal(store.notebook()[0].myExample, '');
    assert.ok(store.notebook()[0].createdAt);
  });

  test('preserva myExample quando vem preenchido', () => {
    store.addToNotebook({ id: 'c2', it: 'Ciao', myExample: 'Ciao Marco!' });
    assert.equal(store.notebook()[0].myExample, 'Ciao Marco!');
  });
});

describe('exportar e importar', () => {
  test('roundtrip preserva o progresso', () => {
    store.record('01', 'a', { correct: true, score: 1 });
    const dump = store.exportJSON();

    store.reset();
    assert.equal(store.getItem('01', 'a'), null);

    store.importJSON(dump);
    assert.equal(store.getItem('01', 'a').correct, 1);
  });

  test('rejeita JSON que não é nosso', () => {
    assert.throws(() => store.importJSON('{"foo":1}'), /não parece ser um export/);
    assert.throws(() => store.importJSON('null'), /não parece ser um export/);
    assert.throws(() => store.importJSON('isto não é json'));
  });

  test('download monta um blob com nome datado', () => {
    let href = null;
    let name = null;
    let revoked = 0;
    globalThis.Blob = class { constructor(parts, opts) { this.parts = parts; this.opts = opts; } };
    globalThis.URL = { createObjectURL: () => 'blob:fake', revokeObjectURL: () => { revoked += 1; } };
    const orig = document.createElement.bind(document);
    document.createElement = (tag) => {
      const n = orig(tag);
      if (tag === 'a') {
        Object.defineProperty(n, 'href', { set: (v) => { href = v; }, get: () => href });
        Object.defineProperty(n, 'download', { set: (v) => { name = v; }, get: () => name });
      }
      return n;
    };

    store.download();
    document.createElement = orig;

    assert.equal(href, 'blob:fake');
    assert.match(name, /^lezioni-di-italiano-progresso-\d{4}-\d{2}-\d{2}\.json$/);
    assert.equal(revoked, 1);
  });
});

describe('resiliência de escrita', () => {
  test('localStorage bloqueado no meio da sessão: segue em memória', () => {
    // Modo privado, cota estourada, cookies desligados. O site precisa
    // continuar funcionando — só não persiste entre sessões.
    store.record('01', 'antes', { correct: true, score: 1 });
    installStorage({ blocked: true });

    assert.doesNotThrow(() => store.record('01', 'depois', { correct: true, score: 1 }));
    assert.equal(store.getItem('01', 'depois').correct, 1);
  });
});
