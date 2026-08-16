/* Renderização do conteúdo de estudo.

   O invariante 7.1 do CLAUDE.md — "todo texto italiano exibido tem botão de
   áudio, sem exceção" — é conteúdo E código: quem decide se uma célula ganha
   🔊 é o renderCell aqui. Boa parte deste arquivo existe para travar isso. */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { installDOM, installStorage } from './support/dom.mjs';
import { makeSpeechSynthesis, installUtterance, IT_VOICES } from './support/speech-stub.mjs';
import { flush } from './support/fixtures.mjs';

const synth = makeSpeechSynthesis({ voices: IT_VOICES });
installUtterance();
installDOM({ speechSynthesis: synth });
installStorage();

const {
  el, speakButton, chip, subChip, prose, renderBlock, renderSection, renderObiettivi,
  renderStage, audioBar, renderFunzioni,
} = await import('../js/render.js');
const speech = await import('../js/speech.js');
await speech.voicesReady();

/** Botões de áudio dentro de um nó, na ordem em que aparecem. */
const speakButtons = (node) => node.querySelectorAll('.speak');
const spokenLabels = (node) =>
  speakButtons(node).map((b) => b.getAttribute('aria-label').replace(/^Ouvir: /, ''));

describe('el', () => {
  test('class, html e atributos comuns', () => {
    const n = el('div', { class: 'x y', 'data-k': 'v', title: 'z' });
    assert.equal(n.tagName, 'DIV');
    assert.equal(n.className, 'x y');
    assert.equal(n.getAttribute('data-k'), 'v');
    assert.equal(n.getAttribute('title'), 'z');
  });

  test('null, undefined e false são ignorados como atributo', () => {
    const n = el('div', { a: null, b: undefined, c: false, d: 0 });
    assert.equal(n.hasAttribute('a'), false);
    assert.equal(n.hasAttribute('b'), false);
    assert.equal(n.hasAttribute('c'), false);
    assert.equal(n.getAttribute('d'), '0', 'zero é valor, não ausência');
  });

  test('true vira atributo booleano vazio', () => {
    assert.equal(el('input', { disabled: true }).getAttribute('disabled'), '');
  });

  test('handler on* é registrado como listener', () => {
    let cliques = 0;
    const n = el('button', { onClick: () => { cliques += 1; } });
    n.click();
    assert.equal(cliques, 1);
  });

  test('filhos: string, número, nó, aninhados e nulos', () => {
    const n = el('p', {}, 'a', 1, el('b', {}, 'c'), null, undefined, false, ['d', el('i', {})]);
    assert.equal(n.childNodes.length, 5);
    assert.equal(n.textContent, 'a1cd');
  });
});

describe('speakButton', () => {
  test('rótulo acessível descreve o que vai ser falado, sem tags', () => {
    const b = speakButton('<b>il</b> cane');
    assert.equal(b.getAttribute('aria-label'), 'Ouvir: il cane');
    assert.equal(b.className, 'speak');
    assert.equal(b.textContent, '🔊');
  });

  test('clicar fala e marca o botão enquanto toca', async () => {
    const antes = synth.spoken.length;
    const b = speakButton('Buongiorno!');
    b.click();
    await flush(0);

    assert.equal(synth.spoken.length, antes + 1);
    assert.equal(synth.spoken.at(-1).text, 'Buongiorno!');
    await flush(0);
    assert.equal(b.getAttribute('data-speaking'), null, 'o marcador sai ao terminar');
  });

  test('rótulo customizado sobrescreve o padrão', () => {
    assert.equal(speakButton('x', { label: 'Ouvir o diálogo' }).getAttribute('aria-label'), 'Ouvir o diálogo');
  });
});

describe('chips', () => {
  test('chip carrega a categoria na classe, para a cor vir do CSS', () => {
    const c = chip('VERBO');
    assert.equal(c.className, 'chip chip--VERBO');
    assert.equal(c.textContent, 'VERBO');
  });

  test('subChip usa a variante secundária', () => {
    assert.equal(subChip('Presente Indicativo').className, 'chip chip--sub');
  });
});

