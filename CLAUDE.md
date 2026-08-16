# CLAUDE.md

Instruções operacionais para agentes trabalhando neste repositório.

O objetivo principal deste projeto é um **loop de autoria repetível**: a cada aula nova, ler os arquivos que o professor entregou e acrescentar uma seção ao site **sem redesenhar nada e sem tocar em código**. Este documento existe para tornar isso mecânico. Se você precisar abrir `js/` para adicionar uma aula, algo está errado — pare e diga.

---

## Invariantes — nunca viole sem avisar

1. **Nunca commite `presentations/` nem `ERRATA.md`.** Ambos estão no `.gitignore`. O primeiro é material de terceiros e contém dados pessoais; o segundo é caderno de trabalho local.
2. **Nenhum arquivo versionado cita nome de pessoa ou da plataforma de aula.** Vale para os docs também — este repositório é público. Diálogos usam nomes italianos genéricos (Marco, Giulia, Luca). Não use dados pessoais reais (idade, cidade) em exemplos.
2.1. **`content/` nunca fala em terceira pessoa sobre a origem do material.** Nada de "o professor anotou/resumiu/explicou", "na aula ele disse", "É o Exercício N do Compito M", ou qualquer frase que denuncie a existência de um professor, aula ao vivo, apostila ou deck por trás do conteúdo. O invariante 3 já exige que todo conteúdo explicativo seja transcrito para `content/*.json`; isso vai além e exige que a transcrição também **apague a voz de quem entregou o material** — o texto final tem que se ler como se o próprio site fosse a fonte original. Reformule como explicação direta ("a regra é X") ou apague a referência.
3. **Nunca linke PDF nem sirva arquivo de `presentations/`.** O site é autocontido: todo conteúdo explicativo é transcrito para `content/*.json`.
4. **Zero dependências e zero passo de build.** Sem `package.json`, sem bundler, sem CI de build, sem CDN. O site é HTML + CSS + JS vanilla servido direto. Vale para as ferramentas também: o validador é stdlib do Python e a suíte é o `node --test` embutido com um DOM próprio — se a resposta para um problema for `npm install`, ela está errada.
5. **Ao adicionar uma aula, edite apenas `content/`.** Não toque em `js/`, `css/` nem nos JSONs de aulas anteriores. As duas exceções são geradas por ferramenta, nunca à mão: o `conteggio` do manifest e o `content/lessico.json`, que saem de `python tools/validate.py --fix`.
6. **`id` de item é imutável.** Ele é a chave do progresso no `localStorage`. Renomear um `id` apaga o histórico daquele item; reaproveitar um `id` mistura históricos de coisas diferentes.
7. **Toda seção precisa de `spiegazione`.** É o que torna o site independente dos slides. O validador reprova se faltar.
7.1. **Todo texto italiano exibido tem botão de áudio — com uma exceção só, abaixo.** Isso vale para `titolo` de aula/seção, itens de `header` (comunicazione/lessico/grammatica), toda célula de `tabella` que não esteja marcada `pt: true`, cabeçalhos de coluna de `paradigma` e `paradigm-fill`, as battute do `scambio`, e o título+gloss do `dialogo`. Ao criar uma tabela nova, pergunte célula por célula: "isto é italiano ou é rótulo/descrição em português?" — no segundo caso, marque `{ "html": "…", "pt": true }`. Ver a seção *Tipos de bloco*.
   **A exceção é o campo `sbagliata` do `correzione`**, e ela é a única. Aquele italiano é agramatical de propósito — é o que o aluno tem de achar — e por isso não ganha 🔊 **nem entra em `content/lessico.json`**: ouvir a forma errada em voz italiana nativa é o jeito mais rápido de gravá-la como se fosse boa, e admiti-la no léxico autorizaria um diálogo a usá-la. Só a `risposta` fala, e só depois de o aluno responder. Ver *Exercícios*.
7.2. **Marque sempre a minoria — e o `modo` da aula diz quem é a minoria.** É a regra única por trás dos mecanismos de "isto é italiano?". Em **célula de tabela** o italiano é sempre a maioria → marque a exceção portuguesa com `pt: true`. Em **texto corrido** depende do `modo`: em `pt` a prosa é portuguesa e você marca o italiano com `<it>`; em `misto`/`it` a prosa é italiana e você marca o português com `<pt>`. Todos nomeiam o que é marcado, nunca o padrão. Ver *Os dois mecanismos* e *Modo de língua*.
8. **Nada de atividade em par ou grupo.** A aula é particular 1-a-1. Materiais A1 de referência estão cheios de *"in coppia"* e *"girate per la classe"* — tudo isso é inaplicável aqui.
9. **`category` só entre os cinco valores permitidos** (abaixo). Acrescentar um valor exige editar `tools/validate.py`, `css/tokens.css` **e** este documento.
10. **A ordem das etapas é fixa e igual em toda aula.** *Riscaldamento → Lessico → Ascolto → Studio → Esercizi → Produzione → Bilancio.* Quem manda é a sequência de `append` em `renderLesson()` (`js/app.js`), **não** a ordem das chaves no JSON — reordenar o arquivo não muda nada na página. Uma aula pode **omitir** etapa (a Aula 0 não tem diálogo com paradigma; a trilha filtra sozinha), nunca reordenar. O motivo é pedagógico: **contexto antes da regra** — o aluno encontra o bloco pronto, ouve o diálogo usando o bloco, e só então lê o porquê. Aula que pareça exigir outra ordem é sinal de que o conteúdo está no bloco errado — pare e diga; não mexa em `js/`.

---

## Comandos

```bash
# Extrair texto de PDF (poppler; já disponível no ambiente)
pdftotext -layout -enc UTF-8 "presentations/Lezione_2-Slides.pdf" -

# Validar content/ contra todos os invariantes — SEMPRE rode antes de terminar
python tools/validate.py

# Reescreve os dados derivados (conteggio do manifest + lessico.json).
# Rode DEPOIS de acrescentar uma aula, antes de validar.
python tools/validate.py --fix

# Suítes. A de JS se mexer em js/ ou css/; a de Python se mexer no validador.
node tools/test.mjs
python tools/validate_test.py

# Navegador de verdade. Antes de commitar mudança em css/ ou em render/layout:
# é a única que enxerga cascata, @media e layout computado. Pula sem Chrome.
node tools/browser-test.mjs

# Servir localmente. Necessário: fetch() de JSON falha em file:// por CORS.
python -m http.server 8000
# → http://localhost:8000
```

---

## As fontes e seus papéis

O professor entrega dois tipos de arquivo, e **eles não são equivalentes**:

| Padrão | Tipo | Papel |
|---|---|---|
| `Lezione_N-Slides.pdf` | deck 16:9 | **Referência estrutural** — quais tópicos, em que ordem, e as tabelas |
| `Lezione_N-<Tema>.pdf` | handout | Material de apoio de um tema (ex.: `Lezione_0-Alfabeto.pdf`) |
| `Lezione_N-Anotações.txt` | export do chat da aula | **Fonte real dos exemplos e da progressão didática** |

**Os slides dizem o que foi coberto; as anotações mostram como foi ensinado.** As anotações costumam conter conteúdo que **não está** no deck. Na Aula 1, por exemplo, um tema inteiro (idade com *avere*: `Io ho quindici anni`, `vent'anni`) e a regra de `lo/gli` por som inicial existiam **só** nas anotações. Se você usar apenas o deck, vai produzir uma aula incompleta.

### Parse do PDF

`pdftotext -layout -enc UTF-8 <arquivo> -`. Nos decks, procure o **chip de categoria** no topo-esquerdo de cada slide (`VERBO`, `VOCABOLARIO`, `ESPRESSIONE`, `GRAMMATICA`) — ele vira o campo `category`. O H1 italiano vira `titolo`; o subtítulo em itálico vira `gloss`.

### Parse do export de chat

A **ordem cronológica é a progressão didática** — preserve-a. Filtre o ruído da plataforma:

