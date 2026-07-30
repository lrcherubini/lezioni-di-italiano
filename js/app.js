/* ==========================================================================
   app.js — bootstrap, roteamento e montagem dos cards de exercício.

   Responsabilidades que ficam SÓ aqui:
     · carregar manifest e JSON de aula
     · montar o card em volta de cada exercício (número, chip, ações)
     · chamar check/feedback e reportar ao store
   Nenhum módulo de exercício conhece o store; nenhum conhece o roteador.
   ========================================================================== */

import * as speech from './speech.js';
import * as store from './store.js';
import { getExercise } from './exercises/index.js';
import {
  el, chip, speakButton, renderSection, renderObiettivi, renderStage,
} from './render.js';

const CONTENT = 'content/';

/* --- Fetch --------------------------------------------------------------- */

async function loadJSON(path) {
  const res = await fetch(path, { cache: 'no-cache' });
  if (!res.ok) throw new Error(`${res.status} ao carregar ${path}`);
  return res.json();
}

/* --- Tema ---------------------------------------------------------------- */

function initTheme() {
  const saved = store.settings().theme;
  if (saved) document.documentElement.dataset.theme = saved;

  const btn = document.querySelector('[data-action="theme"]');
  if (!btn) return;

  const sync = () => {
    const current = document.documentElement.dataset.theme;
    const dark = current === 'dark'
      || (!current && window.matchMedia('(prefers-color-scheme: dark)').matches);
    btn.textContent = dark ? '☀️' : '🌙';
    btn.setAttribute('aria-label', dark ? 'Tema claro' : 'Tema escuro');
  };

  btn.addEventListener('click', () => {
    const current = document.documentElement.dataset.theme;
    const dark = current === 'dark'
      || (!current && window.matchMedia('(prefers-color-scheme: dark)').matches);
    const next = dark ? 'light' : 'dark';
    document.documentElement.dataset.theme = next;
    store.setSetting('theme', next);
    sync();
  });

  sync();
}

/* --- Banner de degradação de áudio --------------------------------------

   Caso real em alguns Linux e Android: o navegador não tem nenhuma voz
   it-IT instalada. O site continua utilizável — mas o aluno precisa saber
   por que não sai som, em vez de achar que está quebrado.               */

function initAudioBanner() {
  const slot = document.getElementById('audio-status');
  if (!slot) return;

  speech.onStatusChange((s) => {
    if (!s.ready) return;
    slot.innerHTML = '';
    if (!s.degraded) return;

    slot.append(
      el('div', { class: 'banner', role: 'alert' },
        el('span', {}, '🔇'),
        el('div', {},
          el('strong', {}, s.supported
            ? 'Nenhuma voz italiana instalada neste navegador. '
            : 'Este navegador não tem síntese de voz. '),
          el('span', { html:
            'Os exercícios continuam funcionando em <b>modo transcrição</b>: o texto aparece '
            + 'e a tarefa passa a ser de leitura e produção. Para ter áudio, instale uma voz '
            + 'italiana no sistema (no Windows: Configurações → Hora e Idioma → Voz) ou '
            + 'tente o Edge ou o Chrome.' })
        )
      )
    );
  });

  speech.voicesReady();
}

/* --- Card de exercício -------------------------------------------------- */

let exCounter = 0;

/**
 * Monta o card em volta de um exercício e liga o ciclo
 * submit → check → feedback → store.record.
 */
