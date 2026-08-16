# Lezioni di italiano 🇮🇹

Material de estudo de italiano **A1**, montado a partir das minhas aulas particulares: conteúdo explicado por escrito e exercícios que treinam **audição**.

Site estático, sem servidor, sem build, sem dependências. Progresso salvo só no navegador.

---

## Por que existe

O material que recebo nas aulas são slides em PDF e o registro do chat. É bom como lembrete, mas não dá para estudar sozinho: as tabelas estão lá, a **explicação** não. Uma semana depois, `lo spagnolo` é uma linha numa tabela sem lógica aparente.

Este site resolve três coisas:

1. **É autocontido.** Toda regra vem com o *porquê* escrito. Não preciso abrir nenhum PDF.
2. **Tem áudio em tudo.** Cada linha em italiano tem 🔊, com velocidade reduzida e repetição livre — voz sintetizada pelo navegador, sem arquivo de som no repositório.
3. **Junta as fontes.** Boa parte do conteúdo só existe no chat da aula, não nos slides. Aqui os dois viram uma coisa.

## Como rodar localmente

```bash
python -m http.server 8000
# abra http://localhost:8000
```

> **Não abra o `index.html` com duplo clique.** O site carrega o conteúdo com `fetch()`, e navegadores bloqueiam isso em `file://` por CORS. Precisa ser servido por HTTP. Se você tentar, o próprio site mostra um aviso explicando isso.

Qualquer servidor estático serve: `npx serve`, `php -S localhost:8000`, extensão Live Server do VS Code.

## Estrutura

```
index.html            índice de aulas + painel «Seus dados»
lezione.html          página de aula (?l=01)
ripasso.html          revisão espaçada, atravessando todas as aulas
notebook.html         o caderno léxico: a forma guardada + a SUA frase com ela
frasi.html            as frases da aula — as que você diz e as que só ouve
css/
  tokens.css          tokens: paleta derivada dos slides, dark mode
  style.css           folha única, mobile-first
js/
  main.js             ponto de entrada da home e da aula
  app.js              rota, monta os exercícios, liga o ciclo de resposta
  ripasso.js          monta a revisão; reusa o mesmo card de exercício
  notebook.js         monta o caderno; reusa initChrome/fail do app.js
  frasi.js            monta as frases; reusa renderFunzioni do render.js
  speech.js           síntese de voz (único lugar que toca speechSynthesis)
  store.js            progresso e caderno (único lugar que toca localStorage)
  check.js            correção de resposta + diff palavra a palavra
  render.js           seções, chips, tabelas, blocos, botão de áudio
  record.js           gravação de voz (único lugar que toca getUserMedia)
  exercises/          um módulo por tipo + index.js (registry)
content/
  manifest.json       índice das aulas (com o conteggio derivado)
  lezione-NN.json     uma por aula (hoje: 00 a 03)
  frasi.json          as frases de aula; não é aula, não entra no manifest
  lessico.json        derivado: forma italiana → aula que a ensinou
tests/
  *.test.mjs          suíte (node:test), um arquivo por cenário
  support/            DOM mínimo, dublê da Web Speech API, fixtures
  browser/            *.browser.mjs — o que só um Chrome de verdade afirma
tools/
  validate.py         valida o conteúdo; --fix grava os dados derivados
  validate_test.py    testes do validador (unittest da stdlib)
  test.mjs            roda a suíte JS com cobertura e piso de 80%
  browser.mjs         dirige um Chrome por CDP, sem dependência nenhuma
  browser-test.mjs    roda a suíte de navegador (pula sem Chrome instalado)
```

Não versionados (ver `.gitignore`):

- `presentations/` — os arquivos originais das aulas. Material de terceiros, com dados pessoais. **Não é redistribuído.**
- `ERRATA.md` — caderno local de dúvidas e divergências para levar à próxima aula.

## Aulas