- a palavra `img` isolada (avatar)
- nomes de pessoas e linhas de nome de remetente
- timestamps `HH:MM`
- cabeçalhos de data (`qui., jul. 23`)
- `Enviado`
- mensagens promocionais e automáticas da plataforma (avaliação, "compartilhe sua experiência", "peça para … compartilhar")
- linhas de anexo (`Alfabeto`, `54.0 KB PDF`)

Sobra só o corpo das mensagens do professor, em ordem. **Nenhum nome extraído daqui pode chegar a `content/`.**

---

## Validação de formas duvidosas

Quando o material da aula divergir do que você espera, **não assuma erro**. Há três saídas:

1. **Confirmado pela fonte** → ensine como está.
2. **Exceção real** → ensine **e explique por que é exceção**, dentro de `spiegazione` ou de um bloco `nota` com `tono: "eccezione"`. Isso é conteúdo, não errata.
3. **Dúvida não resolvida ou lapso provável** → registre em `ERRATA.md` (local) com status, e ensine a forma padrão.

### Hierarquia de fontes

1. **Treccani** — `treccani.it/vocabolario/<lema>` — referência primária.
2. **Accademia della Crusca** — para questão normativa em disputa.
3. Dizionario Olivetti, Wikizionario IT — secundárias.

**Reverso serve para conjugação verbal e contexto de tradução, não como autoridade normativa.**

### Caso de referência

As anotações da Aula 1 traziam `i belghe`. Treccani registra `bèlga agg. e s. m. e f. (pl. m. -gi, f. -ghe)` → `i belgi` / `le belghe`. E existe exceção real: palavras em `-ca/-ga` normalmente mantêm o som duro no plural (`amica → amiche`, `collega → colleghi`), logo o esperado seria `belghi`, mas é `belgi`, por influência do francês *Belges*. Resultado: a **exceção foi ensinada e explicada** (saída 2, virou nota `eccezione` em `l01-s03`), e a grafia `i belghe` foi tratada como lapso (saída 3, foi para o `ERRATA.md`).

### `ERRATA.md` é fila, não depósito

Cada entrada tem `status` (`aberto` / `perguntado` / `resolvido`), data, o que a fonte diz e o link. Ao resolver, **migre a explicação para a `spiegazione` da seção e remova a entrada**. A checklist de aula nova **começa** por aqui, justamente para nada ficar eternamente aberto.

---

## Schema de `content/lezione-NN.json`

Fonte da verdade. `tools/validate.py` verifica tudo abaixo.

```jsonc
{
  "id": "01",                    // string, 2 dígitos com zero à esquerda; casa com o manifest
  "numero": 1,                   // int
  "titolo": "Io sono, tu sei",   // em italiano
  "gloss": "…",                  // em português

  // Cabeçalho de 3 colunas, no modelo dos livros A1 — e o SUMÁRIO da aula.
  // Cada item é string OU objeto, o mesmo idioma da célula de `tabella`:
  //   "Presentarsi"                              → texto, sem link
  //   { "it": "…", "sezione": "l01-s06" }        → vira atalho para o ponto
  // `sezione` aceita um `section.id` desta aula OU uma âncora de etapa
  // (`riscaldamento` `lessico` `ascolto` `studio` `esercizi` `produzione`
  // `bilancio`) — item de comunicazione costuma apontar para o diálogo.
  // Alvo inexistente é ERRO: o link ficaria clicável e mudo.
  "header": {
    "comunicazione": [{ "it": "Salutare", "sezione": "l01-s05" }],
    "lessico": ["…"],
    "grammatica": ["…"]
  },

  "riscaldamento": {
    "prompt": "…",               // ativa conhecimento prévio; pode ter HTML
    "spiegazione": ["…"]
  },

  "sections": [{
    "id": "l01-s01",             // IMUTÁVEL. Convenção: l<NN>-s<NN>
    "category": "VERBO",         // VERBO | VOCABOLARIO | ESPRESSIONE | GRAMMATICA | PRONUNCIA
    "sottotitolo": "Presente Indicativo",   // chip secundário, opcional
    "titolo": "Essere · Avere",  // italiano
    "gloss": "ser/estar · ter",  // português
    "spiegazione": [             // OBRIGATÓRIO, 2+ parágrafos. Ver regras abaixo.
      "…", "…"
    ],
    "blocks": [ /* ver tipos de bloco */ ]
  }],

  "chunks": [{
    "id": "l01-c01",
    "it": "Io sono ___.",        // semiFixed EXIGE o slot ___
    "pt": "Eu sou ___.",
    "category": "VERBO",
    "chunkType": "semiFixed",    // fixed | semiFixed | collocation | word
    "slot": ["brasiliano", "…"], // só em semiFixed
    "figura": "🚗"               // opcional; ver abaixo
  }],

  "funzioni": [ /* opcional; ver abaixo */ ],
  "dialogo": { /* ver abaixo */ },
  "esercizi": [ /* ver abaixo */ ],
  "produzione": [{ "id": "l01-p01", "consegna": "…" }],
  "bilancio": ["Sei conjugar …", "…"]          // autoavaliação, 1ª pessoa
}
```

### Os dois eixos são ortogonais

- **`category`** — eixo de **domínio**. Vem do chip do deck. Governa cor, navegação e filtro.
- **`chunkType`** — eixo de **forma lexical**. Governa para qual drill o item é elegível: só `semiFixed` alimenta slot-and-frame; `word`, `collocation` e `fixed` entram em flashcard.

*Buongiorno!* é legitimamente `ESPRESSIONE` + `fixed`. **Não funda os dois campos** — isso quebraria a elegibilidade automática de exercício.

`PRONUNCIA` é uma extensão nossa: o deck não tinha chip para fonética, e rotular pronúncia como `GRAMMATICA` seria mentir na taxonomia.

### `figura` — o estímulo visual da carta

Campo **opcional** do chunk. Quando existe, ele substitui o português na
frente do flashcard, e a recuperação deixa de ser tradução (PT → IT) para
ser **conceito → IT**, que é o caminho que trava numa conversa. O português
volta no verso, junto do italiano: 🚗 sozinho não distingue `la macchina` de
`l'auto`, e o aluno precisa saber se acertou.

**Emoji por padrão, SVG inline por exceção.** Arquivo de imagem está fora:
binário em repositório público exige origem e licença rastreadas, e não há
passo de build para otimizar nada.

```jsonc
{ "id": "l01-c29", "it": "il Brasile", "pt": "o Brasil",
  "category": "VOCABOLARIO", "chunkType": "word", "figura": "🇧🇷" }
```

Regras, e o validador reprova quem as quebrar:

- **Só ponha figura quando ela for inequívoca.** 🚗 para `la macchina` serve;
  🚜 para `la fattoria` não — o aluno responderia *il trattore* e teria
  errado por culpa da figura, não da memória. Na dúvida, deixe sem.
- **Bandeira é país, nunca língua.** 🇩🇪 é `la Germania`. Se 🇩🇪 também fosse
  `il tedesco`, duas cartas teriam a mesma frente e uma delas seria sempre
  «errada».
- **SVG inline** (`"<svg …>…</svg>"`) só quando não houver emoji que sirva.
  Sem `<script>`, sem `on…=`, sem `<image>`, sem `<foreignObject>` e sem
  `href` que não comece com `#` — é o único campo do conteúdo que vira
  marcação crua, e referência externa quebraria o «zero CDN».
- **`figura` não entra em `content/lessico.json`.** Emoji não é forma
  italiana; o léxico continua colhendo o que a aula *exibe* em italiano.
- A figura vai com `role="img"` e a glossa portuguesa como `aria-label`.
  Com leitor de tela a carta degrada exatamente para a carta de texto.

### `funzioni` — os chunks agrupados por intenção comunicativa

Campo **opcional** no topo do JSON. Rende as *Frasi utili* no alto da etapa
Lessico, acima do baralho: primeiro se lê organizado, depois se testa
embaralhado.

```jsonc
"funzioni": [
  { "id": "l01-f01",
    "quando": "Quando ti presenti",        // italiano, ganha 🔊
    "gloss": "Quando você se apresenta",   // português
    "figura": "🤝",                        // opcional, mesmas regras acima
    "chunks": ["l01-c01", "l01-c08", "l01-c29"] }
]
```

