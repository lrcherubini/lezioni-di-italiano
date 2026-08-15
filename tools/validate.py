#!/usr/bin/env python3
"""
Valida os arquivos de content/ contra os invariantes do projeto.

Uso:
    python tools/validate.py          # confere
    python tools/validate.py --fix    # confere e reescreve os dados derivados

Não é um passo de build — o site roda sem isso. É a checagem do passo 9 da
checklist de "chegou aula nova" no CLAUDE.md, transformada em código para
que o loop de autoria não dependa de inspeção manual.

DADOS DERIVADOS. Duas coisas em content/ são calculadas a partir das aulas,
não escritas à mão:

  · manifest.lezioni[].conteggio — quantos ids rastreáveis a aula tem. A
    home lê daqui em vez de baixar todo lezione-NN.json só para contar
    (com 40 aulas seriam ~1,6 MB por visita).
  · content/lessico.json — índice cumulativo do que já foi ensinado e em
    que aula. Sustenta a checagem da regra do i+1 nos diálogos.

Os dois são VERSIONADOS — o site é servido direto, sem build — e o
validador reprova quando ficam velhos. `--fix` reescreve. É o contrário de
um passo de build: o derivado é conferido no repositório, não gerado no
deploy.

Só stdlib. Sai com código 1 se algo falhar.
"""

import json
import re
import sys
import unicodedata
from collections import Counter
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
CONTENT = ROOT / 'content'

# Arquivos de content/ que NÃO são aula. Ficam de fora das checagens de
# schema de aula e da conferência contra o manifest.
# Arquivos de content/ que NÃO são aula. O conjunto governa cinco coisas de
# uma vez: pular `check_lesson`, ficar fora da colheita do léxico, ficar fora
# da checagem de escopo, não exigir entrada no manifest, e não entrar na
# contagem de aulas.
#
# `frasi.json` está aqui de propósito, e a razão do léxico é a que importa:
# ele existe para a checagem do i+1 dos diálogos, e as frases de sobrevivência
# são `fixed` decoradas inteiras, não vocabulário ensinado. Se entrassem, um
# diálogo poderia se autoautorizar a usá-las. Ele tem checagem própria em
# `check_frasi`.
NAO_LEZIONE = {'manifest.json', 'lessico.json', 'frasi.json'}

# Espelham o que está documentado no CLAUDE.md. Acrescentar valor aqui
# exige acrescentar no CLAUDE.md também — é de propósito que dê trabalho.
VALID_CATEGORY = {'VERBO', 'VOCABOLARIO', 'ESPRESSIONE', 'GRAMMATICA', 'PRONUNCIA'}
VALID_CHUNK_TYPE = {'fixed', 'semiFixed', 'collocation', 'word'}
# chunkTypes que viram carta de flashcard. ESPELHA TIPI_CARTA em
# js/exercises/flashcard.js. `semiFixed` fica de fora: tem lacuna por
# definição («Io sono ___») e não tem verso — é matéria do slot-frame.
TIPI_CARTA = {'word', 'collocation', 'fixed'}
VALID_BLOCK = {'lista', 'tabella', 'contrasto', 'paradigma', 'scambio', 'nota'}
VALID_TONO = {'info', 'attenzione', 'eccezione'}
# Língua da prosa da aula. O curso caminha de 'pt' para 'it' — ver CLAUDE.md.
# Ausente = 'pt', para que toda aula escrita antes do mecanismo continue válida.
MODI = ('pt', 'misto', 'it')
# Precisa casar com o registry em js/exercises/index.js.
REGISTERED_TYPES = {
    'gap-audio', 'qa-transcribe', 'dialogue', 'paradigm-fill',
    'scelta', 'riordino', 'abbinamento', 'slot-frame', 'dictogloss',
    'traduzione', 'trasformazione',
}
# Alvos de `trasformazione`. ESPELHA o Map `VERSI` em
# js/exercises/trasformazione.js — valor fora daqui renderiza sem glosa.
VALID_VERSO = {'affermativa', 'negativa', 'interrogativa'}
# `flashcard` NÃO entra aqui de propósito: o baralho é derivado dos chunks
# por flashcardDeck(), nunca escrito em `esercizi`. Escrever um à mão
# duplicaria os ids e o conteggio contaria duas vezes.

# Tipos com sub-itens: cada elemento do campo listado tem id próprio e vira
# uma linha no progresso. ESPELHA o método `countItems` de cada módulo em
# js/exercises/ — `paradigm-fill` fica de fora porque conta células ocultas,
# não linhas, e por isso é tratado à parte em count_items().
SUBITEM_FIELD = {
    'scelta': 'domande',
    'riordino': 'frasi',
    'abbinamento': 'coppie',
    'slot-frame': 'giri',
    'traduzione': 'frasi',
    'trasformazione': 'frasi',
}

# Mínimos por aula, conforme o passo 7 da checklist.
MINIMUMS = {'gap-audio': 2, 'qa-transcribe': 1}

# Âncoras de etapa que renderLesson() emite. ESPELHA o array `stages` em
# js/app.js — a ordem aqui não importa (é um conjunto), a existência sim:
# um item de `header` pode apontar para uma etapa, não só para uma seção.
STAGE_ANCHORS = {
    'riscaldamento', 'lessico', 'ascolto', 'studio',
    'esercizi', 'produzione', 'bilancio',
}

errors: list[str] = []
warnings: list[str] = []


def err(msg: str) -> None:
    errors.append(msg)


def warn(msg: str) -> None:
    warnings.append(msg)


def norm(s: str) -> str:
    """Normaliza para comparar frase reconstruída com o texto do TTS."""
    s = unicodedata.normalize('NFC', s or '')
    return ' '.join(s.split()).strip().lower().rstrip('.!?')


def load_all() -> dict[str, dict]:
    out = {}
    for path in sorted(CONTENT.glob('*.json')):
        try:
            out[path.name] = json.loads(path.read_text(encoding='utf-8'))
        except json.JSONDecodeError as e:
            err(f'{path.name}: JSON inválido — {e}')
    return out


def check_cell(name: str, ctx: str, cell) -> None:
    """Célula de tabella: string simples (italiano, ganha 🔊) ou
    { "html": str, "pt": true } (não-italiano, sem áudio). Ver CLAUDE.md."""
    if isinstance(cell, str) or cell is None:
        return
    if isinstance(cell, dict):
        extra = set(cell.keys()) - {'html', 'pt'}
        if extra:
            err(f'{name} {ctx}: célula com chave desconhecida {extra}')
        if 'html' not in cell or not isinstance(cell.get('html'), str):
            err(f'{name} {ctx}: célula-objeto sem "html" string')
        if 'pt' in cell and not isinstance(cell['pt'], bool):
            err(f'{name} {ctx}: célula "pt" deve ser booleano')
        return
    err(f'{name} {ctx}: célula precisa ser string ou objeto {{html, pt}}, veio {type(cell).__name__}')