| # | Título | Conteúdo |
|---|---|---|
| 0 | *L'alfabeto e i suoni* | Alfabeto, vogais abertas/fechadas, C e G duro/brando, dígrafos, consoantes dobradas, acento tônico |
| 1 | *Io sono, tu sei* | Presente de *essere* e *avere*, países, nacionalidades (4 formas), números 0–20, saudações, artigos, plural, idade com *avere* |
| 2 | *Io parlo, io abito* | Presente dos regulares em *-are*, países e nacionalidades, as línguas, *in* + país contra *a* + cidade, *un po'* / *molto bene* / *solo* |
| 3 | *Io leggo, io scrivo* | Presente dos regulares em *-ere*, o G duro e o G brando de *leggere*, materiais de leitura, plurais irregulares (*il tema*, *la tesi*, *la mail*), *la mattina* contra *ogni sera* |

Fora da sequência, três páginas que valem para todas as aulas: **Ripasso**
(revisão espaçada), **Il mio quaderno** (o caderno léxico) e **Frasi per la
lezione** (o que dizer quando você trava, e o que reconhecer quando ouvir).

## Como adicionar uma aula

O fluxo completo está em **[CLAUDE.md](CLAUDE.md)** — é o documento operacional, escrito para um agente executar.

Resumo: colocar os arquivos novos em `presentations/`, criar `content/lezione-NN.json` seguindo o schema, acrescentar a entrada em `content/manifest.json`, rodar o validador. **Nenhum código é tocado** — adicionar aula mexe só em `content/`.

```bash
python tools/validate.py --fix    # grava os dados derivados
python tools/validate.py          # confere tudo
node tools/test.mjs               # a aula nova entra no smoke sozinha
```

O validador cobre os invariantes que importam: toda seção tem explicação, `id` únicos (são a chave do progresso), largura de tabela consistente, categorias válidas, tipo de exercício registrado, e a frase reconstruída de cada lacuna idêntica ao áudio.

**Dados derivados.** Duas coisas em `content/` são calculadas, não escritas à mão: o `conteggio` de cada entrada do manifest (quantos itens rastreáveis a aula tem) e o `content/lessico.json` (forma italiana → aula que a ensinou). São versionadas — o site é servido direto, sem build — e o validador reprova quando ficam velhas. Isso é o que deixa a home carregar **um** arquivo em vez de todas as aulas.

**Regra do i+1.** O validador compara o italiano de cada diálogo com o léxico acumulado até aquela aula e **avisa** sobre forma nunca ensinada. Aviso e não erro: a checagem é heurística e existe caso legítimo (o diálogo da Aula 0 soletra *Castelli* de propósito). Mas cada aviso merece uma decisão.

## Testes

```bash
node tools/test.mjs            # suíte JS + cobertura, reprova abaixo de 80%
node tools/test.mjs --sem-cobertura
node tools/test.mjs tests/check.test.mjs
python tools/validate_test.py  # testes do validador
```

Runner é o `node --test` embutido (Node 22+) e a cobertura é a do V8 — **nenhuma dependência**, nenhum `package.json`, coerente com o resto do projeto. Onde o código precisa de DOM, os testes usam um DOM mínimo próprio em [tests/support/dom.mjs](tests/support/dom.mjs), de umas 300 linhas, em vez de trazer o jsdom.

Os testes de página carregam os **JSONs reais** de `content/`, não mocks. Isso dá ao loop de autoria uma rede que o `validate.py` não dá: ele checa que o schema está certo, a suíte checa que o schema **vira página**.

O que está coberto, além do caminho feliz: `localStorage` bloqueado ou corrompido, migração de progresso antigo, navegador sem nenhuma voz italiana, navegador sem Web Speech API, `fetch` falhando em `file://`, aula com tipo de exercício não registrado, e manifest apontando para arquivo inexistente.

`tests/aule.test.mjs` percorre o manifest e não cita nenhuma aula pelo nome: **a aula da semana entra no smoke sozinha**, sem editar teste nenhum.

### A suíte de navegador