describe('bloco lista', () => {
  test('cada item italiano ganha 🔊; pt e nota são texto', () => {
    const b = renderBlock({
      type: 'lista',
      titolo: 'Saluti',
      items: [
        { it: 'Buongiorno!', pt: 'Bom dia!', nota: 'até o almoço' },
        { it: 'Ciao!', pt: 'Oi!' },
      ],
    });

    assert.deepEqual(spokenLabels(b), ['Buongiorno!', 'Ciao!']);
    assert.equal(b.querySelectorAll('.item').length, 2);
    assert.equal(b.querySelectorAll('.item__nota').length, 1);
    assert.match(b.querySelector('.block__title').innerHTML, /Saluti/);
  });
});

describe('bloco tabella', () => {
  test('célula string é italiano e ganha botão', () => {
    const b = renderBlock({
      type: 'tabella',
      intestazioni: ['Persona', 'Essere', 'Avere'],
      righe: [['io', 'sono', 'ho'], ['tu', 'sei', 'hai']],
    });
    // 3 cabeçalhos + 6 células
    assert.equal(speakButtons(b).length, 9);
    assert.equal(b.querySelectorAll('thead').length, 1);
  });

  test('célula marcada pt: true NÃO ganha botão', () => {
    // A voz é it-IT: dar áudio a um rótulo em português faria o site ler
    // "consoante comum" com sotaque italiano.
    const b = renderBlock({
      type: 'tabella',
      intestazioni: [{ html: 'Artigo', pt: true }, { html: 'Usa-se antes de', pt: true }, 'Esempi'],
      righe: [['<b>il</b>', { html: 'consoante comum (masc.)', pt: true }, '<em>il cane</em>']],
    });
    assert.deepEqual(spokenLabels(b), ['Esempi', 'il', 'il cane']);
  });

  test('aside entre parênteses sai do texto falado, mas fica na tela', () => {
    const b = renderBlock({
      type: 'tabella',
      intestazioni: ['Singolare'],
      righe: [['<em>libro → libri</em> (livro → livros)']],
    });
    const botao = speakButtons(b).at(-1);
    assert.equal(botao.getAttribute('aria-label'), 'Ouvir: libro → libri');
    assert.match(b.innerHTML, /livro → livros/, 'a glosa continua visível');
  });

  test('célula vazia não gera botão órfão', () => {
    const b = renderBlock({ type: 'tabella', intestazioni: ['', ''], righe: [['', 'ciao']] });
    assert.deepEqual(spokenLabels(b), ['ciao']);
    assert.equal(b.querySelectorAll('thead').length, 0, 'cabeçalho todo vazio não é renderizado');
  });

  test('tabela sem righe não quebra', () => {
    assert.doesNotThrow(() => renderBlock({ type: 'tabella', intestazioni: ['a'] }));
  });
});

describe('bloco contrasto', () => {
  test('renderiza um grupo por contraste, com os exemplos audíveis', () => {
    const b = renderBlock({
      type: 'contrasto',
      titolo: 'C duro e C brando',
      gruppi: [
        { etichetta: 'C dura /k/', gloss: 'antes de A, O, U', esempi: [{ it: 'Casa', pt: 'casa' }] },
        { etichetta: 'C dolce /tʃ/', esempi: [{ it: 'Ciao', pt: 'oi' }] },
      ],
    });
    assert.equal(b.querySelectorAll('.contrasto__group').length, 2);
    assert.deepEqual(spokenLabels(b), ['Casa', 'Ciao']);
    assert.equal(b.querySelectorAll('.contrasto__gloss').length, 1);
  });
});