def check_table(name: str, ctx: str, block: dict) -> None:
    width = len(block.get('intestazioni', []))
    for h in block.get('intestazioni', []):
        check_cell(name, ctx, h)
    for i, row in enumerate(block.get('righe', [])):
        if len(row) != width:
            err(f'{name} {ctx}: tabela linha {i} tem {len(row)} células, cabeçalho tem {width}')
        for cell in row:
            check_cell(name, ctx, cell)


def check_paradigma(name: str, ctx: str, block: dict, ids: Counter) -> None:
    width = len(block.get('colonne', []))
    for row in block.get('righe', []):
        ids[row['id']] += 1
        if len(row.get('forme', [])) != width:
            err(f'{name} {row["id"]}: {len(row.get("forme", []))} formas para {width} colunas')


TAG_RE = {
    'it': (re.compile(r'<it>'), re.compile(r'</it>'), re.compile(r'<it>\s*(<[^>]*>\s*)*</it>')),
    'pt': (re.compile(r'<pt>'), re.compile(r'</pt>'), re.compile(r'<pt>\s*(<[^>]*>\s*)*</pt>')),
}


def tag_viva(modo: str) -> str:
    """Qual pseudo-tag marca a MINORIA neste modo. Ver CLAUDE.md."""
    return 'pt' if modo in ('misto', 'it') else 'it'


def check_prose(name: str, ctx: str, testo, modo: str = 'pt') -> None:
    """As pseudo-tags `<it>` / `<pt>` de texto corrido.

    `render.js` as casa por regex sobre a string, não por parse de DOM — o
    DOM mínimo da suíte não parseia innerHTML. Consequência: tag torta não
    estoura a página, ela só deixa a forma muda, e ninguém percebe. Por isso
    tudo aqui é erro, nunca aviso.

    As duas tags são conferidas em TODOS os modos: uma `<pt>` desbalanceada
    numa aula em modo «pt» é igualmente um bug, mesmo que inerte hoje.
    """
    s = str(testo or '')
    viva = tag_viva(modo)

    for tag, (abre, fecha, vazia) in TAG_RE.items():
        abertas, fechadas = len(abre.findall(s)), len(fecha.findall(s))
        if abertas != fechadas:
            err(f'{name} {ctx}: <{tag}> desbalanceada ({abertas} aberta(s), {fechadas} '
                f'fechada(s)) — a forma ficaria sem áudio silenciosamente')
        if vazia.search(s):
            err(f'{name} {ctx}: <{tag}> sem texto — não geraria botão nenhum')

        # Tag da língua majoritária: redundante e ambígua. Em modo «pt» a
        # prosa já é portuguesa, então <pt> não marca nada; em modo italiano,
        # <it> idem. Não renderiza errado — mas declara uma intenção que o
        # modo contradiz, e isso é sempre um engano de autoria.
        if tag != viva and abertas:
            err(f'{name} {ctx}: <{tag}> em aula de modo «{modo}» — neste modo a prosa já é '
                f'{"portuguesa" if tag == "pt" else "italiana"}; a tag a usar é <{viva}>')


# Marcação proibida dentro de um SVG de `figura`. O conteúdo é nosso, mas
# a checagem custa dez linhas e fecha a porta para sempre — inclusive contra
# o dia em que alguém colar um SVG "achado na internet" dentro do JSON.
SVG_PROIBIDO = (
    ('<script', 'script embutido'),
    ('<foreignobject', '<foreignObject> carrega HTML arbitrário'),
    ('<image', '<image> aponta para arquivo externo'),
    ('javascript:', 'URL javascript:'),
)
SVG_HANDLER_RE = re.compile(r'\son[a-z]+\s*=', re.I)
SVG_HREF_RE = re.compile(r'(?:xlink:)?href\s*=\s*["\']?([^"\'\s>]*)', re.I)

# Junções que não contam como "mais um símbolo": ZWJ (👨‍🍳) e o seletor de
# apresentação emoji (❤️). Sem elas, sequências legítimas pareceriam texto.
EMOJI_JUNCAO = {0x200D, 0xFE0F}


def check_figura(quem: str, fig) -> None:
    """`chunks[].figura` — o estímulo visual da carta de flashcard.

    Duas formas, e a primeira é o caso comum: um emoji, ou um SVG inline
    (a exceção, quando não existe emoji que sirva). Arquivo de imagem está
    fora por decisão: binário em repositório público exige origem e licença
    rastreadas, e o site não tem passo de build para otimizar nada.

    A parte do emoji é uma checagem de FORMA, não um parser de Unicode: ela
    existe para pegar o engano provável — texto português enfiado em
    `figura`, que apareceria gigante na carta e entregaria a resposta.
    """
    if not isinstance(fig, str) or not fig.strip():
        err(f'{quem}: figura vazia — omita o campo em vez de deixá-lo em branco')
        return

    s = fig.strip()

    if s.startswith('<svg'):
        if not s.endswith('</svg>'):
            err(f'{quem}: figura SVG não fecha em </svg>')
        baixo = s.lower()
        for marca, porque in SVG_PROIBIDO:
            if marca in baixo:
                err(f'{quem}: figura SVG contém «{marca}» — {porque}')
        if SVG_HANDLER_RE.search(s):
            err(f'{quem}: figura SVG tem handler inline (on…=)')
        for alvo in SVG_HREF_RE.findall(s):
            if not alvo.startswith('#'):
                err(f'{quem}: figura SVG referencia «{alvo}» — só href interno (#id) é aceito')
        if 'viewbox' not in baixo:
            warn(f'{quem}: figura SVG sem viewBox — não escala junto com a carta')
        return

    if '<' in s:
        err(f'{quem}: figura não é emoji nem SVG — comece com «<svg» ou use um emoji')
        return

    pontos = [ord(c) for c in s]
    if len(pontos) > 10:
        err(f'{quem}: figura com {len(pontos)} caracteres — parece texto, não emoji')
        return
    fora = [c for c in s if ord(c) < 0x2190 and ord(c) not in EMOJI_JUNCAO]
    if fora or not any(ord(c) >= 0x2190 for c in s):
        err(f'{quem}: figura «{s}» não parece um emoji — a frente da carta '
            f'não pode virar texto, senão entrega a resposta')


def check_header(name: str, d: dict) -> None:
    """O cabeçalho de 3 colunas é o sumário da aula, e cada item pode virar
    atalho para o ponto da página.

    O item é string OU {it, sezione} — o mesmo idioma da célula de tabella,
    e pela mesma razão: string é o caso comum, o objeto marca a exceção. Sem
    `sezione` o item continua sendo texto, como sempre foi.

    `sezione` que aponta para o vazio é ERRO: o link continuaria clicável e
    simplesmente não rolaria, que é o defeito que ninguém percebe.
    """
    header = d.get('header') or {}
    alvos = {s.get('id') for s in d.get('sections', [])} | STAGE_ANCHORS

    for coluna, itens in header.items():
        for i, raw in enumerate(itens or []):
            quem = f'{name} header.{coluna}[{i}]'
            if isinstance(raw, str):
                continue
            if not isinstance(raw, dict):
                err(f'{quem}: item precisa ser string ou objeto {{it, sezione}}')
                continue
            if not raw.get('it'):
                err(f'{quem}: objeto de header sem «it»')
            alvo = raw.get('sezione')
            if alvo is None:
                warn(f'{quem}: objeto sem «sezione» — use string simples, é a mesma coisa')
            elif alvo not in alvos:
                err(f'{quem}: sezione «{alvo}» não existe nesta aula '
                    f'(use um id de section ou uma âncora de etapa)')


