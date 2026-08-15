/* Os quatro drills de fixação: scelta, riordino, abbinamento e slot-frame.

   Arquivo próprio, e não um apêndice de exercises.test.mjs, pelo mesmo
   motivo que os outros cenários têm o seu: `node --test` dá um processo por
   arquivo, e é assim que o estado de módulo do speech.js entra virgem.

   O que se testa é o comportamento que o conteúdo depende, não o desenho:
   que sub-item vira id de progresso (senão o `conteggio` mente), que a
   correção não aceita o que não deve, e que `reveal` só acontece depois de
   uma tentativa — a regra que impede um drill de virar gabarito. */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { installDOM, installStorage } from './support/dom.mjs';
import { makeSpeechSynthesis, installUtterance, IT_VOICES } from './support/speech-stub.mjs';

const synth = makeSpeechSynthesis({ voices: IT_VOICES });
installUtterance();
installDOM({ speechSynthesis: synth });
installStorage();

const { getExercise } = await import('../js/exercises/index.js');
const { mescola } = await import('../js/exercises/shuffle.js');
const speech = await import('../js/speech.js');
await speech.voicesReady();

/** Espera a fila do speech drenar. `speakSequence` só emite o turno seguinte
 *  depois do onend do anterior, mais uma pausa de 220 ms entre turnos — por
 *  isso não dá para afirmar a sequência inteira logo após o clique. */
async function ateFalar(quantos, timeout = 3000) {
  const alvo = synth.spoken.length + quantos;
  const limite = Date.now() + timeout;
  while (synth.spoken.length < alvo && Date.now() < limite) {
    await new Promise((res) => setTimeout(res, 20));
  }
}

function montar(item) {
  const mod = getExercise(item.type);
  const enviados = [];
  const ctx = { submit: (r) => enviados.push(r), lesson: '02', speak: speech.speak };
  const root = mod.render(item, ctx);
  return { mod, root, enviados };
}

/* --- shuffle -------------------------------------------------------------- */

describe('mescola', () => {
  test('é determinístico: a mesma semente dá a mesma ordem', () => {
    const a = mescola(['io', 'sono', 'brasiliano', 'e', 'tu'], 'l02-e01-f1');
    const b = mescola(['io', 'sono', 'brasiliano', 'e', 'tu'], 'l02-e01-f1');
    assert.deepEqual(a, b);
  });

  test('sementes diferentes dão ordens diferentes', () => {
    const a = mescola(['uno', 'due', 'tre', 'quattro', 'cinque'], 'aaa');
    const b = mescola(['uno', 'due', 'tre', 'quattro', 'cinque'], 'bbb');
    assert.notDeepEqual(a, b);
  });

  test('nunca devolve a ordem original — senão não há exercício', () => {
    const orig = ['a', 'b'];
    assert.notDeepEqual(mescola(orig, 'x'), orig);
    // Varre várias sementes: nenhuma pode escapar pela identidade.
    for (let i = 0; i < 50; i++) {
      const l = ['uno', 'due', 'tre', 'quattro'];
      assert.notDeepEqual(mescola(l, `seme-${i}`), l);
    }
  });

  test('preserva o conteúdo e não muta a entrada', () => {
    const orig = ['uno', 'due', 'tre'];
    const out = mescola(orig, 'k');
    assert.deepEqual([...out].sort(), ['due', 'tre', 'uno']);
    assert.deepEqual(orig, ['uno', 'due', 'tre']);
  });

  test('lista de 0 ou 1 item passa intacta', () => {
    assert.deepEqual(mescola([], 'k'), []);
    assert.deepEqual(mescola(['solo'], 'k'), ['solo']);
  });
});

/* --- scelta --------------------------------------------------------------- */

const SCELTA = {
  id: 'l02-e01', type: 'scelta', category: 'GRAMMATICA',
  consegna: 'Scegli la parola corretta.',
  domande: [
    { id: 'l02-e01-q1', testo: 'Noi abitiamo ___ Brasile.', opzioni: ['in', 'a', 'di'], risposta: 'in', pt: 'Nós moramos no Brasil.', nota: '<b>in</b> + país.' },
    { id: 'l02-e01-q2', testo: 'Io abito ___ Roma.', opzioni: ['in', 'a', 'di'], risposta: 'a', pt: 'Eu moro em Roma.' },
  ],
};