function mountExercise(item, lessonId) {
  const mod = getExercise(item.type);
  exCounter += 1;

  if (!mod) {
    return el('div', { class: 'ex' },
      el('p', {}, `Tipo de exercício não registrado: «${item.type}». Ver js/exercises/index.js.`)
    );
  }

  const card = el('div', { class: 'ex', id: item.id, 'data-type': item.type });

  const head = el('div', { class: 'ex__head' },
    el('span', { class: 'ex__num' }, `Ex. ${String(exCounter).padStart(2, '0')}`),
    el('span', { class: 'ex__consegna', html: item.consegna ?? '' }),
    item.category ? chip(item.category) : null
  );
  card.append(head);

  let answered = false;

  const ctx = {
    submit(response) {
      const result = mod.check(item, response, body);

      // Um diálogo ou paradigma tem vários sub-itens; registramos cada um
      // pelo seu id para o progresso ser granular.
      if (Array.isArray(result.results) && result.results.length) {
        for (const r of result.results) {
          store.record(lessonId, r.id, { correct: r.correct, score: r.correct ? 1 : 0 });
        }
      } else {
        store.record(lessonId, item.id, { correct: result.correct, score: result.score });
      }

      card.dataset.state = result.correct
        ? (result.level === 'exact' ? 'correct' : 'partial')
        : 'wrong';

      mod.feedback?.(item, result, body);
      answered = true;
      revealBtn.disabled = false;
      window.dispatchEvent(new CustomEvent('ldi:progress'));
    },
    speak: speech.speak,
    lesson: lessonId,
  };

  const body = mod.render(item, ctx);
  card.append(body);

  const revealBtn = el('button', {
    class: 'btn btn--ghost btn--sm',
    type: 'button',
    disabled: true,
    title: 'Disponível depois de uma tentativa',
  }, 'Mostrar resposta');

  // A resposta só libera depois de tentar. Sem isso, o exercício de audição
  // vira exercício de leitura.
  revealBtn.addEventListener('click', () => {
    if (!answered) return;
    mod.reveal?.(item, body);
    revealBtn.disabled = true;
  });

  card.append(el('div', { class: 'ex__actions' }, revealBtn));
  return card;
}

/* --- Home ---------------------------------------------------------------- */

async function renderHome() {
  const manifest = await loadJSON(`${CONTENT}manifest.json`);
  const grid = document.getElementById('lesson-grid');
  grid.innerHTML = '';

  // Contamos itens de cada aula para a barra de progresso ser real.
  const counts = await Promise.all(
    manifest.lezioni.map(async (l) => {
      try {
        const data = await loadJSON(`${CONTENT}${l.file}`);
        return countItems(data);
      } catch {
        return 0;
      }
    })
  );

  manifest.lezioni.forEach((l, i) => {
    const prog = store.lessonProgress(l.id, counts[i]);

    grid.append(
      el('li', {},
        el('article', { class: 'lesson-card' },
          el('div', { class: 'lesson-card__body' },
            el('div', { class: 'lesson-card__num' }, `Lezione ${l.numero}`),
            el('h2', { class: 'lesson-card__title' },
              el('a', { href: `lezione.html?l=${l.id}` }, l.titolo)
            ),
            el('p', { class: 'lesson-card__gloss' }, l.gloss),
            el('div', { class: 'lesson-card__chips' }, ...(l.categorie ?? []).map(chip)),
            el('ul', { class: 'lesson-card__temi' }, ...(l.temi ?? []).map((t) => el('li', {}, t)))
          ),
          el('div', { class: 'lesson-card__foot' },
            el('div', { class: 'progress' },
              el('div', { class: 'progress__bar', style: `width:${prog.pct}%` })
            ),
            el('span', { class: 'progress__label' }, `${prog.done}/${prog.total}`)
          )
        )
      )
    );
  });
}

/** Conta itens rastreáveis: sub-itens quando existem, senão o exercício. */
function countItems(lesson) {
  let n = 0;
  for (const ex of lesson.esercizi ?? []) {
    if (ex.type === 'paradigm-fill') {
      for (const r of ex.righe ?? []) n += (r.nascondi ?? []).length;
    } else {
      n += 1;
    }
  }
  const detail = lesson.dialogo?.passate?.find((p) => p.focus === 'detail');
  n += detail?.domande?.length ?? 0;
  return n;
}

/* --- Página de aula ----------------------------------------------------- */

