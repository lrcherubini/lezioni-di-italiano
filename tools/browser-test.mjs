#!/usr/bin/env node
/* ==========================================================================
   browser-test.mjs — roda a suíte de navegador.

       node tools/browser-test.mjs
       node tools/browser-test.mjs tests/browser/voci.browser.mjs
       CHROME=/caminho/do/chrome node tools/browser-test.mjs

   Por que é um runner separado de `tools/test.mjs`
   -----------------------------------------------
   1. **Custo.** Cada arquivo sobe um Chrome. A suíte de `tests/` roda em
      segundos e é a que se roda a cada salvar; esta leva dezenas de segundos
      e é a que se roda antes de commitar.
   2. **Ambiente.** Ela precisa de um Chromium instalado. `node tools/test.mjs`
      tem que continuar verde numa máquina sem navegador nenhum, senão o
      projeto passa a exigir ambiente — exatamente o que o invariante 4 evita.
   3. **Cobertura.** Estes testes dirigem o site por fora; contá-los na
      cobertura do V8 inflaria o número sem medir nada a mais.

   Daí o sufixo `.browser.mjs`: o `node --test` sem alvo descobre
   `*.test.mjs`, então estes ficam de fora por construção, e este script os
   passa explicitamente.

   Sem Chromium, cada teste se marca como **pulado** e o processo sai 0 — o
   sinal é «não verifiquei», não «está quebrado».
   ========================================================================== */

import { spawnSync } from 'node:child_process';
import { readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { browserPath } from './browser.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const DIR = join(ROOT, 'tests', 'browser');

const alvos = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const arquivos = alvos.length
  ? alvos
  : readdirSync(DIR).filter((f) => f.endsWith('.browser.mjs')).map((f) => join('tests/browser', f));

const exe = browserPath();
if (exe) {
  console.log(`navegador: ${exe}\n`);
} else {
  console.warn(
    'Nenhum Chromium encontrado — os testes de navegador serão PULADOS.\n'
    + 'Instale o Chrome ou o Edge, ou aponte CHROME=/caminho/do/executavel.\n'
  );
}

/* `--test-concurrency=1`: cada arquivo sobe o seu Chrome, e deixar três
   subirem juntos numa máquina modesta transforma espera em falha por
   timeout. Sequencial é mais lento e é o que não mente. */
const { status } = spawnSync(
  process.execPath,
  ['--test', '--test-concurrency=1', ...arquivos],
  { cwd: ROOT, stdio: 'inherit' }
);

process.exit(status ?? 1);
