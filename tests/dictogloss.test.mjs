/* Dictogloss — as quatro etapas.

   Arquivo próprio: o cenário conta ESCUTAS, e o contador é estado do card;
   além disso exercita speech.js, cujo estado de módulo entra virgem por
   processo.

   O que precisa de prova é a regra pedagógica, não o DOM: a 1ª escuta trava
   a escrita (senão vira transcrição), a nota de corte é generosa (senão
   reconstruir vira ditado), e o diff aparece mesmo quando o aluno acertou —
   é ele que ensina, não o veredito. */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { installDOM, installStorage } from './support/dom.mjs';
import { makeSpeechSynthesis, installUtterance, IT_VOICES } from './support/speech-stub.mjs';
import { flush } from './support/fixtures.mjs';

const synth = makeSpeechSynthesis({ voices: IT_VOICES });
installUtterance();
installDOM({ speechSynthesis: synth });
installStorage();

const { getExercise } = await import('../js/exercises/index.js');
const speech = await import('../js/speech.js');
await speech.voicesReady();

const mod = getExercise('dictogloss');

const ITEM = {
  id: 'l02-e27',
  type: 'dictogloss',
  category: 'VERBO',
  consegna: 'Ascolta e ricostruisci.',
  testo: 'Io abito a Roma, ma sono brasiliano.',
  audio: { tts: 'Io abito a Roma, ma sono brasiliano.', src: null },
  pt: 'Eu moro em Roma, mas sou brasileiro.',
  preinsegnamento: [
    { it: 'abito', pt: 'moro' },
    { it: 'ma', pt: 'mas' },
  ],
  aiuto: 'Cidade pede <it>a</it>.',
};

function montar(item = ITEM) {
  const enviados = [];
  const ctx = { submit: (r) => enviados.push(r), lesson: '02', speak: speech.speak };
  return { root: mod.render(item, ctx), enviados };
}

const ouvir = (root) => root.querySelector('.player .btn--primary').dispatchEvent({ type: 'click' });

/* --- Etapa 1: pré-ensino -------------------------------------------------- */

describe('pré-ensino', () => {
  test('mostra as formas difíceis ANTES de ouvir, cada uma com áudio', () => {
    const { root } = montar();
    const itens = root.querySelectorAll('.items .item');
    assert.equal(itens.length, 2);
    for (const i of itens) assert.equal(i.querySelectorAll('.speak').length, 1);
    assert.match(root.textContent, /abito/);
    assert.match(root.textContent, /moro/);
  });

  test('sem pré-ensino, o exercício continua montando', () => {
    const { root } = montar({ ...ITEM, preinsegnamento: undefined });
    assert.equal(root.querySelectorAll('.items .item').length, 0);
    assert.ok(root.querySelector('.dicto__input'));
  });
});

/* --- Etapa 2: as escutas -------------------------------------------------- */

describe('as três escutas', () => {
  test('a 1ª escuta NÃO deixa escrever — senão vira transcrição', () => {
    const { root } = montar();
    const input = root.querySelector('.dicto__input');
    assert.equal(input.disabled, true);
    assert.match(root.querySelector('.dicto__conta').textContent, /Escuta 1 de 3: só ouça/);
  });

  test('o botão Verificar também nasce travado', () => {
    const { root } = montar();
    assert.equal(root.querySelector('.ex__actions .btn--primary').disabled, true);
  });

  test('depois da 1ª escuta o campo abre', async () => {
    const { root } = montar();
    ouvir(root);
    await flush();

    const input = root.querySelector('.dicto__input');
    assert.equal(input.disabled, false);
    assert.equal(root.querySelector('.ex__actions .btn--primary').disabled, false);
    assert.match(input.getAttribute('placeholder'), /suas palavras/);
  });

  test('o contador acompanha as escutas e não trava depois da 3ª', async () => {
    const { root } = montar();
    const conta = root.querySelector('.dicto__conta');

    ouvir(root); await flush();
    assert.match(conta.textContent, /Escuta 1 de 3 feita/);
    ouvir(root); await flush();
    assert.match(conta.textContent, /Escuta 2 de 3 feita/);
    ouvir(root); await flush();
    assert.match(conta.textContent, /3 escutas feitas/);
    ouvir(root); await flush();
    assert.match(conta.textContent, /3 escutas feitas/, 'continua ouvindo à vontade');
  });

  test('o áudio é o texto completo, em italiano', async () => {
    const { root } = montar();
    ouvir(root);
    await flush();
    assert.equal(synth.spoken.at(-1).text, 'Io abito a Roma, ma sono brasiliano.');
    assert.equal(synth.spoken.at(-1).lang, 'it-IT');
  });
});

/* --- Etapa 3: correção da reconstrução ------------------------------------ */