- **Agrupa por REFERÊNCIA de id, nunca copiando texto.** `chunks` continua
  sendo o inventário lexical único da aula. Duplicar o texto aqui faria uma
  edição no chunk deixar o agrupamento mentindo, e id repetido misturaria
  dois históricos de progresso. Id que não existe em `chunks` é **erro**.
- **O mesmo chunk pode entrar em duas funções.** `Ciao` é saudação e
  despedida; é justamente por referenciar que isso sai de graça.
- **Não grava progresso e não conta no `conteggio`.** Função é leitura
  organizada; quem testa a recuperação é o baralho logo abaixo dela.
- **Só `fixed` é cobrado.** O validador **avisa** quando uma frase fixa ficou
  fora de toda função — frase fixa é por definição frase pronta com função
  comunicativa. `word` e `collocation` são item lexical (`il cane`,
  `i Paesi Bassi`), não têm um «quando se usa» e ficam de fora da conta.
- **`quando` entra em `content/lessico.json`.** Não é exceção nova: é o mesmo
  caso de `header.comunicazione`, rótulo funcional em italiano exibido com 🔊.
- **Cada linha oferece «＋ caderno».** É a porta de entrada do caderno léxico
  — visível de saída, ao contrário do botão irmão no verso do flashcard. Ver
  abaixo.

### `content/frasi.json` — as frases que atravessam todas as aulas

Arquivo de conteúdo que **não é aula**: sem `numero`, sem `sections`, fora do
manifest e fora de `lessico.json`. Reusa as chaves `funzioni` + `chunks`, e é
por isso que `renderFunzioni()` monta `frasi.html` sem uma linha de mudança.

```jsonc
{ "id": "frasi", "titolo": "…", "gloss": "…", "intro": "…",
  "gruppi": [ { "id": "tu-dici", "titolo": "Tu dici", "gloss": "…",
                "spiegazione": ["…"], "funzioni": [ /* iguais aos da aula */ ] } ],
  "chunks": [ /* iguais aos da aula */ ] }
```

Três regras, e o validador (`check_frasi`) sustenta as três:

- **Frase que uma aula já ensina entra com o MESMO id** — `l00-c03`, não um
  id novo. Id é a chave do caderno, e dois ids para a mesma frase a
  guardariam duas vezes. O preço é o texto duplicado no arquivo, então o
  texto é **conferido contra a aula de origem**: editar um lado só quebra o
  build, em vez de deixar o site se contradizendo em silêncio.
- **Id que não vem de aula nenhuma começa com `fr-`**, para nunca colidir com
  o id de uma aula que ainda não foi escrita.
- **Fica fora de `content/lessico.json`.** O léxico existe para a checagem do
  i+1 dos diálogos; se as frases de sobrevivência o alimentassem, um diálogo
  se autoautorizaria a usá-las. Elas são `fixed` decoradas inteiras, não
  vocabulário ensinado. Corolário aceito: usar uma delas num diálogo **vai**
  gerar aviso de escopo, e a decisão é caso a caso.

Não grava progresso e não entra no Ripasso — é a mesma decisão de `funzioni`:
leitura organizada. O que ela tem é o **＋ caderno**.

### A porta do caderno léxico

O caderno (`notebook.html`) já existia inteiro e passava nos testes, e mesmo
assim era invisível: só se chegava a ele pelo card da home, que **só aparece
com o caderno cheio**, e o único botão capaz de enchê-lo nascia `hidden`
atrás do «Mostrar» de uma carta. Um laço fechado — só achava quem já tinha
usado.

Hoje há três entradas, e a diferença entre elas é deliberada:

| Onde | Sempre visível? | Por quê |
|---|---|---|
| Linha de *Frasi utili* (`renderFunzioni`) | **sim** | é onde o aluno está olhando o léxico |
| Página `frasi.html` | **sim** | idem, e a página nunca está vazia |
| Verso da carta do flashcard | só depois do «Mostrar» | é quando o aluno **descobre que não lembrava** — o momento em que guardar vale a pena |
| Card na home | só com o caderno cheio | call-out numérico vazio ensina a ignorar |

**Quem grava é o `app.js`, sempre.** `notebookCtx(lessonId)` devolve
`{has, toggle}` e é passado por parâmetro — para o `ctx` do exercício e para
`renderFunzioni(lesson, modo, notebook)`. Nem `render.js` nem módulo de
exercício fala com o `store.js`.

### Tipos de bloco

```jsonc
// lista — itens italiano + gloss + nota opcional
{ "type": "lista", "titolo": "…",
  "items": [{ "it": "…", "pt": "…", "nota": "…" }] }

// tabella — TODA linha precisa ter o mesmo número de células do cabeçalho.
// Cada célula (cabeçalho ou corpo) é string OU objeto:
//   string simples          → assumida em ITALIANO, ganha 🔊 automaticamente
//   { "html": "…", "pt": true } → NÃO italiano (cabeçalho/descrição em
//                                  português), sem botão de áudio
// O texto falado tem qualquer aside entre parênteses removido antes do TTS
// (parênteses neste conteúdo só guardam glosa em PT ou abreviação, nunca
// italiano que precise ser ouvido) — não precisa fazer nada para isso,
// render.js cuida sozinho.
{ "type": "tabella", "titolo": "…",
  "intestazioni": ["Persona", "Essere", "Avere"],
  "righe": [["io", "sono", "ho"]] }

// Exemplo de tabela mista (a maioria não precisa disto — só quando um
// cabeçalho ou coluna inteira é descrição em português, não italiano):
{ "type": "tabella", "titolo": "Quando usare quale",
  "intestazioni": [
    { "html": "Artigo", "pt": true },      // rótulo em PT, sem botão
    { "html": "Usa-se antes de", "pt": true },
    "Esempi"                                // Italiano, ganha botão
  ],
  "righe": [
    ["<b>il</b>", { "html": "consoante comum (masc.)", "pt": true }, "<em>il cane</em>"]
  ] }

// contrasto — 2+ grupos, para contraste de som ou de forma
{ "type": "contrasto", "titolo": "…",
  "gruppi": [{ "etichetta": "C dura /k/", "gloss": "…",
               "esempi": [{ "it": "Casa", "pt": "casa" }] }] }

// paradigma — tabela de formas; `forme` precisa ter len == len(colonne)
{ "type": "paradigma", "titolo": "…",
  "colonne": ["Maschile sing.", "Femminile sing.", "Maschile pl.", "Femminile pl."],
  "righe": [{ "id": "l01-s03-p01", "pt": "brasileiro",
              "forme": ["il brasiliano", "la brasiliana", "i brasiliani", "le brasiliane"],
              "eccezione": false }] }

// scambio — o microdiálogo de 2 a 4 turnos. É LEITURA, não drill: sem id,
// sem progresso, não entra no `conteggio`. Preenche o degrau que falta entre
// produzir uma frase solta (`traduzione`) e o diálogo de 8 turnos.
// Exatamente dois falantes, `A` e `B`, e ALTERNADOS — é o que o TTS sabe
// diferenciar, e dois turnos na mesma voz leem como uma frase só.
{ "type": "scambio", "titolo": "…",
  "battute": [ { "speaker": "A", "it": "Qualcosa da bere?", "pt": "Algo pra beber?" },
               { "speaker": "B", "it": "Un caffè, per favore.", "pt": "Um café, por favor." } ] }

// nota — callout. tono: info | attenzione | eccezione
{ "type": "nota", "tono": "attenzione", "titolo": "…", "testo": "…" }
```

> **`scambio` entra em `content/lessico.json`; `dialogo` não.** A diferença
> não é o formato — os dois são turnos com falante — é o papel. O scambio é
> **modelo que a aula exibe e ensina**, na mesma categoria de `lista` e
> `tabella`; o diálogo é **o que a checagem de escopo confere**, e entrando
> ele se autoautorizaria.

Campos de texto aceitam HTML inline (`<b>`, `<em>`, `<code>`). O TTS remove tags antes de falar.