def check_funzioni(name: str, d: dict, ids: Counter, modo: str = 'pt') -> None:
    """`funzioni` — os chunks da aula agrupados por intenção comunicativa.

    Agrupa POR REFERÊNCIA de id, nunca copiando texto: `chunks` continua
    sendo o inventário lexical único da aula. Duplicar o texto aqui faria uma
    edição no chunk deixar o agrupamento mentindo, e um id repetido
    misturaria dois históricos de progresso.

    Não conta em `count_items`: função é leitura organizada, e quem testa a
    recuperação é o baralho logo abaixo dela.
    """
    funzioni = d.get('funzioni') or []
    if not funzioni:
        return

    disponiveis = {c['id'] for c in d.get('chunks', [])}
    agrupados: set[str] = set()

    for f in funzioni:
        fid = f.get('id', '?')
        ids[fid] += 1

        if not f.get('quando'):
            err(f'{name} {fid}: funzione sem «quando» (o rótulo em italiano)')
        if not f.get('gloss'):
            warn(f'{name} {fid}: funzione sem gloss em português')
        check_prose(name, f'{fid}.gloss', f.get('gloss'), modo)

        if 'figura' in f:
            check_figura(f'{name} {fid}', f['figura'])

        refs = f.get('chunks') or []
        if not refs:
            err(f'{name} {fid}: funzione sem nenhum chunk — remova-a ou preencha')
        for cid in refs:
            if cid not in disponiveis:
                err(f'{name} {fid}: referencia o chunk «{cid}», que não existe nesta aula')
            else:
                agrupados.add(cid)

    # Só `fixed` entra nesta conta, e é de propósito. Frase fixa é por
    # definição uma frase pronta com função comunicativa — «Buongiorno»,
    # «Quanti anni hai?» —, então uma que ficou fora de todo grupo é
    # provavelmente descuido. `word` e `collocation` são item lexical
    # (`il cane`, `i Paesi Bassi`): não têm um «quando se usa», e cobrá-los
    # aqui encheria a saída de ruído que se aprende a ignorar.
    orfaos = [c['id'] for c in d.get('chunks', [])
              if c.get('chunkType') == 'fixed' and c['id'] not in agrupados]
    if orfaos:
        amostra = ', '.join(orfaos[:6])
        extra = f' (+{len(orfaos) - 6})' if len(orfaos) > 6 else ''
        warn(f'{name}: {len(orfaos)} frase(s) fixa(s) fora de toda funzione — '
             f'{amostra}{extra}. Ou entram num grupo, ou é caso legítimo.')


def check_scambio(name: str, sid: str, block: dict) -> None:
    """`scambio` — o microdiálogo de 2 a 4 linhas.

    É leitura, não drill: bloco de seção, sem id, sem progresso, sem entrar
    no `conteggio`. Preenche o degrau que faltava entre produzir uma frase
    solta (`traduzione`) e o diálogo de 8 turnos.

    Duas regras, e as duas herdadas do diálogo pelo mesmo motivo:
    exatamente dois falantes, `A` e `B`, porque é o que `voiceFor()` sabe
    diferenciar; e turnos alternados, porque dois turnos seguidos na mesma
    voz leem como uma frase só e a troca deixa de ser troca.
    """
    battute = block.get('battute') or []

    if not 2 <= len(battute) <= 4:
        err(f'{name} {sid}: scambio com {len(battute)} turno(s) — o formato é de 2 a 4. '
            f'Mais que isso é diálogo, e diálogo tem passadas.')

    anterior = None
    for i, b in enumerate(battute):
        if not b.get('it'):
            err(f'{name} {sid}: battuta[{i}] do scambio sem «it»')
        if not b.get('pt'):
            err(f'{name} {sid}: battuta[{i}] do scambio sem «pt» — é modelo para ler, '
                f'não exercício de compreensão')
        sp = b.get('speaker')
        if sp not in {'A', 'B'}:
            err(f'{name} {sid}: battuta[{i}] do scambio com speaker «{sp}» — só A e B, '
                f'que é o que o TTS sabe diferenciar')
        elif sp == anterior:
            err(f'{name} {sid}: battuta[{i}] do scambio repete o falante «{sp}» — '
                f'dois turnos na mesma voz leem como uma frase só')
        anterior = sp


def check_section(name: str, section: dict, ids: Counter, modo: str = 'pt') -> None:
    sid = section.get('id', '?')
    ids[sid] += 1

    if section.get('category') not in VALID_CATEGORY:
        err(f'{name} {sid}: category inválida «{section.get("category")}»')

    # O invariante que sustenta a autocontenção do site.
    if not section.get('spiegazione'):
        err(f'{name} {sid}: sem spiegazione — o site precisa ser autocontido')
    elif len(section['spiegazione']) < 2:
        warn(f'{name} {sid}: spiegazione com 1 parágrafo só; a regra pede o "porquê" também')

    for i, p in enumerate(section.get('spiegazione', [])):
        check_prose(name, f'{sid}.spiegazione[{i}]', p, modo)

    for block in section.get('blocks', []):
        btype = block.get('type')
        if btype not in VALID_BLOCK:
            err(f'{name} {sid}: bloco desconhecido «{btype}» (render.js não sabe desenhar)')
        if btype == 'tabella':
            check_table(name, sid, block)
        elif btype == 'paradigma':
            check_paradigma(name, sid, block, ids)
        elif btype == 'nota':
            if block.get('tono') not in VALID_TONO:
                err(f'{name} {sid}: nota com tono inválido «{block.get("tono")}»')
            check_prose(name, f'{sid}.nota', block.get('testo'), modo)
        elif btype == 'contrasto' and len(block.get('gruppi', [])) < 2:
            err(f'{name} {sid}: contrasto precisa de 2+ grupos')
        elif btype == 'scambio':
            check_scambio(name, sid, block)

        # Toda nota de item é prosa e passa por prose() no render.
        for it in block.get('items', []):
            check_prose(name, f'{sid}.lista.nota', it.get('nota'), modo)
        for g in block.get('gruppi', []):
            for e in g.get('esempi', []):
                check_prose(name, f'{sid}.contrasto.nota', e.get('nota'), modo)
        for row in block.get('righe', []):
            if isinstance(row, dict):
                check_prose(name, f'{sid}.{row.get("id", "riga")}.nota', row.get('nota'), modo)