```bash
node tools/browser-test.mjs                       # sobe um Chrome de verdade
node tools/browser-test.mjs tests/browser/voci.browser.mjs
CHROME=/caminho/do/chrome node tools/browser-test.mjs
```

O DOM de `tests/support/dom.mjs` **nunca interpreta CSS**, e isso deixa uma
classe inteira de defeito invisível: o verso do flashcard já nasceu visível com
`hidden: true` no JS e um `display: flex` numa classe do CSS — resposta na tela
antes de o aluno tentar, e a suíte inteira verde.

Esta suíte pergunta o que a outra não pode: **o navegador concorda?** Layout
computado, cascata real, `@media`, `localStorage` de verdade, erro de console
de verdade. São 50 testes em ~13s, cobrindo o que só ali se vê — todo `[hidden]`
realmente invisível nas cinco páginas, nenhuma rolagem horizontal a 360px, o
tema escuro e o toggle vencendo nos dois sentidos, a impressão escondendo a
chrome, os três degraus de voz, e o caminho do aluno de ponta a ponta.

**Sem Playwright, e sem `npm install`.** O Node 22+ traz `WebSocket` global e o
Chrome fala **CDP** — o mesmo protocolo que o Playwright usa por baixo. O driver
inteiro é [tools/browser.mjs](tools/browser.mjs), stdlib pura. O que se perde é
a conveniência (auto-wait rico, seletores por texto, trace viewer) e o suporte a
Firefox e WebKit; o que se ganha é continuar sem `package.json`.

Ela é um runner **separado** de propósito: cada arquivo sobe um Chrome, então
ela é a que se roda antes de commitar, não a cada salvar. E numa máquina sem
navegador os testes se marcam como **pulados**, com saída 0 — o sinal é «não
verifiquei», não «está quebrado».

O que ela **não** faz: não tira screenshot nem compara pixel (afirma propriedade
computada, não estética), só fala com Chromium, e não ouve o áudio — dá para
afirmar qual voz foi escolhida, não que o som saiu certo.

## Documentação

| Arquivo | Para quê |
|---|---|
| **[CLAUDE.md](CLAUDE.md)** | Como acrescentar aula: schema, parse das fontes, checklist, invariantes |
| **[PRD.md](PRD.md)** | O problema, o usuário, os objetivos, o catálogo de exercícios, critérios de aceite |
| **[DESIGN.md](DESIGN.md)** | UX (princípios, passadas do diálogo, feedback, acessibilidade) e sistema visual |

## Stack, e por que essa

**HTML + CSS + JavaScript vanilla.** ES modules, um JSON por aula, `fetch`. Sem framework, sem bundler, sem `package.json`, sem CDN.

A razão é durabilidade: isto precisa funcionar dentro de dois anos, sem manutenção, enquanto o curso durar. `node_modules` envelhece e pipeline de build quebra; HTML servido direto não. Deploy é `git push`.

O áudio usa a **Web Speech API** do navegador com voz `it-IT`, então não há nenhum arquivo de som no repositório e acrescentar aula é escrever só texto. O schema já reserva um campo `audio.src` caso algum dia valha usar MP3 gravado.

Se o navegador não tiver nenhuma voz italiana instalada, o site avisa e passa para **modo transcrição** — o texto é revelado e os exercícios continuam funcionando como leitura e produção. No Windows, vozes italianas se instalam em *Configurações → Hora e Idioma → Voz*.

## Privacidade

Nada sai do navegador. Sem conta, sem servidor, sem cookies, sem analytics, sem fonte ou script externo. O progresso fica no `localStorage` e pode ser exportado e reimportado como JSON pelos botões no topo da home.

## Licença e conteúdo

Código e conteúdo sob licença **MIT** — ver [LICENSE](LICENSE). As explicações didáticas foram escritas para este repositório.

O material original das aulas (slides e anotações do professor) **não está aqui e não é redistribuído** — fica fora do controle de versão. Este é material de estudo pessoal, sem fins comerciais.