describe('bloco paradigma', () => {
  const bloco = {
    type: 'paradigma',
    colonne: ['Maschile sing.', 'Femminile sing.'],
    righe: [
      { id: 'p1', pt: 'brasileiro', forme: ['il brasiliano', 'la brasiliana'], eccezione: false },
      { id: 'p2', pt: 'belga', forme: ['il belga', 'la belga'], eccezione: true },
    ],
  };

  test('cabeçalhos de coluna e todas as formas são audíveis', () => {
    const b = renderBlock(bloco);
    assert.deepEqual(spokenLabels(b), [
      'Maschile sing.', 'Femminile sing.',
      'il brasiliano', 'la brasiliana',
      'il belga', 'la belga',
    ]);
  });

  test('a coluna Português é rótulo — sem botão', () => {
    const b = renderBlock(bloco);
    assert.equal(b.querySelector('thead').querySelectorAll('th')[0].textContent, 'Português');
    assert.equal(b.querySelector('thead').querySelectorAll('th')[0].querySelectorAll('.speak').length, 0);
  });

  test('linha de exceção fica marcada e a legenda aparece', () => {
    const b = renderBlock(bloco);
    assert.equal(b.querySelectorAll('tr[data-eccezione="true"]').length, 1);
    assert.match(b.innerHTML, /forma irregular/);
  });

  test('sem exceção, sem legenda', () => {
    const b = renderBlock({ ...bloco, righe: [bloco.righe[0]] });
    assert.ok(!b.innerHTML.includes('forma irregular'));
  });
});

describe('bloco scambio', () => {
  const bloco = {
    type: 'scambio',
    titolo: 'Na menor conversa possível',
    battute: [
      { speaker: 'A', it: 'Qualcosa da bere?', pt: 'Algo pra beber?' },
      { speaker: 'B', it: 'Un caffè, per favore.', pt: 'Um café, por favor.' },
    ],
  };

  test('uma linha por turno, com o falante no dataset', () => {
    const b = renderBlock(bloco);
    const righe = b.querySelectorAll('.battuta');
    assert.equal(righe.length, 2);
    assert.deepEqual(righe.map((r) => r.getAttribute('data-speaker')), ['A', 'B']);
  });

  test('cada turno é audível sozinho, com a voz do seu falante', () => {
    const b = renderBlock(bloco);
    assert.deepEqual(spokenLabels(b), ['Qualcosa da bere?', 'Un caffè, per favore.']);
  });

  test('e a troca inteira também', () => {
    const b = renderBlock(bloco);
    const tutto = b.querySelectorAll('button').find((x) => /Ouvir a troca/.test(x.textContent));
    assert.ok(tutto, 'sem play da troca inteira, o scambio vira uma lista');
  });

  test('a tradução aparece: é modelo para ler, não teste de compreensão', () => {
    const b = renderBlock(bloco);
    assert.match(b.textContent, /Algo pra beber\?/);
    assert.match(b.textContent, /Um café, por favor\./);
  });

  test('ganha o wrapper de bloco e o título, ao contrário da nota', () => {
    const b = renderBlock(bloco);
    assert.equal(b.className, 'block');
    assert.match(b.querySelector('.block__title').textContent, /menor conversa/);
  });

  test('sem battute não quebra a página', () => {
    // O validador reprova; o render não pode explodir por causa disso.
    assert.doesNotThrow(() => renderBlock({ type: 'scambio' }));
  });
});

describe('bloco nota', () => {
  test('o tono vira classe e não recebe wrapper de bloco', () => {
    const b = renderBlock({ type: 'nota', tono: 'eccezione', titolo: 'Belga', testo: 'i belgi' });
    assert.equal(b.tagName, 'ASIDE');
    assert.equal(b.className, 'nota nota--eccezione');
    assert.equal(b.getAttribute('role'), 'note');
  });

  test('tono ausente vira info', () => {
    assert.equal(renderBlock({ type: 'nota', testo: 'x' }).className, 'nota nota--info');
  });

  test('o <it> da nota ganha 🔊, e o resto do texto não', () => {
    const b = renderBlock({
      type: 'nota',
      testo: 'Quando você vir <it><em>amico</em></it> → <it><em>amici</em></it>, não é capricho.',
    });
    assert.deepEqual(spokenLabels(b), ['amico', 'amici']);
    assert.match(b.textContent, /não é capricho/);
  });
});

