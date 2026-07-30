/* Correção de resposta. É o módulo com mais regra pedagógica embutida:
   acento vale "correto com nota", elisão só quando o item permite, e o
   apóstrofo nunca some. */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import {
  normalize, deaccent, expandElision, checkAnswer,
  tokenize, diffTokens, renderDiff, similarity, escapeHtml,
} from '../js/check.js';

describe('normalize', () => {
  test('caixa, espaço e pontuação final saem', () => {
    assert.equal(normalize('  Io   SONO brasiliano. '), 'io sono brasiliano');
  });

  test('apóstrofos tipográficos viram apóstrofo reto', () => {
    assert.equal(normalize('l’amico'), "l'amico");
    assert.equal(normalize('un´amica'), "un'amica");
    assert.equal(normalize('vent`anni'), "vent'anni");
  });

  test('o apóstrofo NUNCA é removido — é informação gramatical', () => {
    // un amico (masc.) vs un'amica (fem.): remover o apóstrofo tornaria
    // os dois indistinguíveis, e é exatamente essa distinção que se ensina.
    assert.notEqual(normalize("un'amica"), normalize('un amica'));
    assert.ok(normalize("un'amica").includes("'"));
  });

  test('aspas, parênteses e reticências saem', () => {
    assert.equal(normalize('«Ciao!» (saluto)…'), 'ciao saluto');
  });

  test('null e undefined viram string vazia', () => {
    assert.equal(normalize(null), '');
    assert.equal(normalize(undefined), '');
  });
});

describe('deaccent', () => {
  test('remove diacríticos mantendo o resto da normalização', () => {
    assert.equal(deaccent('Perché?'), 'perche');
    assert.equal(deaccent('sì'), 'si');
    assert.equal(deaccent('città'), 'citta');
  });

  test('não mexe no apóstrofo', () => {
    assert.equal(deaccent("l'amico"), "l'amico");
  });
});

describe('expandElision', () => {
  test('desfaz as elisões que o italiano A1 usa', () => {
    assert.equal(expandElision("l'amico"), 'lo amico');
    assert.equal(expandElision("un'amica"), 'una amica');
    assert.equal(expandElision("vent'anni"), 'venti anni');
    assert.equal(expandElision("trent'anni"), 'trenta anni');
  });
});

describe('checkAnswer', () => {
  test('resposta vazia é erro sem score', () => {
    const r = checkAnswer('', 'sono');
    assert.deepEqual(r, { correct: false, score: 0, similarity: 0, level: 'none' });
    assert.deepEqual(checkAnswer('   ', 'sono').level, 'none');
  });

  test('similarity vem em TODOS os ramos, não só no erro', () => {
    // gap-audio gradua a mensagem por result.similarity; quem consome não
    // deveria precisar saber em qual ramo a resposta caiu.
    for (const r of [
      checkAnswer('sono', 'sono'),                              // exact
      checkAnswer('perche', 'perché'),                          // accent
      checkAnswer('lo amico', "l'amico", { tolleranzaElisione: true }), // elision
      checkAnswer('zzz', 'sono'),                               // none
      checkAnswer('', 'sono'),                                  // vazio
    ]) {
      assert.equal(typeof r.similarity, 'number', JSON.stringify(r));
      assert.ok(r.similarity >= 0 && r.similarity <= 1);
    }
    assert.equal(checkAnswer('sono', 'sono').similarity, 1);
  });

  test('igualdade estrita, ignorando caixa e pontuação', () => {
    const r = checkAnswer('  Sono. ', 'sono');
    assert.equal(r.correct, true);
    assert.equal(r.score, 1);
    assert.equal(r.level, 'exact');
  });

  test('accettaAnche entra como alternativa exata', () => {
    const r = checkAnswer('18', 'diciotto', { accettaAnche: ['18'] });
    assert.equal(r.correct, true);
    assert.equal(r.level, 'exact');
  });

  test('acento faltando é CORRETO COM NOTA, não erro', () => {
    // A decisão central deste arquivo: quem escreve "perche" acertou a
    // palavra e errou o acento. Score 0.85, não 0.
    const r = checkAnswer('perche', 'perché');
    assert.equal(r.correct, true);
    assert.equal(r.score, 0.85);
    assert.equal(r.level, 'accent');
    assert.match(r.nota, /acento/);
    assert.match(r.nota, /perché/);
  });

  test('tolleranzaAccenti: false reprova — quando o acento É o conteúdo', () => {
    const r = checkAnswer('perche', 'perché', { tolleranzaAccenti: false });
    assert.equal(r.correct, false);
    assert.equal(r.level, 'none');
  });

  test('elisão só é aceita quando o item pede', () => {
    assert.equal(checkAnswer('lo amico', "l'amico").correct, false);

    const r = checkAnswer('lo amico', "l'amico", { tolleranzaElisione: true });
    assert.equal(r.correct, true);
    assert.equal(r.level, 'elision');
    assert.equal(r.score, 0.85);
    assert.match(r.nota, /elide/);
  });

  test('erro devolve similaridade para graduar o feedback', () => {
    const perto = checkAnswer('sona', 'sono');
    assert.equal(perto.correct, false);
    assert.ok(perto.similarity > 0.6, `esperava > 0.6, veio ${perto.similarity}`);

    const longe = checkAnswer('xyzw', 'sono');
    assert.ok(longe.similarity < 0.3, `esperava < 0.3, veio ${longe.similarity}`);
  });

  test('a nota escapa o gabarito antes de virar HTML', () => {
    // A nota vai para innerHTML no feedback. Se o gabarito tiver aspas ou
    // sinal de menor, precisa sair escapado.
    const r = checkAnswer('si', '"sì"');
    assert.equal(r.level, 'accent');
    assert.ok(r.nota.includes('&quot;'), `nota não escapou: ${r.nota}`);
    assert.ok(!r.nota.includes('"sì"'), 'aspas cruas na nota');
  });
});