describe('reconstrução', () => {
  test('texto idêntico é acerto exato', () => {
    const r = mod.check(ITEM, 'Io abito a Roma, ma sono brasiliano.');
    assert.equal(r.correct, true);
    assert.equal(r.level, 'exact');
  });

  test('pontuação e caixa não contam', () => {
    const r = mod.check(ITEM, 'io abito a roma ma sono brasiliano');
    assert.equal(r.correct, true);
  });

  test('acento faltando é acerto com nota, não erro', () => {
    const item = { ...ITEM, testo: 'Lui è brasiliano.' };
    const r = mod.check(item, 'Lui e brasiliano.');
    assert.equal(r.correct, true);
    assert.equal(r.level, 'accent');
  });

  test('reformular com as MESMAS ideias passa — a nota de corte é generosa', () => {
    // Perdeu «ma», manteve o resto: ~6/7 das palavras.
    const r = mod.check(ITEM, 'Io abito a Roma, sono brasiliano.');
    assert.equal(r.correct, true);
    assert.equal(r.level, 'partial');
    assert.ok(r.score >= 0.65 && r.score < 1, `score fora da faixa: ${r.score}`);
  });

  test('lembrar quase nada é erro', () => {
    const r = mod.check(ITEM, 'Io sono.');
    assert.equal(r.correct, false);
    assert.equal(r.level, 'none');
  });

  test('resposta vazia não quebra', () => {
    const r = mod.check(ITEM, '');
    assert.equal(r.correct, false);
    assert.equal(r.score, 0);
  });

  test('a nota de corte é mais frouxa que a do qa-transcribe', () => {
    // O alvo tem 7 palavras; esta resposta recupera 5 → 0.714, que cai
    // exatamente ENTRE os dois cortes: passa no dictogloss (0.65, onde se
    // reconstrói de memória) e reprova no qa-transcribe (0.8, onde se
    // transcreve o que se ouviu). É a diferença entre os dois exercícios.
    const quase = 'Io abito a Roma brasiliano.';
    const r = mod.check(ITEM, quase);
    assert.ok(r.score >= 0.65 && r.score < 0.8, `score fora da faixa: ${r.score}`);
    assert.equal(r.correct, true);
    assert.equal(getExercise('qa-transcribe').check(
      { risposta: { testo: ITEM.testo } }, quase
    ).correct, false);
  });
});

/* --- Etapa 4: análise ----------------------------------------------------- */

describe('análise contra o original', () => {
  test('o diff aparece mesmo quando o aluno acertou — é ele que ensina', () => {
    const { root } = montar();
    root.querySelector('.dicto__input').value = 'Io abito a Roma, ma sono brasiliano.';
    const fb = mod.feedback(ITEM, mod.check(ITEM, root.querySelector('.dicto__input').value), root);
    assert.ok(fb.querySelector('.diff'), 'sempre mostra o diff');
    assert.match(fb.textContent, /Perfetto/);
  });

  test('marca o que faltou e o que foi acrescentado', () => {
    const { root } = montar();
    const input = root.querySelector('.dicto__input');
    input.value = 'Io vivo a Roma, ma sono brasiliano.';
    const fb = mod.feedback(ITEM, mod.check(ITEM, input.value), root);

    const diff = fb.querySelector('.diff');
    assert.match(diff.innerHTML, /<del[^>]*>abito<\/del>/);
    assert.match(diff.innerHTML, /<ins[^>]*>vivo<\/ins>/);
  });

  test('avisa que reconstruir não é transcrever', () => {
    const { root } = montar();
    root.querySelector('.dicto__input').value = 'Io abito a Roma.';
    const fb = mod.feedback(ITEM, mod.check(ITEM, 'Io abito a Roma.'), root);
    assert.match(fb.textContent, /Reconstruir não é transcrever/);
  });

  test('o original aparece com áudio e tradução', () => {
    const { root } = montar();
    root.querySelector('.dicto__input').value = 'x';
    const fb = mod.feedback(ITEM, mod.check(ITEM, 'x'), root);
    const orig = fb.querySelectorAll('.block')[0];
    assert.match(orig.textContent, /Originale/);
    assert.equal(orig.querySelectorAll('.speak').length, 1);
    assert.match(orig.textContent, /Eu moro em Roma/);
  });

  test('os três tons têm título próprio', () => {
    const casos = [
      ['Io abito a Roma, ma sono brasiliano.', /Perfetto/],
      ['Io abito a Roma, sono brasiliano.', /mensagem chegou/],
      ['Io sono.', /ouvir de novo/],
    ];
    for (const [resposta, esperado] of casos) {
      const { root } = montar();
      root.querySelector('.dicto__input').value = resposta;
      const fb = mod.feedback(ITEM, mod.check(ITEM, resposta), root);
      assert.match(fb.querySelector('.feedback__title').textContent, esperado);
    }
  });
});

describe('dica e reveal', () => {
  test('a dica fica escondida atrás do botão', () => {
    const { root } = montar();
    const dica = root.querySelectorAll('.feedback')[0];
    assert.equal(dica.hidden, true);
    root.querySelectorAll('.ex__actions .btn')[1].dispatchEvent({ type: 'click' });
    assert.equal(dica.hidden, false);
  });

  test('sem aiuto, não há botão de dica', () => {
    const { root } = montar({ ...ITEM, aiuto: undefined });
    assert.equal(root.querySelectorAll('.ex__actions .btn').length, 1);
  });

  test('reveal mostra o original', () => {
    const { root } = montar();
    mod.reveal(ITEM, root);
    const fb = root._parts.feedback;
    assert.equal(fb.hidden, false);
    assert.match(fb.textContent, /Io abito a Roma, ma sono brasiliano\./);
  });
});

describe('envio', () => {
  test('Verificar manda o texto digitado', async () => {
    const { root, enviados } = montar();
    ouvir(root); await flush();
    root.querySelector('.dicto__input').value = 'prova';
    root.querySelector('.ex__actions .btn--primary').dispatchEvent({ type: 'click' });
    assert.deepEqual(enviados, ['prova']);
  });

  test('Ctrl+Enter envia; Enter puro não', async () => {
    const { root, enviados } = montar();
    ouvir(root); await flush();
    const input = root.querySelector('.dicto__input');
    input.value = 'x';
    input.dispatchEvent({ type: 'keydown', key: 'Enter' });
    assert.equal(enviados.length, 0, 'Enter puro insere linha');
    input.dispatchEvent({ type: 'keydown', key: 'Enter', ctrlKey: true });
    assert.equal(enviados.length, 1);
  });
});
