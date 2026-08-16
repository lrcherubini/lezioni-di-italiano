/* ==========================================================================
   pagine.browser.mjs — os invariantes que só um navegador de verdade afirma.

   Regra deste arquivo: **nada aqui pode ser afirmável pelo DOM da suíte.**
   Se um teste caberia em `tests/*.test.mjs`, ele pertence lá — é mais rápido,
   roda em qualquer máquina e não depende de Chrome instalado. Aqui ficam só
   as afirmações que precisam de cascata de CSS, `@media` e layout computado.
   ========================================================================== */

import test from 'node:test';
import assert from 'node:assert/strict';
import { withPage, browserPath } from '../../tools/browser.mjs';

/* As cinco páginas do site. Cada uma com o seletor que prova que ela montou —
   `document.readyState` sozinho não basta, porque o conteúdo chega por
   `fetch()` bem depois do `load`. */
const PAGINAS = [
  ['/', '#lesson-grid .lesson-card'],
  ['/lezione.html?l=01', '#lesson .section'],
  ['/ripasso.html', 'main .stage, main .banner, main .vuoto'],
  ['/notebook.html', 'main'],
  ['/frasi.html', 'main .funzioni, main .stage'],
];

const semChrome = browserPath() ? false : 'nenhum Chromium instalado';

test('as cinco páginas no navegador de verdade', { skip: semChrome }, async (t) => {
  await withPage(async (page) => {
    /* Vozes fixadas de propósito: a lista real do Chrome headless é
       NÃO-DETERMINÍSTICA — em execuções seguidas na mesma máquina apareceram
       ora 2 vozes (Microsoft, só pt-BR), ora 19 (Google, com uma it-IT),
       porque as vozes de rede chegam quando chegam. Testar contra a lista
       ambiente é assinar teste intermitente. Aqui o site vê sempre duas
       italianas; os outros degraus têm arquivo próprio. */
    await page.vozes([
      { name: 'Alice', lang: 'it-IT' },
      { name: 'Cosimo', lang: 'it-IT' },
      { name: 'Maria', lang: 'pt-BR' },
    ]);

    for (const [url, montou] of PAGINAS) {
      await t.test(`${url} — sobe sem erro de console`, async () => {
        await page.goto(url, { esperarPor: `document.querySelector(${JSON.stringify(montou)}) !== null` });
        assert.deepEqual(page.erros(), [],
          `a página escreveu no console.error — o critério PRD §9.2 é «sem erro no console»`);
      });

      await t.test(`${url} — todo [hidden] está mesmo invisível`, async () => {
        /* O defeito que motivou este arquivo: o verso do flashcard nasceu
           visível com `hidden: true` no JS e `display: flex` numa classe do
           CSS, e os 599 testes de comportamento passaram. `css.test.mjs`
           cobre isso lendo a folha como texto; aqui o navegador responde. */
        const visiveis = await page.eval(`
          [...document.querySelectorAll('[hidden]')]
            .filter((e) => getComputedStyle(e).display !== 'none')
            .map((e) => e.tagName + '.' + String(e.className || '').split(' ')[0])`);
        assert.deepEqual(visiveis, [],
          'elemento marcado [hidden] continuou com display — alguma classe venceu a regra global');
      });

      await t.test(`${url} — NF7: o corpo não rola na horizontal a 360px`, async () => {
        await page.viewport(360, 740);
        await page.goto(url, { esperarPor: `document.querySelector(${JSON.stringify(montou)}) !== null` });
        const [scroll, client] = await page.eval(
          '[document.documentElement.scrollWidth, document.documentElement.clientWidth]'
        );
        // Tolerância de 1px: arredondamento de subpixel não é vazamento.
        assert.ok(scroll <= client + 1,
          `a página rolou ${scroll - client}px na horizontal em tela de 360px`);
        await page.viewport(1280, 900);
      });
    }
  });
});

test('NF8 — tema claro e escuro, e o toggle vencendo nos dois sentidos', { skip: semChrome }, async (t) => {
  await withPage(async (page) => {
    const luminancia = (rgb) => {
      const [r, g, b] = rgb.match(/\d+/g).map(Number);
      return 0.2126 * r + 0.7152 * g + 0.0722 * b;
    };

    await t.test('sistema escuro → fundo escuro', async () => {
      await page.tema('dark');
      await page.goto('/lezione.html?l=01', { esperarPor: 'document.querySelector("#lesson .section") !== null' });
      const bg = await page.css('body', 'background-color');
      assert.ok(luminancia(bg) < 90, `no dark do sistema o fundo veio claro: ${bg}`);
    });

    await t.test('sistema claro → fundo claro', async () => {
      await page.tema('light');
      await page.goto('/lezione.html?l=01', { esperarPor: 'document.querySelector("#lesson .section") !== null' });
      const bg = await page.css('body', 'background-color');
      assert.ok(luminancia(bg) > 200, `no light do sistema o fundo veio escuro: ${bg}`);
    });

    /* O DESIGN §2.7 diz que cada bloco de tema aparece duas vezes justamente
       para o toggle vencer os dois sentidos. Forçar claro DENTRO do dark do
       sistema é a metade que um `@media` sozinho erraria. */
    await t.test('forçar claro dentro do dark do sistema', async () => {
      await page.tema('dark');
      await page.goto('/lezione.html?l=01', { esperarPor: 'document.querySelector("#lesson .section") !== null' });
      await page.eval('document.documentElement.dataset.theme = "light"');
      const bg = await page.css('body', 'background-color');
      assert.ok(luminancia(bg) > 200, `data-theme="light" não venceu o dark do sistema: ${bg}`);
    });

    await t.test('forçar escuro dentro do claro do sistema', async () => {
      await page.tema('light');
      await page.goto('/lezione.html?l=01', { esperarPor: 'document.querySelector("#lesson .section") !== null' });
      await page.eval('document.documentElement.dataset.theme = "dark"');
      const bg = await page.css('body', 'background-color');
      assert.ok(luminancia(bg) < 90, `data-theme="dark" não venceu o claro do sistema: ${bg}`);
    });
  });
});

test('DESIGN §1.8 — impressão esconde a chrome e revela a transcrição', { skip: semChrome }, async (t) => {
  await withPage(async (page) => {
    await page.vozes([{ name: 'Alice', lang: 'it-IT' }, { name: 'Cosimo', lang: 'it-IT' }]);
    await page.goto('/lezione.html?l=01', { esperarPor: 'document.querySelector("#lesson .section") !== null' });

    await t.test('na tela, a trilha aparece', async () => {
      assert.notEqual(await page.css('.rail', 'display'), 'none');
    });

    await t.test('na tela, a transcrição do diálogo está oculta', async () => {
      assert.equal(await page.visiveis('#l01-d01 .battuta'), 0);
    });

    await t.test('no papel, a chrome some', async () => {
      await page.midia('print');
      for (const sel of ['.rail', '.site-header', '.toolbar']) {
        assert.equal(await page.css(sel, 'display'), 'none',
          `${sel} continuou impresso — DESIGN §1.8 diz que player, trilha e botões desaparecem`);
      }
    });

    await t.test('e a transcrição é revelada, para o material servir em papel', async () => {
      /* A única reexibição legítima de `[hidden]`: `.battute[hidden]` vence a
         regra global por especificidade, e `css.test.mjs` guarda que essa é a
         exceção. Aqui se confere que ela de fato funciona. */
      assert.equal(await page.css('#l01-d01 .battute', 'display'), 'block',
        'a transcrição não foi revelada na impressão — imprimir o diálogo daria uma página muda');
      await page.midia('');
    });
  });
});