def check_gap_audio(name: str, ex: dict) -> None:
    if '___' not in ex.get('testo', ''):
        err(f'{name} {ex["id"]}: gap-audio sem lacuna «___»')
        return
    # O áudio tem que ser a frase completa: se não bater, o aluno ouve uma
    # coisa e lê outra. Pega espaço sobrando em elisão, entre outros.
    recon = ex['testo'].replace('___', ex.get('risposta', ''))
    tts = ex.get('audio', {}).get('tts', '')
    if norm(recon) != norm(tts):
        err(f'{name} {ex["id"]}: frase reconstruída não bate com o áudio\n'
            f'      reconstruída: {recon!r}\n'
            f'      audio.tts:    {tts!r}')


def check_paradigm_fill(name: str, ex: dict, ids: Counter) -> None:
    width = len(ex.get('colonne', []))
    for row in ex.get('righe', []):
        ids[row['id']] += 1
        forms = row.get('forme', [])
        if len(forms) != width:
            err(f'{name} {row["id"]}: {len(forms)} formas para {width} colunas')
        hidden = row.get('nascondi', [])
        if not hidden:
            warn(f'{name} {row["id"]}: nenhuma célula oculta — linha não exercita nada')
        for i in hidden:
            if i >= width:
                err(f'{name} {row["id"]}: nascondi {i} fora do range (0..{width - 1})')
            else:
                ids[f'{row["id"]}-c{i}'] += 1


def check_subitems(name: str, ex: dict, ids: Counter) -> list[dict]:
    """Registra os ids dos sub-itens e devolve a lista. Comum aos 4 drills."""
    campo = SUBITEM_FIELD[ex['type']]
    itens = ex.get(campo, [])
    if not itens:
        err(f'{name} {ex["id"]}: «{ex["type"]}» sem «{campo}» — não exercita nada')
    for it in itens:
        if 'id' not in it:
            err(f'{name} {ex["id"]}: item de «{campo}» sem id — sem id não há progresso')
        else:
            ids[it['id']] += 1
    return itens


def check_dictogloss(name: str, ex: dict) -> None:
    """Ouvir um texto curto e reconstruí-lo de memória.

    Duas exigências, e as duas vêm do que o próprio módulo argumenta.

    A do áudio é a mesma regra dura do `gap-audio`: o que se ouve tem que
    ser o que se lê no fim. Divergir aqui é pior que num gap, porque o aluno
    compara a reconstrução inteira contra o `testo` — um `tts` diferente
    faria o diff acusar erro numa palavra que o áudio nunca disse.

    A do pré-ensino é pedagógica. O aluno A1 falha em decodificação e
    fronteira de palavra, não em vocabulário: travado numa forma que nunca
    viu escrita, perde a frase inteira atrás dela, e o exercício passa a
    medir sorte em vez de escuta.
    """
    testo = ex.get('testo', '')
    if not testo:
        err(f'{name} {ex["id"]}: dictogloss sem «testo» — não há o que reconstruir')
        return

    tts = (ex.get('audio') or {}).get('tts')
    if tts and norm(tts) != norm(testo):
        err(f'{name} {ex["id"]}: audio.tts não bate com «testo» — o aluno ouviria uma '
            f'coisa e seria corrigido por outra')

    if not ex.get('preinsegnamento'):
        err(f'{name} {ex["id"]}: dictogloss sem «preinsegnamento» — sem as formas difíceis '
            f'de antemão o exercício mede sorte, não escuta')
    for p in ex.get('preinsegnamento', []):
        if not p.get('it') or not p.get('pt'):
            err(f'{name} {ex["id"]}: item de preinsegnamento precisa de «it» e «pt»')
        elif norm(p['it']) not in norm(testo):
            err(f'{name} {ex["id"]}: preinsegnamento «{p["it"]}» não aparece no texto — '
                f'pré-ensinar o que não vai ser ouvido só gasta a atenção do aluno')

    if not ex.get('pt'):
        err(f'{name} {ex["id"]}: dictogloss sem «pt» — a análise final compara sem tradução')


def check_scelta(name: str, ex: dict, ids: Counter) -> None:
    for q in check_subitems(name, ex, ids):
        qid = q.get('id', '?')
        if '___' not in q.get('testo', ''):
            err(f'{name} {qid}: scelta sem lacuna «___» no testo')
        opzioni = q.get('opzioni', [])
        if len(opzioni) < 2:
            err(f'{name} {qid}: scelta com menos de 2 opções')
        # Sem isto o exercício não tem gabarito clicável: a resposta certa
        # precisa estar entre as alternativas oferecidas.
        if q.get('risposta') not in opzioni:
            err(f'{name} {qid}: risposta {q.get("risposta")!r} não está entre as opções {opzioni!r}')
        if len(set(opzioni)) != len(opzioni):
            err(f'{name} {qid}: opções repetidas em {opzioni!r}')


def check_riordino(name: str, ex: dict, ids: Counter) -> None:
    for f in check_subitems(name, ex, ids):
        fid = f.get('id', '?')
        parole = f.get('parole', [])
        if len(parole) < 3:
            warn(f'{name} {fid}: riordino com {len(parole)} peça(s) — abaixo de 3 não é exercício')
        # As peças precisam remontar exatamente o gabarito: se sobrar ou
        # faltar palavra, o exercício é impossível e só se descobre clicando.
        alvo = [p.strip('.,;:!?').lower() for p in str(f.get('risposta', '')).split()]
        pecas = [p.strip('.,;:!?').lower() for p in parole]
        if sorted(alvo) != sorted(pecas):
            err(f'{name} {fid}: as peças não remontam a risposta\n'
                f'      peças:    {sorted(pecas)}\n'
                f'      risposta: {sorted(alvo)}')


def check_traduzione(name: str, ex: dict, ids: Counter) -> None:
    """PT → IT, frase inteira, sem andaime nenhum na tela.

    O `pt` é o enunciado inteiro, não uma glosa de vocabulário: sem ele a
    frase não tem estímulo e o exercício fica impossível.
    """
    for f in check_subitems(name, ex, ids):
        fid = f.get('id', '?')
        if not f.get('pt'):
            err(f'{name} {fid}: traduzione sem «pt» — é o único estímulo que o aluno vê')
        if not f.get('risposta'):
            err(f'{name} {fid}: traduzione sem «risposta»')
        # Lacuna aqui é engano de tipo: quem quer lacuna quer slot-frame ou
        # gap-audio, e um `___` mostrado ao aluno seria pedido impossível.
        if '___' in str(f.get('pt', '')) or '___' in str(f.get('risposta', '')):
            err(f'{name} {fid}: traduzione com lacuna «___» — use slot-frame se o molde é o alvo')


