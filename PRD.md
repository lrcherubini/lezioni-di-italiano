# PRD — Lezioni di italiano

## 1. Problema

Um adulto brasileiro faz **aula particular de italiano, 1-a-1, online**, uma vez por semana. O material de apoio que o professor entrega é fraco e desestruturado: slides em PDF com tabelas e listas soltas, sem explicação escrita, mais o registro do chat da aula com os exemplos que foram digitados ao vivo.

Consequências práticas, todas verificadas no material real:

- **A explicação não existe em lugar nenhum.** Os slides mostram *que* `lo spagnolo` leva `lo`, nunca *por quê*. Passada uma semana, a explicação oral se perde e resta uma tabela sem lógica.
- **O conteúdo está partido entre duas fontes.** Um tema inteiro da Aula 1 (idade com *avere*, incluindo a elisão `vent'anni`) e a regra de `lo/gli` por som inicial existem **apenas** no chat, não no deck. Quem estuda pelo deck estuda uma aula incompleta.
- **Não há nada de audição.** Zero arquivos de áudio. A prática de escuta acontece só durante a aula, e não é revisitável.
- **Nada conecta as aulas.** A regra de C/G da Aula 0 é exatamente o que explica `amici` contra `amiche` na Aula 1, e nenhum material faz essa ligação.
- **Não há revisão.** Nenhum mecanismo indica o que já foi dominado e o que precisa voltar.

## 2. Usuário

Um só. Não há multiusuário, conta, login ou perfil.

- Falante nativo de **português do Brasil**, nível **A1** de italiano.
- Desenvolvedor: confortável com Git, terminal e leitura de JSON.
- Estuda **sozinho, entre as aulas**, em desktop e celular.
- Tem aula **particular**, o que significa que pode levar dúvidas específicas ao professor — e que **atividades em par ou grupo são inúteis**.

## 3. Objetivos

1. **Autocontenção.** Estudar a aula inteira, incluindo o *porquê* de cada regra, sem abrir nenhum PDF.
2. **Audição praticável e repetível.** Exercícios de escuta disponíveis a qualquer hora, com repetição ilimitada e velocidade reduzida.
3. **Loop de autoria mecânico.** A cada aula nova, acrescentar uma seção lendo os arquivos entregues e editando **apenas** `content/` — requisito de primeira classe, não conveniência.
4. **Continuidade visual com a aula.** O site espelha a taxonomia de chips do próprio professor, para parecer continuação da aula e não um app paralelo.
5. **Durabilidade.** Precisa funcionar em 2 anos sem manutenção. Daí zero dependências.
6. **Imersão progressiva.** O conteúdo explicativo migra do português para o italiano ao longo do curso, aula a aula, e as duas pontas coexistem no mesmo site — a Aula 1 continua em português enquanto a Aula 30 já é toda em italiano. Ver §12.

## 4. Não-objetivos

- **Não substitui a aula.** É material de estudo entre aulas.
- **Sem backend, sem conta, sem sincronização entre dispositivos.** Progresso é local ao navegador.
- **Sem atividade de par ou grupo.**
- **Sem reconhecimento de fala e sem avaliação de pronúncia.** A produção oral é auto-gravada e autoavaliada.
- **Não é um curso genérico de italiano.** Só cobre o que foi dado em aula, na ordem em que foi dado.
- **Não redistribui o material do professor.** `presentations/` é gitignorado.
- **Sem gamificação** (pontos, streaks, badges).

## 5. Fundamentação metodológica

A referência inicial foi a metodologia da inFlux. A pesquisa mostrou que ela é **abordagem Comunicativa + Lexical**, não drill audiolingual, e que **não tem currículo de italiano** (só inglês e espanhol). O que se aproveitou dela:

- **Taxonomia de chunks** — frase fixa / semifixa / colocação / palavra. A frase semifixa (*slot-and-frame*: `Io sono ___`) é o mecanismo de ensinar gramática sem enunciar regra. Curiosamente, o próprio material do professor já é drill de chunks com tabelas de paradigma — o modelo encaixou sem forçar.
- **Lexical Notebook** — chunk + exemplo próprio do aluno + revisão.
- **Roteamento adaptativo** — contar erros por item e servir mais do que se erra.

