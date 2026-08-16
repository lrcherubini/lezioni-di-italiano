/* ==========================================================================
   voci.browser.mjs — os três degraus de voz do DESIGN §1.5, num navegador.

   Por que stubar a lista em vez de usar a da máquina: ela é
   **não-determinística**. Em execuções seguidas do mesmo Chrome headless, no
   mesmo Windows, a página viu ora 2 vozes (Microsoft, ambas pt-BR, nenhuma
   italiana), ora 19 (Google, com exatamente uma it-IT) — as vozes de rede
   chegam quando chegam, e `voiceschanged` às vezes nem dispara. Um teste
   apoiado nisso seria intermitente por construção.

   `page.vozes()` injeta a lista **antes** de qualquer script do site rodar,
   então os três degraus ficam determinísticos — inclusive o de duas vozes
   italianas, que esta máquina nunca conseguiria oferecer sozinha.
   ========================================================================== */

import test from 'node:test';
import assert from 'node:assert/strict';
import { withPage, browserPath } from '../../tools/browser.mjs';

const semChrome = browserPath() ? false : 'nenhum Chromium instalado';
const AULA = '/lezione.html?l=01';
const MONTOU = 'document.querySelector("#lesson .section") !== null';

/** O que `speech.status()` enxerga depois de as vozes assentarem. */
const STATUS = `(async () => {
  const m = await import('/js/speech.js');
  return await m.voicesReady();
})()`;

test('NF5 — zero voz italiana entra em modo transcrição, sem tela branca', { skip: semChrome }, async (t) => {
  await withPage(async (page) => {
    await page.vozes([
      { name: 'Google US English', lang: 'en-US' },
      { name: 'Microsoft Maria', lang: 'pt-BR' },
    ]);
    await page.goto(AULA, { esperarPor: MONTOU });

    await t.test('o banner explica o que houve e o que fazer', async () => {
      const banner = await page.text('[role="alert"]');
      assert.ok(banner, 'nenhum banner apareceu sem voz italiana');
      assert.match(banner, /voz italiana/i);
      assert.match(banner, /instale|instalar/i, 'o banner não diz o que fazer a respeito');
    });

    await t.test('o speech.js se declara degradado', async () => {
      const s = await page.eval(STATUS);
      assert.equal(s.degraded, true);
      assert.equal(s.voiceCount, 0);
    });

    await t.test('e a aula segue inteira e interativa', async () => {
      /* Números exatos de propósito: são os que o DESIGN §1.6 afirma. A versão
         anterior daquele parágrafo dizia «10 seções e 15 cards» e ficou anos
         errada porque nada a conferia. Aula 1 é aula fechada — se estes
         números mudarem, é mudança real e o parágrafo tem que mudar junto. */
      assert.equal(await page.count('.section'), 11, 'seções');
      assert.equal(await page.count('.ex'), 29, 'cards de exercício');
      assert.equal(await page.count('input, textarea'), 81, 'campos');

      const verificar = await page.eval(
        '[...document.querySelectorAll("button")].filter((b) => /verificar/i.test(b.textContent)).length'
      );
      assert.equal(verificar, 28, 'botões Verificar');
      assert.deepEqual(page.erros(), [], 'o modo degradado escreveu erro no console');
    });
  });
});

test('DESIGN §1.5 — uma voz só: mesma voz, pitch diferente por falante', { skip: semChrome }, async (t) => {
  await withPage(async (page) => {
    await page.vozes([{ name: 'Google italiano', lang: 'it-IT' }]);
    await page.goto(AULA, { esperarPor: MONTOU });

    await t.test('não é degradado — uma voz basta', async () => {
      const s = await page.eval(STATUS);
      assert.equal(s.degraded, false);
      assert.equal(s.voiceCount, 1);
    });

    await t.test('os dois falantes caem na mesma voz', async () => {
      const [a, b] = await page.eval(`(async () => {
        const m = await import('/js/speech.js');
        await m.voicesReady();
        return [m.voiceFor('A')?.name, m.voiceFor('B')?.name];
      })()`);
      assert.equal(a, 'Google italiano');
      assert.equal(b, 'Google italiano',
        'com uma voz só, o falante B tem que reusar a mesma — quem diferencia é o pitch');
    });
  });
});

test('DESIGN §1.5 — duas vozes: uma distinta por falante', { skip: semChrome }, async (t) => {
  await withPage(async (page) => {
    await page.vozes([
      { name: 'Alice', lang: 'it-IT' },
      { name: 'Cosimo', lang: 'it-IT' },
    ]);
    await page.goto(AULA, { esperarPor: MONTOU });

    await t.test('nenhum banner, e duas vozes contadas', async () => {
      const s = await page.eval(STATUS);
      assert.equal(s.degraded, false);
      assert.equal(s.voiceCount, 2);
      assert.equal(await page.text('[role="alert"]'), null, 'apareceu banner com duas vozes italianas');
    });

    await t.test('A e B recebem vozes diferentes', async () => {
      const [a, b] = await page.eval(`(async () => {
        const m = await import('/js/speech.js');
        await m.voicesReady();
        return [m.voiceFor('A')?.name, m.voiceFor('B')?.name];
      })()`);
      assert.equal(a, 'Alice');
      assert.equal(b, 'Cosimo');
      assert.notEqual(a, b, 'os dois falantes do diálogo saíram na mesma voz');
    });
  });
});