describe('prose — italiano dentro de texto corrido', () => {
  test('sem <it>, devolve um nó só com o HTML intacto', () => {
    const p = prose('A regra vale para <b>c</b> e <b>g</b>.');
    assert.equal(p.tagName, 'P');
    assert.equal(p.innerHTML, 'A regra vale para <b>c</b> e <b>g</b>.');
    assert.equal(speakButtons(p).length, 0, 'nada de botão onde não há italiano');
  });

  test('cada <it> vira texto + botão, na ordem do parágrafo', () => {
    const p = prose('Daí <it>chi</it> se lê «qui» e <it>spaghetti</it> tem g de gato.');
    assert.deepEqual(spokenLabels(p), ['chi', 'spaghetti']);
    assert.match(p.textContent, /se lê «qui»/);
    assert.match(p.textContent, /tem g de gato/);
  });

  test('o botão vem DEPOIS da palavra, não antes', () => {
    const p = prose('vale para <it>amiche</it> também');
    const inline = p.querySelector('.it-inline');
    const filhos = inline.children;
    assert.ok(filhos[0].classList.contains('it-inline__text'));
    assert.ok(filhos[1].classList.contains('speak--inline'));
  });

  test('a marcação interna sobrevive, mas não é falada', () => {
    const p = prose('plurais como <it><em>amici</em></it>.');
    assert.match(p.innerHTML, /<em>amici<\/em>/, 'o itálico continua no texto');
    assert.deepEqual(spokenLabels(p), ['amici'], 'o TTS recebe a forma limpa');
  });

  test('parêntese de glosa não vai para o áudio', () => {
    const p = prose('a forma <it>lieta (feminino)</it> concorda com quem fala.');
    assert.deepEqual(spokenLabels(p), ['lieta']);
  });

  test('clicar no botão inline fala em italiano', async () => {
    const p = prose('a palavra <it>ciao</it> é informal.');
    const antes = synth.spoken.length;
    speakButtons(p)[0].dispatchEvent({ type: 'click' });
    await flush();
    assert.equal(synth.spoken.at(-1).text, 'ciao');
    assert.equal(synth.spoken.at(-1).lang, 'it-IT');
    assert.equal(synth.spoken.length, antes + 1);
  });

  test('aceita tag e atributos externos', () => {
    const p = prose('olhe <it>chi</it>', 'div', { class: 'stage__intro' });
    assert.equal(p.tagName, 'DIV');
    assert.equal(p.className, 'stage__intro');
  });

  test('entrada vazia ou nula não quebra', () => {
    assert.equal(prose('').textContent, '');
    assert.equal(prose(null).textContent, '');
    assert.equal(prose(undefined).textContent, '');
  });

  test('<it> vazio não gera botão mudo', () => {
    const p = prose('nada aqui <it></it> mesmo');
    assert.equal(speakButtons(p).length, 0);
  });
});

/* --- Matriz modo × marcação ---------------------------------------------

   A regra é uma («marque a minoria»), mas ela tem duas polaridades e três
   modos, então o que precisa de prova é a MATRIZ, não cada célula solta:
   para cada modo, o que acontece com texto sem tag, com a tag viva e com a
   tag inerte. Uma tabela evita o teste-por-teste que sempre esquece uma
   combinação — e foi assim que apareceu o caso «parágrafo 100% <pt>». */

