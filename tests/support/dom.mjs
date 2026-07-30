/* ==========================================================================
   dom.mjs — DOM mínimo para rodar o código do site dentro do Node.

   Por que existe: o invariante de zero dependências vale para os testes
   também. Instalar jsdom traria um node_modules que o projeto inteiro foi
   desenhado para não ter. O código do site usa uma fatia pequena e bem
   delimitada da API do DOM — createElement, append, atributos, dataset,
   classList, querySelector e eventos — e essa fatia cabe aqui.

   Isto NÃO é um navegador: não há layout, CSS nem parse de innerHTML.
   innerHTML é armazenado como string, o que basta porque o site só o usa
   para escrever (nunca para ler de volta como árvore). O que depende de
   pixel de verdade — tamanho de botão, cor de chip — se verifica no
   Chrome, não aqui.
   ========================================================================== */

const VOID_TAGS = new Set(['input', 'br', 'hr', 'img', 'meta', 'link']);

/* --- Seletores -----------------------------------------------------------
   Suporta o que o site usa: tag, .classe, #id, [attr], [attr="valor"], e
   combinador descendente (".rail a"). Sem `>`, `+`, `~` ou pseudo-classes —
   se algum dia o código precisar deles, este parser falha alto em vez de
   silenciosamente casar errado.                                          */

