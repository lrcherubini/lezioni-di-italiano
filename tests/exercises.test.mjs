/* Os quatro tipos de exercício, pelo contrato do registry:
   render → ctx.submit → check → feedback → reveal.

   O que se testa aqui é comportamento pedagógico, não só DOM: a passada 1
   do diálogo tem que travar input E transcrição; a resposta só aparece
   depois de tentar; acerto com nota de acento não é erro. */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { installDOM, installStorage } from './support/dom.mjs';
import { makeSpeechSynthesis, installUtterance, IT_VOICES } from './support/speech-stub.mjs';
import { flush } from './support/fixtures.mjs';

const synth = makeSpeechSynthesis({ voices: IT_VOICES });
installUtterance();
installDOM({ speechSynthesis: synth });
installStorage();

const { getExercise, knownTypes } = await import('../js/exercises/index.js');
const speech = await import('../js/speech.js');
await speech.voicesReady();

/** Monta um exercício capturando o que ele envia via ctx.submit. */
function montar(item) {
  const mod = getExercise(item.type);
  const enviados = [];
  const ctx = { submit: (r) => enviados.push(r), lesson: '01', speak: speech.speak };
  const root = mod.render(item, ctx);
  return { mod, root, enviados, ctx };
}

describe('registry', () => {
  test('conhece exatamente os quatro tipos implementados', () => {
    assert.deepEqual(knownTypes().sort(), ['dialogue', 'gap-audio', 'paradigm-fill', 'qa-transcribe']);
  });

  test('tipo desconhecido devolve null em vez de lançar', () => {
    assert.equal(getExercise('dictogloss'), null);
    assert.equal(getExercise(undefined), null);
  });

  test('todo módulo cumpre o contrato render/check', () => {
    for (const t of knownTypes()) {
      const m = getExercise(t);
      assert.equal(typeof m.render, 'function', `${t}.render`);
      assert.equal(typeof m.check, 'function', `${t}.check`);
      assert.equal(m.type, t);
    }
  });
});

/* ------------------------------------------------------------------ */

describe('gap-audio', () => {
  const item = {
    id: 'l01-e01', type: 'gap-audio', category: 'VERBO',
    consegna: 'Ascolta e completa.',
    audio: { tts: 'Io sono brasiliano.', src: null },
    testo: 'Io ___ brasiliano.',
    risposta: 'sono',
    pt: 'Eu sou brasileiro.',
    aiuto: 'Verbo essere, 1ª pessoa.',
  };

  test('a lacuna aparece como marcador, nunca como a resposta', () => {
    const { root } = montar(item);
    const prompt = root.querySelector('.ex__prompt');
    assert.match(prompt.innerHTML, /<span class="gap"><\/span>/);
    assert.ok(!prompt.innerHTML.includes('sono'), 'a resposta vazaria o exercício');
  });

  test('tocar fala a frase COMPLETA, não a que está na tela', () => {
    const { root } = montar(item);
    root.querySelectorAll('.player button')[0].click();
    assert.equal(synth.spoken.at(-1).text, 'Io sono brasiliano.');
  });

  test('Enter no input envia', () => {
    const { root, enviados } = montar(item);
    root._parts.input.value = 'sono';
    root._parts.input.dispatchEvent({ type: 'keydown', key: 'Enter' });
    assert.deepEqual(enviados, ['sono']);
  });

  test('outra tecla não envia', () => {
    const { root, enviados } = montar(item);
    root._parts.input.dispatchEvent({ type: 'keydown', key: 'a' });
    assert.equal(enviados.length, 0);
  });

  test('a dica fica atrás de um botão', () => {
    const { root } = montar(item);
    const dica = root.querySelectorAll('.feedback')[0];
    assert.equal(dica.hidden, true);
    root.querySelectorAll('.ex__row button')[1].click();
    assert.equal(dica.hidden, false);
  });

  test('sem aiuto, não há botão de dica', () => {
    const { root } = montar({ ...item, aiuto: undefined });
    assert.equal(root.querySelectorAll('.ex__row button').length, 1);
  });

  test('acerto exato: Esatto! e a frase completa audível', () => {
    const { mod, root } = montar(item);
    const r = mod.check(item, 'sono');
    assert.equal(r.level, 'exact');

    const fb = mod.feedback(item, r, root);
    assert.equal(fb.hidden, false);
    assert.equal(fb.className, 'feedback feedback--ok');
    assert.match(fb.textContent, /Esatto!/);
    assert.match(fb.innerHTML, /Io sono brasiliano\./);
    assert.equal(fb.querySelectorAll('.speak').length, 1);
  });

  test('acerto com acento: warn, não erro', () => {
    const acentuado = { ...item, risposta: 'perché' };
    const { mod, root } = montar(acentuado);
    const r = mod.check(acentuado, 'perche');
    assert.equal(r.correct, true);

    const fb = mod.feedback(acentuado, r, root);
    assert.equal(fb.className, 'feedback feedback--warn');
    assert.match(fb.textContent, /Quase perfeito/);
  });

  test('erro perto e erro longe recebem conselhos diferentes', () => {
    const { mod, root } = montar(item);

    const perto = mod.feedback(item, mod.check(item, 'sona'), root);
    assert.match(perto.textContent, /fim da palavra/);

    const longe = mod.feedback(item, mod.check(item, 'zzz'), root);
    assert.match(longe.textContent, /use a dica/);
  });

  test('reveal preenche o input e mostra a transcrição', () => {
    const { mod, root } = montar(item);
    mod.reveal(item, root);
    assert.equal(root._parts.input.value, 'sono');
    assert.match(root._parts.feedback.textContent, /Resposta/);
    assert.match(root._parts.feedback.innerHTML, /Io sono brasiliano\./);
  });
});

