/* ==========================================================================
   fixtures.mjs — conteúdo de verdade para os testes.

   Os testes de app.js carregam os JSONs REAIS de content/, não mocks. É de
   propósito: assim uma aula nova mal formada quebra o teste, e o loop de
   autoria ganha uma rede de segurança que o validate.py não dá (ele checa
   o schema; isto checa que o schema renderiza).
   ========================================================================== */

import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

export const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

export function readContent(name) {
  return JSON.parse(readFileSync(join(ROOT, 'content', name), 'utf-8'));
}

export function contentFiles() {
  return readdirSync(join(ROOT, 'content')).filter((f) => f.endsWith('.json'));
}

export function readText(...parts) {
  return readFileSync(join(ROOT, ...parts), 'utf-8');
}

/** fetch() que serve os arquivos reais do repositório. */
export function installFetch({ fail = null } = {}) {
  const calls = [];
  globalThis.fetch = async (path) => {
    calls.push(path);
    if (fail && path.includes(fail)) {
      return { ok: false, status: 404, json: async () => ({}) };
    }
    try {
      const body = readFileSync(join(ROOT, path), 'utf-8');
      return { ok: true, status: 200, json: async () => JSON.parse(body) };
    } catch {
      return { ok: false, status: 404, json: async () => ({}) };
    }
  };
  return calls;
}

/** Esqueleto da home. Os ids têm que casar com index.html — há um teste
 *  que confere isso, para o esqueleto não sair de sincronia com a página. */
export function homeSkeleton(document) {
  const mk = (tag, attrs) => {
    const n = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v);
    return n;
  };
  document.body.append(
    mk('div', { id: 'audio-status' }),
    mk('button', { 'data-action': 'theme' }),
    mk('button', { 'data-action': 'export' }),
    mk('button', { 'data-action': 'import' }),
    mk('div', { id: 'home-topo' }),
    mk('div', { id: 'lesson-grid' })
  );
}

/** Esqueleto da página de aula. Idem, casa com lezione.html. */
export function lessonSkeleton(document) {
  const mk = (tag, attrs) => {
    const n = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v);
    return n;
  };
  document.body.append(
    mk('div', { id: 'audio-status' }),
    mk('button', { 'data-action': 'theme' }),
    mk('main', { id: 'lesson' })
  );
}

/** Deixa a fila de microtasks/timers drenar. */
export function flush(ms = 0) {
  return new Promise((r) => setTimeout(r, ms));
}