describe('matriz modo × marcação', () => {
  const MODOS = ['pt', 'misto', 'it'];
  const italiano = (m) => m === 'misto' || m === 'it';

  for (const modo of MODOS) {
    describe(`modo «${modo}»`, () => {
      test('texto sem marca nenhuma', () => {
        const p = prose('Uma frase simples com <b>negrito</b>.', 'p', {}, modo);
        // Em modo italiano a prosa INTEIRA é o insumo, então ganha um botão
        // mesmo sem tag; em modo pt não há italiano a ouvir.
        assert.equal(speakButtons(p).length, italiano(modo) ? 1 : 0);
        assert.match(p.textContent, /Uma frase simples/);
      });

      test('a tag viva marca a minoria e é a única a virar botão', () => {
        const p = italiano(modo)
          ? prose('Io parlo <pt>eu falo</pt> italiano.', 'p', {}, modo)
          : prose('a forma <it>parlo</it> é a primeira pessoa.', 'p', {}, modo);

        assert.equal(speakButtons(p).length, 1);
        assert.deepEqual(spokenLabels(p), italiano(modo)
          ? ['Io parlo italiano.']   // a glosa PT sai do áudio, fica na tela
          : ['parlo']);              // só a forma citada
        assert.match(p.textContent, italiano(modo) ? /eu falo/ : /primeira pessoa/);
      });

      test('a tag inerte não vira botão nem vaza como texto cru', () => {
        const p = italiano(modo)
          ? prose('Io parlo <it>italiano</it> bene.', 'p', {}, modo)
          : prose('a forma <pt>portuguesa</pt> aqui.', 'p', {}, modo);

        // Em modo italiano o parágrafo inteiro é falado, incluindo o que
        // está dentro da tag inerte — ela não subtrai nada.
        assert.equal(speakButtons(p).length, italiano(modo) ? 1 : 0);
        assert.ok(!p.innerHTML.includes('<it>&'), 'não escapa a tag');
        assert.match(p.textContent, italiano(modo) ? /italiano/ : /portuguesa/);
      });
    });
  }

  test('«misto» e «it» renderizam idêntico — a diferença é editorial', () => {
    const fonte = 'Il verbo <pt>o verbo</pt> è regolare.';
    const a = prose(fonte, 'p', {}, 'misto');
    const b = prose(fonte, 'p', {}, 'it');
    assert.equal(a.innerHTML, b.innerHTML);
    assert.deepEqual(spokenLabels(a), spokenLabels(b));
  });

  test('modo desconhecido cai para «pt» em vez de quebrar', () => {
    const p = prose('cita <it>ciao</it> aqui', 'p', {}, 'xyz');
    assert.deepEqual(spokenLabels(p), ['ciao']);
  });

  test('parágrafo 100% português em modo «it» não ganha botão mudo', () => {
    const p = prose('<pt>Uma nota inteira de compreensão.</pt>', 'p', {}, 'it');
    assert.equal(speakButtons(p).length, 0, 'não há italiano para ouvir');
    assert.equal(p.querySelectorAll('.pt-inline').length, 1);
  });

  test('o botão de parágrafo vem ANTES do texto; o inline vem DEPOIS', () => {
    const ita = prose('Ecco la casa.', 'p', {}, 'it');
    assert.ok(ita.children[0].classList.contains('speak--para'));

    const pt = prose('a palavra <it>casa</it> aqui', 'p', {}, 'pt');
    const inline = pt.querySelector('.it-inline');
    assert.ok(inline.children[0].classList.contains('it-inline__text'));
    assert.ok(inline.children[1].classList.contains('speak--inline'));
  });

  test('parênteses saem do áudio nos dois modos', () => {
    assert.deepEqual(
      spokenLabels(prose('Ecco la casa (a casa).', 'p', {}, 'it')),
      ['Ecco la casa.']
    );
    assert.deepEqual(
      spokenLabels(prose('a forma <it>lieta (feminino)</it> concorda', 'p', {}, 'pt')),
      ['lieta']
    );
  });

  test('o botão de parágrafo fala em it-IT, nunca em português', async () => {
    const p = prose('Io parlo <pt>eu falo</pt> italiano.', 'p', {}, 'it');
    speakButtons(p)[0].dispatchEvent({ type: 'click' });
    await flush();
    assert.equal(synth.spoken.at(-1).text, 'Io parlo italiano.');
    assert.equal(synth.spoken.at(-1).lang, 'it-IT');
  });

  test('o modo desce por renderSection, renderBlock e renderStage', () => {
    const sec = renderSection({
      id: 's1', category: 'VERBO', titolo: 'Parlare', gloss: 'falar',
      spiegazione: ['Il verbo è regolare.', 'Le desinenze sono sei.'],
      blocks: [{ type: 'nota', tono: 'info', testo: 'Attenzione alla desinenza.' }],
    }, 'it');
    // 2 parágrafos de spiegazione + 1 nota, cada um com seu botão de
    // parágrafo — mais o botão do título, que não depende do modo.
    assert.equal(sec.querySelectorAll('.speak--para').length, 3);

    const stage = renderStage({ id: 'x', kicker: 'k', title: 't', intro: 'Ecco il testo.', modo: 'it' });
    assert.equal(stage.querySelectorAll('.speak--para').length, 1);
  });
});

