#!/usr/bin/env node
/* ==========================================================================
   test.mjs — roda a suíte com cobertura e reprova abaixo do piso.

   Uso:
       node tools/test.mjs              # tudo, com cobertura
       node tools/test.mjs --sem-cobertura
       node tools/test.mjs tests/check.test.mjs

   Só stdlib: o runner é o `node --test` embutido (Node 22+), e a cobertura
   é a do V8. Isso mantém o invariante de zero dependências — não existe
   package.json nem node_modules neste projeto, nos testes tampouco.

   Este script existe só para não ter que decorar a linha de flags. Ele é
   equivalente a:
       node --test --experimental-test-coverage \
            --test-coverage-exclude='tests/**' \
            --test-coverage-lines=80 --test-coverage-branches=80 \
            --test-coverage-functions=80
   ========================================================================== */

import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

/* Piso de cobertura. Subir é bem-vindo; descer precisa de justificativa,
   porque o valor deste projeto está justamente em não ter regressão
   silenciosa entre uma aula e outra. */
const PISO = 80;

const args = process.argv.slice(2);
const semCobertura = args.includes('--sem-cobertura');
const alvos = args.filter((a) => !a.startsWith('--'));

const flags = ['--test'];

if (!semCobertura) {
  flags.push(
    '--experimental-test-coverage',
    // Fora da conta: os próprios testes e este runner. O que se mede é js/.
    '--test-coverage-exclude=tests/**',
    '--test-coverage-exclude=tools/**',
    `--test-coverage-lines=${PISO}`,
    `--test-coverage-branches=${PISO}`,
    `--test-coverage-functions=${PISO}`
  );
}

const { status } = spawnSync(process.execPath, [...flags, ...alvos], {
  cwd: ROOT,
  stdio: 'inherit',
});

if (status !== 0 && !semCobertura) {
  console.error(
    `\nSe a falha for de cobertura: o piso é ${PISO}% em linhas, ramos e funções.\n`
    + 'A tabela acima diz quais linhas ficaram sem exercitar.'
  );
}

process.exit(status ?? 1);
