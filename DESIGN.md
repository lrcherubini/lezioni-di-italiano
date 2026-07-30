# DESIGN.md — UX e sistema visual

Duas partes: **Parte 1** é comportamento e fluxo; **Parte 2** é o sistema visual. Ficam no mesmo arquivo porque as decisões se justificam mutuamente — o tratamento visual da `spiegazione` só faz sentido junto do princípio que a exige.

---

# Parte 1 — UX

## 1.1 Princípios

Cinco, em ordem de precedência. Quando entram em conflito, o de cima ganha.

### 1. Treinar, não testar

O padrão de material de audição é "ouça e responda perguntas". A literatura (Field, Conti) é enfática que isso *mede* a escuta sem *treinar* a escuta. Aqui, todo exercício de audição tem tarefa progressiva, com foco declarado em cada passada.

Consequência concreta: **o mesmo áudio é reaproveitado com tarefas diferentes** em vez de trocado por um novo. Reouvir não é trapaça, é o método — e a UI diz isso em texto, na abertura da etapa `Esercizi`.

### 2. Sempre o porquê

Nenhuma regra aparece sem explicação. É resposta direta a uma falha documentada em materiais comparáveis: responder "é assim que eles falam".

Na prática: `spiegazione` é campo **obrigatório** de toda seção, validado por script, e vem **antes** das tabelas no layout. O aluno lê o raciocínio, depois consulta a tabela — não o contrário.

### 3. Italiano primeiro, português sob demanda

O italiano é o texto principal, em peso semibold. A tradução é secundária: menor, em itálico, cor esmaecida. A hierarquia visual carrega a intenção de "pensar direto no idioma" sem precisar esconder a tradução — esconder atrapalharia um A1.

### 4. Produção obrigatória

Reconhecimento é fácil de construir e insuficiente para aprender. Toda aula termina com uma etapa de **produção sem gabarito**: escrever suas próprias frases, gravar-se, comparar. A ausência de gabarito é deliberada — e o texto da etapa diz que travar ali é justamente o que vale levar para a aula.

### 5. Nunca deixar o aluno sem saída

Falha de áudio, aula inexistente, `localStorage` bloqueado: em nenhum caso a resposta é tela branca ou silêncio. Sempre há um aviso que explica **o que aconteceu e o que fazer**.

## 1.2 Máquina de estados da aula

Página única, rolagem vertical, trilha *sticky* no topo. **Sem paginação** — material de estudo precisa ser re-escaneável, e paginar prejudica revisão. A trilha marca a etapa visível via `IntersectionObserver`.

```
Riscaldamento  Ativa conhecimento prévio. Pede uma tentativa ANTES de estudar
               ("escreva como você acha que se diz…"), e a etapa Produzione
               manda voltar aqui para o aluno se corrigir. Fecha o ciclo.

Studio         Seções com os chips do deck. spiegazione → blocos.
               🔊 em toda linha italiana.

Ascolto        O diálogo, em 3 passadas. Coração do método.

Esercizi       Cards inline: gap-audio, qa-transcribe, paradigm-fill.

Produzione     Sem gabarito, de propósito.

Bilancio       Autoavaliação. O desmarcado é o roteiro de revisão.
```

Etapas que a aula não tem simplesmente não aparecem — nem no conteúdo nem na trilha.

## 1.3 Anatomia de um card de exercício

Estados possíveis, visíveis na borda esquerda do card:

| Estado | Borda | Quando |
|---|---|---|
| inicial | cinza | não respondido |
| `correct` | verde | acerto exato |
| `partial` | âmbar | acerto com ressalva (acento, ou parcial em transcrição) |
| `wrong` | vermelho | erro |

### Regra: a resposta só abre depois de tentar

O botão **Mostrar resposta** nasce `disabled` e só libera após uma submissão. Sem isso, o exercício de audição degenera em exercício de leitura — basta revelar e copiar. O `title` do botão explica por que está travado, para não parecer bug.

### Regra: a transcrição completa é feedback, não enunciado

Em `gap-audio`, a frase inteira com áudio e tradução aparece **só no feedback**. Se aparecesse antes, não haveria o que ouvir.

## 1.4 O diálogo em passadas — a decisão mais opinativa

Três passadas, tarefas distintas, destravadas em ordem.

**Passada 1 — `gist`.** Só escuta. O `textarea` de anotação está **`disabled`**, não apenas oculto, e a transcrição está `hidden` sem botão para revelar. Objetivo: quantas vozes, qual assunto.

> Esta é a regra mais fácil de erodir e a que mais importa. Se der para ler ou anotar na primeira escuta, a escuta global não acontece. Desabilitar é intencional: ocultar convida a inspecionar o DOM; desabilitar comunica que é regra.

**Passada 2 — `note`.** Anotação liberada, com pedido **estreito** ("anote só os números"). Estreito de propósito: tentar transcrever tudo na segunda passada é o que trava o aluno.

**Passada 3 — `detail`.** Perguntas aparecem. O botão de revelar transcrição aparece. Cada linha tem seu 🔊 para reouvir só aquele trecho.