describe('bloco desconhecido', () => {
  test('degrada para um aviso visível em vez de sumir', () => {
    const b = renderBlock({ type: 'inventado' });
    assert.match(b.innerHTML, /bloco desconhecido: inventado/);
  });

  test('o tipo é escapado — o JSON de conteúdo não injeta HTML', () => {
    const b = renderBlock({ type: '<img src=x onerror=1>' });
    assert.ok(!b.innerHTML.includes('<img'), b.innerHTML);
    assert.match(b.innerHTML, /&lt;img/);
  });
});

describe('renderSection', () => {
  const secao = {
    id: 'l01-s01',
    category: 'VERBO',
    sottotitolo: 'Presente Indicativo',
    titolo: 'Essere · Avere',
    gloss: 'ser/estar · ter',
    spiegazione: ['Primeiro parágrafo.', 'Segundo parágrafo.'],
    blocks: [{ type: 'lista', items: [{ it: 'Io sono', pt: 'eu sou' }] }],
  };

  test('monta chips, título audível, gloss e explicação', () => {
    const s = renderSection(secao);
    assert.equal(s.getAttribute('id'), 'l01-s01');
    assert.equal(s.querySelectorAll('.chip').length, 2);
    assert.equal(spokenLabels(s)[0], 'Essere · Avere');
    assert.equal(s.querySelectorAll('.spiegazione p').length, 2);
    assert.match(s.querySelector('.section__gloss').innerHTML, /ser\/estar/);
  });

  test('a explicação vem antes dos blocos — é o que torna o site autocontido', () => {
    const s = renderSection(secao);
    const body = s.querySelector('.section__body');
    assert.equal(body.children[0].className, 'spiegazione');
  });

  test('seção sem sottotitolo, gloss ou blocks não quebra', () => {
    const s = renderSection({ id: 'x', category: 'VERBO', titolo: 'T' });
    assert.equal(s.querySelectorAll('.chip').length, 1);
    assert.equal(s.querySelectorAll('.section__gloss').length, 0);
  });
});

describe('renderObiettivi', () => {
  test('cada objetivo é frase italiana e ganha 🔊', () => {
    // Este era o buraco que originou o invariante 7.1: as três colunas do
    // cabeçalho eram italiano puro e não tinham áudio nenhum.
    const o = renderObiettivi({
      comunicazione: ['Presentarsi', 'Salutare'],
      lessico: ['I numeri'],
      grammatica: ['Essere e avere'],
    });
    assert.deepEqual(spokenLabels(o), ['Presentarsi', 'Salutare', 'I numeri', 'Essere e avere']);
    assert.equal(o.querySelectorAll('h2').length, 3);
  });

  test('header ausente devolve null', () => {
    assert.equal(renderObiettivi(null), null);
    assert.equal(renderObiettivi(undefined), null);
  });

  test('coluna vazia não gera item', () => {
    const o = renderObiettivi({ comunicazione: ['A'] });
    assert.equal(o.querySelectorAll('li').length, 1);
  });

  test('item com `sezione` vira link; string simples continua texto', () => {
    const o = renderObiettivi({
      comunicazione: ['Presentarsi', { it: 'Salutare', sezione: 'l01-s05' }],
    });
    const links = o.querySelectorAll('a');
    assert.equal(links.length, 1, 'só o item com sezione vira link');
    assert.equal(links[0].getAttribute('href'), '#l01-s05');
    assert.equal(links[0].innerHTML, 'Salutare');
  });

  test('o 🔊 fica FORA do link — clicar nele toca, não navega', () => {
    // Se o botão estivesse dentro do <a>, o clique borbulharia para a âncora
    // e a página rolaria em vez de (ou além de) falar.
    const o = renderObiettivi({ comunicazione: [{ it: 'Salutare', sezione: 'l01-s05' }] });
    assert.equal(o.querySelectorAll('a .speak').length, 0);
    assert.equal(speakButtons(o).length, 1);
  });

  test('objeto sem sezione ainda fala e ainda aparece', () => {
    const o = renderObiettivi({ comunicazione: [{ it: 'Salutare' }] });
    assert.deepEqual(spokenLabels(o), ['Salutare']);
    assert.equal(o.querySelectorAll('a').length, 0);
  });
});

