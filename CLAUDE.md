# CLAUDE.md

Instruções operacionais para agentes trabalhando neste repositório.

O objetivo principal deste projeto é um **loop de autoria repetível**: a cada aula nova, ler os arquivos que o professor entregou e acrescentar uma seção ao site **sem redesenhar nada e sem tocar em código**. Este documento existe para tornar isso mecânico. Se você precisar abrir `js/` para adicionar uma aula, algo está errado — pare e diga.

---

## Invariantes — nunca viole sem avisar

1. **Nunca commite `presentations/` nem `ERRATA.md`.** Ambos estão no `.gitignore`. O primeiro é material de terceiros e contém dados pessoais; o segundo é caderno de trabalho local.
2. **Nenhum arquivo versionado cita nome de pessoa ou da plataforma de aula.** Vale para os docs também — este repositório é público. Diálogos usam nomes italianos genéricos (Marco, Giulia, Luca). Não use dados pessoais reais (idade, cidade) em exemplos.
3. **Nunca linke PDF nem sirva arquivo de `presentations/`.** O site é autocontido: todo conteúdo explicativo é transcrito para `content/*.json`.
4. **Zero dependências e zero passo de build.** Sem `package.json`, sem bundler, sem CI de build, sem CDN. O site é HTML + CSS + JS vanilla servido direto. Vale para as ferramentas também: o validador é stdlib do Python e a suíte é o `node --test` embutido com um DOM próprio — se a resposta para um problema for `npm install`, ela está errada.
5. **Ao adicionar uma aula, edite apenas `content/`.** Não toque em `js/`, `css/` nem nos JSONs de aulas anteriores.
6. **`id` de item é imutável.** Ele é a chave do progresso no `localStorage`. Renomear um `id` apaga o histórico daquele item; reaproveitar um `id` mistura históricos de coisas diferentes.
7. **Toda seção precisa de `spiegazione`.** É o que torna o site independente dos slides. O validador reprova se faltar.
7.1. **Todo texto italiano exibido tem botão de áudio — sem exceção.** Isso vale para `titolo` de aula/seção, itens de `header` (comunicazione/lessico/grammatica), toda célula de `tabella` que não esteja marcada `pt: true`, cabeçalhos de coluna de `paradigma` e `paradigm-fill`, e o título+gloss do `dialogo`. Ao criar uma tabela nova, pergunte célula por célula: "isto é italiano ou é rótulo/descrição em português?" — no segundo caso, marque `{ "html": "…", "pt": true }`. Ver a seção *Tipos de bloco*.
8. **Nada de atividade em par ou grupo.** A aula é particular 1-a-1. Materiais A1 de referência estão cheios de *"in coppia"* e *"girate per la classe"* — tudo isso é inaplicável aqui.
9. **`category` só entre os cinco valores permitidos** (abaixo). Acrescentar um valor exige editar `tools/validate.py`, `css/tokens.css` **e** este documento.

---

## Comandos

```bash
# Extrair texto de PDF (poppler; já disponível no ambiente)
pdftotext -layout -enc UTF-8 "presentations/Lezione_2-Slides.pdf" -

# Validar content/ contra todos os invariantes — SEMPRE rode antes de terminar
python tools/validate.py

# Suíte de testes + cobertura (piso 80%). Rode se mexer em js/ ou css/.
node tools/test.mjs

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

  "header": {                    // cabeçalho de 3 colunas, no modelo dos livros A1
    "comunicazione": ["…"],
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
    "slot": ["brasiliano", "…"]  // só em semiFixed
  }],

  "dialogo": { /* ver abaixo */ },
  "esercizi": [ /* ver abaixo */ ],
  "produzione": [{ "id": "l01-p01", "consegna": "…" }],
  "bilancio": ["Sei conjugar …", "…"]          // autoavaliação, 1ª pessoa
}
```

### Os dois eixos são ortogonais

- **`category`** — eixo de **domínio**. Vem do chip do deck. Governa cor, navegação e filtro.
- **`chunkType`** — eixo de **forma lexical**. Governa para qual drill o item é elegível: só `semiFixed` alimenta slot-and-frame; só `word`/`collocation` entram em flashcard.

*Buongiorno!* é legitimamente `ESPRESSIONE` + `fixed`. **Não funda os dois campos** — isso quebraria a elegibilidade automática de exercício.

`PRONUNCIA` é uma extensão nossa: o deck não tinha chip para fonética, e rotular pronúncia como `GRAMMATICA` seria mentir na taxonomia.

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

// nota — callout. tono: info | attenzione | eccezione
{ "type": "nota", "tono": "attenzione", "titolo": "…", "testo": "…" }
```

Campos de texto aceitam HTML inline (`<b>`, `<em>`, `<code>`). O TTS remove tags antes de falar.

### Exercícios

Tipos registrados em `js/exercises/index.js`. Usar tipo não registrado é erro de validação.

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
7. **Gere exercícios:** ≥2 `gap-audio`, ≥1 `qa-transcribe`, ≥1 `paradigm-fill` por paradigma, ≥1 `dialogo`.
8. **Acrescente a entrada em `content/manifest.json`** (`id`, `numero`, `file`, `titolo`, `gloss`, `categorie`, `temi`).
9. **Rode `python tools/validate.py`** e zere os erros. Rode também **`node tools/test.mjs`**: os testes de página carregam os JSONs reais, então uma aula que não renderiza falha ali.
10. **Checagem de anonimato:** nenhum nome próprio das fontes aparece em arquivo versionado; os diálogos usam nomes italianos genéricos.
11. **Não toque** em `js/`, `css/`, nem nos JSONs de aulas anteriores.

---

## Arquitetura, para quando você *precisar* mexer no código

```
index.html          índice de aulas
lezione.html        renderiza ?l=NN
css/tokens.css      tokens; paleta derivada do deck; dark mode
css/style.css       folha única, mobile-first
js/app.js           bootstrap, rota, monta cards, liga submit→check→feedback→store
js/speech.js        ÚNICO lugar que toca speechSynthesis
js/store.js         ÚNICO lugar que toca localStorage
js/check.js         normalização de resposta e diff por token
js/render.js        seções, chips, blocos, botão de áudio, barra de player
js/exercises/       um módulo por tipo + index.js (registry)
content/            manifest.json + lezione-NN.json
tests/              suíte node:test; support/ tem DOM mínimo e dublês
tools/validate.py   valida os invariantes deste documento
tools/test.mjs      roda a suíte com cobertura, piso de 80%
```

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
- Se `check` devolver `results: [{id, correct}]`, o `app.js` registra **cada sub-item** separadamente. É assim que paradigma e diálogo têm progresso por célula/pergunta.
- **Nenhum módulo de exercício fala com `store.js`.** Quem grava é o `app.js`.
- **Nenhum módulo chama `speechSynthesis` direto.** Use `speech.js`.

### Armadilhas já resolvidas em `speech.js` — não reintroduza

- `getVoices()` retorna `[]` na primeira chamada. Verificado neste ambiente: 0 vozes imediatamente, 19 depois do evento `voiceschanged`. Use `voicesReady()`.
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