describe('scelta', () => {
  test('expõe o id de cada pergunta — é o que o Ripasso resolve', () => {
    assert.deepEqual(getExercise('scelta').subItemIds(SCELTA), ['l02-e01-q1', 'l02-e01-q2']);
  });

  test('clicar numa alternativa desmarca as outras da mesma pergunta', () => {
    const { root } = montar(SCELTA);
    const [q1] = [...root._parts.rows.values()];
    q1.buttons[0].dispatchEvent({ type: 'click' });
    q1.buttons[1].dispatchEvent({ type: 'click' });

    const marcados = q1.buttons.filter((b) => b.getAttribute('aria-pressed') === 'true');
    assert.equal(marcados.length, 1);
    assert.equal(marcados[0].getAttribute('data-valore'), 'a');
  });

  test('a seleção de uma pergunta não afeta a outra', () => {
    const { root } = montar(SCELTA);
    const [q1, q2] = [...root._parts.rows.values()];
    q1.buttons[0].dispatchEvent({ type: 'click' });
    q2.buttons[1].dispatchEvent({ type: 'click' });

    assert.equal(q1.buttons[0].getAttribute('aria-pressed'), 'true');
    assert.equal(q2.buttons[1].getAttribute('aria-pressed'), 'true');
  });

  test('check devolve um result por pergunta, com o id do sub-item', () => {
    const { mod, root } = montar(SCELTA);
    const [q1, q2] = [...root._parts.rows.values()];
    q1.buttons[0].dispatchEvent({ type: 'click' }); // "in" — certo
    q2.buttons[0].dispatchEvent({ type: 'click' }); // "in" — errado

    const r = mod.check(SCELTA, null, root);
    assert.equal(r.results.length, 2);
    assert.deepEqual(r.results.map((x) => x.id), ['l02-e01-q1', 'l02-e01-q2']);
    assert.deepEqual(r.results.map((x) => x.correct), [true, false]);
    assert.equal(r.correct, false);
    assert.equal(r.score, 0.5);
  });

  test('pergunta em branco conta como errada, sem lançar', () => {
    const { mod, root } = montar(SCELTA);
    const r = mod.check(SCELTA, null, root);
    assert.equal(r.score, 0);
    assert.equal(r.results.every((x) => x.correct === false), true);
  });

  test('feedback marca a certa e a errada clicada, e trava as alternativas', () => {
    const { mod, root } = montar(SCELTA);
    const [q1] = [...root._parts.rows.values()];
    q1.buttons[1].dispatchEvent({ type: 'click' }); // "a" — errado
    const r = mod.check(SCELTA, null, root);
    mod.feedback(SCELTA, r, root);

    assert.ok(q1.buttons[0].classList.contains('opzione--giusta'));
    assert.ok(q1.buttons[1].classList.contains('opzione--sbagliata'));
    assert.ok(q1.buttons.every((b) => b.disabled));
    assert.equal(q1.esito.hidden, false);
  });

  test('reveal marca a alternativa certa em todas as perguntas', () => {
    const { mod, root } = montar(SCELTA);
    mod.reveal(SCELTA, root);
    for (const row of root._parts.rows.values()) {
      const on = row.buttons.filter((b) => b.getAttribute('aria-pressed') === 'true');
      assert.equal(on.length, 1);
      assert.equal(on[0].getAttribute('data-valore'), row.q.risposta);
    }
  });

  test('«Ouvir todas» fala as frases COMPLETAS, com a lacuna preenchida', async () => {
    const { mod, root } = montar(SCELTA);
    const r = mod.check(SCELTA, null, root);
    const fb = mod.feedback(SCELTA, r, root);

    const antes = synth.spoken.length;
    fb.querySelectorAll('.btn--sm')[0].dispatchEvent({ type: 'click' });
    await ateFalar(2);

    const ditos = synth.spoken.slice(antes).map((u) => u.text);
    assert.deepEqual(ditos.slice(0, 2), ['Noi abitiamo in Brasile.', 'Io abito a Roma.']);
  });

  test('o botão Verificar envia o exercício', () => {
    const { root, enviados } = montar(SCELTA);
    root.querySelector('.btn--primary').dispatchEvent({ type: 'click' });
    assert.equal(enviados.length, 1);
  });
});

