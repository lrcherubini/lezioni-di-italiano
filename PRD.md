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
| `flashcard` | Léxico da aula em cartas, com autoavaliação | Lexical Notebook |
| `dictogloss` | 4 etapas: pré-ensino → 3 escutas → reconstrução → análise contra o original | Dictogloss |

Também já entregues: **Ripasso** adaptativo atravessando aulas (`ripasso.html`), card de Ripasso na home, **Lexical Notebook** com UI própria (`notebook.html`) e **gravação de voz** na etapa de Produzione.

### Ainda não implementado

| Tipo | O que faz | Por que não |
|---|---|---|
| `minimal-pair` | Discriminação 2AFC de sons próximos, ciclando vozes | HVPT pede ciclagem de várias vozes; `voiceFor()` em `speech.js` só expõe **dois** slots — o eixo `speaker` A/B, já consumido pelo diálogo. Exige refazer a seleção de voz no arquivo mais delicado do projeto. |

## 8. Requisitos não-funcionais

| # | Requisito | Como é atendido |
|---|---|---|
| NF1 | **Zero build, zero dependência** | HTML + CSS + JS vanilla, ES modules, JSON via `fetch`. Deploy = `git push`. |
| NF2 | **Loop de autoria mecânico** | Aula nova toca só `content/`; `CLAUDE.md` traz a checklist; `tools/validate.py` verifica. |
| NF3 | **Sem servidor, sem rastreamento** | Nada sai do navegador. Sem cookies, sem analytics, sem fonte ou script externo. |
| NF4 | **Privacidade** | Nenhum arquivo versionado cita nome de pessoa ou plataforma. `presentations/` e `ERRATA.md` gitignorados. |
| NF5 | **Degradação graciosa de áudio** | Sem voz `it-IT`, o site avisa e entra em modo transcrição-primeiro. Nunca tela branca. |
| NF6 | **Acessibilidade** | Navegação por teclado, `aria-live` no feedback, `aria-pressed` nos toggles, skip link, foco visível, `prefers-reduced-motion`. |
| NF7 | **Responsivo** | Mobile-first; tabelas rolam no próprio container; o corpo nunca rola na horizontal. |
| NF8 | **Tema claro e escuro** | Segue o sistema, com toggle que vence nos dois sentidos. |
| NF9 | **Integridade do progresso** | `localStorage` versionado com função de migração; `id` de item imutável. |

## 9. Critérios de aceite (verificáveis)

1. `python tools/validate.py` sai com 0.
2. Aula 1 renderiza 10 seções, 6 etapas e 15 cards de exercício, sem erro no console.
3. Todos os chips aparecem com as cores do deck.
4. Resposta sem acento em item com acento → correto **com nota** exibindo a forma acentuada.
5. `un amico` **não** é aceito onde se espera `un'amica`.
6. Passada 1 do diálogo: input desabilitado e transcrição oculta; passadas 2 e 3 travadas até liberar.
7. Verificar um exercício grava em `localStorage` e o progresso sobrevive a F5.
8. Paradigma grava progresso **por célula** (`l01-e13-r1-c1`), não por exercício.
9. Sem voz `it-IT`: banner aparece, página segue completa e interativa.
10. Aula inexistente (`?l=99`) mostra erro explicativo, não tela branca.
11. Nenhum nome de pessoa ou plataforma em arquivo versionado.

## 10. Roadmap

**Fase 1 — feita.** Estrutura, docs, 4 tipos de exercício, Aulas 0 e 1 completas a partir das fontes reais, validador, progresso com SRS, degradação de áudio, tema claro/escuro.

**Fase 2 — feita.** `slot-frame`, `scelta`, `riordino`, `abbinamento`, `flashcard`, `dictogloss`; UI do Lexical Notebook; Ripasso adaptativo na home; gravação de voz na Produzione; mecanismo de modo de língua (§12).

**Fase 3 — se fizer falta.** `minimal-pair` (exige refatorar a seleção de voz); persistir gravações em IndexedDB para comparar evolução ao longo das semanas; MP3 pré-gerados por item (o schema já tem `audio.src`) caso o TTS se mostre insuficiente; busca em todo o conteúdo.

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