/* ------------------------------------------------------------------ */

describe('qa-transcribe', () => {
  const item = {
    id: 'l01-e10', type: 'qa-transcribe', category: 'VERBO',
    consegna: 'Ascolta e trascrivi.',
    domanda: { tts: 'Quanti anni hai?', testo: 'Quanti anni hai?', pt: 'Quantos anos você tem?' },
    risposta: { tts: 'Ho diciotto anni.', testo: 'Ho diciotto anni.', pt: 'Tenho dezoito anos.' },
    aiuto: 'É um número.',
  };

  test('toca pergunta e resposta com vozes diferentes', async () => {
    const { root } = montar(item);
    const antes = synth.spoken.length;
    root.querySelectorAll('.player button')[0].click();
    await flush(400);   // speakSequence pausa 220ms entre turnos

    const ditos = synth.spoken.slice(antes);
    assert.deepEqual(ditos.map((u) => u.text), ['Quanti anni hai?', 'Ho diciotto anni.']);
    assert.notEqual(ditos[0].voice.voiceURI, ditos[1].voice.voiceURI);
  });

  test('"só a resposta" existe e toca com a voz B', async () => {
    const { root } = montar(item);
    const botao = root.querySelectorAll('.player button').find((b) => b.textContent.includes('Só a resposta'));
    botao.click();
    await flush(5);
    assert.equal(synth.spoken.at(-1).text, 'Ho diciotto anni.');
    assert.equal(synth.spoken.at(-1).voice.voiceURI, 'it-cosimo');
  });

  test('Enter puro insere linha; Ctrl+Enter envia', () => {
    const { root, enviados } = montar(item);
    root._parts.input.value = 'Ho diciotto anni';
    root._parts.input.dispatchEvent({ type: 'keydown', key: 'Enter' });
    assert.equal(enviados.length, 0, 'textarea: Enter é quebra de linha');

    root._parts.input.dispatchEvent({ type: 'keydown', key: 'Enter', ctrlKey: true });
    assert.equal(enviados.length, 1);
  });

  test('transcrição exata é exact', () => {
    const { mod } = montar(item);
    assert.equal(mod.check(item, 'ho diciotto anni').level, 'exact');
  });

  test('80% das palavras conta como audição bem-sucedida', () => {
    const { mod } = montar(item);
    // "Ho diciotto anni" tem 3 tokens; errar 1 dá 66% → reprova.
    const r = mod.check(item, 'Ho diciotto');
    assert.equal(r.correct, false);
    assert.ok(r.score < 0.8);

    const longo = {
      ...item,
      risposta: { ...item.risposta, testo: 'Io ho diciotto anni e sono brasiliano' },
    };
    const q = mod.check(longo, 'Io ho diciotto anni e sono argentino');  // 6/7
    assert.equal(q.correct, true);
    assert.equal(q.level, 'partial');
  });

  test('o feedback mostra o diff palavra a palavra', () => {
    const { mod, root } = montar(item);
    root._parts.input.value = 'Ho venti anni';
    const fb = mod.feedback(item, mod.check(item, 'Ho venti anni'), root);

    assert.match(fb.innerHTML, /<del title="faltou">diciotto<\/del>/);
    assert.match(fb.innerHTML, /<ins title="sobrou">venti<\/ins>/);
    assert.match(fb.textContent, /% das palavras/);
    assert.match(fb.textContent, /Vamos de novo/);
  });

  test('acerto exato não mostra diff, só o original', () => {
    const { mod, root } = montar(item);
    root._parts.input.value = 'Ho diciotto anni.';
    const fb = mod.feedback(item, mod.check(item, 'Ho diciotto anni.'), root);
    assert.match(fb.textContent, /Perfetto!/);
    assert.equal(fb.querySelectorAll('.diff').length, 0);
    assert.equal(fb.querySelectorAll('.speak').length, 1);
  });

  test('reveal mostra a resposta com áudio', () => {
    const { mod, root } = montar(item);
    mod.reveal(item, root);
    assert.match(root._parts.feedback.innerHTML, /Ho diciotto anni\./);
    assert.equal(root._parts.feedback.querySelectorAll('.speak').length, 1);
  });

  test('a dica fica atrás de um botão que alterna', () => {
    const { root } = montar(item);
    const dica = root.querySelectorAll('.feedback')[0];
    const botao = root.querySelectorAll('.ex__actions button')[1];

    assert.equal(dica.hidden, true);
    botao.click();
    assert.equal(dica.hidden, false);
    botao.click();
    assert.equal(dica.hidden, true);
  });

  test('sem aiuto, não há botão de dica', () => {
    const { root } = montar({ ...item, aiuto: undefined });
    assert.equal(root.querySelectorAll('.ex__actions button').length, 1);
  });

  test('sem campo tts, usa o testo para falar', async () => {
    // O schema permite omitir tts quando ele seria igual ao testo.
    const semTts = {
      ...item,
      domanda: { testo: 'Come stai?', pt: 'Como vai?' },
      risposta: { testo: 'Bene, grazie.', pt: 'Bem, obrigado.' },
    };
    const { root } = montar(semTts);
    const antes = synth.spoken.length;
    root.querySelectorAll('.player button')[0].click();
    await flush(400);

    assert.deepEqual(synth.spoken.slice(antes).map((u) => u.text), ['Come stai?', 'Bene, grazie.']);
  });

  test('resposta sem tradução não gera linha de gloss vazia', () => {
    const semPt = { ...item, risposta: { testo: 'Ho diciotto anni.', tts: 'Ho diciotto anni.' } };
    const { mod, root } = montar(semPt);

    root._parts.input.value = 'Ho diciotto anni.';
    const fb = mod.feedback(semPt, mod.check(semPt, 'Ho diciotto anni.'), root);
    assert.equal(fb.querySelectorAll('.item__pt').length, 0);

    mod.reveal(semPt, root);
    assert.equal(root._parts.feedback.querySelectorAll('.item__pt').length, 0);
  });

  test('acerto só com acento errado aparece como nota no feedback', () => {
    const acento = {
      ...item,
      risposta: { testo: 'Sì, perché no?', tts: 'Sì, perché no?', pt: 'Sim, por que não?' },
    };
    const { mod, root } = montar(acento);
    root._parts.input.value = 'Si, perche no?';

    const r = mod.check(acento, 'Si, perche no?');
    assert.equal(r.level, 'accent');

    const fb = mod.feedback(acento, r, root);
    assert.match(fb.textContent, /Quase — a audição pegou/);
    assert.match(fb.innerHTML, /acento/);
  });

  test('tolleranzaAccenti: false reprova quando o acento é o conteúdo', () => {
    const estrito = {
      ...item,
      tolleranzaAccenti: false,
      risposta: { testo: 'Perché', tts: 'Perché' },
    };
    const { mod } = montar(estrito);
    assert.equal(mod.check(estrito, 'Perche').correct, false);
  });
});

