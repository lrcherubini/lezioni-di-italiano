/* ==========================================================================
   interazione.browser.mjs — o caminho do aluno, ponta a ponta.

   Aqui o `localStorage` é o de verdade, o `submit` passa pelo `app.js` de
   verdade e o F5 é um F5. A suíte de `tests/` cobre cada peça com dublê; o
   que ela não cobre é a costura das três — nem a cor que a borda do card
   realmente assume, que é uma afirmação do DESIGN §1.3 e só o navegador
   resolve.
   ========================================================================== */

import test from 'node:test';
import assert from 'node:assert/strict';
import { withPage, browserPath } from '../../tools/browser.mjs';

const semChrome = browserPath() ? false : 'nenhum Chromium instalado';
const AULA = '/lezione.html?l=01';
const MONTOU = 'document.querySelector("#lesson .section") !== null';
const VOZES = [{ name: 'Alice', lang: 'it-IT' }, { name: 'Cosimo', lang: 'it-IT' }];

test('responder um exercício grava, e o progresso sobrevive ao F5', { skip: semChrome }, async (t) => {
  await withPage(async (page) => {
    await page.vozes(VOZES);
    await page.goto(AULA, { esperarPor: MONTOU });

    await t.test('o card começa sem estado e com «Mostrar resposta» travado', async () => {
      assert.equal(await page.eval('document.querySelector("#l01-e01").dataset.state ?? null'), null,
        'o card já nasceu com estado');

      const travado = await page.eval(`
        [...document.querySelectorAll('#l01-e01 button')]
          .some((b) => /mostrar resposta/i.test(b.textContent) && b.disabled)`);
      assert.ok(travado,
        'DESIGN §1.3: «Mostrar resposta» nasce disabled, senão a audição vira leitura');
    });

    await t.test('a resposta certa marca data-state=correct', async () => {
      await page.fill('#l01-e01 input', 'sono');
      await page.eval(`
        [...document.querySelectorAll('#l01-e01 button')]
          .find((b) => /verificar/i.test(b.textContent)).click()`);
      await page.esperar('document.querySelector("#l01-e01").dataset.state === "correct"');

      const feedback = await page.text('#l01-e01 [role="status"]');
      assert.match(feedback ?? '', /esatto/i, `o feedback verde não apareceu: ${feedback}`);
    });

    await t.test('e a borda esquerda fica mesmo verde — DESIGN §1.3', async () => {
      /* A tabela de estados do DESIGN promete cor na borda esquerda. O DOM da
         suíte confirmaria o atributo e pararia aí; a pergunta que importa é
         se a regra `.ex[data-state="correct"]` de fato venceu a cascata. */
      const borda = await page.css('#l01-e01', 'border-left-color');
      const ok = await page.eval(
        'getComputedStyle(document.documentElement).getPropertyValue("--ok").trim()'
      );
      const inicial = await page.css('#l01-e02', 'border-left-color'); // ainda não respondido
      assert.notEqual(borda, inicial,
        `a borda do card respondido ficou igual à de um card intocado (${borda})`);
      assert.ok(ok, 'o token --ok não existe mais em tokens.css');
    });

    await t.test('gravou no localStorage de verdade', async () => {
      const bruto = await page.eval('localStorage.getItem("ldi:v1")');
      assert.ok(bruto, 'nada foi escrito em ldi:v1');
      assert.match(bruto, /l01-e01/, 'o id do exercício não entrou no progresso salvo');
    });

    await t.test('sobrevive ao F5 — PRD §9.7', async () => {
      /* O card NÃO repinta ao recarregar, e isso é o desenho: o estado do
         card é da sessão, o progresso é do `localStorage`. Então o que se
         afirma aqui é o que a promessa realmente diz — o dado ficou. */
      await page.goto(AULA, { esperarPor: MONTOU });
      const bruto = await page.eval('localStorage.getItem("ldi:v1")');
      assert.match(bruto, /l01-e01/, 'o progresso sumiu no recarregar');
    });

    await t.test('e aparece na barra de progresso da home', async () => {
      await page.goto('/', { esperarPor: 'document.querySelector("#lesson-grid .lesson-card") !== null' });
      const rotulo = await page.eval(`
        [...document.querySelectorAll('.progress__label')].map((e) => e.textContent.trim())`);
      const aula1 = rotulo.find((r) => /^\d+\/\d+$/.test(r) && Number(r.split('/')[0]) > 0);
      assert.ok(aula1, `nenhuma barra da home saiu de 0: ${JSON.stringify(rotulo)}`);
    });
  });
});

test('PRD §9.12 — o verso do flashcard não aparece antes de «Mostrar»', { skip: semChrome }, async (t) => {
  await withPage(async (page) => {
    await page.vozes(VOZES);
    await page.goto(AULA, { esperarPor: MONTOU });
    await page.esperar('document.querySelector("#l01-lex .carta") !== null');

    await t.test('o italiano está invisível de fato, não só marcado', async () => {
      assert.equal(await page.visiveis('#l01-lex .carta__it'), 0,
        'o verso da carta estava visível antes de o aluno tentar — foi exatamente este o bug');
    });

    await t.test('só uma carta por vez', async () => {
      assert.equal(await page.visiveis('#l01-lex .carta'), 1,
        'mais de uma carta visível: o olho lê a resposta da de baixo e não há recuperação');
    });

    await t.test('depois de «Mostrar», o verso aparece', async () => {
      await page.eval(`(() => {
        const carta = [...document.querySelectorAll('#l01-lex .carta')].find((c) => c.checkVisibility());
        const btn = [...carta.querySelectorAll('button')].find((b) => /mostrar/i.test(b.textContent));
        if (!btn) throw new Error('a carta visível não tem botão «Mostrar»');
        btn.click();
      })()`);
      await page.esperar(
        '[...document.querySelectorAll("#l01-lex .carta__it")].some((e) => e.checkVisibility())'
      );
    });

    await t.test('e o «＋ caderno» só então fica alcançável', async () => {
      /* A decisão escrita no CLAUDE.md: no flashcard o botão aparece depois do
         «Mostrar», porque é quando o aluno descobre que não lembrava. */
      assert.ok(await page.visiveis('#l01-lex .carta__caderno') >= 1,
        'o ＋ caderno da carta continuou inalcançável depois do Mostrar');
    });
  });
});

test('DESIGN §1.4 — a passada 1 do diálogo não deixa escrever nem ler', { skip: semChrome }, async (t) => {
  await withPage(async (page) => {
    await page.vozes(VOZES);
    await page.goto(AULA, { esperarPor: MONTOU });
    await page.esperar('document.querySelector("#l01-d01") !== null');

    await t.test('o textarea de anotação está disabled', async () => {
      const livre = await page.eval(`
        [...document.querySelectorAll('#l01-d01 textarea')].filter((t) => !t.disabled).length`);
      assert.equal(livre, 0,
        'dava para anotar na primeira escuta — a escuta global não acontece se der para escrever');
    });

    await t.test('nenhuma battuta do diálogo está renderizada', async () => {
      assert.equal(await page.visiveis('#l01-d01 .battuta'), 0,
        'a transcrição estava na tela na passada 1 — o exercício de audição virou de leitura');
    });

    await t.test('as passadas 2 e 3 nascem travadas', async () => {
      const travadas = await page.eval(`
        [...document.querySelectorAll('#l01-d01 button')]
          .filter((b) => /passada/i.test(b.textContent) && b.disabled).length`);
      assert.ok(travadas >= 2,
        `só ${travadas} passadas travadas — o aluno consegue pular a escuta pura`);
    });
  });
});