### Os dois mecanismos de "isto é italiano?"

Há **dois**, com polaridade oposta, e isso é de propósito. A regra que
unifica os dois é uma só: **marque a minoria, deixe a maioria implícita.**

| Onde | Maioria | Você marca | Como |
|---|---|---|---|
| Célula de `tabella` | italiano (76%) | a exceção **portuguesa** | `{ "html": "…", "pt": true }` |
| Texto corrido | português (~87%) | a exceção **italiana** | `<it>…</it>` |

Os dois **nomeiam o que é marcado**, nunca o padrão — e é por isso que um se
chama `pt` e o outro `it` sem serem incoerentes. Inverter qualquer um deles
seria pior: exigir `<it>` em cada célula poria a marcação em 271 células
para poupar 87, e um `pt: true` em prosa obrigaria a envelopar a explicação
inteira em português para liberar quatro palavras italianas.

A polaridade difere porque **a granularidade difere**, não por acaso: uma
célula é um valor JSON discreto e comporta um campo; uma frase precisa de
marcação a nível de trecho, e não existe "campo" para meia oração.

#### Onde `<it>` vale

**Em todo campo de prosa** — e a lista é fechada, porque `<it>` num campo
que não passa por `prose()` **não vira botão e não avisa**:

`riscaldamento.prompt` · `riscaldamento.spiegazione` · `section.spiegazione` ·
`nota.testo` · `lista.item.nota` · `contrasto.esempio.nota` ·
`paradigma.riga.nota` · `esercizio.consegna` · `esercizio.aiuto` ·
nota de sub-item dos drills · `produzione.consegna` · `bilancio`

Acrescentou campo de texto novo? Passe-o por `prose()` em `js/` **e**
acrescente-o a `check_lesson`/`check_section` em `tools/validate.py`. Os
dois lados juntos, sempre — é o que impede o `<it>` de morrer calado.

`<it>…</it>` marca uma forma italiana citada em meio à prosa. O renderer a
troca por *texto + botão de áudio*, nessa ordem:

```jsonc
"testo": "Quando você vir <it><em>amico</em></it> → <it><em>amici</em></it> mas <it><em>amica</em></it> → <it><em>amiche</em></it>, não é capricho: …"
```

Regras de uso:

- **Marque a forma, não a frase.** `<it>amici</it>`, e não
  `<it>amico → amici</it>` — a seta iria para o TTS, e o aluno ouviria as
  duas formas grudadas quando o que ele quer é comparar uma com a outra.
- **Só italiano.** `<em>` continua sendo ênfase genérica e cai também sobre
  palavra portuguesa; é por isso que `<it>` existe em vez de a gente
  pendurar áudio no `<em>`. Marcar «capricho» com `<it>` faria o site
  oferecer voz italiana para uma palavra portuguesa.
- **Marcação interna sobrevive:** `<it><em>amici</em></it>` mantém o
  itálico na tela e manda `amici` limpo para o TTS.
- Parênteses de glosa saem do áudio, como em célula de tabela:
  `<it>lieta (feminino)</it>` fala só `lieta`.

> **Por que o validador reprova `<it>` torta.** O casamento é por regex sobre
> a string, não por parse de DOM — o DOM mínimo da suíte guarda `innerHTML`
> como texto e não o percorre. Consequência: uma tag desbalanceada **não
> quebra a página**, ela só deixa a forma muda, e ninguém percebe. Por isso
> `<it>` desbalanceada ou vazia é **erro**, não aviso.

**`<it>` não entra em `content/lessico.json`.** É a única exceção à
equivalência "ganha 🔊 ⇒ entra no léxico", e é deliberada: a prosa
*menciona* uma forma, o inventário de ensino continua sendo `chunks`,
`lista`, `tabella`, `contrasto` e `paradigma`. Se a citação em prosa
autorizasse vocabulário, bastaria mencionar uma palavra na explicação para
liberá-la no diálogo — e a checagem do i+1 perderia o sentido.

### Exercícios

Tipos registrados em `js/exercises/index.js`. Usar tipo não registrado é erro de validação.

**`flashcard` é a exceção:** ele nunca se escreve em `esercizi`. O baralho é **derivado** dos `chunks` da aula por `flashcardDeck()`, e escrever um à mão duplicaria os ids e faria o `conteggio` contar duas vezes. Entram os chunks `word`, `collocation` e `fixed` — `semiFixed` fica de fora porque tem lacuna por definição (`Io sono ___`) e não tem verso; ele é matéria do `slot-frame`.

> **O baralho mostra uma carta por vez, e isso é requisito, não estilo.** A
> primeira versão empilhava tudo numa `<ol>` e o olho lia a resposta da carta
> de baixo enquanto tentava a de cima — não havia recuperação, só leitura.
> Pelo mesmo motivo «Registrar revisão» só aparece na última carta: carta sem
> voto conta como não lembrada, então enviar no meio reprovaria em bloco o que
> o aluno ainda nem viu. E «✓ Lembrei» avança sozinho enquanto «✗ Não lembrei»
> fica parado: errar é exatamente quando guardar no caderno vale a pena, e
> avançar tiraria a chance no único momento em que ela aparece.

> **No Ripasso, cada carta vira um baralho de uma carta só.** `indexById`
> mapeia `carta.id` → `{...deck, carte: [carta]}`, e não para o baralho
> inteiro. Motivo concreto: `check` grava **todas** as cartas do baralho que
> recebeu, e carta sem voto conta como não lembrada — apontar para o baralho
> inteiro faria uma revisão de três cartas reprovar as outras vinte e quatro,
> que nem estavam vencidas. Na aula você revisa o baralho; no Ripasso, a carta.

**O inventário lexical da aula são os `chunks` — e só eles.** Vocabulário que
você quer ver virar carta tem que estar ali, com id próprio, mesmo que a
palavra já apareça num bloco `lista`. Não existe colheita automática de
`lista`: um item de lista não tem id, e id é a chave imutável do progresso.

```jsonc
// gap-audio — ouvir e completar a lacuna
{ "id": "l01-e01", "type": "gap-audio", "category": "VERBO",
  "consegna": "Ascolta e completa.",
  "audio": { "tts": "Io sono brasiliano.", "src": null },
  "testo": "Io ___ brasiliano.",     // a lacuna é literalmente ___
  "risposta": "sono",
  "pt": "Eu sou brasileiro.",
  "aiuto": "…",                      // opcional, atrás de um botão
  "accettaAnche": ["…"],             // opcional
  "tolleranzaAccenti": true,         // default true; false quando o acento É o conteúdo
  "tolleranzaElisione": false }      // default false; true aceita "lo amico" por "l'amico"
```

> **Regra dura:** `testo.replace("___", risposta)` tem que ser igual a `audio.tts`, ignorando caixa, espaço e pontuação final. Senão o aluno ouve uma coisa e lê outra. O validador checa isso — foi assim que se pegou `Un' amica` com espaço sobrando.

```jsonc
// qa-transcribe — ouvir pergunta + resposta, transcrever a RESPOSTA
{ "id": "l01-e10", "type": "qa-transcribe", "category": "VERBO",
  "consegna": "…",
  "domanda": { "tts": "…", "testo": "…", "pt": "…" },
  "risposta": { "tts": "…", "testo": "…", "pt": "…" },
  "aiuto": "…" }

// paradigm-fill — completar células de paradigma. Cada célula oculta é
// um item de progresso próprio, com id `<row.id>-c<índice>`.
{ "id": "l01-e13", "type": "paradigm-fill", "category": "VOCABOLARIO",
  "consegna": "…",
  "colonne": ["Maschile sing.", "…"],
  "righe": [{ "id": "l01-e13-r1", "pt": "brasileiro",
              "forme": ["il brasiliano", "la brasiliana", "i brasiliani", "le brasiliane"],
              "nascondi": [1, 3],        // índices que ficam em branco
              "nota": "…", "eccezione": false }] }
```

#### Os seis drills de fixação

