/* ==========================================================================
   meta.test.mjs — toda página servida tem cartão de link.

   Por que isto é teste e não «lembrar de fazer»
   ---------------------------------------------
   O site foi compartilhado com uma pessoa antes de ninguém reparar que quatro
   das cinco páginas não tinham `description` nem Open Graph. O sintoma não
   aparece no site: aparece na conversa de quem recebeu o link, como um
   retângulo vazio. Nenhuma suíte olhava para o `<head>`.

   Como `css.test.mjs`, este lê os arquivos como **texto**. É pouco, e é
   suficiente: a pergunta aqui é «a tag está lá», não «o navegador concorda».
   ========================================================================== */

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

/* Lista explícita, não glob. Um glob varreria também `diagnostico-voz.html`,
   que é ferramenta local e gitignorada — e, pior, uma página nova entraria
   calada. Assim, acrescentar página é um ato deliberado em dois lugares.
   O espelho é PAGINAS em `tests/browser/pagine.browser.mjs`. */
const PAGINAS = [
  'index.html',
  'lezione.html',
  'ripasso.html',
  'notebook.html',
  'frasi.html',
];

/** Extrai o content de uma meta, por `name` ou por `property`. */
function meta(html, chave) {
  const re = new RegExp(
    `<meta\\s+(?:name|property)=["']${chave}["']\\s+content=["']([^"']+)["']`, 'i'
  );
  return html.match(re)?.[1] ?? null;
}

for (const pagina of PAGINAS) {
  const html = readFileSync(join(ROOT, pagina), 'utf8');

  test(`${pagina} — o essencial do <head>`, async (t) => {
    await t.test('declara a língua da prosa', () => {
      assert.match(html, /<html lang="pt-BR">/,
        'a prosa é portuguesa; sem lang o leitor de tela e o buscador erram o idioma');
    });

    await t.test('tem título não vazio', () => {
      const titulo = html.match(/<title>([^<]+)<\/title>/)?.[1];
      assert.ok(titulo && titulo.trim().length > 5, `título ausente ou curto: ${titulo}`);
    });

    await t.test('tem description com conteúdo real', () => {
      const d = meta(html, 'description');
      assert.ok(d, 'sem <meta name="description"> — o cartão de link nasce vazio');
      /* 50 é o piso do que descreve alguma coisa; 200 é onde os buscadores
         cortam. Fora da faixa, a descrição não está fazendo o trabalho. */
      assert.ok(d.length >= 50 && d.length <= 200,
        `description com ${d.length} caracteres, fora da faixa 50–200: «${d}»`);
    });

    await t.test('tem o mínimo de Open Graph', () => {
      for (const chave of ['og:type', 'og:site_name', 'og:locale', 'og:title', 'og:description']) {
        assert.ok(meta(html, chave), `falta ${chave}`);
      }
      assert.equal(meta(html, 'og:locale'), 'pt_BR');
      assert.equal(meta(html, 'og:site_name'), 'Lezioni di italiano');
      assert.equal(meta(html, 'twitter:card'), 'summary');
    });

    await t.test('não vaza URL absoluta com o handle do dono do repositório', () => {
      /* Invariante 2: nenhum arquivo versionado cita nome de pessoa. A URL
         padrão do GitHub Pages embute o handle, então `og:url` e `canonical`
         só entram quando houver endereço de publicação decidido. */
      assert.equal(meta(html, 'og:url'), null,
        'og:url exige URL absoluta; ver PRD §13 antes de acrescentar');
      assert.doesNotMatch(html, /github\.io/i,
        'endereço do GitHub Pages embute o handle do dono — não entra em arquivo versionado');
    });
  });
}

test('as páginas com áudio anunciam o mesmo cartão de site', () => {
  const nomes = PAGINAS.map((p) => meta(readFileSync(join(ROOT, p), 'utf8'), 'og:site_name'));
  assert.equal(new Set(nomes).size, 1,
    `o og:site_name divergiu entre páginas: ${JSON.stringify(nomes)}`);
});