A **progressão de tópicos A1** vem do padrão de facto do mercado (Nuovo Espresso 1), não da inFlux.

### A ordem das etapas: contexto antes da regra

A aula renderiza sempre na mesma ordem — *Riscaldamento → Lessico → Ascolto → Studio → Esercizi → Produzione → Bilancio* — e ela é fixa no código, não configurável por aula.

A primeira versão punha **Studio antes de tudo**, herdando a organização dos slides do professor: eles são agrupados por tópico gramatical, que é uma ordem de referência, não de aprendizado. O efeito era o aluno ler a regra de `lo/gli` antes de jamais ter ouvido `lo spagnolo` — exatamente o contrário da abordagem comunicativa que este documento declara como fundamentação.

A ordem atual segue o ciclo do método lexical: **o bloco pronto primeiro** (`Lessico`, com os chunks agrupados por intenção comunicativa), **o bloco em uso** (`Ascolto`), **e só então a estrutura que o explica** (`Studio`). É onde `spiegazione` rende mais: explicar uma forma que o aluno já encontrou é ancorar; explicá-la antes é pedir para decorar.

A ordem ser única, e não declarada por aula, é decisão: uma aula que parecesse pedir outra ordem seria conteúdo colocado no bloco errado, e um campo de ordenação só esconderia isso.

### Modos de falha documentados, contra os quais o produto foi desenhado

| Falha observada em produtos comparáveis | Resposta do produto |
|---|---|
| App de áudio sem controle de velocidade, sem repetir trecho | Velocidade Lento/Normal, repetir a qualquer momento, 🔊 por linha |
| "É assim que eles falam", sem explicação | `spiegazione` obrigatória, com o *porquê*, em toda seção |
| Aula "robótica", só reconhecimento | Etapa de **produção** em toda aula, sem gabarito |
| Erros no material de apoio | Procedimento de validação em fonte normativa + `ERRATA.md` |

### Pedagogia de audição

Aplicada de Field e Conti:

- **"Train, don't test."** "Ouça e responda perguntas de compreensão" é o antipadrão, não o padrão.
- **Mesmo áudio, tarefa diferente em cada passada.**
- **Passada 1 é escuta pura** — sem escrever, sem ler. Na UI, o input fica *desabilitado* e a transcrição *escondida*. Se der para ler na primeira vez, o exercício de audição virou exercício de leitura.
- O aluno falha em **decodificação e fronteira de palavra**, não em vocabulário.
- Feedback além de certo/errado: transcrição **e** possibilidade de reouvir só o trecho que escapou.
- Velocidade A1 entre ~100–150 wpm; **nunca acima de +25%**. Daí o teto de `1.0` — não existe botão de acelerar.

## 6. Histórias de usuário

### Obrigatórias (pedidas explicitamente)

**H1 — Diálogo curto com conteúdo da aula.**
Como aluno, quero ouvir um diálogo curto usando só o vocabulário que já vi, para treinar escuta em contexto.
*Aceite:* 6–10 turnos; dois falantes com vozes distinguíveis; três passadas com tarefas diferentes; passada 1 com input desabilitado e transcrição oculta; transcrição liberada só na passada 3, com áudio por linha.

**H2 — Lacuna preenchida de ouvido.**
Como aluno, quero uma frase com lacuna que eu preencho ouvindo o áudio.
*Aceite:* o texto não revela a palavra; repetição ilimitada; Lento disponível; a frase reconstruída é idêntica ao áudio; resposta sem acento conta como correta **com nota** mostrando o acento certo; a transcrição completa só aparece depois de uma tentativa.

**H3 — Transcrever a resposta de um par pergunta/resposta.**
Como aluno, quero ouvir uma pergunta e sua resposta e transcrever apenas a resposta.
*Aceite:* botão para ouvir só a resposta; feedback como **diff palavra a palavra** marcando o que faltou e o que sobrou; ≥80% das palavras conta como acerto parcial; original com áudio e tradução ao final.