São os tipos de **volume**: cada um leva vários sub-itens, e **cada sub-item
tem id próprio e vira uma linha do progresso**. É por isso que eles precisam
de `subItemIds` no módulo (ver `js/exercises/index.js`) — sem isso o
`conteggio` do manifest conta 1 onde há 8, a barra de progresso mente **e o
Ripasso nunca traz aquele sub-item de volta**.

> **Eles formam uma escada, e ela só se lê inteira.** Cada degrau tira uma
> muleta da tela: `abbinamento` dá os dois lados · `scelta` dá as
> alternativas · `riordino` dá as palavras · `slot-frame` dá o molde ·
> `trasformazione` dá a frase e pede uma operação · `traduzione` não dá nada
> além do sentido. Ao escrever uma aula, cubra degraus vizinhos — pular do
> `abbinamento` direto para o `traduzione` é onde o aluno trava e desiste.

```jsonc
// scelta — escolher a forma certa entre alternativas.
// Para o que se decide por contraste, não por regra: in×a, il×lo, -i×-e.
{ "id": "l02-e09", "type": "scelta", "category": "GRAMMATICA",
  "consegna": "…",
  "domande": [{ "id": "l02-e09-q1",
                "testo": "Noi abitiamo ___ Brasile.",  // a lacuna é obrigatória
                "opzioni": ["in", "a", "di", "per"],   // 2+, sem repetição
                "risposta": "in",                      // TEM que estar em opzioni
                "pt": "…", "nota": "…" }] }

// riordino — remontar a frase com as palavras fora de ordem.
// As peças precisam remontar EXATAMENTE a risposta; o validador confere.
{ "id": "l02-e14", "type": "riordino", "category": "GRAMMATICA",
  "consegna": "…",
  "frasi": [{ "id": "l02-e14-f1",
              "parole": ["Io", "abito", "a", "Roma"],
              "risposta": "Io abito a Roma.",   // pontuação é normalizada
              "pt": "…", "nota": "…", "accettaAnche": ["…"] }] }

// abbinamento — associar duas colunas. `destra` não pode repetir, senão a
// correção fica ambígua e uma linha certa seria marcada errada.
{ "id": "l02-e16", "type": "abbinamento", "category": "ESPRESSIONE",
  "consegna": "…",
  "coppie": [{ "id": "l02-e16-p1",
               "sinistra": "Dove abiti?",
               "destra": "Abito a Vienna, in Austria.", "pt": "…" }] }

// slot-frame — drill de substituição sobre frase semifixa (o do método
// lexical). O aluno escreve a frase INTEIRA a cada giro: o que se automatiza
// é o molde, e o molde só se automatiza passando inteiro.
{ "id": "l02-e04", "type": "slot-frame", "category": "VERBO",
  "consegna": "…",
  "frame": { "it": "Io parlo ___.", "pt": "Eu falo ___." },  // ___ obrigatório
  "modello": "Io parlo italiano.",   // opcional; default = risposta do 1º giro
  "giri": [{ "id": "l02-e04-g1",
             "slot": "italiano",     // o que entra no ___
             "pt": "italiano",       // prompt em PORTUGUÊS — o aluno produz
             "risposta": "Io parlo italiano.",
             "accettaAnche": ["…"] }] }

// trasformazione — converter o modo da frase. A operação isolada: o aluno já
// produz `Io sono italiano` e trava em `Non sono italiano?` porque nunca
// moveu as peças da frase que ele mesmo acabou de dizer.
{ "id": "l01-e26", "type": "trasformazione", "category": "GRAMMATICA",
  "consegna": "…",
  "frasi": [{ "id": "l01-e26-f1",
              "partenza": "Io sono italiano.",   // italiano, ganha 🔊
              "verso": "negativa",               // affermativa|negativa|interrogativa
              "risposta": "Io non sono italiano.",
              "accettaAnche": ["…"], "nota": "…" }] }

// traduzione — PT → IT, frase inteira, sem nenhum andaime na tela.
// O topo da escada: só o português aparece, e o italiano sai da memória.
{ "id": "l01-e27", "type": "traduzione", "category": "ESPRESSIONE",
  "consegna": "…",
  "frasi": [{ "id": "l01-e27-f1",
              "pt": "Bom dia. Eu sou brasileiro.",   // o ÚNICO estímulo
              "risposta": "Buongiorno. Io sono brasiliano.",
              "accettaAnche": ["Buongiorno. Sono brasiliano."],
              "nota": "…", "tolleranzaAccenti": true }] }
```

> **A pontuação final é conteúdo em `trasformazione`, e só ali.** Em italiano
> a interrogativa **não inverte nada**: `Tu sei italiano?` difere de
> `Tu sei italiano.` apenas pelo ponto. `checkAnswer` descarta pontuação — o
> que está certo para todo outro tipo —, então o módulo confere isso à parte,
> e o validador exige que `risposta` termine em `?` quando `verso` é
> `interrogativa` e **não** termine quando é `negativa`/`affermativa`. Sem
> isso, copiar a frase de partida valeria ponto e o drill não exercitaria
> nada. `pontuacaoBate` em `js/exercises/trasformazione.js` e a checagem em
> `check_trasformazione` são espelhos — mudou uma, mude a outra.

```jsonc
// correzione — ler uma frase ERRADA e reescrevê-la certa. Não é degrau da
// escada: é um eixo perpendicular a ela. Os seis degraus partem de material
// correto e medem produção; este parte de material errado e mede
// MONITORAMENTO — a atenção com que se relê o que se acabou de escrever.
{ "id": "l03-e24", "type": "correzione", "category": "GRAMMATICA",
  "consegna": "…",
  "frasi": [{ "id": "l03-e24-f1",
              "sbagliata": "Lui legge i giornale.",   // agramatical DE PROPÓSITO
              "risposta": "Lui legge il giornale.",
              "pt": "Ele lê o jornal.",               // obrigatório: o sentido pretendido
              "nota": "…", "accettaAnche": [] }] }
```

> **⚠ A ARMADILHA DO `sbagliata`, e ela é única no projeto.**
>
> `sbagliata` é o **único texto italiano do site que não deve ser ensinado**.
> Todo o resto assume a equivalência «italiano exibido ⇒ 🔊 ⇒ entra no
> léxico» (invariante 7.1). Aqui ela quebra nas duas pontas, de propósito:
>
> - **Não ganha botão de áudio.** Ouvir a forma errada numa voz italiana
>   nativa é o jeito mais rápido de gravá-la como se fosse boa. Só a
>   `risposta` fala, e só depois de o aluno responder.
> - **Não entra em `content/lessico.json`.** Se entrasse, a checagem do i+1
>   passaria a autorizar um diálogo a usar a forma errada. (Sai de graça:
>   `esercizi` já está inteiro fora da colheita — mas está travado por
>   teste, porque é o tipo de coisa que uma refatoração desfaz sem avisar.)
> - **O play do feedback toca só as formas certas.** O par errada→certa
>   seria tentador, como no `trasformazione` — e metade do que o aluno
>   ouviria seria italiano errado.
>
> A marcação é **textual** (`✗ errata`) além de visual: cor nunca é o único
> canal, e quem usa leitor de tela precisa saber que a frase está errada.
>
> **Regra dura:** `sbagliata` normalizada não pode ser igual à `risposta` —
> senão copiar vale ponto e o drill não exercita nada. É a mesma ideia da
> regra de pontuação do `trasformazione`, e é mais insidiosa aqui, porque as
> duas são frases inteiras e a diferença pode ser uma letra. O que o
> validador **não** faz é julgar se a `sbagliata` é de fato agramatical:
> isso continua com quem escreve a aula, pela hierarquia de fontes acima.

> **`traduzione` não leva lacuna.** Um `___` ali é engano de tipo: quem quer
> lacuna quer `slot-frame` (se o molde é o alvo) ou `gap-audio` (se é escuta).
> O validador reprova. Vale igual para `correzione`.

> **`slot` e `risposta` têm que casar.** O validador avisa quando
> `frame.it` com o `slot` no lugar do `___` não reproduz a `risposta` — é o
> sinal de que aquilo deixou de ser drill de substituição e virou outro
> exercício. Elisão é o caso legítimo (`vent'` + ` anni` = `vent'anni`), e o
> validador já sabe disso.

