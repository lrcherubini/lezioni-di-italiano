/* A folha de estilo, lida como texto.

   Por que este arquivo existe: o DOM da suíte guarda `hidden` como
   propriedade e NUNCA interpreta CSS. Isso deixa um ponto cego inteiro —
   uma regra de classe com `display` derrota o `[hidden]` do user-agent e
   nenhum teste de comportamento percebe. Foi exatamente o que aconteceu com
   o verso do flashcard: `hidden: true` no JS, `.carta__it { display:flex }`
   no CSS, e a resposta aparecendo antes de o aluno tentar lembrar. Os 571
   testes passavam.

   Não dá para consertar isso com um DOM melhor sem trazer jsdom + um motor
   de CSS, o que o invariante 4 proíbe. Dá para consertar com uma checagem
   textual da própria folha, que custa nada e trava o remédio no lugar.

   A regra deste arquivo: afirmar só o que é INVARIANTE de segurança, nunca
   estética. Cor, espaçamento e tipografia mudam o tempo todo e não merecem
   teste; «esconder tem que esconder» não muda nunca. */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const css = readFileSync(fileURLToPath(new URL('../css/style.css', import.meta.url)), 'utf8');

/** Remove os comentários antes de procurar regra: senão o texto que EXPLICA
 *  a regra passaria por ela, e o teste ficaria verde por causa da prosa. */
const regras = css.replace(/\/\*[\s\S]*?\*\//g, '');

describe('[hidden] esconde de verdade', () => {
  test('existe a regra global, e ela é !important', () => {
    assert.match(regras, /\[hidden\]\s*\{[^}]*display:\s*none\s*!important/,
      'sem `[hidden] { display: none !important }` qualquer classe com '
      + '`display` reexibe conteúdo escondido pelo JS, em silêncio');
  });

  test('a regra vem antes de todo o resto', () => {
    // `!important` empata com `!important`, e no empate ganha quem vem
    // depois. Uma regra global lá embaixo protegeria menos do que parece.
    const global = regras.search(/\[hidden\]\s*\{[^}]*display:\s*none\s*!important/);
    const primeiroDisplay = regras.search(/\.\S[^{}]*\{[^}]*display:/);
    assert.ok(global >= 0 && global < primeiroDisplay,
      'a regra global de [hidden] tem que vir antes da primeira classe com display');
  });

  test('ninguém reexibe [hidden] sem !important — seria empate perdido', () => {
    // Reexibir é legítimo (o @media print mostra a transcrição do diálogo),
    // mas só vence a global se também for !important.
    const reexibe = [...regras.matchAll(/[^{}]*\[hidden\][^{}]*\{([^}]*)\}/g)]
      .filter(([, corpo]) => /display:\s*(?!none)/.test(corpo))
      .filter(([, corpo]) => !/!important/.test(corpo));
    assert.deepEqual(reexibe.map((m) => m[0].trim()), [],
      'estas regras tentam reexibir [hidden] e perdem para a global');
  });
});