### Derivadas

**H4 — Entender o porquê.** Toda seção tem explicação escrita, com casos-limite e comparação com o português. *Aceite:* dá para estudar a aula sem abrir PDF.

**H5 — Completar paradigma.** Tabelas de nacionalidade com células em branco. *Aceite:* cada célula é item de progresso próprio; feedback por célula; exceções marcadas.

**H6 — Ouvir qualquer linha.** Todo texto italiano tem 🔊.

**H7 — Não perder progresso.** Progresso sobrevive a recarga; exportável e importável em JSON.

**H8 — Autoavaliação.** Checklist no fim da aula; o que fica desmarcado é o roteiro de revisão.

## 7. Catálogo de exercícios

### Implementados

| Tipo | O que faz | Origem |
|---|---|---|
| `dialogue` | Diálogo em 3 passadas, tarefa diferente por passada | Field/Conti; rubricas A1 |
| `gap-audio` | Lacuna preenchida de ouvido | *Ascolta e completa* |
| `qa-transcribe` | Transcrever a resposta ouvida | Ditado focado |
| `paradigm-fill` | Completar tabela de formas | Drill de paradigma do professor |
| `slot-frame` | Drill de frase semifixa trocando o slot | Abordagem lexical |
| `scelta` | Escolher a forma certa entre alternativas | Compito «Scegli la parola corretta» |
| `riordino` | Remontar a frase com as palavras fora de ordem | Compito «Riordina le parole» |
| `abbinamento` | Associar pergunta e resposta | Compito «Abbina domande e risposte» |
| `flashcard` | Baralho do léxico da aula, uma carta por vez, com autoavaliação; a frente pode ser um **emoji/SVG** em vez do português | Lexical Notebook; efeito de superioridade da imagem |
| `dictogloss` | 4 etapas: pré-ensino → 3 escutas → reconstrução → análise contra o original | Dictogloss |
| `trasformazione` | Converter o modo da frase: afirmativa ⇄ negativa ⇄ interrogativa | Conversão de modo; tabela «afirmativa/negativa/interrogativa» dos materiais comunicativos |
| `traduzione` | PT → IT, frase inteira, sem nenhum andaime; feedback por diff de palavra | Tradução bidirecional das *consolidation exercises* |
| `correzione` | Ler uma frase errada e reescrevê-la certa | *Find the mistakes and rewrite* |

**Os drills de volume formam uma escada, e ela foi desenhada como escada.** Cada degrau tira uma muleta da tela: `abbinamento` dá os dois lados · `scelta` dá as alternativas · `riordino` dá as palavras · `slot-frame` dá o molde · `trasformazione` dá a frase e pede uma operação · `traduzione` não dá nada além do sentido.

Os dois últimos foram os que faltaram por mais tempo, e a falta tinha consequência: sem eles a aula terminava em reconhecimento, e produzir uma frase inteira do zero — o que a conversa exige — só acontecia na etapa de Produzione, que não tem correção.

**`correzione` não é um degrau da escada: é um eixo perpendicular a ela.** Os seis degraus partem todos de material correto e medem *produção*. Este parte de material errado e mede **monitoramento** — a atenção com que se relê o que se acabou de escrever. Quem produz `Lui legge il giornale` sem hesitar passa direto por `Lui legge i giornale` num texto seu, porque são duas habilidades e o site só treinava uma.

Ele traz consigo a **única exceção** ao invariante «italiano exibido ⇒ 🔊 ⇒ entra no léxico»: o campo `sbagliata` não ganha áudio e não alimenta `lessico.json`. Ver DESIGN §1.3 e o cabeçalho de `js/exercises/correzione.js`.

### Blocos de conteúdo

Além dos exercícios, uma seção monta blocos de leitura: `lista`, `tabella`, `contrasto`, `paradigma`, `nota` e **`scambio`**.

