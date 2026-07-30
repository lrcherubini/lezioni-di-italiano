/* Smoke de TODAS as aulas do manifest.

   Este arquivo não menciona nenhuma aula pelo nome de propósito: ele
   percorre o manifest. Chegando a aula 17 na semana que vem, ela entra
   aqui sozinha — nenhum teste precisa ser editado, e uma aula que não
   renderiza falha antes de ir para o ar.

   É a diferença entre o validate.py e isto: lá se confere que o schema
   está certo, aqui que o schema VIRA PÁGINA. */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { installDOM, installStorage } from './support/dom.mjs';
import { makeSpeechSynthesis, installUtterance, IT_VOICES } from './support/speech-stub.mjs';
import { readContent, contentFiles } from './support/fixtures.mjs';

const synth = makeSpeechSynthesis({ voices: IT_VOICES });
installUtterance();
installDOM({ speechSynthesis: synth });
installStorage();

const { renderSection, renderObiettivi, renderBlock } = await import('../js/render.js');
const { getExercise, knownTypes } = await import('../js/exercises/index.js');
const { countItems } = await import('../js/app.js');
const { indexById } = await import('../js/ripasso.js');

const manifest = readContent('manifest.json');
const aulas = manifest.lezioni.map((entry) => ({ entry, lesson: readContent(entry.file) }));

describe('manifest', () => {
  test('lista pelo menos uma aula', () => {
    assert.ok(aulas.length > 0);
  });

  test('todo lezione-NN.json de content/ está no manifest', () => {
    const noDisco = contentFiles().filter((f) => f.startsWith('lezione-'));
    const noManifest = manifest.lezioni.map((l) => l.file);
    assert.deepEqual(noDisco.sort(), [...noManifest].sort());
  });

  test('os números são únicos e ordenados', () => {
    const nums = manifest.lezioni.map((l) => l.numero);
    assert.deepEqual(nums, [...nums].sort((a, b) => a - b));
    assert.equal(new Set(nums).size, nums.length);
  });
});

for (const { entry, lesson } of aulas) {
  describe(`aula ${entry.id} — ${entry.titolo}`, () => {
    test('o manifest bate com o arquivo', () => {
      assert.equal(lesson.id, entry.id);
      assert.equal(lesson.numero, entry.numero);
    });

    test('conteggio em dia', () => {
      assert.equal(entry.conteggio, countItems(lesson),
        'rode python tools/validate.py --fix');
    });

    test('todas as seções renderizam', () => {
      for (const s of lesson.sections ?? []) {
        const nó = renderSection(s);
        assert.equal(nó.getAttribute('id'), s.id);
        assert.ok(nó.querySelector('.spiegazione'), `${s.id} sem explicação na tela`);
        assert.ok(nó.querySelector('.chip'), `${s.id} sem chip de categoria`);
      }
    });

    test('todo bloco desenha algo conhecido', () => {
      for (const s of lesson.sections ?? []) {
        for (const b of s.blocks ?? []) {
          const nó = renderBlock(b);
          assert.ok(!nó.innerHTML.includes('bloco desconhecido'),
            `${s.id}: bloco «${b.type}» não tem renderizador`);
        }
      }
    });

    test('o cabeçalho de objetivos renderiza com áudio em cada frase', () => {
      const ob = renderObiettivi(lesson.header);
      if (!lesson.header) return;
      const total = [
        ...(lesson.header.comunicazione ?? []),
        ...(lesson.header.lessico ?? []),
        ...(lesson.header.grammatica ?? []),
      ].length;
      assert.equal(ob.querySelectorAll('.speak').length, total);
    });

    test('todo exercício tem tipo registrado e monta', () => {
      for (const ex of lesson.esercizi ?? []) {
        const mod = getExercise(ex.type);
        assert.ok(mod, `${ex.id}: tipo «${ex.type}» fora do registry (${knownTypes()})`);

        const root = mod.render(ex, { submit: () => {}, lesson: entry.id });
        assert.ok(root, `${ex.id}: render devolveu vazio`);
      }
    });

    test('o diálogo monta e respeita a passada de escuta pura', () => {
      const d = lesson.dialogo;
      if (!d) return;

      const mod = getExercise('dialogue');
      const root = mod.render({ ...d, type: 'dialogue' }, { submit: () => {} });

      assert.equal(root.querySelector('.battute').hidden, true,
        'a passada 1 não pode deixar ler a transcrição');
      assert.equal(root.querySelectorAll('.battuta').length, d.battute.length);
      assert.equal(root.querySelectorAll('.battuta .speak').length, d.battute.length);
    });

    test('todo id rastreável resolve para um exercício montável', () => {
      // O que o Ripasso precisa: nenhum id gravado no progresso pode ficar
      // órfão, senão a revisão silenciosamente pula o item.
      const idx = indexById(lesson);

      for (const ex of lesson.esercizi ?? []) {
        assert.ok(idx.has(ex.id), ex.id);
        if (ex.type === 'paradigm-fill') {
          for (const row of ex.righe ?? []) {
            for (const i of row.nascondi ?? []) {
              assert.ok(idx.has(`${row.id}-c${i}`), `${row.id}-c${i}`);
            }
          }
        }
      }

      for (const p of lesson.dialogo?.passate ?? []) {
        for (const q of p.domande ?? []) assert.ok(idx.has(q.id), q.id);
      }
    });

    test('nenhum id se repete dentro da aula', () => {
      // Ids são a chave do progresso: repetir faz duas coisas diferentes
      // compartilharem histórico.
      const vistos = new Set();
      const ver = (id) => {
        assert.ok(!vistos.has(id), `id duplicado: ${id}`);
        vistos.add(id);
      };
      for (const s of lesson.sections ?? []) ver(s.id);
      for (const c of lesson.chunks ?? []) ver(c.id);
      for (const e of lesson.esercizi ?? []) ver(e.id);
      for (const p of lesson.produzione ?? []) ver(p.id);
    });
  });
}