def check_trasformazione(name: str, ex: dict, ids: Counter) -> None:
    """Afirmativa ⇄ negativa ⇄ interrogativa. ESPELHA o Map `VERSI` em
    js/exercises/trasformazione.js — `verso` fora dele renderiza sem glosa."""
    for f in check_subitems(name, ex, ids):
        fid = f.get('id', '?')
        if not f.get('partenza'):
            err(f'{name} {fid}: trasformazione sem «partenza»')
        if not f.get('risposta'):
            err(f'{name} {fid}: trasformazione sem «risposta»')
        verso = f.get('verso')
        if verso not in VALID_VERSO:
            err(f'{name} {fid}: verso «{verso}» inválido — use um de {sorted(VALID_VERSO)}')

        partenza = str(f.get('partenza', '')).strip()
        risposta = str(f.get('risposta', '')).strip()

        # A pontuação final é conteúdo neste tipo, e só neste: em italiano a
        # interrogativa não inverte nada, então `Tu sei italiano?` difere de
        # `Tu sei italiano.` apenas pelo ponto. Por isso a comparação abaixo
        # NÃO passa por norm(), que descartaria justamente o que distingue as
        # duas — e por isso o módulo confere a pontuação à parte do
        # checkAnswer. ESPELHA `pontuacaoBate` em
        # js/exercises/trasformazione.js: mudou lá, mude aqui.
        if verso == 'interrogativa' and not risposta.endswith('?'):
            err(f'{name} {fid}: risposta interrogativa sem «?» — é ele que faz a pergunta em italiano')
        if verso in ('affermativa', 'negativa') and risposta.endswith('?'):
            err(f'{name} {fid}: risposta «{verso}» termina em «?»')

        # Partida igual à chegada é linha que não transforma nada, e passa
        # despercebida porque «responder» seria só copiar o que está na tela.
        if partenza.casefold() == risposta.casefold():
            err(f'{name} {fid}: partenza e risposta são a mesma frase — nada a transformar')


def check_abbinamento(name: str, ex: dict, ids: Counter) -> None:
    coppie = check_subitems(name, ex, ids)
    if len(coppie) < 2:
        err(f'{name} {ex["id"]}: abbinamento com menos de 2 pares — nada a associar')
    destre = [c.get('destra') for c in coppie]
    for c in coppie:
        cid = c.get('id', '?')
        if not c.get('sinistra') or not c.get('destra'):
            err(f'{name} {cid}: par sem «sinistra» ou «destra»')
    # Alternativas iguais tornariam a correção literal ambígua: duas linhas
    # aceitariam a mesma string e uma delas seria marcada errada sem motivo.
    if len(set(destre)) != len(destre):
        err(f'{name} {ex["id"]}: respostas repetidas em «destra» — a associação fica ambígua')


def check_slot_frame(name: str, ex: dict, ids: Counter, modo: str = 'pt') -> None:
    frame = ex.get('frame', {})
    if '___' not in frame.get('it', ''):
        err(f'{name} {ex["id"]}: slot-frame sem slot «___» no frame.it')

    for g in check_subitems(name, ex, ids):
        gid = g.get('id', '?')
        if not g.get('risposta'):
            err(f'{name} {gid}: giro sem risposta')
        # O prompt existe para o aluno PRODUZIR, nunca para copiar. Em modo
        # 'pt' isso significa um prompt português. Em modo italiano o próprio
        # `slot` serve: ver «italiano» e ter de escrever «Io parlo italiano.»
        # continua sendo produzir o molde, que é o que o drill automatiza.
        # slot-frame.js já faz o fallback `giro.pt ?? giro.slot`.
        if modo == 'it':
            if not g.get('pt') and not g.get('slot'):
                err(f'{name} {gid}: giro sem «pt» nem «slot» — não há prompt nenhum')
        elif not g.get('pt'):
            err(f'{name} {gid}: giro sem prompt «pt» — em modo «{modo}» o aluno produz '
                f'a partir do português')
        # O drill só é de substituição se a resposta for de fato o molde com
        # o slot preenchido. Uma resposta que foge do molde é outro exercício.
        molde = frame.get('it', '')
        if molde and g.get('slot') is not None:
            esperado = molde.replace('___', str(g['slot']))
            # A elisão come o espaço seguinte («vent'» + « anni» = «vent'anni»),
            # então comparar cru acusaria falso positivo em todo slot elidido.
            if _sem_spazio_dopo_apostrofo(esperado) != _sem_spazio_dopo_apostrofo(g.get('risposta', '')):
                warn(f'{name} {gid}: risposta não é o molde com o slot preenchido\n'
                     f'      molde+slot: {esperado!r}\n'
                     f'      risposta:   {g.get("risposta")!r}')


def _sem_spazio_dopo_apostrofo(s: str) -> str:
    return norm(re.sub(r"'\s+", "'", str(s)))


def check_dialogo(name: str, d: dict, ids: Counter) -> None:
    ids[d['id']] += 1

    if len(d.get('battute', [])) < 4:
        warn(f'{name} {d["id"]}: diálogo com menos de 4 turnos')

    speakers = {b.get('speaker') for b in d.get('battute', [])}
    if len(speakers) < 2:
        warn(f'{name} {d["id"]}: um só falante — speech.js não vai diferenciar vozes')

    passate = d.get('passate', [])
    # A passada de escuta pura é o coração do método; sem ela o exercício
    # de audição vira exercício de leitura.
    if not any(p.get('inputBloccato') for p in passate):
        err(f'{name} {d["id"]}: nenhuma passada com inputBloccato — falta a escuta pura')
    if [p.get('focus') for p in passate][:1] != ['gist']:
        err(f'{name} {d["id"]}: a primeira passada precisa ter focus «gist»')

    for p in passate:
        if p.get('focus') == 'detail':
            if not p.get('domande'):
                err(f'{name} {d["id"]}: passada detail sem perguntas')
            for q in p.get('domande', []):
                ids[q['id']] += 1
                if not q.get('risposta'):
                    err(f'{name} {q["id"]}: pergunta sem resposta')