`scambio` é o microdiálogo de 2 a 4 turnos, e existe para o degrau que faltava: entre produzir *uma frase* (`traduzione`) e o diálogo de 8 turnos não havia nada, e o que falta ali é ver o bloco vivendo na menor conversa possível. É **leitura, não drill** — sem id, sem progresso, sem entrar no `conteggio` —, pela mesma distinção que separa `funzioni` do baralho.

Ele **entra** em `lessico.json`, ao contrário do `dialogo`. A diferença não é o formato — os dois são turnos com falante — é o papel: o scambio é modelo que a aula exibe e ensina, como uma `lista`; o diálogo é o que a checagem de escopo confere, e entrando ele se autoautorizaria.

Também já entregues: **Ripasso** adaptativo atravessando aulas (`ripasso.html`), card de Ripasso na home, **Lexical Notebook** com UI própria (`notebook.html`), **gravação de voz** na etapa de Produzione, as **Frasi utili** (§7.1) e a página **Frasi per la lezione** (§7.2).

### 7.1 Frasi utili — o chunk agrupado por intenção

Os chunks existiam desde a Aula 1 e só apareciam de uma forma: cartas embaralhadas no baralho. Isso testa recuperação, mas não responde a pergunta que o aluno faz quando vai falar, que não é «o que quer dizer *piacere*» e sim **«o que eu digo quando conheço alguém»**.

`funzioni` agrupa os chunks por intenção comunicativa — *Quando ti presenti*, *Quando non capisci*, *Quando sei gentile* — e renderiza no alto da etapa Lessico, antes do baralho. Primeiro se lê organizado, depois se testa embaralhado.

Duas decisões sustentam isso:

- **Agrupa por referência de id, nunca copiando texto.** `chunks` continua sendo o inventário lexical único: texto duplicado ficaria mentindo depois da primeira edição, e id duplicado misturaria dois históricos de progresso.
- **Não grava progresso.** Função é leitura organizada; quem mede a recuperação é o baralho logo abaixo. Por isso `funzioni` não entra no `conteggio` — e por isso acrescentá-la a uma aula antiga não mexeu na barra de progresso de ninguém.

### 7.2 Frasi per la lezione — o que atravessa todas as aulas

`frasi.html` é a terceira página fora da sequência, depois de Ripasso e Caderno, e existe pelo mesmo motivo das outras duas: **o que atravessa todas as aulas não cabe dentro de nenhuma.** As frases de sobrevivência viviam na Aula 0 — e ninguém volta à Aula 0 no meio da Aula 12 para achar «pode repetir?».

A divisão em dois grupos é o conteúdo inteiro:

| Grupo | O aluno | Por que separado |
|---|---|---|
| **Tu dici** | **produz** | Decora e diz. Travar sem ter como pedir socorro é o que faz a conversa parar. |
| **L'insegnante dice** | só **reconhece** | Chegam faladas, rápido e sem aviso, e é aí que travam. |

A metade receptiva é a parte que **o site faz melhor que um livro**: um livro imprime `Ripeti dopo di me` e manda ouvir um CD; aqui o 🔊 já está em cada linha, a 0.7 e a 1.0. Reconhecer a instrução na velocidade real é habilidade separada de saber o que ela significa, e é a que decide se a aula anda ou para para explicar.

Reusa `funzioni` + `chunks`, então `renderFunzioni()` a monta sem uma linha de mudança. **Não grava progresso e fica fora do Ripasso**, pela mesma decisão do §7.1. O que ela tem é o **＋ caderno** — leia organizado aqui, guarde o que travou, escreva a sua frase lá.

Duas regras que o validador sustenta: frase que uma aula já ensina aparece com o **mesmo id** (id é a chave do caderno, e dois ids para a mesma frase a guardariam duas vezes), com o texto conferido contra a aula de origem; e `frasi.json` fica **fora de `lessico.json`**, senão um diálogo se autoautorizaria a usar as frases de sobrevivência.

### Ainda não implementado

| Tipo | O que faz | Por que não |
|---|---|---|
| `minimal-pair` | Discriminação 2AFC de sons próximos, ciclando vozes | HVPT pede ciclagem de várias vozes; `voiceFor()` em `speech.js` só expõe **dois** slots — o eixo `speaker` A/B, já consumido pelo diálogo. Exige refazer a seleção de voz no arquivo mais delicado do projeto. |