async function renderLesson() {
  const params = new URLSearchParams(location.search);
  const id = params.get('l') ?? '00';

  const manifest = await loadJSON(`${CONTENT}manifest.json`);
  const entry = manifest.lezioni.find((l) => l.id === id);
  if (!entry) throw new Error(`Aula «${id}» não existe no manifest.`);

  const lesson = await loadJSON(`${CONTENT}${entry.file}`);
  store.markVisited(id);

  document.title = `Lezione ${lesson.numero} · ${lesson.titolo}`;

  const main = document.getElementById('lesson');
  main.innerHTML = '';

  /* Cabeçalho */
  main.append(
    el('header', { class: 'lesson-header' },
      el('div', { class: 'lesson-header__chips' },
        el('span', { class: 'lesson-card__num' }, `Lezione ${lesson.numero}`),
        ...(entry.categorie ?? []).map(chip)
      ),
      el('h1', {}, speakButton(lesson.titolo), ' ', lesson.titolo),
      el('p', { class: 'lesson-header__gloss' }, lesson.gloss)
    )
  );

  const obiettivi = renderObiettivi(lesson.header);
  if (obiettivi) main.append(obiettivi);

  /* Trilha sticky — só com as etapas que a aula realmente tem */
  const stages = [
    ['riscaldamento', 'Riscaldamento', Boolean(lesson.riscaldamento)],
    ['studio', 'Studio', Boolean(lesson.sections?.length)],
    ['ascolto', 'Ascolto', Boolean(lesson.dialogo)],
    ['esercizi', 'Esercizi', Boolean(lesson.esercizi?.length)],
    ['produzione', 'Produzione', Boolean(lesson.produzione?.length)],
    ['bilancio', 'Bilancio', Boolean(lesson.bilancio?.length)],
  ].filter(([, , has]) => has);

  main.append(
    el('nav', { class: 'rail', 'aria-label': 'Etapas da aula' },
      el('ul', {}, ...stages.map(([anchor, label]) =>
        el('li', {}, el('a', { href: `#${anchor}` }, label))
      ))
    )
  );

  /* Riscaldamento */
  if (lesson.riscaldamento) {
    const r = lesson.riscaldamento;
    main.append(renderStage(
      { id: 'riscaldamento', kicker: 'Etapa 1', title: 'Riscaldamento', intro: r.prompt },
      ...(r.spiegazione ?? []).map((p) =>
        el('div', { class: 'spiegazione' }, el('p', { html: p }))
      )
    ));
  }

  /* Studio */
  if (lesson.sections?.length) {
    main.append(renderStage(
      {
        id: 'studio',
        kicker: 'Etapa 2',
        title: 'Studio',
        intro: 'Cada linha em italiano tem 🔊. Ouça antes de ler a tradução — '
             + 'e leia a explicação, não só a tabela.',
      },
      ...lesson.sections.map(renderSection)
    ));
  }

  /* Ascolto */
  if (lesson.dialogo) {
    const d = lesson.dialogo;
    main.append(renderStage(
      {
        id: 'ascolto',
        kicker: 'Etapa 3',
        title: 'Ascolto',
        intro: d.consegna ?? '',
      },
      el('div', { class: 'ex', id: d.id, 'data-type': 'dialogue' },
        el('div', { class: 'ex__head' },
          el('span', { class: 'ex__num' }, 'Dialogo'),
          el('span', { class: 'ex__consegna' }, d.titolo),
          d.gloss ? el('span', { class: 'section__gloss', html: d.gloss }) : null
        )
      )
    ));

    // O diálogo usa o mesmo caminho de montagem dos exercícios.
    const shell = main.querySelector(`#${cssEscape(d.id)}`);
    const mounted = mountExercise({ ...d, type: 'dialogue', consegna: d.titolo }, id);
    shell.replaceWith(mounted);
  }

  /* Esercizi */
  if (lesson.esercizi?.length) {
    main.append(renderStage(
      {
        id: 'esercizi',
        kicker: 'Etapa 4',
        title: 'Esercizi',
        intro: 'A resposta só libera depois de você tentar. Use <b>Lento</b> à vontade — '
             + 'repetir não é trapaça, é o método.',
      },
      ...lesson.esercizi.map((ex) => mountExercise(ex, id))
    ));
  }

  /* Produzione */
  if (lesson.produzione?.length) {
    main.append(renderStage(
      {
        id: 'produzione',
        kicker: 'Etapa 5',
        title: 'Produzione',
        intro: 'Sem gabarito, e de propósito: aqui você produz. '
             + 'Se travar em algo, é exatamente isso que vale levar para a próxima aula.',
      },
      el('ol', { class: 'produzione' },
        ...lesson.produzione.map((p) => el('li', { id: p.id, html: p.consegna }))
      )
    ));
  }

  /* Bilancio */
  if (lesson.bilancio?.length) {
    const ul = el('ul', { class: 'bilancio' });
    const checked = new Set(store.getBilancio(id));

    lesson.bilancio.forEach((b, i) => {
      const input = el('input', { type: 'checkbox', checked: checked.has(i) || null });
      input.addEventListener('change', () => store.setBilancio(id, i, input.checked));
      ul.append(el('li', {}, el('label', {}, input, el('span', { html: b }))));
    });

    main.append(renderStage(
      {
        id: 'bilancio',
        kicker: 'Etapa 6',
        title: 'Bilancio',
        intro: 'Marque com honestidade. O que ficar desmarcado é o seu roteiro de revisão.',
      },
      ul
    ));
  }

  /* Navegação entre aulas */
  const idx = manifest.lezioni.findIndex((l) => l.id === id);
  const prev = manifest.lezioni[idx - 1];
  const next = manifest.lezioni[idx + 1];
  main.append(
    el('nav', { class: 'lesson-nav' },
      prev ? el('a', { class: 'btn', href: `lezione.html?l=${prev.id}` }, `← Lezione ${prev.numero}`) : el('span'),
      next ? el('a', { class: 'btn', href: `lezione.html?l=${next.id}` }, `Lezione ${next.numero} →`) : el('span')
    )
  );

  initRail();
}