describe('renderFunzioni', () => {
  const AULA = {
    funzioni: [
      { id: 'l01-f01', quando: 'Quando saluti', gloss: 'Quando você cumprimenta',
        figura: '👋', chunks: ['c1', 'c2'] },
      { id: 'l01-f02', quando: 'Quando ti presenti', gloss: 'Quando você se apresenta',
        chunks: ['c1'] },
    ],
    chunks: [
      { id: 'c1', it: 'Buongiorno', pt: 'Bom dia' },
      { id: 'c2', it: 'Ciao', pt: 'Oi / Tchau' },
    ],
  };

  test('aula sem funzioni devolve null', () => {
    assert.equal(renderFunzioni({ chunks: [] }), null);
    assert.equal(renderFunzioni(null), null);
  });

  test('um card por função, com o id da função como âncora', () => {
    const f = renderFunzioni(AULA);
    const cards = f.querySelectorAll('.funzione');
    assert.equal(cards.length, 2);
    assert.equal(cards[0].getAttribute('id'), 'l01-f01');
  });

  test('resolve os chunks por id, sem duplicar o texto deles', () => {
    const f = renderFunzioni(AULA);
    const righe = f.querySelectorAll('.funzione__riga');
    assert.equal(righe.length, 3, '2 chunks no primeiro grupo + 1 no segundo');
    assert.match(righe[0].textContent, /Buongiorno/);
    assert.match(righe[0].textContent, /Bom dia/);
  });

  test('o mesmo chunk pode servir a duas intenções', () => {
    // `Ciao` é saudação e despedida; agrupar por referência é o que permite
    // isso sem duplicar id — e id duplicado misturaria dois progressos.
    const f = renderFunzioni(AULA);
    assert.equal(f.textContent.match(/Buongiorno/g).length, 2);
  });

  test('o rótulo e cada linha italiana ganham 🔊', () => {
    const f = renderFunzioni(AULA);
    assert.deepEqual(spokenLabels(f),
      ['Quando saluti', 'Buongiorno', 'Ciao', 'Quando ti presenti', 'Buongiorno']);
  });

  test('a figura é role=img com a glossa como nome acessível', () => {
    const f = renderFunzioni(AULA);
    const fig = f.querySelector('.funzione__figura');
    assert.equal(fig.getAttribute('role'), 'img');
    assert.equal(fig.getAttribute('aria-label'), 'Quando você cumprimenta');
    assert.equal(fig.textContent, '👋');
  });

  test('referência para chunk inexistente não quebra a página', () => {
    // O validador reprova isto; o render não pode explodir por causa disso.
    const f = renderFunzioni({
      funzioni: [{ id: 'f1', quando: 'X', chunks: ['fantasma'] }],
      chunks: [],
    });
    assert.equal(f.querySelectorAll('.funzione__riga').length, 0);
  });

  /* --- A porta do caderno ------------------------------------------------
     O botão nasce VISÍVEL aqui, ao contrário do irmão no verso do flashcard.
     Era o laço fechado: o único jeito de guardar uma forma estava escondido
     atrás do «Mostrar» de uma carta, então só achava o caderno quem já o
     tinha usado. */

  test('sem `notebook`, nenhuma linha ganha botão — compatível para trás', () => {
    const f = renderFunzioni(AULA);
    assert.equal(f.querySelectorAll('.funzione__caderno').length, 0);
  });

  test('com `notebook`, cada linha ganha um ＋ caderno já visível', () => {
    const f = renderFunzioni(AULA, 'pt', { has: () => false, toggle: () => true });
    const bts = f.querySelectorAll('.funzione__caderno');
    assert.equal(bts.length, 3, 'um por linha, inclusive o chunk repetido');
    assert.equal(bts[0].hasAttribute('hidden'), false, 'visível de saída, sem virar carta');
    assert.equal(bts[0].textContent, '＋ caderno');
    assert.equal(bts[0].getAttribute('aria-pressed'), 'false');
  });

  test('o que já está no caderno nasce marcado', () => {
    const f = renderFunzioni(AULA, 'pt', { has: (id) => id === 'c1', toggle: () => true });
    const bts = f.querySelectorAll('.funzione__caderno');
    assert.equal(bts[0].getAttribute('aria-pressed'), 'true');
    assert.equal(bts[0].textContent, '✓ no caderno');
    assert.equal(bts[1].getAttribute('aria-pressed'), 'false', 'c2 não está');
  });

  test('clicar entrega o chunk inteiro e alterna rótulo e aria-pressed', () => {
    const guardados = [];
    let dentro = false;
    const f = renderFunzioni(AULA, 'pt', {
      has: () => dentro,
      toggle(chunk) { guardados.push(chunk); dentro = !dentro; return dentro; },
    });
    const btn = f.querySelector('.funzione__caderno');

    btn.click();
    assert.deepEqual(guardados[0], { id: 'c1', it: 'Buongiorno', pt: 'Bom dia' },
      'o chunk vai inteiro — o caderno precisa do `it` e do `pt`');
    assert.equal(btn.textContent, '✓ no caderno');
    assert.equal(btn.getAttribute('aria-pressed'), 'true');

    btn.click();
    assert.equal(btn.textContent, '＋ caderno');
    assert.equal(btn.getAttribute('aria-pressed'), 'false');
  });

  test('render.js não fala com o store: só usa o que recebe por parâmetro', () => {
    // `notebook` sem os métodos não pode explodir — é a mesma tolerância que
    // o flashcard tem com `ctx.notebook?.toggle?.()`.
    const f = renderFunzioni(AULA, 'pt', {});
    const btn = f.querySelector('.funzione__caderno');
    assert.equal(btn.getAttribute('aria-pressed'), 'false');
    btn.click();
    assert.equal(btn.getAttribute('aria-pressed'), 'false');
  });
});