## 8. Requisitos não-funcionais

| # | Requisito | Como é atendido |
|---|---|---|
| NF1 | **Zero build, zero dependência** | HTML + CSS + JS vanilla, ES modules, JSON via `fetch`. Deploy = `git push`. Vale para o ferramental: validador em stdlib do Python, suíte no `node --test` embutido, e o harness de navegador falando CDP direto pelo `WebSocket` do Node — sem Playwright e sem `package.json`. |
| NF2 | **Loop de autoria mecânico** | Aula nova toca só `content/`; `CLAUDE.md` traz a checklist; `tools/validate.py` verifica. |
| NF3 | **Sem servidor, sem rastreamento** | Nada sai do navegador. Sem cookies, sem analytics, sem fonte ou script externo. |
| NF4 | **Privacidade** | Nenhum arquivo versionado cita nome de pessoa ou plataforma. `presentations/` e `ERRATA.md` gitignorados. |
| NF5 | **Degradação graciosa de áudio** | Sem voz `it-IT`, o site avisa e entra em modo transcrição-primeiro. Nunca tela branca. |
| NF6 | **Acessibilidade** | Navegação por teclado, `aria-live` no feedback, `aria-pressed` nos toggles, skip link, foco visível, `prefers-reduced-motion`. |
| NF7 | **Responsivo** | Mobile-first; tabelas rolam no próprio container; o corpo nunca rola na horizontal. |
| NF8 | **Tema claro e escuro** | Segue o sistema, com toggle que vence nos dois sentidos. |
| NF9 | **Integridade do progresso** | `localStorage` versionado com função de migração; `id` de item imutável. |
| NF10 | **Controle sobre os próprios dados** | Painel «Seus dados» na home (`#dati`) explica o que fica salvo e onde, e traz exportar, importar e **apagar tudo** com confirmação inline. Sem banner de consentimento: o `localStorage` guarda só armazenamento estritamente necessário, e não há servidor nem terceiro. Persistir gravação de voz mudaria isso e exigiria opt-in. |

## 9. Critérios de aceite (verificáveis)

Onde diz **[nav]**, o critério deixou de depender de alguém abrir o navegador e
conferir: virou asserção em `tests/browser/`, num Chrome de verdade. Era a
metade da lista que o DOM da suíte não alcançava — e a que envelhecia calada,
como o parágrafo do DESIGN §1.6 que ficou anos afirmando «10 seções e 15 cards»
para uma aula que tem 11 e 29.

1. `python tools/validate.py` sai com 0.
2. Aula 1 renderiza 11 seções e as 7 etapas, **sem erro no console**. A trilha sticky lista as etapas **na mesma ordem** em que elas aparecem na página. **[nav]**
3. Todos os chips aparecem com as cores do deck.
4. Resposta sem acento em item com acento → correto **com nota** exibindo a forma acentuada.
5. `un amico` **não** é aceito onde se espera `un'amica`.
6. Passada 1 do diálogo: input desabilitado e transcrição oculta; passadas 2 e 3 travadas até liberar. **[nav]**
7. Verificar um exercício grava em `localStorage` e o progresso sobrevive a F5 — no dado salvo e na barra da home, **não** na borda do card, que é estado de sessão. **[nav]**
8. Paradigma grava progresso **por célula** (`l01-e13-r1-c1`), não por exercício.
9. Sem voz `it-IT`: banner aparece, página segue completa e interativa. **[nav]**
10. Aula inexistente (`?l=99`) mostra erro explicativo, não tela branca.
11. Nenhum nome de pessoa ou plataforma em arquivo versionado.
12. O verso do flashcard **não** aparece antes de «Mostrar», e só uma carta fica visível por vez. **[nav]**
13. «🗑 Apagar tudo» pede confirmação; cancelar preserva o progresso, confirmar zera progresso, agenda e caderno.
14. Nenhuma das cinco páginas rola na horizontal a 360px de largura (NF7). **[nav]**
15. Todo elemento marcado `[hidden]` está de fato com `display: none` (NF6/NF7). **[nav]**
16. O tema segue o sistema **e** o toggle vence nos dois sentidos (NF8). **[nav]**
17. Na impressão, trilha, player e botões somem; a transcrição oculta é revelada. **[nav]**