Ao errar, a transcrição **abre automaticamente** com a instrução de reouvir a linha que escapou. É o "feedback além de certo/errado": o aluno precisa ouvir *como* errou, não só que errou.

Chegar às passadas 2 ou 3 libera a seguinte — o aluno controla o ritmo, mas não pode pular a primeira.

## 1.5 Player de áudio

Corrige três falhas concretas documentadas em apps de curso comerciais: ausência de controle de velocidade, ausência de repetição, e dificuldade de repetir **uma** frase.

| Controle | Por quê |
|---|---|
| ▶ Ouvir | início |
| ↻ De novo | repetição é o método, então merece botão próprio |
| ■ Parar | interrompe na hora |
| **Lento (0.7)** / **Normal (1.0)** | A1 rende entre ~100–150 wpm |
| 🔊 por linha | repetir **um** trecho, a falha mais citada |
| ↳ Só a resposta | em `qa-transcribe`, isola o trecho que interessa |

**Não existe velocidade acima de 1.0.** Não é omissão: acima de ~+25% a compreensão desaba, e o teto é restrição pedagógica.

### Dois falantes com uma API só de TTS

`speechSynthesis` não tem noção de personagem. Três degraus:

| Vozes `it-IT` | Estratégia |
|---|---|
| 2 ou mais | uma voz distinta por falante |
| exatamente 1 | mesma voz, *pitch* diferente (A 1.05 / B 0.85) |
| **zero** | modo transcrição-primeiro |

Verificado neste ambiente: `getVoices()` devolve **0 vozes imediatamente** e 19 (com 1 italiana) só depois do evento `voiceschanged`. O degrau de 1 voz é, portanto, o caso comum — não uma borda teórica.

## 1.6 Degradação sem voz italiana

Caso real em alguns Linux e Android. Resposta:

1. Banner de aviso no topo, explicando **o que** aconteceu e **como resolver** (instalar voz no sistema, ou usar Edge/Chrome).
2. Os exercícios continuam interativos — o texto é revelado e a tarefa passa a ser leitura e produção.
3. Nada de erro, nada de botão morto sem explicação, nada de tela branca.

Verificado: com zero vozes `it-IT`, a Aula 1 renderiza as 10 seções e 15 cards, com 32 inputs e 15 botões Verificar funcionais.

## 1.7 Feedback de resposta

Três tons, e o do meio é o que carrega o design.

| Tom | Quando | Mensagem |
|---|---|---|
| verde | acerto exato | *Esatto!* + frase completa com áudio |
| **âmbar** | **acerto com ressalva** | *Quase perfeito* + **qual** foi a ressalva |
| vermelho | erro | orientação acionável, não só "errado" |

**O tom âmbar existe porque reprovar por acento ensina menos que apontar o acento.** Quem escreve `perche` acertou a palavra; a informação útil é `perch<b>é</b>`. Vale `score: 0.85`, então conta como progresso.

O vermelho é graduado por similaridade: acima de 60%, "você está perto, repare no fim da palavra"; abaixo, "ouça em Lento e use a dica".

Em transcrição, o feedback é **diff palavra a palavra** — `del` para o que faltou, `ins` para o que sobrou, na ordem em que se lê um diff. Numa transcrição, saber *qual* palavra escapou é a informação; "errado" não é.

## 1.8 Acessibilidade

- **Teclado:** tudo alcançável. `Enter` envia em `input`; `Ctrl/Cmd+Enter` em `textarea` (`Enter` puro insere linha, como se espera).
- **Leitores de tela:** feedback em `role="status"` + `aria-live="polite"`, para ser anunciado sem roubar foco. Banner de degradação em `role="alert"`. Nota didática em `role="note"`.
- **Toggles:** velocidade e passadas usam `aria-pressed`; a trilha usa `aria-current`.
- **Botões de áudio:** `aria-label` com o texto que será falado — "🔊" sozinho não diz nada.
- **Foco:** `:focus-visible` com anel de 3px; nunca removido.
- **Skip link** para o conteúdo.
- **Movimento:** `prefers-reduced-motion` zera transições.
- **Cor nunca é o único canal:** estados carregam ícone (✅/❌) e texto além da cor.
- **Impressão:** player, trilha e botões desaparecem; transcrições ocultas são reveladas, para o material servir em papel.

---

# Parte 2 — Sistema visual

## 2.1 De onde vem a paleta

Do deck de slides das aulas. Isso é decisão, não acidente: **o material deve parecer continuação da aula, não um app paralelo.** O deck usa faixa tricolor italiana, navy escuro para títulos e chips de grammatica/verbo, crimson para expressões, verde para vocabulário — e a estrutura "H1 em italiano + subtítulo em itálico glosando em português", que o site reproduz em toda seção.

## 2.2 Tokens

Em `css/tokens.css`. Nada de valor cru fora dele.

```
Marca      --navy #1a3a6b   --crimson #b3272d   --verde #1e7a4b
Destaque   --accent
Superfície --bg --surface --surface-alt --surface-sunken --border --border-strong
Texto      --text --text-muted --text-faint --text-on-dark
Feedback   --ok --warn --err (cada um com -bg e -border)
Chips      --chip-verbo --chip-vocabolario --chip-espressione
           --chip-grammatica --chip-pronuncia
```