/* --- riordino ------------------------------------------------------------- */

const RIORDINO = {
  id: 'l02-e02', type: 'riordino', category: 'GRAMMATICA',
  consegna: 'Riordina le parole.',
  frasi: [
    { id: 'l02-e02-f1', parole: ['Io', 'abito', 'a', 'Roma'], risposta: 'Io abito a Roma.', pt: 'Eu moro em Roma.' },
  ],
};

/** Clica as peças na ordem do gabarito, consumindo cada uma só uma vez. */
function montarFrase(row, alvo) {
  const usati = new Set();
  for (const parola of alvo) {
    const idx = row.parole.findIndex(
      (p, i) => !usati.has(i) && p.toLowerCase() === parola.toLowerCase()
    );
    usati.add(idx);
    row.scelte.push(idx);
  }
  row.disegna();
}

describe('riordino', () => {
  test('expõe o id de cada frase', () => {
    assert.deepEqual(getExercise('riordino').subItemIds(RIORDINO), ['l02-e02-f1']);
  });

  test('as peças chegam embaralhadas, nunca na ordem do gabarito', () => {
    const { root } = montar(RIORDINO);
    const [row] = [...root._parts.rows.values()];
    assert.notDeepEqual(row.parole, ['Io', 'abito', 'a', 'Roma']);
    assert.deepEqual([...row.parole].sort(), ['Io', 'Roma', 'a', 'abito']);
  });

  test('montar na ordem certa acerta, e o ponto final do gabarito não atrapalha', () => {
    const { mod, root } = montar(RIORDINO);
    const [row] = [...root._parts.rows.values()];
    montarFrase(row, ['Io', 'abito', 'a', 'Roma']);

    const r = mod.check(RIORDINO, null, root);
    assert.equal(r.correct, true);
    assert.equal(r.results[0].id, 'l02-e02-f1');
  });

  test('ordem errada é erro, mesmo com todas as peças usadas', () => {
    const { mod, root } = montar(RIORDINO);
    const [row] = [...root._parts.rows.values()];
    montarFrase(row, ['Io', 'a', 'abito', 'Roma']);

    const r = mod.check(RIORDINO, null, root);
    assert.equal(r.correct, false);
  });

  test('clicar numa peça já colocada devolve ela ao pool', () => {
    const { root } = montar(RIORDINO);
    const [row] = [...root._parts.rows.values()];
    const linea = root.querySelector('.riordino__linea');
    const pool = root.querySelector('.riordino__pool');

    assert.equal(pool.querySelectorAll('.parola').length, 4);

    pool.querySelectorAll('.parola')[0].dispatchEvent({ type: 'click' });
    assert.equal(row.scelte.length, 1);
    assert.equal(linea.querySelectorAll('.parola').length, 1);

    linea.querySelectorAll('.parola')[0].dispatchEvent({ type: 'click' });
    assert.equal(row.scelte.length, 0);
    assert.equal(pool.querySelectorAll('.parola').length, 4);
  });

  test('a linha vazia mostra a instrução em vez de ficar em branco', () => {
    const { root } = montar(RIORDINO);
    assert.ok(root.querySelector('.riordino__vuoto'));
  });

  test('Limpar devolve todas as peças', () => {
    const { root } = montar(RIORDINO);
    const [row] = [...root._parts.rows.values()];
    montarFrase(row, ['Io', 'abito', 'a', 'Roma']);
    assert.equal(row.scelte.length, 4);

    root.querySelectorAll('.btn--ghost')[0].dispatchEvent({ type: 'click' });
    assert.equal(row.scelte.length, 0);
  });

  test('reveal monta o gabarito, e ele passa no próprio check', () => {
    const { mod, root } = montar(RIORDINO);
    mod.reveal(RIORDINO, root);
    assert.equal(mod.check(RIORDINO, null, root).correct, true);
  });

  test('reveal lida com palavra repetida sem reusar a mesma peça', () => {
    const item = {
      id: 'l02-e03', type: 'riordino',
      frasi: [{
        id: 'l02-e03-f1',
        parole: ['Io', 'parlo', 'italiano', 'e', 'parlo', 'inglese'],
        risposta: 'Io parlo italiano e parlo inglese.',
      }],
    };
    const { mod, root } = montar(item);
    mod.reveal(item, root);
    const [row] = [...root._parts.rows.values()];
    assert.equal(new Set(row.scelte).size, 6, 'cada peça usada uma vez só');
    assert.equal(mod.check(item, null, root).correct, true);
  });

  test('feedback expõe o que o aluno montou quando erra', () => {
    const { mod, root } = montar(RIORDINO);
    const [row] = [...root._parts.rows.values()];
    montarFrase(row, ['Roma', 'a', 'abito', 'Io']);
    const r = mod.check(RIORDINO, null, root);
    mod.feedback(RIORDINO, r, root);
    assert.match(row.esito.innerHTML, /Roma a abito Io/);
  });
});