## 10. Roadmap

**Fase 1 — feita.** Estrutura, docs, 4 tipos de exercício, Aulas 0 e 1 completas a partir das fontes reais, validador, progresso com SRS, degradação de áudio, tema claro/escuro.

**Fase 2 — feita.** `slot-frame`, `scelta`, `riordino`, `abbinamento`, `flashcard`, `dictogloss`; UI do Lexical Notebook; Ripasso adaptativo na home; gravação de voz na Produzione; mecanismo de modo de língua (§12).

**Fase 2.1 — feita.** Reordenação das etapas para *contexto antes da regra* (§5); **Frasi utili** (§7.1); `trasformazione` e `traduzione`, que fecham a escada de produção; cabeçalho de objetivos virou **sumário navegável** — cada item com `sezione` rola até o ponto da aula.

**Fase 2.2 — feita.** O caderno léxico estava inteiro e passando nos testes, e mesmo assim invisível: era um laço fechado, porque só se chegava a ele pelo card da home — que só aparece com o caderno cheio — e o único botão capaz de enchê-lo nascia escondido atrás do «Mostrar» de uma carta. Ganhou **＋ caderno em toda linha das Frasi utili** e link na etapa Lessico. Junto vieram **`frasi.html`** (§7.2); o primeiro **`dictogloss`** autorado, que fez o tipo deixar de ser código morto e expôs que faltava sua checagem no validador; o bloco **`scambio`**; e o drill **`correzione`**.

**Fase 2.3 — feita.** Suíte de navegador (`tools/browser.mjs` + `tests/browser/`),
que fecha o ponto cego admitido desde sempre: o DOM da suíte nunca interpretou
CSS, e `tests/css.test.mjs` só conseguia aproximar o invariante lendo a folha
como texto. São 50 asserções num Chrome de verdade — `[hidden]` realmente
invisível, nenhuma rolagem horizontal a 360px, tema e impressão, os três degraus
de voz, e o caminho do aluno de ponta a ponta. Sete critérios do §9 deixaram de
depender de conferência manual, e a conferência que ela forçou já rendeu: o
DESIGN §1.6 afirmava «10 seções e 15 cards» para uma Aula 1 que tem 11 e 29.

**Fase 3 — se fizer falta.** `minimal-pair` (exige refatorar a seleção de voz); persistir gravações em IndexedDB para comparar evolução ao longo das semanas — **e isso exige opt-in explícito na mesma mudança**, porque gravação salva deixa de ser armazenamento necessário e vira dado guardado por escolha (ver `js/record.js` e CLAUDE.md); MP3 pré-gerados por item (o schema já tem `audio.src`) caso o TTS se mostre insuficiente; busca em todo o conteúdo (com 4 aulas e ~500 formas, ainda resolve um problema que não existe); pôr `frasi.json` no manifest, se as frases de sobrevivência pedirem drill e revisão espaçada além da leitura.

## 11. Decisões de arquitetura e o motivo

| Decisão | Alternativa recusada | Por quê |
|---|---|---|
| **Web Speech API** para áudio | MP3 pré-gerados | Autoria sem atrito: aula nova é só texto. Zero binário no git. Velocidade de graça. `audio.src` fica no schema como saída futura. |
| **localStorage** | Sem estado algum | Habilita revisão espaçada e histórico de erro, sem backend. Exportável para não trancar o dado. |
| **Zero build** | Astro/Vite | Precisa funcionar em 2 anos sem manutenção. `node_modules` envelhece; HTML não. |
| **JSON por aula + `fetch`** | HTML autocontido por aula | Um lugar para mudar a UI. Custo aceito: exige servidor local para preview, porque `fetch` não roda em `file://`. |
| **`category` e `chunkType` separados** | Um campo só | Eixos diferentes: um governa cor e navegação, o outro governa elegibilidade de drill. Fundir quebraria a geração de exercício. |
| **Teto de velocidade em 1.0** | Deixar 1.5× | Para A1, acelerar derruba a compreensão. Restrição pedagógica deliberada. |
| **Acento vira "correto com nota"** | Reprovar | Quem escreve `perche` acertou a palavra. Reprovar ensina menos que apontar o acento. |
| **Harness de navegador em CDP puro** | Playwright | Ver abaixo. |

