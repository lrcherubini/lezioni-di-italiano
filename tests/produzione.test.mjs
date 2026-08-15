/* Os dois tipos de produção livre: traduzione e trasformazione.

   Arquivo próprio pelo mesmo motivo dos outros: `node --test` dá um processo
   por arquivo, e é assim que o estado de módulo do speech.js entra virgem.

   O que se testa é o que o conteúdo depende, não o desenho. Em especial a
   regra de pontuação da trasformazione: `checkAnswer` descarta pontuação
   final — para todo outro tipo isso está certo — e aqui é justamente o que
   distingue uma interrogativa italiana da afirmativa correspondente. Se essa
   checagem sumir, copiar a frase de partida passa a valer ponto e o drill
   deixa de exercitar qualquer coisa, sem erro nenhum no console. */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { installDOM, installStorage } from './support/dom.mjs';
import { makeSpeechSynthesis, installUtterance, IT_VOICES } from './support/speech-stub.mjs';

const synth = makeSpeechSynthesis({ voices: IT_VOICES });
installUtterance();
installDOM({ speechSynthesis: synth });
installStorage();

const { getExercise } = await import('../js/exercises/index.js');
const speech = await import('../js/speech.js');
await speech.voicesReady();

function montar(item) {
  const mod = getExercise(item.type);
  const enviados = [];
  const ctx = { submit: (r) => enviados.push(r), lesson: '01', speak: speech.speak };
  const root = mod.render(item, ctx);
  return { mod, root, enviados };
}

/** Preenche os inputs na ordem em que aparecem e devolve o resultado. */
function responder(mod, item, root, respostas) {
  const inputs = root.querySelectorAll('input');
  respostas.forEach((r, i) => { inputs[i].value = r; });
  return mod.check(item, null, root);
}

/* --- traduzione ----------------------------------------------------------- */

const TRAD = {
  id: 't-e01', type: 'traduzione', category: 'ESPRESSIONE', consegna: 'Traduci.',
  frasi: [
    { id: 't-e01-f1', pt: 'Eu sou brasileiro.', risposta: 'Io sono brasiliano.',
      accettaAnche: ['Sono brasiliano.'], nota: 'Pronome é opcional.' },
    { id: 't-e01-f2', pt: 'Quantos anos você tem?', risposta: 'Quanti anni hai?' },
  ],
};

describe('traduzione', () => {
  test('a tela mostra só o português — nenhuma pista do italiano', () => {
    const { root } = montar(TRAD);
    const texto = root.textContent;
    assert.ok(texto.includes('Eu sou brasileiro.'));
    assert.equal(texto.includes('Io sono brasiliano'), false,
      'a resposta não pode estar na tela antes da tentativa');
  });

  test('subItemIds casa com os ids que check devolve', () => {
    const { mod, root } = montar(TRAD);
    const r = mod.check(TRAD, null, root);
    assert.deepEqual(mod.subItemIds(TRAD), r.results.map((x) => x.id));
  });

  test('aceita a variante de accettaAnche', () => {
    const { mod, root } = montar(TRAD);
    const r = responder(mod, TRAD, root, ['Sono brasiliano.', 'Quanti anni hai?']);
    assert.equal(r.correct, true);
    assert.equal(r.score, 1);
  });

  test('sem acento é correto COM nota, não erro', () => {
    const { mod, root } = montar(TRAD);
    const r = responder(mod, TRAD, root, ['Io sono brasiliano.', 'Quanti anni hai?']);
    assert.equal(r.correct, true);
  });

  test('errado devolve score parcial, não zero seco', () => {
    const { mod, root } = montar(TRAD);
    const r = responder(mod, TRAD, root, ['Io sono brasiliano.', 'niente']);
    assert.equal(r.correct, false);
    assert.equal(r.score, 0.5);
  });

  test('o feedback de erro traz o diff palavra a palavra', () => {
    const { mod, root } = montar(TRAD);
    const r = responder(mod, TRAD, root, ['Io sono brasiliano.', 'Quanti anni tu?']);
    mod.feedback(TRAD, r, root);
    // «hai» faltou: tem que aparecer marcado como ausente, não só «errado».
    const diff = root.querySelector('.diff');
    assert.ok(diff, 'sem diff o aluno não vê QUAL palavra faltou');
    assert.match(diff.innerHTML, /<del[^>]*>hai<\/del>/);
  });

  test('reveal preenche o gabarito e marca como revelado', () => {
    const { mod, root } = montar(TRAD);
    mod.reveal(TRAD, root);
    const inputs = root.querySelectorAll('input');
    assert.equal(inputs[0].value, 'Io sono brasiliano.');
    assert.ok(inputs[0].className.includes('traduzione__input--warn'));
  });
});

/* --- trasformazione ------------------------------------------------------- */

const TRASF = {
  id: 't-e02', type: 'trasformazione', category: 'GRAMMATICA', consegna: 'Trasforma.',
  frasi: [
    { id: 't-e02-f1', partenza: 'Io sono italiano.', verso: 'negativa',
      risposta: 'Io non sono italiano.', accettaAnche: ['Non sono italiano.'] },
    { id: 't-e02-f2', partenza: 'Tu sei italiano.', verso: 'interrogativa',
      risposta: 'Tu sei italiano?' },
  ],
};

describe('trasformazione', () => {
  test('a frase de partida aparece com 🔊 e o alvo como chip', () => {
    const { root } = montar(TRASF);
    assert.equal(root.querySelectorAll('.trasformazione__partenza .speak').length, 2);
    assert.match(root.textContent, /interrogativa/);
  });

  test('subItemIds casa com os ids que check devolve', () => {
    const { mod, root } = montar(TRASF);
    const r = mod.check(TRASF, null, root);
    assert.deepEqual(mod.subItemIds(TRASF), r.results.map((x) => x.id));
  });

  test('as duas transformações certas dão 100%', () => {
    const { mod, root } = montar(TRASF);
    const r = responder(mod, TRASF, root, ['Io non sono italiano.', 'Tu sei italiano?']);
    assert.equal(r.correct, true);
  });

  /* O ponto do arquivo. As palavras batem — é a MESMA frase da partida — e
     só a pontuação diz que não é uma pergunta. Sem a checagem à parte,
     `checkAnswer` diria «certo» e o aluno ganharia ponto por copiar. */
  test('copiar a partida NÃO passa como interrogativa', () => {
    const { mod, root } = montar(TRASF);
    const r = responder(mod, TRASF, root, ['Io non sono italiano.', 'Tu sei italiano.']);
    assert.equal(r.correct, false);
    const pergunta = r.results.find((x) => x.id === 't-e02-f2');
    assert.equal(pergunta.correct, false);
    assert.match(pergunta.nota, /\?/, 'a nota tem que dizer o que faltou');
  });

  test('sobra de «?» reprova a negativa — a regra é simétrica', () => {
    const { mod, root } = montar(TRASF);
    const r = responder(mod, TRASF, root, ['Io non sono italiano?', 'Tu sei italiano?']);
    const negativa = r.results.find((x) => x.id === 't-e02-f1');
    assert.equal(negativa.correct, false);
    assert.match(negativa.nota, /pergunta/i);
  });

  test('reveal preenche o gabarito com a pontuação certa', () => {
    const { mod, root } = montar(TRASF);
    mod.reveal(TRASF, root);
    const inputs = root.querySelectorAll('input');
    assert.equal(inputs[1].value, 'Tu sei italiano?');
  });
});