/* ------------------------------------------------------------------ */

describe('paradigm-fill', () => {
  const item = {
    id: 'l01-e13', type: 'paradigm-fill', category: 'VOCABOLARIO',
    consegna: 'Completa.',
    colonne: ['Maschile sing.', 'Femminile sing.', 'Maschile pl.', 'Femminile pl.'],
    righe: [{
      id: 'l01-e13-r1', pt: 'brasileiro',
      forme: ['il brasiliano', 'la brasiliana', 'i brasiliani', 'le brasiliane'],
      nascondi: [1, 3],
      nota: 'regular',
    }],
  };

  test('esconde só as células pedidas; as dadas continuam audíveis', () => {
    const { root } = montar(item);
    assert.equal(root.querySelectorAll('input').length, 2);
    // 4 cabeçalhos de coluna + 2 formas dadas
    assert.equal(root.querySelectorAll('.speak').length, 6);
  });

  test('cada célula oculta é um item de progresso próprio', () => {
    // É isto que faz o progresso saber QUAL forma você erra, e não só
    // "errou o paradigma de brasiliano".
    const { mod, root } = montar(item);
    const r = mod.check(item, null, root);
    assert.deepEqual(r.results.map((x) => x.id), ['l01-e13-r1-c1', 'l01-e13-r1-c3']);
  });

  test('score parcial quando acerta metade', () => {
    const { mod, root } = montar(item);
    const [c1, c3] = [...root._parts.cells.values()];
    c1.input.value = 'la brasiliana';
    c3.input.value = 'errado';

    const r = mod.check(item, null, root);
    assert.equal(r.correct, false);
    assert.equal(r.score, 0.5);
    assert.equal(r.level, 'partial');

    const fb = mod.feedback(item, r, root);
    assert.match(fb.textContent, /1 de 2 corretas/);
    assert.equal(fb.className, 'feedback feedback--warn');
    assert.match(fb.textContent, /le brasiliane/);
    assert.match(fb.textContent, /você escreveu «errado»/);
  });

  test('célula em branco é reportada como tal', () => {
    const { mod, root } = montar(item);
    const fb = mod.feedback(item, mod.check(item, null, root), root);
    assert.match(fb.textContent, /em branco/);
    assert.equal(fb.className, 'feedback feedback--err');
  });

  test('tudo certo marca as células e não lista erros', () => {
    const { mod, root } = montar(item);
    const [c1, c3] = [...root._parts.cells.values()];
    c1.input.value = 'la brasiliana';
    c3.input.value = 'le brasiliane';

    const r = mod.check(item, null, root);
    assert.equal(r.correct, true);
    assert.equal(r.score, 1);

    const fb = mod.feedback(item, r, root);
    assert.equal(fb.className, 'feedback feedback--ok');
    assert.equal(fb.querySelectorAll('.items').length, 0);
    assert.equal(c1.input.style.borderColor, 'var(--ok)');
  });

  test('a elisão NÃO é tolerada aqui — o artigo é parte da resposta', () => {
    // l'amico vs lo amico: o apóstrofo é justamente o que se está treinando.
    const amico = {
      ...item,
      righe: [{ id: 'r-amico', pt: 'o amigo', forme: ["l'amico", 'gli amici'], nascondi: [0] }],
      colonne: ['Singolare', 'Plurale'],
    };
    const { mod, root } = montar(amico);
    [...root._parts.cells.values()][0].input.value = 'lo amico';
    assert.equal(mod.check(amico, null, root).correct, false);
  });

  test('Enter em qualquer célula envia a tabela inteira', () => {
    const { root, enviados } = montar(item);
    [...root._parts.cells.values()][1].input.dispatchEvent({ type: 'keydown', key: 'Enter' });
    assert.equal(enviados.length, 1);
  });

  test('reveal preenche todas as células ocultas', () => {
    const { mod, root } = montar(item);
    mod.reveal(item, root);
    const vals = [...root._parts.cells.values()].map((c) => c.input.value);
    assert.deepEqual(vals, ['la brasiliana', 'le brasiliane']);
  });

  test('linha de exceção fica marcada na tabela', () => {
    const { root } = montar({
      ...item,
      righe: [{ ...item.righe[0], eccezione: true }],
    });
    assert.equal(root.querySelectorAll('tr[data-eccezione="true"]').length, 1);
  });
});

