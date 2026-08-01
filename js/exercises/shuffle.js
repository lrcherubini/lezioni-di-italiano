/* ==========================================================================
   shuffle.js — embaralhamento determinístico, semeado por string.

   Determinístico de propósito, e não por preguiça de usar Math.random.
   Duas consequências que valem o trabalho:

     · a mesma frase cai sempre na mesma ordem, então o aluno que recarrega
       a página não perde a referência visual do que já tinha montado;
     · a suíte pode afirmar posições sem stub de Math.random — e stub de
       global é exatamente o tipo de coisa que o node --test deste projeto
       evita isolando um cenário por arquivo.
   ========================================================================== */

/** FNV-1a. Só precisa espalhar bem strings curtas como «l02-e06-f1». */
function seme(str) {
  let h = 2166136261;
  for (let i = 0; i < String(str).length; i++) {
    h ^= String(str).charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/**
 * Fisher–Yates semeado.
 * @param {Array} lista
 * @param {string} id semente — use o id do item, para ser estável
 * @returns {Array} cópia embaralhada; nunca idêntica à entrada (2+ itens)
 */
export function mescola(lista, id) {
  const out = [...lista];
  if (out.length < 2) return out;

  let s = seme(id) || 1;
  const rand = () => {
    // xorshift32: barato, sem dependência, suficiente para 8 peças.
    s ^= s << 13; s >>>= 0;
    s ^= s >>> 17;
    s ^= s << 5; s >>>= 0;
    return s / 0x100000000;
  };

  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }

  // Sair na ordem original não é exercício. Rotacionar resolve e continua
  // determinístico.
  if (out.every((v, i) => v === lista[i])) out.push(out.shift());
  return out;
}