/** Marca na trilha a etapa visível. IntersectionObserver evita listener de scroll. */
function initRail() {
  const links = [...document.querySelectorAll('.rail a')];
  const byId = new Map(links.map((a) => [a.getAttribute('href').slice(1), a]));

  const obs = new IntersectionObserver((entries) => {
    for (const e of entries) {
      if (!e.isIntersecting) continue;
      for (const a of links) a.removeAttribute('aria-current');
      byId.get(e.target.id)?.setAttribute('aria-current', 'true');
    }
  }, { rootMargin: '-30% 0px -60% 0px' });

  for (const id of byId.keys()) {
    const node = document.getElementById(id);
    if (node) obs.observe(node);
  }
}

/** IDs de conteúdo são controlados por nós, mas querySelector com id que
 *  comece por dígito quebra — daí o escape. */
function cssEscape(id) {
  return typeof CSS !== 'undefined' && CSS.escape ? CSS.escape(id) : id;
}

/* --- Exportar / importar progresso -------------------------------------- */

function initDataButtons() {
  document.querySelector('[data-action="export"]')?.addEventListener('click', () => store.download());

  const importBtn = document.querySelector('[data-action="import"]');
  if (!importBtn) return;

  importBtn.addEventListener('click', () => {
    const input = el('input', { type: 'file', accept: 'application/json,.json' });
    input.addEventListener('change', async () => {
      const file = input.files?.[0];
      if (!file) return;
      try {
        store.importJSON(await file.text());
        location.reload();
      } catch (err) {
        alert(`Não foi possível importar: ${err.message}`);
      }
    });
    input.click();
  });
}

/* --- Bootstrap ---------------------------------------------------------- */

function fail(err) {
  console.error(err);
  const slot = document.getElementById('audio-status') ?? document.body;
  slot.prepend(
    el('div', { class: 'banner banner--err', role: 'alert' },
      el('span', {}, '⚠️'),
      el('div', {},
        el('strong', {}, 'Não foi possível carregar o conteúdo. '),
        el('span', { html:
          `<code>${String(err.message ?? err)}</code><br>`
          + 'Se você abriu o arquivo com duplo clique, é isso: o navegador bloqueia '
          + '<code>fetch()</code> em <code>file://</code>. Rode <code>python -m http.server 8000</code> '
          + 'na raiz do projeto e acesse <code>http://localhost:8000</code>.' })
      )
    )
  );
}

async function main() {
  initTheme();
  initAudioBanner();
  initDataButtons();

  try {
    if (document.getElementById('lesson-grid')) {
      await renderHome();
      window.addEventListener('ldi:progress', () => renderHome().catch(fail));
    } else if (document.getElementById('lesson')) {
      await renderLesson();
    }
  } catch (err) {
    fail(err);
  }
}

document.addEventListener('DOMContentLoaded', main);