### Por que `--accent` existe separado de `--navy`

Armadilha real, corrigida durante a implementação: `--navy` (#1a3a6b) é escuro o suficiente para servir de **fundo** com texto branco, e por isso **não pode virar texto** sobre fundo escuro — no dark mode ficaria ilegível.

Então há dois tokens com papéis distintos: `--navy` para fundos e bordas, **`--accent` para texto e ênfase**, e é `--accent` que inverte no dark mode. A tentação de espalhar `:root[data-theme="dark"] .foo { color: … }` por todo o CSS foi recusada: além de repetitivo, aquele padrão não cobre quem está no dark do sistema sem ter tocado no toggle.

## 2.3 Chips de categoria

Vêm dos chips do deck e são o eixo de **domínio** do conteúdo.

| Chip | Cor | Conteúdo |
|---|---|---|
| `VERBO` | navy | conjugação, uso de verbo |
| `VOCABOLARIO` | verde | listas de palavras, paradigmas |
| `ESPRESSIONE` | crimson | frases fixas, saudações |
| `GRAMMATICA` | navy-600 | artigos, plural, concordância |
| `PRONUNCIA` | **violeta** | fonética, alfabeto, acento |

`PRONUNCIA` é **extensão nossa**: o deck não tinha chip para fonética, e a Aula 0 é inteiramente pronúncia. Rotular fonética como `GRAMMATICA` seria mentir na taxonomia; violeta foi escolhido por não colidir com nenhuma cor do deck.

O **chip secundário** (`.chip--sub`) é contornado em vez de preenchido, para não competir com o primário — espelha o chip de subtópico à direita nos slides.

## 2.4 Tipografia

| Papel | Tratamento |
|---|---|
| Títulos de aula e seção | serifada (`--font-serif`), `--accent` |
| Texto italiano | sans, **600**, cor de texto plena |
| Gloss em português | sans, *itálico*, `--text-muted`, um passo menor |
| Explicação | sans, `--lh-loose` (1.7), largura máxima `68ch` |
| Diff e código | monoespaçada |

O par **italiano-semibold / gloss-itálico-esmaecido** é o motivo tipográfico central, repetido em item de lista, célula de tabela, linha de diálogo e feedback. É o Princípio 3 em forma visual.

A serifada nos títulos separa "material de estudo" de "interface": chrome é sans, conteúdo tem voz própria.

`--measure: 68ch` limita a largura da `spiegazione`. Explicação longa em linha larga não se lê.

## 2.5 Tratamento visual de `spiegazione` e notas

A `spiegazione` não fica em caixa nem em cor de destaque: é **texto corrido**, com entrelinha folgada e largura limitada. Deve parecer um livro, não um alerta. Dentro dela, `<b>` recebe `--accent` e `<em>` fica semibold em itálico — usado para citar formas italianas no meio do português.

**Notas** são callouts, com três tons semânticos:

| `tono` | Visual | Uso |
|---|---|---|
| `info` | azul suave | contexto útil, atalho mental |
| `attenzione` | âmbar | erro comum, pegadinha |
| `eccezione` | borda crimson | forma irregular que precisa ser decorada |

O `eccezione` tem peso visual maior de propósito. Linha de paradigma marcada como exceção ganha fundo âmbar e um `⚠` — é o que faz `i belgi` não passar batido.

## 2.6 Tabelas

Sempre dentro de `.table-wrap` com `overflow-x: auto`: **a tabela rola dentro do próprio container e o corpo da página nunca rola na horizontal.** Conjugações e paradigmas de 4 colunas não caberiam em tela de celular de outro jeito.

`thead` é sticky dentro do wrapper, primeira coluna em semibold, zebra nas listas.

Em paradigmas, **toda célula tem 🔊** — a tabela é material de escuta, não só de leitura.

## 2.7 Dark mode

Segue o sistema por padrão, com toggle que persiste.

Detalhe de implementação que importa: cada bloco de tema aparece **duas vezes** — como `@media (prefers-color-scheme: dark)` restrito a `:root:not([data-theme="light"])`, e como `:root[data-theme="dark"]`. Isso garante que o toggle vença nos dois sentidos: forçar claro dentro do dark do sistema, e forçar escuro dentro do claro.

No dark, os chips clareiam (o navy do deck não tem contraste suficiente em fundo escuro) e as cores de feedback ganham versões dessaturadas.

## 2.8 Responsivo

Mobile-first, com apenas quatro pontos de quebra e nenhum framework.

| Largura | Muda |
|---|---|
| base | tudo em coluna única |
| 620px | blocos de `contrasto` viram 2 colunas |
| 640px | grade de aulas vira multi-coluna |
| 720px | cabeçalho de objetivos vira 3 colunas |

Elementos que sobrevivem em telas estreitas por decisão: os controles do player usam `flex-wrap`; a trilha rola horizontalmente com `min-width: max-content`; tabelas rolam no próprio wrapper.
