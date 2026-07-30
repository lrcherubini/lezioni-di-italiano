/* ==========================================================================
   store.js — persistência local, versionada.
   Sem backend, sem conta. Tudo vive no localStorage do navegador.

   Nenhum módulo de exercício fala com o localStorage direto: app.js chama
   record() e os exercícios só devolvem resultado. Isso mantém o schema
   de progresso num lugar só.
   ========================================================================== */

const KEY = 'ldi:v1';
const VERSION = 1;

/* IDs de item são IMUTÁVEIS: são a chave do progresso. Renomear um id em
   content/*.json apaga o histórico daquele item. Ver CLAUDE.md. */

function emptyState() {
  return {
    version: VERSION,
    updatedAt: new Date().toISOString(),
    lessons: {},
    notebook: [],
    settings: { rate: 1.0, voiceURI: null, glossVisible: true, theme: null },
  };
}

/* --- Migração -----------------------------------------------------------
   Contrato: nunca apagar a chave antiga na mesma release que introduz a
   nova. migrate() recebe o dado como está e devolve na versão corrente. */

function migrate(data) {
  if (!data || typeof data !== 'object') return emptyState();

  // v0 (sem campo version) → v1
  if (!data.version) {
    data.version = 1;
    data.notebook ??= [];
    data.settings ??= emptyState().settings;
  }

  // Futuras migrações entram aqui, em cadeia:
  // if (data.version === 1) { ...; data.version = 2; }

  return data;
}

let cache = null;

function load() {
  if (cache) return cache;
  try {
    const raw = localStorage.getItem(KEY);
    cache = raw ? migrate(JSON.parse(raw)) : emptyState();
  } catch {
    // localStorage bloqueado (modo privado, cookies off) ou JSON corrompido.
    // O site precisa continuar funcionando, só sem persistir.
    cache = emptyState();
  }
  return cache;
}

function persist() {
  if (!cache) return;
  cache.updatedAt = new Date().toISOString();
  try {
    localStorage.setItem(KEY, JSON.stringify(cache));
  } catch {
    /* cota estourada ou storage indisponível — segue em memória */
  }
}

/* --- Aulas e itens ------------------------------------------------------- */

function lessonBucket(lessonId) {
  const s = load();
  s.lessons[lessonId] ??= { visitedAt: null, sectionsSeen: [], bilancio: [], items: {} };
  return s.lessons[lessonId];
}

export function markVisited(lessonId) {
  const b = lessonBucket(lessonId);
  b.visitedAt = new Date().toISOString();
  persist();
}

/**
 * Registra o resultado de uma tentativa e reagenda a revisão.
 * @param {string} lessonId
 * @param {string} itemId
 * @param {{correct: boolean, score?: number}} result
 */
export function record(lessonId, itemId, result) {
  const b = lessonBucket(lessonId);
  // Os defaults entram por spread, não por `??` no objeto inteiro: um item
  // vindo de export antigo (ou de arquivo editado à mão) pode existir sem
  // `ease`/`interval`, e aí o agendamento produzia NaN → data inválida →
  // toISOString() lançava e o submit do exercício morria junto.
  const prev = {
    attempts: 0, correct: 0, ease: 2.5, interval: 0, dueAt: null, lastAt: null,
    ...(b.items[itemId] ?? {}),
  };

  prev.attempts += 1;
  if (result.correct) prev.correct += 1;
  prev.lastAt = new Date().toISOString();

  schedule(prev, result);

  b.items[itemId] = prev;
  persist();
  return prev;
}

/* SRS leve, no espírito do SM-2 mas sem a nota de 0–5: usamos só
   acertou/errou e o score parcial que o diff devolve. Suficiente para
   decidir "revisar amanhã" contra "revisar em duas semanas". */

/* Teto do intervalo, em dias. Sem ele o intervalo cresce por fator ~3 a
   cada acerto e, por volta do 23º acerto seguido, ultrapassa o range de
   Date — `setDate()` gera data inválida e `toISOString()` LANÇA, derrubando
   o submit inteiro do exercício. Um ano também é o limite pedagógico útil:
   revisão mais espaçada que isso, num curso de A1, é o mesmo que nunca. */
const MAX_INTERVAL_DAYS = 365;