/* --- abbinamento ---------------------------------------------------------- */

const ABBINA = {
  id: 'l02-e04', type: 'abbinamento', category: 'VERBO',
  consegna: 'Abbina domande e risposte.',
  coppie: [
    { id: 'l02-e04-p1', sinistra: 'Di dove sei?', destra: 'Sono brasiliano.', pt: 'Sou brasileiro.' },
    { id: 'l02-e04-p2', sinistra: 'Quanti anni hai?', destra: 'Ho diciannove anni.', pt: 'Tenho 19 anos.' },
    { id: 'l02-e04-p3', sinistra: 'Dove abiti?', destra: 'Abito a Milano.', pt: 'Moro em Milão.' },
  ],
};

describe('abbinamento', () => {
  test('expõe o id de cada par', () => {
    assert.deepEqual(getExercise('abbinamento').subItemIds(ABBINA),
      ['l02-e04-p1', 'l02-e04-p2', 'l02-e04-p3']);
  });

  test('todo select oferece todas as respostas, mais a opção vazia', () => {
    const { root } = montar(ABBINA);
    for (const row of root._parts.rows.values()) {
      const opts = row.select.querySelectorAll('option');
      assert.equal(opts.length, 4);
      assert.equal(opts[0].getAttribute('value'), '');
    }
  });

  test('as alternativas vêm embaralhadas', () => {
    const { root } = montar(ABBINA);
    assert.notDeepEqual(root._parts.alternative, ABBINA.coppie.map((c) => c.destra));
  });

  test('associação certa e errada, cada uma com seu id', () => {
    const { mod, root } = montar(ABBINA);
    const [p1, p2, p3] = [...root._parts.rows.values()];
    p1.select.value = 'Sono brasiliano.';
    p2.select.value = 'Abito a Milano.';
    p3.select.value = 'Abito a Milano.';

    const r = mod.check(ABBINA, null, root);
    assert.deepEqual(r.results.map((x) => x.id), ['l02-e04-p1', 'l02-e04-p2', 'l02-e04-p3']);
    assert.deepEqual(r.results.map((x) => x.correct), [true, false, true]);
  });

  test('select em branco é erro, não acerto por omissão', () => {
    const { mod, root } = montar(ABBINA);
    const r = mod.check(ABBINA, null, root);
    assert.equal(r.score, 0);
  });

  test('feedback pinta o select e revela a resposta certa', () => {
    const { mod, root } = montar(ABBINA);
    const [p1, p2] = [...root._parts.rows.values()];
    p1.select.value = 'Sono brasiliano.';
    const r = mod.check(ABBINA, null, root);
    mod.feedback(ABBINA, r, root);

    assert.ok(p1.select.classList.contains('abbina__select--ok'));
    assert.ok(p2.select.classList.contains('abbina__select--err'));
    assert.match(p2.esito.innerHTML, /Ho diciannove anni/);
  });

  test('reveal preenche tudo certo', () => {
    const { mod, root } = montar(ABBINA);
    mod.reveal(ABBINA, root);
    assert.equal(mod.check(ABBINA, null, root).correct, true);
  });
});