def check_lesson(name: str, d: dict, ids: Counter) -> None:
    # Língua da prosa desta aula. Ausente = 'pt': toda aula escrita antes do
    # mecanismo continua válida sem edição nenhuma.
    modo = d.get('modo', 'pt')
    if modo not in MODI:
        err(f'{name}: modo «{modo}» inválido — use um de {MODI}')
        modo = 'pt'

    check_header(name, d)

    r = d.get('riscaldamento') or {}
    check_prose(name, 'riscaldamento.prompt', r.get('prompt'), modo)
    for i, p in enumerate(r.get('spiegazione', [])):
        check_prose(name, f'riscaldamento.spiegazione[{i}]', p, modo)

    for section in d.get('sections', []):
        check_section(name, section, ids, modo)

    for chunk in d.get('chunks', []):
        ids[chunk['id']] += 1
        if chunk.get('chunkType') not in VALID_CHUNK_TYPE:
            err(f'{name} {chunk["id"]}: chunkType inválido «{chunk.get("chunkType")}»')
        if chunk.get('category') not in VALID_CATEGORY:
            err(f'{name} {chunk["id"]}: category inválida «{chunk.get("category")}»')
        if chunk.get('chunkType') == 'semiFixed' and '___' not in chunk.get('it', ''):
            err(f'{name} {chunk["id"]}: semiFixed sem slot «___»')
        if 'figura' in chunk:
            check_figura(f'{name} {chunk["id"]}', chunk['figura'])

    # Depois dos chunks: as funções referenciam ids, e precisam vê-los prontos.
    check_funzioni(name, d, ids, modo)

    types: Counter = Counter()
    for ex in d.get('esercizi', []):
        ids[ex['id']] += 1
        etype = ex.get('type')
        types[etype] += 1

        # Todo campo de prosa do exercício passa por prose() no render, então
        # todo campo de prosa é conferido aqui. A lista tem que ficar completa:
        # um campo esquecido aqui é um `<it>` que morre calado lá.
        check_prose(name, f'{ex["id"]}.consegna', ex.get('consegna'), modo)
        check_prose(name, f'{ex["id"]}.aiuto', ex.get('aiuto'), modo)
        for campo in ('domande', 'frasi', 'coppie', 'giri', 'righe'):
            for sub in ex.get(campo, []):
                if isinstance(sub, dict):
                    check_prose(name, f'{sub.get("id", ex["id"])}.nota', sub.get('nota'), modo)
        if etype not in REGISTERED_TYPES:
            err(f'{name} {ex["id"]}: type «{etype}» não está no registry de js/exercises/index.js')
        if etype == 'gap-audio':
            check_gap_audio(name, ex)
        elif etype == 'dictogloss':
            check_dictogloss(name, ex)
        elif etype == 'paradigm-fill':
            check_paradigm_fill(name, ex, ids)
        elif etype == 'scelta':
            check_scelta(name, ex, ids)
        elif etype == 'riordino':
            check_riordino(name, ex, ids)
        elif etype == 'abbinamento':
            check_abbinamento(name, ex, ids)
        elif etype == 'slot-frame':
            check_slot_frame(name, ex, ids, modo)
        elif etype == 'traduzione':
            check_traduzione(name, ex, ids)
        elif etype == 'trasformazione':
            check_trasformazione(name, ex, ids)

    if d.get('dialogo'):
        check_dialogo(name, d['dialogo'], ids)
    else:
        warn(f'{name}: sem diálogo — a checklist pede ao menos um')

    for t, minimum in MINIMUMS.items():
        if types[t] < minimum:
            warn(f'{name}: {types[t]} exercício(s) «{t}»; a checklist pede {minimum}+')

    for field in ('produzione', 'bilancio'):
        if not d.get(field):
            warn(f'{name}: sem «{field}»')

    for p in d.get('produzione', []):
        ids[p['id']] += 1
        check_prose(name, f'{p["id"]}.consegna', p.get('consegna'), modo)

    for i, b in enumerate(d.get('bilancio', [])):
        check_prose(name, f'bilancio[{i}]', b, modo)


# --- Léxico cumulativo ---------------------------------------------------

TAGS = re.compile(r'<[^>]*>')
# Mantém o apóstrofo: em italiano ele é informação gramatical (l'amico), e
# tirá-lo aqui misturaria formas que a aula ensina como distintas.
NAO_PALAVRA = re.compile(r"[^\w'À-ſ]+", re.UNICODE)
# Hífen entre letras: separação silábica («Ca-stel-li»), não palavra composta.
SILABAS = re.compile(r'(?<=[^\W\d_])[-‑](?=[^\W\d_])', re.UNICODE)

# Palavras funcionais e nomes próprios dos diálogos. Não são "vocabulário
# ensinado" — cobrá-las na checagem de escopo só geraria ruído.
STOPLIST = {
    'e', 'ed', 'o', 'ma', 'di', 'da', 'a', 'in', 'con', 'su', 'per', 'tra', 'fra',
    'il', 'lo', 'la', 'i', 'gli', 'le', 'un', 'uno', 'una', "un'", "l'", "d'",
    'io', 'tu', 'lui', 'lei', 'noi', 'voi', 'loro',
    'sì', 'si', 'no', 'non', 'che', 'chi', 'come', 'anche', 'molto', 'ecco',
    'marco', 'giulia', 'luca', 'anna', 'paolo', 'sofia',
}


def parole(text: str) -> list[str]:
    """Palavras italianas de um trecho, sem markup e em caixa baixa.

    Junta separação silábica: as aulas de pronúncia escrevem «Ca-stel-li»,
    e sem isto o índice ganharia «stel» e «li» como se fossem palavras.

    Fica de fora o que não é palavra: números («venti» é vocabulário, «20»
    não é) e o marcador de lacuna «___» das frases semifixas.
    """
    limpo = TAGS.sub(' ', str(text or ''))
    limpo = SILABAS.sub('', limpo.lower())
    return [p for p in NAO_PALAVRA.split(limpo) if any(c.isalpha() for c in p)]


def build_lessico(files: dict[str, dict]) -> dict:
    """Índice cumulativo: forma → primeira aula que a ensinou.

    A colheita é exatamente o italiano que a aula EXIBE — o mesmo conjunto
    que ganha botão de áudio pelo invariante 7.1: `chunks[]` (com os
    `slot[]` das semifixas), itens de `header`, e os blocos `lista`,
    `tabella` (menos as células marcadas `pt: true`), `contrasto` e
    `paradigma`.

    Fora da colheita, de propósito:
      · `spiegazione` — ali o italiano vem embebido em português.
      · `dialogo` e `esercizi` — são o que a checagem de escopo confere.
        Se entrassem aqui, um diálogo fora de escopo se autoautorizaria.
    """
    formas: dict[str, dict] = {}

    def registra(texto, aula: str, origem: str) -> None:
        for p in parole(texto):
            if p in STOPLIST:
                continue
            # Primeira aula vence: o índice diz quando a forma ENTROU.
            if p not in formas or aula < formas[p]['aula']:
                formas[p] = {'aula': aula, 'origine': origem}

    def registra_cella(cell, aula: str) -> None:
        # Célula marcada pt: true é rótulo em português, não vocabulário.
        if isinstance(cell, dict):
            if cell.get('pt'):
                return
            registra(cell.get('html', ''), aula, 'tabella')
        else:
            registra(cell, aula, 'tabella')

    for name in sorted(files):
        if name in NAO_LEZIONE:
            continue
        lesson = files[name]
        aula = lesson.get('id', '??')

        # Item de header é string OU {it, sezione}. Ler só a string faria o
        # léxico encolher em silêncio no dia em que o item virasse objeto —
        # e a checagem de escopo passaria a aprovar diálogo fora de escopo.
        for coluna in (lesson.get('header') or {}).values():
            for item in coluna:
                registra(item if isinstance(item, str) else item.get('it', ''), aula, 'header')

        # `funzioni[].quando` é rótulo funcional em italiano, exibido com 🔊 —
        # exatamente o caso de header.comunicazione, e colhido pela mesma razão.
        # Os chunks agrupados já entram abaixo, por referência de id.
        for f in lesson.get('funzioni', []):
            registra(f.get('quando', ''), aula, 'funzione')

        for chunk in lesson.get('chunks', []):
            registra(chunk.get('it', ''), aula, 'chunk')
            for s in chunk.get('slot', []):
                registra(s, aula, 'slot')

        for section in lesson.get('sections', []):
            for block in section.get('blocks', []):
                tipo = block.get('type')

                if tipo == 'lista':
                    for item in block.get('items', []):
                        registra(item.get('it', ''), aula, 'lista')

                elif tipo == 'tabella':
                    for h in block.get('intestazioni', []):
                        registra_cella(h, aula)
                    for row in block.get('righe', []):
                        for cell in row:
                            registra_cella(cell, aula)

                elif tipo == 'contrasto':
                    for g in block.get('gruppi', []):
                        for ex in g.get('esempi', []):
                            registra(ex.get('it', ''), aula, 'contrasto')

                elif tipo == 'paradigma':
                    for c in block.get('colonne', []):
                        registra(c, aula, 'paradigma')
                    for row in block.get('righe', []):
                        for forma in row.get('forme', []):
                            registra(forma, aula, 'paradigma')

                # `scambio` ENTRA na colheita, ao contrário de `dialogo`, e a
                # diferença não é o formato — é o papel. O scambio é modelo
                # que a aula exibe e ensina, como uma `lista`; o diálogo é o
                # que a checagem de escopo confere. Se o diálogo entrasse,
                # ele se autoautorizaria.
                elif tipo == 'scambio':
                    for b in block.get('battute', []):
                        registra(b.get('it', ''), aula, 'scambio')

    return {'forme': dict(sorted(formas.items()))}