describe('diffTokens', () => {
  test('frase idêntica: tudo same, score 1', () => {
    const { ops, score } = diffTokens('io sono brasiliano', 'io sono brasiliano');
    assert.equal(score, 1);
    assert.deepEqual(ops.map((o) => o.type), ['same', 'same', 'same']);
  });

  test('palavra faltando vira del', () => {
    const { ops, score } = diffTokens('io sono brasiliano', 'io brasiliano');
    assert.deepEqual(ops.map((o) => o.type), ['same', 'del', 'same']);
    assert.equal(ops[1].token, 'sono');
    assert.ok(Math.abs(score - 2 / 3) < 1e-9);
  });

  test('palavra inventada vira add', () => {
    const { ops } = diffTokens('io sono', 'io sono molto');
    assert.deepEqual(ops.map((o) => o.type), ['same', 'same', 'add']);
    assert.equal(ops[2].token, 'molto');
  });

  test('substituição emite del ANTES de add', () => {
    // É como se lê um diff: primeiro o que faltou, depois o que sobrou.
    // O desempate estrito (> e não >=) no backtrack é o que garante isso.
    const { ops } = diffTokens('io sono brasiliano', 'io sono argentino');
    assert.deepEqual(ops.map((o) => o.type), ['same', 'same', 'del', 'add']);
    assert.equal(ops[2].token, 'brasiliano');
    assert.equal(ops[3].token, 'argentino');
  });

  test('resposta vazia: só dels', () => {
    const { ops, score } = diffTokens('io sono', '');
    assert.deepEqual(ops.map((o) => o.type), ['del', 'del']);
    assert.equal(score, 0);
  });

  test('gabarito vazio não divide por zero', () => {
    const { ops, score } = diffTokens('', 'io sono');
    assert.equal(score, 0);
    assert.deepEqual(ops.map((o) => o.type), ['add', 'add']);
  });
});

describe('renderDiff', () => {
  test('marca same, del e add com tags distintas', () => {
    const { html, score } = renderDiff('io sono brasiliano', 'io sono argentino');
    assert.match(html, /<span class="same">io<\/span>/);
    assert.match(html, /<del title="faltou">brasiliano<\/del>/);
    assert.match(html, /<ins title="sobrou">argentino<\/ins>/);
    assert.ok(score < 1);
  });
});

describe('tokenize', () => {
  test('separa por espaço já normalizado, sem tokens vazios', () => {
    assert.deepEqual(tokenize('  Io,  sono!  '), ['io', 'sono']);
  });
});

describe('similarity', () => {
  test('idênticos = 1, disjuntos próximos de 0', () => {
    assert.equal(similarity('ciao', 'ciao'), 1);
    assert.equal(similarity('', 'ciao'), 0);
    assert.equal(similarity('ciao', ''), 0);
    assert.ok(similarity('ciao', 'ciau') > 0.7);
  });
});

describe('escapeHtml', () => {
  test('escapa os quatro caracteres perigosos', () => {
    assert.equal(
      escapeHtml('<img src="x" onerror=y> & fim'),
      '&lt;img src=&quot;x&quot; onerror=y&gt; &amp; fim'
    );
  });
});
