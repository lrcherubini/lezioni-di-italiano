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
index.html            índice de aulas
lezione.html          página de aula (?l=01)
css/
  tokens.css          tokens: paleta derivada dos slides, dark mode
  style.css           folha única, mobile-first
js/
  app.js              bootstrap, rota, monta os exercícios
  speech.js           síntese de voz (único lugar que toca speechSynthesis)
  store.js            progresso (único lugar que toca localStorage)
  check.js            correção de resposta + diff palavra a palavra
  render.js           seções, chips, tabelas, botão de áudio
  exercises/          um módulo por tipo + index.js (registry)
content/
  manifest.json       índice das aulas
  lezione-00.json     Aula 0 — alfabeto e sons
  lezione-01.json     Aula 1 — essere/avere, nacionalidade, idade
tests/
  *.test.mjs          suíte (node:test), um arquivo por cenário
  support/            DOM mínimo, dublê da Web Speech API, fixtures
tools/
  validate.py         valida o conteúdo contra os invariantes do projeto
  test.mjs            roda a suíte com cobertura e piso de 80%
```

Não versionados (ver `.gitignore`):

- `presentations/` — os arquivos originais das aulas. Material de terceiros, com dados pessoais. **Não é redistribuído.**
- `ERRATA.md` — caderno local de dúvidas e divergências para levar à próxima aula.

## Aulas

| # | Título | Conteúdo |
|---|---|---|
| 0 | *L'alfabeto e i suoni* | Alfabeto, vogais abertas/fechadas, C e G duro/brando, dígrafos, consoantes dobradas, acento tônico |
| 1 | *Io sono, tu sei* | Presente de *essere* e *avere*, países, nacionalidades (4 formas), números 0–20, saudações, artigos, plural, idade com *avere* |

## Como adicionar uma aula

O fluxo completo está em **[CLAUDE.md](CLAUDE.md)** — é o documento operacional, escrito para um agente executar.

Resumo: colocar os arquivos novos em `presentations/`, criar `content/lezione-NN.json` seguindo o schema, acrescentar a entrada em `content/manifest.json`, rodar `python tools/validate.py`. **Nenhum código é tocado** — adicionar aula mexe só em `content/`.

```bash
python tools/validate.py
```

O validador cobre os invariantes que importam: toda seção tem explicação, `id` únicos (são a chave do progresso), largura de tabela consistente, categorias válidas, tipo de exercício registrado, e a frase reconstruída de cada lacuna idêntica ao áudio.

## Testes

```bash
node tools/test.mjs            # suíte + cobertura, reprova abaixo de 80%
node tools/test.mjs --sem-cobertura
node tools/test.mjs tests/check.test.mjs
```

Runner é o `node --test` embutido (Node 22+) e a cobertura é a do V8 — **nenhuma dependência**, nenhum `package.json`, coerente com o resto do projeto. Onde o código precisa de DOM, os testes usam um DOM mínimo próprio em [tests/support/dom.mjs](tests/support/dom.mjs), de umas 300 linhas, em vez de trazer o jsdom.

Os testes de página carregam os **JSONs reais** de `content/`, não mocks. Isso dá ao loop de autoria uma rede que o `validate.py` não dá: ele checa que o schema está certo, a suíte checa que o schema **vira página**.

O que está coberto, além do caminho feliz: `localStorage` bloqueado ou corrompido, migração de progresso antigo, navegador sem nenhuma voz italiana, navegador sem Web Speech API, `fetch` falhando em `file://`, aula com tipo de exercício não registrado, e manifest apontando para arquivo inexistente.

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