**Regra dura dos seis:** `id` de sub-item é tão imutável quanto o do
exercício. Renomear um apaga o histórico daquela pergunta específica.

### Diálogo

```jsonc
"dialogo": {
  "id": "l01-d01",
  "titolo": "Piacere!", "gloss": "Prazer!",
  "consegna": "…",
  "battute": [
    { "speaker": "A", "nome": "Giulia", "it": "…", "pt": "…" },
    { "speaker": "B", "nome": "Marco",  "it": "…", "pt": "…" }
  ],
  "passate": [
    { "focus": "gist",   "istruzione": "…", "inputBloccato": true },
    { "focus": "note",   "istruzione": "…", "inputBloccato": false },
    { "focus": "detail", "istruzione": "…", "inputBloccato": false,
      "domande": [{ "id": "l01-d01-q1", "domanda": "…",
                    "risposta": "diciotto", "accettaAnche": ["18"] }] }
  ]
}
```

**Regras não negociáveis do diálogo:**

- A primeira passada tem `focus: "gist"` **e** `inputBloccato: true`. Na passada 1 não se escreve nem se lê — a UI desabilita o input e esconde a transcrição. Se der para ler na primeira vez, a escuta global não acontece e o exercício de audição virou exercício de leitura.
- Use exatamente dois `speaker` (`A` e `B`), para que o TTS diferencie as vozes.
- **Mesmo áudio, tarefa diferente em cada passada.** Nunca repita a mesma tarefa.
- Use **apenas vocabulário desta aula e das anteriores** (regra do i+1).
- 6–10 turnos.


### Modo de língua

Aula nova declara em que língua está a prosa. Campo opcional no topo do JSON:

```jsonc
{ "id": "12", "numero": 12, "modo": "misto", … }   // "pt" | "misto" | "it"
```

Ausente = `"pt"`, então toda aula escrita antes deste mecanismo continua válida sem edição.

| `modo` | Prosa é | Tag viva | Tag inerte | Áudio da prosa |
|---|---|---|---|---|
| `pt` | portuguesa | `<it>` | `<pt>` → **erro** | um 🔊 por forma citada, depois dela |
| `misto` | italiana | `<pt>` | `<it>` → **erro** | um 🔊 por **parágrafo**, antes dele |
| `it` | italiana | `<pt>` | `<it>` → **erro** | idem |

`misto` e `it` **renderizam idêntico**. A diferença entre eles é editorial — quanto português você deixa — não mecânica. Ter os três valores serve ao seu mapa mental da progressão; inventar uma diferença de código para justificar o terceiro seria generalidade especulativa.

O que **não** muda com o modo, em nenhuma hipótese:

- **`spiegazione` continua obrigatória, com 2+ parágrafos.** O validador exige que exista uma *explicação*, não que ela seja portuguesa. Este é o erro mais provável de quem raciocina da premissa errada.
- **Glossas de vocabulário ficam em português**: `lesson.gloss`, `section.gloss`, `lista.items[].pt`, `chunks[].pt`, `paradigma.righe[].pt`, células `pt: true`. São o ponto fixo da progressão, e não precisam de tag: são campos discretos, e **o campo já é a marcação**. Corolário: o cabeçalho `'Português'` do paradigma é rótulo de coluna de glossa — é conteúdo, não chrome, e nunca muda de língua.
- **O léxico e a checagem do i+1.** Em modo `it` a spiegazione ganha 🔊 mas continua fora de `lessico.json`: se explicação toda-italiana autorizasse vocabulário, o aviso de escopo do diálogo perderia o sentido.
- **A chrome da interface.** `Verificar`, `Mostrar resposta`, banners e a home ficam em português sempre.

Só um campo relaxa: **`slot-frame.giri[].pt`**. Em modo `it`, o próprio `slot` serve de prompt (ver `italiano` e ter de escrever `Io parlo italiano.` continua sendo produzir o molde). Nos outros modos ele segue obrigatório.

> **Glossa de vocabulário × tradução de frase inteira.** São coisas diferentes e vale não confundir. Glossa (`chunks[].pt`, `lista.items[].pt`, célula `pt: true`) fica para sempre. **Tradução de frase inteira** — `dialogo.battute[].pt`, `gap-audio.pt`, `qa-transcribe.*.pt`, `scelta.domande[].pt`, `riordino.frasi[].pt`, `abbinamento.coppie[].pt`, `slot-frame.frame.pt` — é candidata a ficar atrás de um `<details>` em modo `it`. **Isso ainda não está implementado**, de propósito: só a primeira aula real em `it` vai dizer quais incomodam. Quando for, esconda no render — nunca apague do JSON.

**Como o modo chega ao render:** por parâmetro explícito, `prose(html, tag, attrs, modo)`, com default `'pt'` em toda a cadeia. **Nunca por estado de módulo** — `ripasso.html` monta itens de várias aulas na mesma página, e um `modo` global renderizaria uma delas errada, sem ordem de chamada que resolva.

---

## Como escrever `spiegazione`

É o campo que faz o site valer, e o mais fácil de fazer mal. Requisitos:

- **Explique o porquê, não só a regra.** Não basta "usa-se *lo* antes de s+consoante"; diga que o critério é o **som seguinte**, e que `il spagnolo` é desconfortável de pronunciar.
- **Contraste com o português quando ajudar.** O aluno é lusófono: "idade usa *avere*, igual ao português — quem aprendeu inglês antes sofre aqui" economiza parágrafos.
- **Cubra os casos-limite** que o aluno vai tropeçar: `un amico` sem apóstrofo contra `un'amica` com.
- **Faça referência cruzada às aulas anteriores.** A regra de C/G da Aula 0 é o que explica `amici`/`amiche` na Aula 1. Amarrar isso é onde o material do professor mais deixa a desejar.
- 2–3 parágrafos por seção. Um parágrafo só quase sempre significa que faltou o porquê.

**O que NÃO fazer:** responder "é assim que eles falam". Se você não consegue explicar, registre em `ERRATA.md` para perguntar na aula.

---

## Checklist: chegou aula nova