/* ------------------------------------------------------------------ */

describe('dialogue', () => {
  const item = {
    id: 'l01-d01', type: 'dialogue',
    titolo: 'Piacere!', gloss: 'Prazer!',
    consegna: 'Ascolta tre volte.',
    battute: [
      { speaker: 'A', nome: 'Giulia', it: 'Ciao! Io sono Giulia.', pt: 'Oi! Eu sou a Giulia.' },
      { speaker: 'B', nome: 'Marco', it: 'Piacere, io sono Marco.', pt: 'Prazer, eu sou o Marco.' },
      { speaker: 'A', nome: 'Giulia', it: 'Quanti anni hai?', pt: 'Quantos anos você tem?' },
      { speaker: 'B', nome: 'Marco', it: 'Ho diciotto anni.', pt: 'Tenho dezoito anos.' },
    ],
    passate: [
      { focus: 'gist', istruzione: 'Só ouça.', inputBloccato: true },
      { focus: 'note', istruzione: 'Anote os nomes.', inputBloccato: false },
      {
        focus: 'detail', istruzione: 'Responda.', inputBloccato: false,
        domande: [
          { id: 'l01-d01-q1', domanda: 'Quantos anos tem o Marco?', risposta: 'diciotto', accettaAnche: ['18'] },
          { id: 'l01-d01-q2', domanda: 'Como se chama ela?', risposta: 'Giulia' },
        ],
      },
    ],
  };

  test('passada 1 trava input E esconde a transcrição', () => {
    // A regra que dá sentido ao exercício: se der para ler na primeira vez,
    // a escuta global não acontece e virou exercício de leitura.
    const { root } = montar(item);
    const tabs = root.querySelectorAll('.dialogo__passate button');

    assert.equal(tabs[0].getAttribute('aria-pressed'), 'true');
    assert.equal(tabs[1].disabled, true, 'as passadas 2 e 3 começam trancadas');
    assert.equal(tabs[2].disabled, true);
    assert.equal(root.querySelector('.battute').hidden, true);
    assert.equal(root.querySelector('textarea').disabled, true);
    assert.equal(root.querySelector('.domande').parentNode.hidden, true, 'as perguntas ficam ocultas');
  });

  test('ouvir o diálogo inteiro destrava a passada 2', async () => {
    const { root } = montar(item);
    root.querySelectorAll('.player button')[0].click();
    await flush(1000);   // 4 turnos, 220ms de pausa entre eles

    const tabs = root.querySelectorAll('.dialogo__passate button');
    assert.equal(tabs[1].disabled, false);
    assert.ok(tabs[1].classList.contains('btn--primary'));
  });

  test('cada turno é falado na ordem, alternando as vozes', async () => {
    const { root } = montar(item);
    const antes = synth.spoken.length;
    root.querySelectorAll('.player button')[0].click();
    await flush(1000);

    const ditos = synth.spoken.slice(antes);
    assert.equal(ditos.length, 5, '4 turnos, mas "Ciao! Io sono Giulia." quebra em 2 sentenças');
    assert.equal(ditos[0].text, 'Ciao!');
    assert.equal(ditos.at(-1).text, 'Ho diciotto anni.');
  });

  test('passada 2 libera a anotação, mas não a transcrição', async () => {
    const { root } = montar(item);
    root._parts.show(1);

    assert.equal(root.querySelector('textarea').disabled, false);
    assert.equal(root.querySelector('.battute').hidden, true, 'ainda não se lê');
    assert.match(root.querySelector('.passata').textContent, /foco: note/);
  });

  test('chegar na passada 2 já destrava a 3 — o aluno controla o ritmo', () => {
    const { root } = montar(item);
    root._parts.show(1);
    assert.equal(root.querySelectorAll('.dialogo__passate button')[2].disabled, false);
  });

  test('passada 3 mostra as perguntas e o botão de transcrição', () => {
    const { root } = montar(item);
    root._parts.show(2);

    assert.equal(root.querySelectorAll('.domande li').length, 2);
    assert.equal(root._parts.revealBtn.hidden, false);
    assert.equal(root._parts.transcript.hidden, true, 'revelar é escolha, não default');
  });

  test('o botão de transcrição alterna e cada linha tem seu 🔊', () => {
    const { root } = montar(item);
    root._parts.show(2);
    root._parts.revealBtn.click();

    assert.equal(root._parts.transcript.hidden, false);
    assert.match(root._parts.revealBtn.textContent, /Esconder/);
    assert.equal(root._parts.transcript.querySelectorAll('.battuta .speak').length, 4);

    root._parts.revealBtn.click();
    assert.equal(root._parts.transcript.hidden, true);
    assert.match(root._parts.revealBtn.textContent, /Mostrar/);
  });

  test('voltar para a passada 1 volta a esconder tudo', () => {
    const { root } = montar(item);
    root._parts.show(2);
    root._parts.revealBtn.click();
    root._parts.show(0);

    assert.equal(root._parts.transcript.hidden, true);
    assert.equal(root._parts.revealBtn.hidden, true);
    assert.match(root._parts.revealBtn.textContent, /Mostrar/);
  });

  test('cada pergunta é um item de progresso próprio', () => {
    const { mod, root } = montar(item);
    const r = mod.check(item, null, root);
    assert.deepEqual(r.results.map((x) => x.id), ['l01-d01-q1', 'l01-d01-q2']);
  });

  test('accettaAnche vale nas perguntas de detalhe', () => {
    const { mod, root } = montar(item);
    const [q1, q2] = [...root._parts.inputs.values()];
    q1.input.value = '18';
    q2.input.value = 'Giulia';

    const r = mod.check(item, null, root);
    assert.equal(r.correct, true);
    assert.equal(r.score, 1);
  });

  test('errar abre a transcrição automaticamente e mostra a resposta com áudio', () => {
    // Erro em pergunta de detalhe é o sinal para reouvir COM o texto à vista.
    const { mod, root } = montar(item);
    const [q1, q2] = [...root._parts.inputs.values()];
    q1.input.value = 'venti';
    q2.input.value = 'Giulia';

    const fb = mod.feedback(item, mod.check(item, null, root), root);

    assert.match(fb.textContent, /1 de 2 corretas/);
    assert.match(fb.textContent, /você escreveu «venti»/);
    assert.equal(fb.querySelectorAll('.item__nota .speak').length, 1, 'a resposta certa é audível');
    assert.equal(root._parts.transcript.hidden, false);
    assert.match(fb.textContent, /reouvir só o trecho/);
  });

  test('resposta em branco aparece como travessão', () => {
    const { mod, root } = montar(item);
    const fb = mod.feedback(item, mod.check(item, null, root), root);
    assert.match(fb.textContent, /«—»/);
  });

  test('reveal preenche as respostas e abre a transcrição', () => {
    const { mod, root } = montar(item);
    mod.reveal(item, root);
    assert.deepEqual([...root._parts.inputs.values()].map((i) => i.input.value), ['diciotto', 'Giulia']);
    assert.equal(root._parts.transcript.hidden, false);
  });

  test('diálogo sem passada de detail não monta perguntas', () => {
    const { root } = montar({
      ...item,
      passate: [{ focus: 'gist', istruzione: 'Só ouça.', inputBloccato: true }],
    });
    assert.equal(root._parts.inputs.size, 0);
    assert.equal(root.querySelectorAll('.domande').length, 0);
  });
});