### Por que não Playwright

A pergunta é legítima — uma ferramenta só de teste, que nunca toca o que é
servido, não ameaça o «durar dois anos sem manutenção» do jeito que uma
dependência de runtime ameaçaria. Ela foi considerada e recusada por medida,
não por princípio.

O Node 22+ traz `WebSocket` global e o Chrome fala **CDP** — o mesmo protocolo
que o Playwright usa por baixo. O driver inteiro coube em `tools/browser.mjs`,
stdlib pura, e entrega 52 asserções em ~13s. O que o Playwright somaria a isso:

- **Firefox e WebKit**, que o CDP não alcança. É o único ganho insubstituível —
  e vale **zero aqui**, porque o único usuário estuda em Chrome/Edge no desktop
  e Chrome no Android: os três são Chromium, exatamente o motor já coberto.
- **Regressão visual.** Não é exclusividade dele: `Page.captureScreenshot` é
  comando CDP. Fica como extensão possível do harness atual, se a Parte 2 do
  DESIGN passar a merecer verificação.
- Conveniência (auto-wait rico, seletor por texto, trace viewer). Real, mas
  `page.esperar()` cobre o essencial.

E uma ressalva que derruba o argumento aparentemente mais forte: **o WebKit do
Playwright não é o Safari.** É um build sem a pilha da Apple, e a
`speechSynthesis` dele não é a do iOS — logo ele **não** testaria o `unlock()`
por gesto que o `js/speech.js` implementa justamente para o iOS Safari. O caso
que mais pediria WebKit é o que o WebKit do Playwright não cobre.

**O que reabriria a decisão:** passar a estudar em Firefox ou em iPhone. Aí
cross-browser deixa de ser hipótese.


## 12. Progressão de língua

O conteúdo explicativo começa em português e migra para o italiano ao longo do curso. Como o número das aulas de virada não é conhecido de antemão, **cada aula declara o seu próprio modo** e os três coexistem no mesmo site.

| `modo` | Prosa | Português aparece | Marca-se |
|---|---|---|---|
| `pt` (padrão) | portuguesa | em toda parte | o italiano citado, com `<it>` |
| `misto` | italiana | em pontos-chave de compreensão | o português, com `<pt>` |
| `it` | italiana | só nas glossas de vocabulário | o português, com `<pt>` |

Três decisões que sustentam isto:

- **É uma regra só, com a polaridade parametrizada.** «Marque a minoria» já era a regra do `pt: true` das tabelas. O `modo` apenas diz quem é a minoria naquela aula. `misto` e `it` renderizam idêntico — a diferença entre eles é editorial, não mecânica.
- **As glossas de vocabulário ficam em português em TODOS os modos.** São o ponto fixo do desenho. E não precisam de mecanismo: são campos JSON discretos, e o campo já é a marcação. O `spiegazione` continua obrigatório em todos os modos — ele exige que exista uma *explicação*, não que ela seja portuguesa.
- **A chrome da interface não acompanha o modo.** É texto funcional, não conteúdo de estudo; `index.html` e `ripasso.html` não têm modo (o Ripasso mistura aulas por construção); e a chrome já é deliberadamente bilíngue — rótulos pedagógicos em italiano (`Riscaldamento`, `Esatto!`, `Modello`), mecânicos em português.

**Não-objetivo:** TTS em português. O português aqui é lido, nunca ouvido, e é a L1 do aluno. `<pt>` nunca ganha botão de áudio — uma voz italiana monolíngue leria português com fonologia italiana, e uma multilíngue trocaria de idioma por detecção de conteúdo.