0. **Revise `ERRATA.md`.** Feche o que foi respondido na aula, migrando a explicação para a `spiegazione` da seção correspondente.
1. **Leia todas as fontes novas** de `presentations/`. PDFs com `pdftotext -layout -enc UTF-8`; export de chat filtrando o ruído e **preservando a ordem cronológica**.
2. **Crie `content/lezione-NN.json`** copiando a estrutura de `lezione-01.json`. Preencha `sections[]` na ordem dos slides, preservando os chips como `category`, e **incorpore todo conteúdo das anotações que não está no deck**.
3. **Escreva `spiegazione`** de cada seção, segundo as regras acima.
4. **Extraia o inventário de chunks** e classifique cada um em `chunkType`.
5. **Valide formas duvidosas** contra Treccani/Crusca e aplique a classificação de 3 saídas.
6. **Escreva o diálogo** (6–10 turnos), só com vocabulário em escopo.
7. **Gere exercícios:** ≥2 `gap-audio`, ≥1 `qa-transcribe`, ≥1 `paradigm-fill` por paradigma, ≥1 `dialogo`. Para **volume de fixação**, use os seis drills, subindo a escada: `scelta` e `slot-frame` são os que mais rendem por linha escrita, `riordino`/`abbinamento` quebram a monotonia de digitar, e feche com `trasformazione` e `traduzione` — sem o topo da escada a aula só treina reconhecimento. Os *Compito* do professor são a melhor matéria-prima — cada exercício deles mapeia direto num tipo (`Scegli` → `scelta`, `Riordina` → `riordino`, `Abbina` → `abbinamento`, `Coniuga` → `paradigm-fill`, `Traduci` → `traduzione`, `Trasforma`/`Volgi al negativo` → `trasformazione`, `Correggi`/`Trova l'errore` → `correzione`).
7.1. **Agrupe as frases fixas em `funzioni`.** Toda frase pronta da aula tem um «quando se usa» — é isso que o aluno procura quando vai falar, e é o que o baralho embaralhado não mostra.
7.2. **Considere um `scambio` e um `correzione`.** Nenhum dos dois é obrigatório, e os dois cobrem buracos que os seis drills deixam. O `scambio` é bloco de leitura: põe o que a seção acabou de ensinar na menor conversa possível, que é o degrau entre produzir uma frase e o diálogo de 8 turnos. O `correzione` mede **monitoramento**, não produção — escreva as frases erradas a partir dos erros que *aquela* aula torna prováveis (desinência trocada, artigo errado, plural onde não há). Releia a armadilha do `sbagliata` antes.
8. **Acrescente a entrada em `content/manifest.json`** (`id`, `numero`, `file`, `titolo`, `gloss`, `categorie`, `temi`). **Não escreva `conteggio` à mão** — é derivado, sai do `--fix`.
9. **Rode `python tools/validate.py --fix`** (grava os derivados) e depois **`python tools/validate.py`** até zerar os erros. Rode também **`node tools/test.mjs`**: os testes de página carregam os JSONs reais, então uma aula que não renderiza falha ali.
9.1. **Leia os avisos de escopo.** O validador compara o italiano do seu diálogo com `content/lessico.json`, o léxico acumulado até aquela aula, e avisa sobre forma nunca ensinada. É **aviso, não erro**, porque a checagem é heurística e existe caso legítimo — o diálogo da Aula 0 soletra *Castelli* de propósito, e a palavra não é vocabulário a ensinar. Para cada aviso, decida: ou a palavra entra no conteúdo da aula (num `chunk`, `lista` ou `tabella`), ou ela sai do diálogo, ou é caso legítimo e fica. O que não vale é ignorar sem olhar.
10. **Checagem de anonimato:** nenhum nome próprio das fontes aparece em arquivo versionado; os diálogos usam nomes italianos genéricos.
11. **Não toque** em `js/`, `css/`, nem nos JSONs de aulas anteriores.

---

## Arquitetura, para quando você *precisar* mexer no código

```
index.html            índice de aulas + o painel «Seus dados» (#dati)
lezione.html          renderiza ?l=NN
ripasso.html          revisão espaçada, atravessando aulas
css/tokens.css        tokens; paleta derivada do deck; dark mode
css/style.css         folha única, mobile-first
js/main.js            ponto de entrada da home e da aula (só o DOMContentLoaded)
js/app.js             rota, monta cards, liga submit→check→feedback→store
js/ripasso.js         ponto de entrada da revisão; reusa mountExercise
js/speech.js          ÚNICO lugar que toca speechSynthesis
js/store.js           ÚNICO lugar que toca localStorage
js/check.js           normalização de resposta e diff por token
js/render.js          seções, chips, blocos, botão de áudio, barra de player
js/exercises/         um módulo por tipo + index.js (registry)
                      shuffle.js: embaralhamento semeado pelo id — determinístico
                      para o aluno não perder a referência visual num F5, e para
                      a suíte afirmar posições sem stubar Math.random
                      index.js também exporta flashcardDeck(), que DERIVA o
                      baralho dos chunks da aula
js/notebook.js        ponto de entrada do caderno léxico; reusa initChrome/fail
js/frasi.js           ponto de entrada das frases de aula; reusa renderFunzioni
js/record.js          ÚNICO lugar que toca em getUserMedia e MediaRecorder
notebook.html         o caderno léxico
frasi.html            as frases da aula — as que você diz e as que só ouve
content/              manifest.json + lezione-NN.json + frasi.json
                      + lessico.json (derivado)
tests/                suíte node:test; support/ tem DOM mínimo e dublês
                      browser/ tem o que só um Chrome de verdade afirma
tools/validate.py     valida os invariantes deste documento; --fix grava derivados
tools/validate_test.py testes do validador (unittest da stdlib)
tools/test.mjs        roda a suíte JS com cobertura, piso de 80%
tools/browser.mjs     dirige um Chrome por CDP (WebSocket do Node); zero dep
tools/browser-test.mjs roda tests/browser/*.browser.mjs; pula sem navegador
```

**`app.js` não se autoinicializa.** Quem dispara é `main.js`, com uma linha.
A razão é concreta: `ripasso.js` importa `mountExercise` e `initChrome` de
`app.js`, e quando o import trazia junto um `DOMContentLoaded`, a página de
revisão subia dois bootstraps e duplicava os listeners da toolbar.

### Dados do aluno: por que não há banner de consentimento

A pergunta reaparece, então fica escrita. **Não há aceite a pedir porque não
há nada a consentir.** Não existe servidor, conta, terceiro nem rede: o
`localStorage` guarda só o progresso do próprio aluno, e isso é
*armazenamento estritamente necessário* para a função que ele pediu — a
categoria dispensada de banner. Um banner que travasse o site até ser aceito
degradaria o produto sem ganho nenhum.

O que a promessa exige de verdade é **controle**, e ele mora em três lugares
que precisam continuar existindo juntos: exportar (`store.download`),
importar (`store.importJSON`) e **apagar** (`store.reset`). Os três aparecem
por extenso no painel `#dati` da home, com a explicação do que fica salvo; a
toolbar repete os dois primeiros como atalho — por isso o wiring em
`initDataButtons` usa `querySelectorAll`, e não `querySelector`.

Apagar confirma **inline**, não com `confirm()`: cabe a lista exata do que
some, oferece baixar a cópia ali mesmo, e é alcançável por teclado e por
teste — `confirm()` bloqueia a thread e não existe fora do navegador.

**A linha que muda isso:** gravação de voz persistida. Hoje o áudio nunca
toca o disco e o microfone já é guardado pela permissão do navegador, que é
um aceite mais forte que qualquer caixa da página. No dia em que a voz ficar
salva (IndexedDB, ver PRD), ela deixa de ser «necessária» e vira dado
guardado por escolha — e escolha se pergunta. **Opt-in explícito entra na
mesma mudança**, junto do botão de apagar as gravações. Está escrito também
no cabeçalho de `js/record.js`.

### Dados derivados em `content/`

Duas coisas ali são **calculadas, não escritas à mão**:

| Onde | O quê | Por quê |
|---|---|---|
| `manifest.lezioni[].conteggio` | ids rastreáveis da aula | A home desenha a barra de progresso sem baixar a aula. Com 40 aulas, buscar todas seriam ~1,6 MB por visita. |
| `content/lessico.json` | forma italiana → aula que a ensinou | Sustenta a checagem da regra do i+1 nos diálogos. |

São **versionados** (o site é servido direto, sem build) e o `validate.py`
reprova quando ficam velhos. `--fix` reescreve. Não é um passo de build: o
derivado é conferido no repositório, não gerado no deploy.

A colheita do léxico é exatamente o italiano que a aula **exibe** — o mesmo
conjunto que ganha 🔊 pelo invariante 7.1: `chunks` (com `slot`), `header`
(o `it` quando o item é objeto), `funzioni[].quando`, e os blocos `lista`,
`tabella` (menos células `pt: true`), `contrasto` e `paradigma`. `dialogo` e
`esercizi` ficam **fora de propósito**: são o que a checagem confere, e se
entrassem, um diálogo fora de escopo se autoautorizaria.

> **O léxico nunca deve encolher.** Depois de um `--fix`, confira
> `git diff content/lessico.json`: encolheu é sinal de que uma fonte de
> colheita deixou de ser lida — foi o risco concreto quando o item de
> `header` passou a aceitar objeto. Um léxico menor não quebra nada na hora,
> só faz a checagem do i+1 aprovar silenciosamente diálogo fora de escopo.

### Testes

`node tools/test.mjs`. Runner é o `node --test` embutido e a cobertura é a do V8 —
zero dependências, coerente com o invariante 4. Onde precisa de DOM, `tests/support/dom.mjs`
implementa a fatia usada pelo site (~300 linhas) em vez de trazer jsdom.

Duas regras ao mexer aqui:

- **Um cenário de estado global = um arquivo.** `speech.js` e `store.js` guardam estado de
  módulo de propósito (promise de vozes cacheada, cache do progresso). `node --test` dá um
  processo por arquivo, que é a forma limpa de ter estado virgem. Reimportar com
  `?query=` funciona mas cria um script distinto para a contagem de cobertura, e o número
  sai errado sem avisar.
- **Os testes de página usam os JSONs reais de `content/`.** É de propósito: `validate.py`
  checa que o schema está certo, a suíte checa que o schema **vira página**. Uma aula nova
  que quebre a renderização falha aqui.

### O ponto cego do DOM da suíte: CSS

O shim guarda `hidden` como propriedade e **nunca interpreta CSS**. Isso deixa
uma classe inteira de defeito invisível para os 710 testes de comportamento:
uma regra de classe com `display` derrota o `[hidden]` do user-agent, que vale
0-0-0 de especificidade.

Foi assim que o verso do flashcard nasceu visível — `hidden: true` no JS,
`.carta__it { display: flex }` no CSS, resposta na tela antes de o aluno
tentar, e tudo verde. O remédio é uma regra global no topo de `style.css`:

```css
[hidden] { display: none !important; }
```

`tests/css.test.mjs` lê a folha como **texto** e trava três coisas: que a
regra existe, que ela vem antes da primeira classe com `display`, e que
ninguém tenta reexibir `[hidden]` sem `!important` (o `@media print` reexibe
a transcrição do diálogo, e vence por especificidade). Afirmar CSS por texto
é pouco — mas custa zero e roda em qualquer máquina, então continua sendo a
primeira linha. **Não afirme estética ali.**

### A segunda linha: `node tools/browser-test.mjs`

O que o texto do CSS não resolve, um Chrome de verdade resolve. `tools/browser.mjs`
dirige um Chromium por **CDP**, com `WebSocket` global do Node e `http` da
stdlib — sem Playwright, sem `package.json`, invariante 4 intacto.

```bash
node tools/browser-test.mjs                          # tudo (~13s)
node tools/browser-test.mjs tests/browser/voci.browser.mjs
CHROME=none node tools/browser-test.mjs              # força o caminho de skip
```

**Regra deste diretório: nada em `tests/browser/` pode ser afirmável pelo
shim.** Se um teste caberia em `tests/*.test.mjs`, ele pertence lá — é mais
rápido e não exige navegador. Aqui só entra o que precisa de cascata, `@media`
ou layout computado.

Três armadilhas já pagas, não as reintroduza:

- **`getComputedStyle(e).display !== 'none'` não é «está visível».** `display`
  não herda: filho de um pai `display:none` continua computando `block`. Foi
  assim que a transcrição do diálogo apareceu como «8 battute na tela» quando
  o contêiner inteiro estava oculto. Use `page.visiveis(sel)`, que pergunta
  `checkVisibility()`.
- **A lista de vozes do Chrome é não-determinística.** Execuções seguidas na
  mesma máquina viram ora 2 vozes (SAPI, só pt-BR), ora 19 (Google, com uma
  it-IT). Nunca teste contra a lista ambiente: use `page.vozes([...])`, que
  injeta antes de o site subir.
- **Sleep fixo é teste intermitente.** Use `page.esperar(expr)`, que faz
  espera ativa com mensagem de erro útil.

O estado do card mora em **`data-state`** (`correct`/`partial`/`wrong`), não em
classe — e ele **não** é restaurado no F5: o card é da sessão, o progresso é do
`localStorage`. «Sobrevive ao F5» se afirma sobre o dado salvo e sobre a barra
da home, nunca sobre a borda do card.

### Contrato de um tipo de exercício

Para adicionar um tipo: crie o módulo, importe em `js/exercises/index.js`, some ao `Map`. Nada mais no core muda.

```js
export default {
  type: 'meu-tipo',
  render(item, ctx) { /* → HTMLElement; ctx.submit(resposta) envia */ },
  check(item, response, root) { /* → {correct, score, level, results?} */ },
  feedback(item, result, root) { /* opcional */ },
  reveal(item, root) { /* opcional */ },
};
```

- O elemento devolvido por `render` carrega `_parts` com as referências de DOM que os outros métodos precisam. É o canal entre eles.
- Se `check` devolver `results: [{id, correct}]`, o `app.js` registra **cada sub-item** separadamente. É assim que paradigma, diálogo e os quatro drills têm progresso por célula/pergunta.
- Quem devolve `results` com vários sub-itens **precisa** implementar `subItemIds(item) → string[]`. É a fonte **única** da verdade sobre esses ids: `countItems` em `app.js` mede a lista para o `conteggio`, e `indexById` em `ripasso.js` resolve cada id de volta para o card. Enquanto os dois enumeravam os tipos por conta própria, 140 dos 272 ids rastreáveis venciam no progresso e nunca apareciam na revisão, sem erro nenhum. `count_items`/`SUBITEM_FIELD` em `tools/validate.py` são o espelho em Python — mudou aqui, mude lá.
- **Nada de arrastar.** Um drill que só funciona com drag-and-drop é inacessível por teclado, ruim no celular e impossível de testar sem navegador de verdade — que a suíte não tem. `riordino` e `abbinamento` são clique e `<select>` por isso.
- **Nenhum módulo de exercício fala com `store.js`.** Quem grava é o `app.js`.
- **Nenhum módulo chama `speechSynthesis` direto.** Use `speech.js`.

### Armadilhas já resolvidas em `speech.js` — não reintroduza

- `getVoices()` retorna `[]` na primeira chamada. Verificado neste ambiente: 0 vozes imediatamente, 19 depois do evento `voiceschanged`. Use `voicesReady()`.
- **E a lista não é estável entre execuções.** Medindo pelo harness de navegador, o mesmo Chrome na mesma máquina viu ora 2 vozes (SAPI do Windows, ambas `pt-BR`) ora 19 (Google, com uma `it-IT`), e há execução em que `voiceschanged` nem dispara. Isso não muda o código, que já é assíncrono — muda o **teste**: nunca afirme nada contra a lista ambiente.
- iOS Safari exige gesto do usuário antes de falar → `unlock()` no primeiro toque.
- Chrome corta utterance longo (~15s) → quebrado por sentença.
- Empilhar `speak()` sem `cancel()` trava a fila.
- Um contador de **geração** controla cancelamento. `speak()` cancela e captura a geração; `speakSequence()` cancela **uma vez** e repassa a geração para cada turno. Por isso existe o `_utter()` interno, que não cancela.
- **Zero vozes it-IT é caso real** (alguns Linux/Android). O site entra em **modo transcrição-primeiro**: banner de aviso, texto revelado, tarefa vira leitura/produção. Nunca deixe isso virar tela branca ou erro.
- Velocidades expostas: `0.7` e `1.0`. **Não adicione velocidade acima de 1.0** — para A1, acelerar derruba a compreensão.

### Correção de resposta em `check.js`

Camadas, na ordem: igualdade estrita → sem diacríticos → elisão (só se o item pedir). A camada de acento devolve **correto com nota** (`score: 0.85`), não erro — um aluno que escreve `perche` acertou a palavra e errou o acento, e merece ouvir exatamente isso.

**O apóstrofo nunca é removido na normalização.** Em italiano ele é informação gramatical: `un amico` (masculino) contra `un'amica` (feminino). Removê-lo tornaria os dois indistinguíveis.

---

## Verificação

```bash
python tools/validate.py          # invariantes de conteúdo
python -m http.server 8000        # e abrir http://localhost:8000
```

No navegador, confira: os chips aparecem com as cores do deck; 🔊 em linha italiana toca voz italiana; a passada 1 do diálogo trava o input; resposta sem acento dá "correto com nota"; o progresso sobrevive a um F5.

Para testar o modo degradado, cole no console antes de carregar:

```js
const r = speechSynthesis.getVoices.bind(speechSynthesis);
speechSynthesis.getVoices = () => r().filter(v => !v.lang.toLowerCase().startsWith('it'));
```

O banner de aviso deve aparecer e a página seguir inteira e utilizável.