const SIMPLE = /^([a-zA-Z][\w-]*)?((?:[.#][\w-]+|\[[^\]]+\])*)$/;

function matchSimple(node, sel) {
  const m = SIMPLE.exec(sel);
  if (!m) throw new Error(`seletor não suportado pelo DOM de teste: «${sel}»`);
  const [, tag, rest = ''] = m;
  if (tag && node.tagName !== tag.toUpperCase()) return false;

  for (const part of rest.match(/[.#][\w-]+|\[[^\]]+\]/g) ?? []) {
    if (part[0] === '.') {
      if (!node.classList.contains(part.slice(1))) return false;
    } else if (part[0] === '#') {
      if (node.getAttribute('id') !== part.slice(1)) return false;
    } else {
      const inner = part.slice(1, -1);
      const eq = inner.indexOf('=');
      if (eq === -1) {
        if (!node.hasAttribute(inner)) return false;
      } else {
        const name = inner.slice(0, eq);
        const want = inner.slice(eq + 1).replace(/^["']|["']$/g, '');
        if (node.getAttribute(name) !== want) return false;
      }
    }
  }
  return true;
}

function matches(node, selector) {
  const parts = selector.trim().split(/\s+/);
  if (!matchSimple(node, parts[parts.length - 1])) return false;

  // Combinador descendente: sobe a árvore procurando cada ancestral pedido.
  let cursor = node.parentNode;
  for (let i = parts.length - 2; i >= 0; i--) {
    while (cursor && !matchSimple(cursor, parts[i])) cursor = cursor.parentNode;
    if (!cursor) return false;
    cursor = cursor.parentNode;
  }
  return true;
}

/* --- classList / dataset -------------------------------------------------- */

class ClassList {
  constructor(node) { this.node = node; }
  get _set() {
    return new Set(String(this.node.getAttribute('class') ?? '').split(/\s+/).filter(Boolean));
  }
  _write(set) { this.node.setAttribute('class', [...set].join(' ')); }
  add(...cs) { const s = this._set; for (const c of cs) s.add(c); this._write(s); }
  remove(...cs) { const s = this._set; for (const c of cs) s.delete(c); this._write(s); }
  contains(c) { return this._set.has(c); }
  toggle(c, force) {
    const has = this.contains(c);
    const on = force === undefined ? !has : force;
    if (on) this.add(c); else this.remove(c);
    return on;
  }
  get length() { return this._set.size; }
}

const kebab = (s) => s.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`);
const camel = (s) => s.replace(/-([a-z])/g, (_, c) => c.toUpperCase());

function makeDataset(node) {
  return new Proxy({}, {
    get: (_, key) => node.getAttribute(`data-${kebab(String(key))}`) ?? undefined,
    set: (_, key, value) => {
      if (value === null || value === undefined) node.removeAttribute(`data-${kebab(String(key))}`);
      else node.setAttribute(`data-${kebab(String(key))}`, String(value));
      return true;
    },
    deleteProperty: (_, key) => {
      node.removeAttribute(`data-${kebab(String(key))}`);
      return true;
    },
    has: (_, key) => node.hasAttribute(`data-${kebab(String(key))}`),
    ownKeys: () => [...node._attrs.keys()]
      .filter((k) => k.startsWith('data-'))
      .map((k) => camel(k.slice(5))),
    getOwnPropertyDescriptor: () => ({ enumerable: true, configurable: true }),
  });
}

/* --- Alvo de eventos ------------------------------------------------------ */

class EventTargetish {
  constructor() { this._listeners = new Map(); }

  addEventListener(type, fn, opts = {}) {
    if (!this._listeners.has(type)) this._listeners.set(type, []);
    this._listeners.get(type).push({ fn, once: Boolean(opts.once) });
  }

  removeEventListener(type, fn) {
    const list = this._listeners.get(type);
    if (!list) return;
    const i = list.findIndex((l) => l.fn === fn);
    if (i >= 0) list.splice(i, 1);
  }

  dispatchEvent(event) {
    const type = typeof event === 'string' ? event : event.type;
    const ev = typeof event === 'string' ? { type } : event;
    ev.target ??= this;
    for (const l of [...(this._listeners.get(type) ?? [])]) {
      if (l.once) this.removeEventListener(type, l.fn);
      l.fn.call(this, ev);
    }
    return true;
  }
}

/* --- Elemento ------------------------------------------------------------- */

class Element extends EventTargetish {
  constructor(tag) {
    super();
    this.tagName = String(tag).toUpperCase();
    this._attrs = new Map();
    this.childNodes = [];
    this.parentNode = null;
    this.style = {};
    this._html = '';
    this.classList = new ClassList(this);
    this.dataset = makeDataset(this);
    this.value = '';
  }

  /* atributos */
  setAttribute(name, value) { this._attrs.set(name, String(value)); }
  getAttribute(name) { return this._attrs.has(name) ? this._attrs.get(name) : null; }
  removeAttribute(name) { this._attrs.delete(name); }
  hasAttribute(name) { return this._attrs.has(name); }

  get className() { return this.getAttribute('class') ?? ''; }
  set className(v) { this.setAttribute('class', v); }
  get id() { return this.getAttribute('id') ?? ''; }
  set id(v) { this.setAttribute('id', v); }

  /* propriedades booleanas espelhadas em atributo — o site usa as duas
     formas (el({hidden:true}) e node.hidden = false), então elas precisam
     ser a mesma coisa. */
  get hidden() { return this.hasAttribute('hidden'); }
  set hidden(v) { if (v) this.setAttribute('hidden', ''); else this.removeAttribute('hidden'); }
  get disabled() { return this.hasAttribute('disabled'); }
  set disabled(v) { if (v) this.setAttribute('disabled', ''); else this.removeAttribute('disabled'); }
  get checked() { return this.hasAttribute('checked'); }
  set checked(v) { if (v) this.setAttribute('checked', ''); else this.removeAttribute('checked'); }

  /* filhos */
  append(...nodes) {
    for (const n of nodes) {
      if (n === null || n === undefined) continue;
      if (typeof n === 'object') n.parentNode = this;
      this.childNodes.push(n);
    }
  }

  prepend(...nodes) {
    for (const n of [...nodes].reverse()) {
      if (n === null || n === undefined) continue;
      if (typeof n === 'object') n.parentNode = this;
      this.childNodes.unshift(n);
    }
  }

  get children() { return this.childNodes.filter((c) => typeof c === 'object'); }

  get innerHTML() {
    if (this.childNodes.length) return this.childNodes.map(serialize).join('');
    return this._html;
  }

  set innerHTML(v) {
    this.childNodes = [];
    this._html = String(v ?? '');
  }

  get textContent() {
    if (this.childNodes.length) {
      return this.childNodes.map((c) => (typeof c === 'string' ? c : c.textContent)).join('');
    }
    return this._html.replace(/<[^>]*>/g, '');
  }

  set textContent(v) {
    this.childNodes = [];
    this._html = '';
    if (v !== '') this.childNodes.push(String(v));
  }

  /* busca */
  querySelectorAll(selector) {
    const out = [];
    walk(this, (n) => { if (n !== this && matches(n, selector)) out.push(n); });
    return out;
  }

  querySelector(selector) { return this.querySelectorAll(selector)[0] ?? null; }

  closest(selector) {
    let n = this;
    while (n) {
      if (matchSimple(n, selector)) return n;
      n = n.parentNode;
    }
    return null;
  }

  click() { this.dispatchEvent({ type: 'click' }); }
  focus() {}
  scrollIntoView() {}
}

function walk(node, fn) {
  for (const c of node.childNodes) {
    if (typeof c !== 'object') continue;
    fn(c);
    walk(c, fn);
  }
}

function serialize(node) {
  if (typeof node === 'string') return node;
  const attrs = [...node._attrs]
    .map(([k, v]) => (v === '' ? ` ${k}` : ` ${k}="${v}"`))
    .join('');
  const tag = node.tagName.toLowerCase();
  if (VOID_TAGS.has(tag)) return `<${tag}${attrs}>`;
  return `<${tag}${attrs}>${node.innerHTML}</${tag}>`;
}

/* --- Documento e janela --------------------------------------------------- */

class Document extends EventTargetish {
  constructor() {
    super();
    this.documentElement = new Element('html');
    this.body = new Element('body');
    this.head = new Element('head');
    this.documentElement.append(this.head, this.body);
    this.title = '';
  }

  createElement(tag) { return new Element(tag); }
  createTextNode(t) { return String(t); }

  getElementById(id) {
    let found = null;
    walk(this.documentElement, (n) => { if (!found && n.getAttribute('id') === id) found = n; });
    return found;
  }

  querySelector(sel) { return this.documentElement.querySelector(sel); }
  querySelectorAll(sel) { return this.documentElement.querySelectorAll(sel); }
}

class Window extends EventTargetish {
  constructor() {
    super();
    this.matchMediaQueries = [];
  }

  matchMedia(query) {
    this.matchMediaQueries.push(query);
    return { matches: false, media: query, addEventListener() {}, removeEventListener() {} };
  }
}

/* --- Instalação nos globais ---------------------------------------------- */

/**
 * Instala um DOM novo em globalThis e devolve os handles.
 * Chame ANTES de importar qualquer módulo de js/ — vários deles leem
 * `window` no topo do arquivo (speech.js registra listeners de gesto ali).
 */
export function installDOM({ speechSynthesis = null, search = '' } = {}) {
  const document = new Document();
  const window = new Window();

  window.document = document;
  if (speechSynthesis) window.speechSynthesis = speechSynthesis;

  const location = {
    search,
    href: `http://localhost/${search}`,
    reloaded: 0,
    reload() { this.reloaded += 1; },
  };
  window.location = location;

  class CustomEvent {
    constructor(type, opts = {}) {
      this.type = type;
      this.detail = opts.detail ?? null;
    }
  }

  const observers = [];
  class IntersectionObserver {
    constructor(cb, opts) {
      this.cb = cb;
      this.opts = opts;
      this.observed = [];
      observers.push(this);
    }
    observe(node) { this.observed.push(node); }
    unobserve(node) { this.observed = this.observed.filter((n) => n !== node); }
    disconnect() { this.observed = []; }
    /** Só para os testes: simula a entrada de um elemento na viewport. */
    trigger(target, isIntersecting = true) { this.cb([{ target, isIntersecting }], this); }
  }

  const alerts = [];

  Object.assign(globalThis, {
    document,
    window,
    location,
    CustomEvent,
    IntersectionObserver,
    alert: (msg) => alerts.push(String(msg)),
  });

  if (speechSynthesis) globalThis.speechSynthesis = speechSynthesis;

  return { document, window, location, observers, alerts, Element };
}

/** localStorage em memória. `blocked` simula modo privado / cookies off. */
export function installStorage({ blocked = false, seed = null } = {}) {
  const map = new Map(seed ? Object.entries(seed) : []);
  const storage = {
    get length() { return map.size; },
    getItem(k) {
      if (blocked) throw new Error('storage bloqueado');
      return map.has(k) ? map.get(k) : null;
    },
    setItem(k, v) {
      if (blocked) throw new Error('storage bloqueado');
      map.set(k, String(v));
    },
    removeItem(k) { map.delete(k); },
    clear() { map.clear(); },
    _map: map,
  };
  globalThis.localStorage = storage;
  return storage;
}

export { Element, Document };