/* --- slot-frame ----------------------------------------------------------- */

const SLOT = {
  id: 'l02-e05', type: 'slot-frame', category: 'VERBO',
  consegna: 'Sostituisci.',
  frame: { it: 'Io parlo ___.', pt: 'Eu falo ___.' },
  giri: [
    { id: 'l02-e05-g1', slot: 'italiano', pt: 'italiano', risposta: 'Io parlo italiano.' },
    { id: 'l02-e05-g2', slot: 'tedesco', pt: 'alemão', risposta: 'Io parlo tedesco.' },
    { id: 'l02-e05-g3', slot: 'ungherese', pt: 'húngaro', risposta: 'Io parlo ungherese.' },
  ],
};

describe('slot-frame', () => {
  test('expõe o id de cada giro', () => {
    assert.deepEqual(getExercise('slot-frame').subItemIds(SLOT),
      ['l02-e05-g1', 'l02-e05-g2', 'l02-e05-g3']);
  });

  test('mostra o molde e o modelo audível de saída', () => {
    const { root } = montar(SLOT);
    assert.match(root.querySelector('.frame__it').innerHTML, /Io parlo/);
    assert.equal(root._parts.modello, 'Io parlo italiano.');
    assert.ok(root.querySelector('.frame__modello'));
  });

  test('o prompt de cada giro é o português — o aluno produz, não copia', () => {
    const { root } = montar(SLOT);
    const prompts = root.querySelectorAll('.giro__prompt').map((n) => n.textContent);
    assert.deepEqual(prompts, ['italiano', 'alemão', 'húngaro']);
  });

  test('exige a frase INTEIRA, não só o slot', () => {
    const { mod, root } = montar(SLOT);
    const [g1] = [...root._parts.rows.values()];
    g1.input.value = 'italiano';

    const r = mod.check(SLOT, null, root);
    assert.equal(r.results[0].correct, false, 'digitar só o slot não vale');
  });

  test('a frase completa acerta, e cada giro tem seu id', () => {
    const { mod, root } = montar(SLOT);
    const rows = [...root._parts.rows.values()];
    rows[0].input.value = 'Io parlo italiano.';
    rows[1].input.value = 'Io parlo tedesco';   // sem ponto: pontuação é normalizada
    rows[2].input.value = 'Io parlo sloveno.';  // errado

    const r = mod.check(SLOT, null, root);
    assert.deepEqual(r.results.map((x) => x.id), ['l02-e05-g1', 'l02-e05-g2', 'l02-e05-g3']);
    assert.deepEqual(r.results.map((x) => x.correct), [true, true, false]);
    assert.equal(r.score, 2 / 3);
  });

  test('acento faltando é acerto com nota, não erro', () => {
    const item = {
      id: 'l02-e06', type: 'slot-frame',
      frame: { it: 'Lui ha ___ anni.', pt: 'Ele tem ___ anos.' },
      giri: [{ id: 'l02-e06-g1', slot: 'ventitré', pt: '23', risposta: 'Lui ha ventitré anni.' }],
    };
    const { mod, root } = montar(item);
    [...root._parts.rows.values()][0].input.value = 'Lui ha ventitre anni.';

    const r = mod.check(item, null, root);
    assert.equal(r.results[0].correct, true);
    assert.equal(r.results[0].level, 'accent');
    assert.match(r.results[0].nota, /acento/i);
  });

  test('elisão NÃO é tolerada: é o que o drill quer automatizar', () => {
    const item = {
      id: 'l02-e07', type: 'slot-frame',
      frame: { it: 'Io ho ___ anni.', pt: 'Eu tenho ___ anos.' },
      giri: [{ id: 'l02-e07-g1', slot: "vent'", pt: '20', risposta: "Io ho vent'anni." }],
    };
    const { mod, root } = montar(item);
    [...root._parts.rows.values()][0].input.value = 'Io ho venti anni.';
    assert.equal(mod.check(item, null, root).results[0].correct, false);
  });

  test('feedback pinta o input e mostra a forma certa', () => {
    const { mod, root } = montar(SLOT);
    const rows = [...root._parts.rows.values()];
    rows[0].input.value = 'Io parlo italiano.';
    const r = mod.check(SLOT, null, root);
    mod.feedback(SLOT, r, root);

    assert.ok(rows[0].input.classList.contains('giro__input--ok'));
    assert.ok(rows[1].input.classList.contains('giro__input--err'));
    assert.match(rows[1].esito.innerHTML, /Io parlo tedesco/);
  });

  test('reveal preenche tudo e o resultado passa no próprio check', () => {
    const { mod, root } = montar(SLOT);
    mod.reveal(SLOT, root);
    assert.equal(mod.check(SLOT, null, root).correct, true);
  });

  test('Enter em qualquer giro envia o exercício inteiro', () => {
    const { root, enviados } = montar(SLOT);
    [...root._parts.rows.values()][1].input.dispatchEvent({ type: 'keydown', key: 'Enter' });
    assert.equal(enviados.length, 1);
    // Outra tecla não envia.
    [...root._parts.rows.values()][1].input.dispatchEvent({ type: 'keydown', key: 'a' });
    assert.equal(enviados.length, 1);
  });

  test('«Ouvir a série» fala os seis giros na ordem, com voz italiana', async () => {
    const { mod, root } = montar(SLOT);
    const r = mod.check(SLOT, null, root);
    const fb = mod.feedback(SLOT, r, root);

    const antes = synth.spoken.length;
    fb.querySelectorAll('.btn--sm')[0].dispatchEvent({ type: 'click' });
    await ateFalar(3);

    const ditos = synth.spoken.slice(antes).map((u) => u.text);
    assert.deepEqual(ditos.slice(0, 3), ['Io parlo italiano.', 'Io parlo tedesco.', 'Io parlo ungherese.']);
    assert.equal(synth.spoken.at(-1).lang, 'it-IT');
  });

  test('sem giros, não quebra nem oferece a série', () => {
    const vazio = { id: 'l02-e99', type: 'slot-frame', frame: { it: 'Io parlo ___.' }, giri: [] };
    const { mod, root } = montar(vazio);
    const r = mod.check(vazio, null, root);
    assert.equal(r.score, 0);
    assert.equal(r.results.length, 0);
    const fb = mod.feedback(vazio, r, root);
    assert.equal(fb.querySelectorAll('.btn--sm').length, 0);
  });
});