function schedule(item, result) {
  const score = result.score ?? (result.correct ? 1 : 0);

  if (score < 0.6) {
    item.ease = Math.max(1.3, item.ease - 0.2);
    item.interval = 1;
  } else {
    item.ease = Math.min(3.0, item.ease + (score >= 0.95 ? 0.1 : 0));
    item.interval = Math.min(
      MAX_INTERVAL_DAYS,
      item.interval === 0 ? 1 : Math.round(item.interval * item.ease)
    );
  }

  const due = new Date();
  due.setDate(due.getDate() + item.interval);
  item.dueAt = due.toISOString();
}

export function getItem(lessonId, itemId) {
  return lessonBucket(lessonId).items[itemId] ?? null;
}

/** Id da última aula visitada, ou null. Alimenta o card «Continuar» da
 *  home — com 40 aulas, lembrar onde parou deixa de ser trivial. */
export function lastVisited() {
  const s = load();
  let melhor = null;
  let quando = '';
  for (const [id, b] of Object.entries(s.lessons)) {
    if (b.visitedAt && b.visitedAt > quando) {
      quando = b.visitedAt;
      melhor = id;
    }
  }
  return melhor;
}

export function lessonProgress(lessonId, totalItems) {
  const b = lessonBucket(lessonId);
  const ids = Object.keys(b.items);
  const done = ids.filter((id) => b.items[id].correct > 0).length;
  return {
    visited: Boolean(b.visitedAt),
    attempted: ids.length,
    done,
    total: totalItems,
    pct: totalItems ? Math.round((done / totalItems) * 100) : 0,
  };
}

/** Quantos itens estão vencidos. Separado de dueItems() porque a home só
 *  precisa do número, e ela não pode pagar por ordenação nem por fetch. */
export function dueCount() {
  const s = load();
  const now = Date.now();
  let n = 0;
  for (const bucket of Object.values(s.lessons)) {
    for (const it of Object.values(bucket.items ?? {})) {
      if (it.dueAt && new Date(it.dueAt).getTime() <= now) n += 1;
    }
  }
  return n;
}

/** Itens com revisão vencida, ordenados pelos mais errados primeiro.
 *  Alimenta o Ripasso. */
export function dueItems(limit = 20) {
  const s = load();
  const now = Date.now();
  const out = [];
  for (const [lessonId, bucket] of Object.entries(s.lessons)) {
    for (const [itemId, it] of Object.entries(bucket.items ?? {})) {
      if (it.dueAt && new Date(it.dueAt).getTime() <= now) {
        const errRate = it.attempts ? 1 - it.correct / it.attempts : 1;
        out.push({ lessonId, itemId, errRate, dueAt: it.dueAt });
      }
    }
  }
  out.sort((a, b) => b.errRate - a.errRate || new Date(a.dueAt) - new Date(b.dueAt));
  return out.slice(0, limit);
}

/* --- Bilancio (autoavaliação) -------------------------------------------- */

export function setBilancio(lessonId, index, checked) {
  const b = lessonBucket(lessonId);
  b.bilancio ??= [];
  if (checked) {
    if (!b.bilancio.includes(index)) b.bilancio.push(index);
  } else {
    b.bilancio = b.bilancio.filter((i) => i !== index);
  }
  persist();
}

export function getBilancio(lessonId) {
  return lessonBucket(lessonId).bilancio ?? [];
}

/* --- Lexical Notebook ---------------------------------------------------- */

export function addToNotebook(entry) {
  const s = load();
  if (s.notebook.some((e) => e.id === entry.id)) return false;
  s.notebook.push({ ...entry, myExample: entry.myExample ?? '', createdAt: new Date().toISOString() });
  persist();
  return true;
}

export function notebook() {
  return load().notebook;
}

export function inNotebook(id) {
  return load().notebook.some((e) => e.id === id);
}

/* --- Preferências -------------------------------------------------------- */

export function settings() {
  return load().settings;
}

export function setSetting(key, value) {
  const s = load();
  s.settings[key] = value;
  persist();
}

/* --- Exportar / importar ------------------------------------------------- */

export function exportJSON() {
  return JSON.stringify(load(), null, 2);
}

export function download() {
  const blob = new Blob([exportJSON()], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  const stamp = new Date().toISOString().slice(0, 10);
  a.href = url;
  a.download = `lezioni-di-italiano-progresso-${stamp}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

/** Importa um export anterior. Rejeita JSON que não pareça nosso. */
export function importJSON(text) {
  const parsed = JSON.parse(text);
  if (!parsed || typeof parsed !== 'object' || !('lessons' in parsed)) {
    throw new Error('Arquivo não parece ser um export de progresso.');
  }
  cache = migrate(parsed);
  persist();
  return true;
}

export function reset() {
  cache = emptyState();
  persist();
}