def check_scope(name: str, lesson: dict, lessico: dict) -> None:
    """Regra do i+1 no diálogo: só vocabulário desta aula e das anteriores.

    AVISO, não erro, de propósito. A checagem é heurística — não há
    lematizador aqui, então uma forma flexionada legítima pode escapar. Se
    reprovasse, o autor aprenderia a contorná-la em vez de olhar.
    """
    d = lesson.get('dialogo')
    if not d:
        return

    aula = lesson.get('id', '??')
    conhecidas = {f for f, v in lessico.get('forme', {}).items() if v['aula'] <= aula}

    fora = set()
    for b in d.get('battute', []):
        for p in parole(b.get('it', '')):
            if p not in STOPLIST and p not in conhecidas:
                fora.add(p)

    if fora:
        amostra = ', '.join(sorted(fora)[:8])
        extra = f' (+{len(fora) - 8})' if len(fora) > 8 else ''
        warn(f'{name} {d["id"]}: o diálogo usa forma(s) fora do léxico acumulado '
             f'até a aula {aula} — {amostra}{extra}. Confira a regra do i+1 '
             f'ou acrescente o item aos chunks da aula.')


def count_items(lesson: dict) -> int:
    """Ids rastreáveis de uma aula.

    ESPELHA countItems() em js/app.js — as duas contas precisam bater, e é
    isso que faz o `conteggio` do manifest ser confiável. Mudou lá, mude
    aqui (há teste que compara as duas).
    """
    n = 0
    for ex in lesson.get('esercizi', []):
        etype = ex.get('type')
        if etype == 'paradigm-fill':
            for row in ex.get('righe', []):
                n += len(row.get('nascondi', []))
        elif etype in SUBITEM_FIELD:
            n += len(ex.get(SUBITEM_FIELD[etype], []))
        else:
            n += 1

    for p in (lesson.get('dialogo') or {}).get('passate', []):
        if p.get('focus') == 'detail':
            n += len(p.get('domande', []))

    # O baralho de flashcards é DERIVADO dos chunks — não está em `esercizi`
    # — mas cada carta grava progresso pelo id do chunk. ESPELHA
    # flashcardDeck() em js/exercises/index.js.
    n += sum(1 for c in lesson.get('chunks', []) if c.get('chunkType') in TIPI_CARTA)

    return n


def check_frasi(data: dict, files: dict[str, dict]) -> None:
    """`content/frasi.json` — as frases que atravessam todas as aulas.

    Não é aula: não tem `numero`, não entra no manifest, não grava progresso
    e não alimenta o léxico. O que ela tem em comum com uma aula é a dupla
    `funzioni` + `chunks`, e é por isso que `renderFunzioni()` a monta sem
    uma linha de mudança.

    A checagem que justifica este arquivo existir é a do id reusado. Uma
    frase que a Aula 0 já ensina aparece aqui com o MESMO id (`l00-c03`), e
    não com um id novo: id é a chave do caderno, e dois ids para a mesma
    frase fariam o aluno guardá-la duas vezes. O preço é o texto duplicado
    no arquivo — então o texto é conferido contra a aula de origem, e o
    build quebra se um dos dois for editado sozinho.
    """
    name = 'frasi.json'

    for campo in ('titolo', 'gruppi', 'chunks'):
        if not data.get(campo):
            err(f'{name}: falta «{campo}»')
    check_prose(name, 'intro', data.get('intro', ''))

    # Índice das formas que as aulas já ensinam, para casar id reusado.
    das_aule: dict[str, dict] = {}
    for fname, lesson in files.items():
        if fname in NAO_LEZIONE:
            continue
        for c in lesson.get('chunks', []):
            das_aule[c['id']] = {'it': c.get('it'), 'pt': c.get('pt'), 'file': fname}

    vistos: set[str] = set()
    disponiveis: set[str] = set()
    for c in data.get('chunks', []):
        cid = c.get('id')
        if not cid:
            err(f'{name}: chunk sem id')
            continue
        if cid in vistos:
            err(f'{name}: chunk «{cid}» duplicado dentro do arquivo')
        vistos.add(cid)
        disponiveis.add(cid)

        if not c.get('it') or not c.get('pt'):
            err(f'{name} {cid}: chunk precisa de «it» e «pt»')
        if c.get('category') not in VALID_CATEGORY:
            err(f'{name} {cid}: category «{c.get("category")}» fora dos valores permitidos')
        if c.get('chunkType') not in VALID_CHUNK_TYPE:
            err(f'{name} {cid}: chunkType «{c.get("chunkType")}» fora dos valores permitidos')
        if 'figura' in c:
            check_figura(f'{name} {cid}', c['figura'])

        origem = das_aule.get(cid)
        if origem:
            # Id reusado: o texto TEM que ser o mesmo, senão a mesma frase
            # apareceria diferente em dois lugares do site.
            for campo in ('it', 'pt'):
                if c.get(campo) != origem[campo]:
                    err(f'{name} {cid}: «{campo}» diverge de {origem["file"]} — '
                        f'{c.get(campo)!r} contra {origem[campo]!r}. Id reusado tem que '
                        f'carregar o mesmo texto; edite os dois ou use um id novo.')
        elif not cid.startswith('fr-'):
            err(f'{name} {cid}: id que não vem de aula nenhuma deve começar com «fr-», '
                f'para não colidir com um id de aula futura')

    for g in data.get('gruppi', []):
        gid = g.get('id', '?')
        if not g.get('titolo'):
            err(f'{name} {gid}: grupo sem «titolo»')
        if not g.get('funzioni'):
            err(f'{name} {gid}: grupo sem «funzioni» — não mostraria nada')
        # Mesma exigência de uma seção de aula: sem o porquê, é lista de frases.
        if len(g.get('spiegazione') or []) < 1:
            err(f'{name} {gid}: grupo sem «spiegazione»')
        for i, p in enumerate(g.get('spiegazione') or []):
            check_prose(name, f'{gid}.spiegazione[{i}]', p)

        for f in g.get('funzioni', []):
            fid = f.get('id', '?')
            if fid in vistos:
                err(f'{name}: id «{fid}» duplicado')
            vistos.add(fid)
            if not f.get('quando'):
                err(f'{name} {fid}: funzione sem «quando»')
            if not f.get('gloss'):
                err(f'{name} {fid}: funzione sem «gloss»')
            if 'figura' in f:
                check_figura(f'{name} {fid}', f['figura'])
            if not f.get('chunks'):
                err(f'{name} {fid}: funzione sem chunks — não mostraria nada')
            for cid in f.get('chunks', []):
                if cid not in disponiveis:
                    err(f'{name} {fid}: referencia chunk «{cid}», que não existe em frasi.json')

    # Chunk declarado e nunca agrupado é chunk invisível: a página só desenha
    # o que alguma funzione referencia.
    agrupados = {cid for g in data.get('gruppi', []) for f in g.get('funzioni', [])
                 for cid in f.get('chunks', [])}
    for cid in sorted(disponiveis - agrupados):
        err(f'{name} {cid}: chunk fora de toda funzione — não apareceria na página')


