/* ==========================================================================
   check.js — correção de texto livre em italiano.

   Princípio: dar crédito parcial em vez de "errado" seco. Um aluno que
   escreve "perche" em vez de "perché" acertou a palavra e errou o acento —
   e merece ouvir exatamente isso, não um X vermelho. Essa distinção é a
   razão de existir deste arquivo.
   ========================================================================== */

/** Apóstrofos tipográficos → apóstrofo reto. Colar de PDF traz os curvos. */
const APOSTROPHES = /[‘’ʼ´`]/g;

/** Pontuação a descartar. O apóstrofo NÃO entra aqui: em italiano ele é
 *  informação gramatical (l'amico, un'amica, vent'anni), não decoração. */
const PUNCT = /[.,;:!?¡¿"“”()[\]{}…«»]/g;

export function normalize(text) {
  return String(text ?? '')
    .replace(APOSTROPHES, "'")
    .replace(PUNCT, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

/** Mesma normalização, mas sem diacríticos: perché → perche, sì → si. */
export function deaccent(text) {
  return normalize(text)
    .normalize('NFD')
    .replace(/\p{Mn}/gu, '');
}

/** Desfaz elisão para comparação tolerante: l'amico → lo amico.
 *  Só usado quando o item pede (tolleranzaElisione), porque na maior parte
 *  dos casos a elisão é justamente o que se está testando. */
export function expandElision(text) {
  return normalize(text)
    .replace(/\bl'/g, 'lo ')
    .replace(/\bun'/g, 'una ')
    .replace(/\bvent'/g, 'venti ')
    .replace(/\btrent'/g, 'trenta ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Compara resposta do aluno com o gabarito.
 *
 * @param {string} given resposta digitada
 * @param {string} expected gabarito
 * @param {{
 *   accettaAnche?: string[],
 *   tolleranzaAccenti?: boolean,
 *   tolleranzaElisione?: boolean
 * }} opts
 * @returns {{correct: boolean, score: number, level: 'exact'|'accent'|'elision'|'alt'|'none', nota?: string}}
 */
export function checkAnswer(given, expected, opts = {}) {
  const g = normalize(given);
  if (!g) return { correct: false, score: 0, level: 'none' };

  const candidates = [expected, ...(opts.accettaAnche ?? [])];

  // 1. Igualdade estrita (após normalizar espaço/pontuação/caixa).
  for (const cand of candidates) {
    if (g === normalize(cand)) {
      return { correct: true, score: 1, level: 'exact' };
    }
  }

  // 2. Sem diacríticos. Conta como correto, mas devolve nota didática:
  //    o aluno acertou a palavra e precisa ver o acento certo.
  //    tolleranzaAccenti === false força reprovação (usado quando o acento
  //    É o conteúdo sendo testado).
  if (opts.tolleranzaAccenti !== false) {
    for (const cand of candidates) {
      if (deaccent(given) === deaccent(cand)) {
        return {
          correct: true,
          score: 0.85,
          level: 'accent',
          nota: `Certo! Só atenção ao acento: <b>${escapeHtml(cand)}</b>.`,
        };
      }
    }
  }

  // 3. Elisão, só se o item permitir explicitamente.
  if (opts.tolleranzaElisione === true) {
    for (const cand of candidates) {
      if (expandElision(given) === expandElision(cand)) {
        return {
          correct: true,
          score: 0.85,
          level: 'elision',
          nota: `Aceito, mas o italiano elide aqui: <b>${escapeHtml(cand)}</b>.`,
        };
      }
    }
  }

  // 4. Errado — mas devolvemos similaridade para modular o feedback.
  const score = similarity(g, normalize(expected));
  return { correct: false, score: 0, level: 'none', similarity: score };
}

/* --- Diff por token -----------------------------------------------------
   Usado na transcrição e (fase 2) no dictogloss. Comparação por PALAVRA,
   não por caractere: o que interessa é qual palavra o aluno não ouviu,
   não que ele trocou uma letra.                                        */

export function tokenize(text) {
  return normalize(text).split(' ').filter(Boolean);
}

/** Subsequência comum mais longa, em tabela. O suficiente para frases de
 *  aula (dezenas de tokens); não vale otimizar. */
function lcsMatrix(a, b) {
  const m = Array.from({ length: a.length + 1 }, () => new Array(b.length + 1).fill(0));
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      m[i][j] = a[i - 1] === b[j - 1] ? m[i - 1][j - 1] + 1 : Math.max(m[i - 1][j], m[i][j - 1]);
    }
  }
  return m;
}

/**
 * Diff palavra a palavra entre gabarito e resposta.
 * @returns {{ops: Array<{type:'same'|'add'|'del', token:string}>, score:number}}
 *   'del' = estava no gabarito e faltou; 'add' = o aluno inventou.
 */
export function diffTokens(expected, given) {
  const a = tokenize(expected);
  const b = tokenize(given);
  const m = lcsMatrix(a, b);

  const ops = [];
  let i = a.length;
  let j = b.length;

  while (i > 0 && j > 0) {
    if (a[i - 1] === b[j - 1]) {
      ops.unshift({ type: 'same', token: a[i - 1] });
      i--;
      j--;
    } else if (m[i - 1][j] > m[i][j - 1]) {
      // Desempate estrito (> e não >=) de propósito: numa substituição isso
      // faz o 'del' sair antes do 'add', que é como se lê um diff — primeiro
      // o que faltou, depois o que sobrou.
      ops.unshift({ type: 'del', token: a[i - 1] });
      i--;
    } else {
      ops.unshift({ type: 'add', token: b[j - 1] });
      j--;
    }
  }
  while (i > 0) ops.unshift({ type: 'del', token: a[--i] });
  while (j > 0) ops.unshift({ type: 'add', token: b[--j] });

  const hits = ops.filter((o) => o.type === 'same').length;
  return { ops, score: a.length ? hits / a.length : 0 };
}

/** Renderiza o diff como HTML. Tokens são normalizados, então seguros;
 *  ainda assim escapamos por disciplina. */
export function renderDiff(expected, given) {
  const { ops, score } = diffTokens(expected, given);
  const html = ops
    .map((o) => {
      const t = escapeHtml(o.token);
      if (o.type === 'same') return `<span class="same">${t}</span>`;
      if (o.type === 'del') return `<del title="faltou">${t}</del>`;
      return `<ins title="sobrou">${t}</ins>`;
    })
    .join(' ');
  return { html, score };
}

/** Similaridade de Levenshtein normalizada, em caracteres. Usada só para
 *  graduar mensagens ("quase!" contra "revise a frase"). */
export function similarity(a, b) {
  if (a === b) return 1;
  if (!a.length || !b.length) return 0;

  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const curr = [i];
    for (let j = 1; j <= b.length; j++) {
      curr[j] = Math.min(
        prev[j] + 1,
        curr[j - 1] + 1,
        prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)
      );
    }
    prev = curr;
  }
  return 1 - prev[b.length] / Math.max(a.length, b.length);
}

export function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