describe('renderStage', () => {
  test('id, kicker, título, intro e filhos', () => {
    const s = renderStage(
      { id: 'studio', kicker: 'Etapa 2', title: 'Studio', intro: 'texto' },
      el('p', {}, 'filho')
    );
    assert.equal(s.getAttribute('id'), 'studio');
    assert.equal(s.querySelector('.stage__kicker').textContent, 'Etapa 2');
    assert.equal(s.querySelector('.stage__intro').innerHTML, 'texto');
    assert.equal(s.textContent.includes('filho'), true);
  });

  test('sem intro, o parágrafo não aparece', () => {
    const s = renderStage({ id: 'x', kicker: 'k', title: 't' });
    assert.equal(s.querySelectorAll('.stage__intro').length, 0);
  });
});

describe('audioBar', () => {
  test('tem tocar, repetir, parar e as duas velocidades', () => {
    const bar = audioBar({ onPlay: () => {}, playLabel: 'Ouvir a frase' });
    const botoes = bar.querySelectorAll('button');
    assert.equal(botoes.length, 5);
    assert.match(botoes[0].textContent, /Ouvir a frase/);
    assert.equal(bar.querySelectorAll('.btn--sm').length, 2, 'Lento e Normal');
  });

  test('tocar e "de novo" chamam onPlay com a velocidade corrente', () => {
    const rates = [];
    const bar = audioBar({ onPlay: (r) => rates.push(r) });
    const [play, again] = bar.querySelectorAll('button');
    play.click();
    again.click();
    assert.deepEqual(rates, [1.0, 1.0]);
  });

  test('parar cancela a fala', () => {
    const antes = synth.cancels;
    const bar = audioBar({ onPlay: () => {} });
    bar.querySelectorAll('button')[2].click();
    assert.equal(synth.cancels, antes + 1);
  });

  test('trocar a velocidade move o aria-pressed e afeta a próxima reprodução', () => {
    const rates = [];
    const bar = audioBar({ onPlay: (r) => rates.push(r) });
    const [lento, normal] = bar.querySelectorAll('.btn--sm');

    lento.click();
    assert.equal(lento.getAttribute('aria-pressed'), 'true');
    assert.equal(normal.getAttribute('aria-pressed'), 'false');

    bar.querySelectorAll('button')[0].click();
    assert.equal(rates.at(-1), 0.7);

    normal.click();
    assert.equal(normal.getAttribute('aria-pressed'), 'true');
    assert.equal(lento.getAttribute('aria-pressed'), 'false');
  });

  test('botões extras entram na barra', () => {
    const bar = audioBar({ onPlay: () => {}, extra: [el('button', { class: 'extra' })] });
    assert.equal(bar.querySelectorAll('.extra').length, 1);
  });
});