def check_manifest(data: dict, files: dict[str, dict]) -> None:
    seen_ids = set()
    # O manifest é o único lugar que vê as aulas em ordem de `numero`, então é
    # aqui que dá para conferir a PROGRESSÃO de língua.
    modo_anterior = None
    for entry in data.get('lezioni', []):
        if entry['file'] not in files:
            err(f'manifest.json: aponta para «{entry["file"]}», que não existe em content/')
            continue
        lesson = files[entry['file']]
        if lesson.get('id') != entry['id']:
            err(f'manifest.json: id «{entry["id"]}» não bate com «{lesson.get("id")}» em {entry["file"]}')
        if entry['id'] in seen_ids:
            err(f'manifest.json: id «{entry["id"]}» duplicado')
        seen_ids.add(entry['id'])
        if entry['id'] != f'{entry["numero"]:02d}':
            err(f'manifest.json: id «{entry["id"]}» deve ser o número com zero-padding de 2 dígitos')

        # Dado derivado: a home confia nele para desenhar a barra de
        # progresso sem baixar a aula inteira.
        esperado = count_items(lesson)
        if entry.get('conteggio') != esperado:
            err(f'manifest.json: «{entry["id"]}» tem conteggio {entry.get("conteggio")!r}, '
                f'mas a aula tem {esperado} itens rastreáveis — rode «python tools/validate.py --fix»')

        # O curso caminha do português para o italiano, nunca ao contrário.
        # Aviso e não erro: uma aula deliberadamente mais leve é imaginável, e
        # a convenção do projeto é que heurística avisa. Mas o caso comum de
        # regressão é esquecer o campo numa aula nova.
        modo = lesson.get('modo', 'pt')
        if modo in MODI and modo_anterior in MODI and MODI.index(modo) < MODI.index(modo_anterior):
            warn(f'manifest.json: aula «{entry["id"]}» volta de modo «{modo_anterior}» para '
                 f'«{modo}» — a progressão de língua costuma só avançar; foi de propósito?')
        modo_anterior = modo if modo in MODI else modo_anterior

    for fname in files:
        if fname in NAO_LEZIONE:
            continue
        if not any(e['file'] == fname for e in data.get('lezioni', [])):
            err(f'{fname}: existe em content/ mas não está no manifest')


def fix_derived(files: dict[str, dict]) -> list[str]:
    """Reescreve os dados derivados em content/. Devolve o que mudou.

    Idempotente de propósito: rodar duas vezes não produz diff na segunda.
    """
    mudou: list[str] = []
    manifest = files.get('manifest.json')
    if not manifest:
        return mudou

    for entry in manifest.get('lezioni', []):
        lesson = files.get(entry.get('file'))
        if lesson is None:
            continue
        esperado = count_items(lesson)
        if entry.get('conteggio') != esperado:
            # Sem seta unicode: o console do Windows é cp1252 e engasga.
            mudou.append(f'manifest.json: {entry["id"]}.conteggio {entry.get("conteggio")!r} -> {esperado}')
            entry['conteggio'] = esperado

    if mudou:
        path = CONTENT / 'manifest.json'
        path.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')

    novo = build_lessico(files)
    atual = files.get('lessico.json')
    if atual is None or atual.get('forme') != novo['forme']:
        antes = len((atual or {}).get('forme', {}))
        mudou.append(f'lessico.json: {antes} -> {len(novo["forme"])} formas')
        (CONTENT / 'lessico.json').write_text(
            json.dumps(novo, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
        files['lessico.json'] = novo

    return mudou


def main(argv: list[str] | None = None) -> int:
    argv = sys.argv[1:] if argv is None else argv
    fix = '--fix' in argv

    files = load_all()
    if errors:
        report()
        return 1

    if 'manifest.json' not in files:
        err('content/manifest.json não encontrado')
        report()
        return 1

    if fix:
        for linha in fix_derived(files):
            print(f'FIX    {linha}')

    ids: Counter = Counter()
    for name, data in files.items():
        if name in NAO_LEZIONE:
            continue
        check_lesson(name, data, ids)

    check_manifest(files['manifest.json'], files)

    if 'frasi.json' in files:
        check_frasi(files['frasi.json'], files)

    # Léxico cumulativo: dado derivado, conferido como invariante.
    lessico = build_lessico(files)
    if files.get('lessico.json', {}).get('forme') != lessico['forme']:
        err('content/lessico.json está desatualizado — rode «python tools/validate.py --fix»')
    else:
        for name, data in files.items():
            if name not in NAO_LEZIONE:
                check_scope(name, data, lessico)

    # IDs são a chave do progresso no localStorage: duplicar faz duas coisas
    # diferentes compartilharem histórico.
    for i, n in sorted(ids.items()):
        if n > 1:
            err(f'id «{i}» aparece {n} vezes — ids precisam ser únicos e imutáveis')

    lessons = len([f for f in files if f not in NAO_LEZIONE])
    formas = len(files.get('lessico.json', {}).get('forme', {}))
    print(f'{lessons} aula(s), {len(ids)} ids rastreáveis, {formas} formas no léxico.')
    report()
    return 1 if errors else 0


def report() -> None:
    for w in warnings:
        print(f'AVISO  {w}')
    for e in errors:
        print(f'ERRO   {e}')
    if not errors:
        print('OK — content/ válido.' + (f' {len(warnings)} aviso(s).' if warnings else ''))


if __name__ == '__main__':
    sys.exit(main())