/* --- correzione ----------------------------------------------------------

   O drill que quebra, de propósito, a equivalência «italiano exibido ⇒ 🔊 ⇒
   entra no léxico» que vale em todo o resto do site. É onde este tipo pode
   nascer com bug sem que nada mais reclame, então é o que estes testes
   guardam antes de qualquer coisa. */

const CORREZIONE = {
  id: 'l03-e24',
  type: 'correzione',
  category: 'GRAMMATICA',
  consegna: 'Trova l\'errore.',
  frasi: [
    { id: 'l03-e24-f1', sbagliata: 'Lui legge i giornale.',
      risposta: 'Lui legge il giornale.', pt: 'Ele lê o jornal.',
      nota: 'Com <it>giornale</it> no singular o artigo é <it>il</it>.' },
    { id: 'l03-e24-f2', sbagliata: 'Noi leggiono un libro.',
      risposta: 'Noi leggiamo un libro.', pt: 'Nós lemos um livro.' },
  ],
};

describe('correzione', () => {
  test('expõe o id de cada frase — é o que o conteggio e o Ripasso leem', () => {
    assert.deepEqual(getExercise('correzione').subItemIds(CORREZIONE),
      ['l03-e24-f1', 'l03-e24-f2']);
  });

  test('a frase ERRADA não ganha botão de áudio', () => {
    // A regra que mais importa neste arquivo. Ouvir a forma errada em voz
    // italiana é o jeito mais rápido de gravá-la como se fosse boa.
    const { root } = montar(CORREZIONE);
    assert.equal(root.querySelectorAll('.speak').length, 0,
      'algum botão de áudio apareceu antes de responder');
  });

  test('a frase errada é marcada por TEXTO, não só por cor', () => {
    const { root } = montar(CORREZIONE);
    const primeira = root.querySelectorAll('.correzione__sbagliata')[0];
    assert.match(primeira.textContent, /errata/i);
    assert.match(primeira.textContent, /Lui legge i giornale\./);
  });

  test('o sentido pretendido aparece — senão não há como saber qual é a certa', () => {
    const { root } = montar(CORREZIONE);
    assert.match(root.textContent, /Ele lê o jornal\./);
  });

  test('corrigir certo acerta; copiar a errada não', () => {
    const { mod, root } = montar(CORREZIONE);
    const rows = [...root._parts.rows.values()];
    rows[0].input.value = 'Lui legge il giornale.';
    rows[1].input.value = 'Noi leggiono un libro.';   // copiou a errada

    const r = mod.check(CORREZIONE, null, root);
    assert.equal(r.results[0].correct, true);
    assert.equal(r.results[1].correct, false);
    assert.equal(r.score, 0.5);
  });

  test('copiar a errada recebe uma nota que diz o que fazer', () => {
    const { mod, root } = montar(CORREZIONE);
    const rows = [...root._parts.rows.values()];
    rows[1].input.value = 'Noi leggiono un libro.';
    const r = mod.check(CORREZIONE, null, root);
    assert.equal(r.results[1].copiou, true);
    assert.match(r.results[1].nota, /repetiu a frase/i);
  });

  test('só a forma CERTA vira áudio, e só depois de responder', () => {
    const { mod, root } = montar(CORREZIONE);
    const r = mod.check(CORREZIONE, null, root);
    mod.feedback(CORREZIONE, r, root);

    const falados = root.querySelectorAll('.speak')
      .map((b) => b.getAttribute('aria-label').replace(/^Ouvir: /, ''));

    // As duas respostas são audíveis. Junto delas aparecem as formas que a
    // `nota` cita com <it>, e isso é o `prose()` fazendo o trabalho dele —
    // são formas CERTAS, citadas para explicar o erro.
    assert.ok(falados.includes('Lui legge il giornale.'));
    assert.ok(falados.includes('Noi leggiamo un libro.'));

    // O que não pode existir em botão nenhum é a forma errada.
    for (const t of falados) {
      assert.doesNotMatch(t, /leggiono|legge i giornale/, `virou áudio: «${t}»`);
    }
  });

  test('«Ouvir as formas certas» não toca nenhuma frase errada', async () => {
    const { mod, root } = montar(CORREZIONE);
    const r = mod.check(CORREZIONE, null, root);
    const fb = mod.feedback(CORREZIONE, r, root);

    const antes = synth.spoken.length;
    fb.querySelectorAll('.btn--sm')[0].dispatchEvent({ type: 'click' });
    await ateFalar(2);

    const ditos = synth.spoken.slice(antes).map((u) => u.text);
    assert.deepEqual(ditos.slice(0, 2), ['Lui legge il giornale.', 'Noi leggiamo un libro.']);
    assert.equal(synth.spoken.at(-1).lang, 'it-IT');
  });

  test('reveal preenche tudo e o resultado passa no próprio check', () => {
    const { mod, root } = montar(CORREZIONE);
    mod.reveal(CORREZIONE, root);
    assert.equal(mod.check(CORREZIONE, null, root).correct, true);
  });

  test('Enter em qualquer campo envia o exercício inteiro', () => {
    const { root, enviados } = montar(CORREZIONE);
    [...root._parts.rows.values()][1].input.dispatchEvent({ type: 'keydown', key: 'Enter' });
    assert.equal(enviados.length, 1);
    [...root._parts.rows.values()][1].input.dispatchEvent({ type: 'keydown', key: 'a' });
    assert.equal(enviados.length, 1);
  });

  test('sem frases, não quebra nem oferece o play', () => {
    const vazio = { id: 'x-e99', type: 'correzione', frasi: [] };
    const { mod, root } = montar(vazio);
    const r = mod.check(vazio, null, root);
    assert.equal(r.results.length, 0);
    assert.equal(mod.feedback(vazio, r, root).querySelectorAll('.btn--sm').length, 0);
  });
});
