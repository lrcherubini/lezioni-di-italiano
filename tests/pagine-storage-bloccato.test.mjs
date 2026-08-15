/* localStorage bloqueado — modo privado, cookies desligados, políticas de
   empresa. Acontece de verdade e não é raro.

   Este arquivo existe porque uma auditoria de CENÁRIOS (não de linhas)
   mostrou o buraco: `store.js` já tratava o storage bloqueado e tinha teste
   próprio, mas **nenhuma página** era exercitada nesse estado. E duas delas
   — Ripasso e Caderno — são movidas INTEIRAMENTE por localStorage: sem ele,
   `dueItems()` e `notebook()` voltam vazios, e o risco não é perder dados
   (não há o que perder), é a página abrir em branco ou estourar.

   Um cenário global por arquivo, pela regra do projeto: aqui o global é o
   storage bloqueado, e as três páginas são renderizadas nele. */

import { test, describe, before } from 'node:test';
import assert from 'node:assert/strict';
import { installDOM, installStorage } from './support/dom.mjs';
import { makeSpeechSynthesis, installUtterance, IT_VOICES } from './support/speech-stub.mjs';
import { installFetch, flush, homeSkeleton } from './support/fixtures.mjs';

const synth = makeSpeechSynthesis({ voices: IT_VOICES });
installUtterance();
const dom = installDOM({ speechSynthesis: synth });
installStorage({ blocked: true });
installFetch();

const store = await import('../js/store.js');
const { renderRipasso } = await import('../js/ripasso.js');
const { renderNotebook } = await import('../js/notebook.js');
const { renderFrasi } = await import('../js/frasi.js');
const { renderHome } = await import('../js/app.js');

before(() => {
  const mk = (tag, attrs) => {
    const n = dom.document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v);
    return n;
  };
  dom.document.body.append(
    mk('div', { id: 'audio-status' }),
    mk('button', { 'data-action': 'theme' }),
    mk('div', { id: 'ripasso' }),
    mk('div', { id: 'notebook' }),
    mk('div', { id: 'frasi' })
  );
});

describe('o store aguenta e segue em memória', () => {
  test('ler não lança — cai para estado vazio', () => {
    assert.doesNotThrow(() => store.notebook());
    assert.deepEqual(store.notebook(), []);
    assert.equal(store.dueCount(), 0);
  });

  test('escrever não lança — só não persiste', () => {
    assert.doesNotThrow(() => store.record('01', 'x', { correct: true, score: 1 }));
    assert.doesNotThrow(() => store.addToNotebook({ id: 'n1', it: 'ciao', pt: 'oi' }));
    // Gravou em memória: a sessão continua utilizável.
    assert.equal(store.notebook().length, 1);
  });

  test('exportar continua funcionando — é a saída de emergência do aluno', () => {
    const dump = store.exportJSON();
    assert.ok(JSON.parse(dump).lessons, 'export válido mesmo sem persistência');
  });
});

describe('Ripasso com storage bloqueado', () => {
  before(async () => {
    await renderRipasso();
    await flush();
  });

  test('abre com o estado vazio, não em branco nem com erro', () => {
    const main = dom.document.getElementById('ripasso');
    assert.ok(main.querySelector('.ripasso-vuoto'), 'mostra o estado vazio');
    assert.match(main.querySelector('.stage__title').textContent, /Ripasso/);
  });

  test('explica o que fazer em vez de só dizer que está vazio', () => {
    const main = dom.document.getElementById('ripasso');
    assert.match(main.textContent, /próxima aula/);
  });
});

describe('Caderno com storage bloqueado', () => {
  before(() => renderNotebook());

  test('abre e mostra a entrada que existe em memória', () => {
    // Sessão sem persistência ainda é uma sessão: o que foi guardado agora
    // continua visível até fechar a aba.
    const main = dom.document.getElementById('notebook');
    assert.equal(main.querySelectorAll('.nota-lex').length, 1);
  });

  test('escrever a frase própria não lança, mesmo sem onde salvar', () => {
    const campo = dom.document.getElementById('notebook').querySelector('.nota-lex__mio');
    campo.value = 'Ciao, come stai?';
    assert.doesNotThrow(() => campo.dispatchEvent({ type: 'blur' }));
    assert.equal(store.notebook()[0].myExample, 'Ciao, come stai?');
  });
});

describe('Frasi com storage bloqueado', () => {
  before(async () => {
    await renderFrasi();
    await flush();
  });

  test('abre inteira — o conteúdo vem do JSON, não do progresso', () => {
    // Ao contrário de Ripasso e Caderno, esta página não depende do storage
    // para ter o que mostrar. Sem ele, ela tem que ficar exatamente igual.
    const main = dom.document.getElementById('frasi');
    assert.ok(main.querySelectorAll('.funzione').length >= 2);
    assert.match(main.textContent, /Ripeti dopo di me/);
  });

  test('guardar no caderno não lança, mesmo sem onde salvar', () => {
    const btn = dom.document.getElementById('frasi').querySelector('.funzione__caderno');
    assert.doesNotThrow(() => btn.click());
    assert.equal(btn.getAttribute('aria-pressed'), 'true', 'a sessão segue utilizável');
  });
});

describe('Home com storage bloqueado', () => {
  before(async () => {
    homeSkeleton(dom.document);
    await renderHome();
    await flush(30);
  });

  test('lista as aulas normalmente — elas não dependem do progresso', () => {
    const grid = dom.document.getElementById('lesson-grid');
    assert.ok(grid.querySelectorAll('.lesson-card').length > 0);
  });

  test('as barras de progresso ficam em zero, sem quebrar', () => {
    const grid = dom.document.getElementById('lesson-grid');
    assert.ok(grid.querySelectorAll('.lesson-card').length > 0);
    assert.equal(grid.querySelectorAll('[data-completa="true"]').length, 0);
  });
});
