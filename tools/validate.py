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
NAO_LEZIONE = {'manifest.json', 'lessico.json'}

# Espelham o que está documentado no CLAUDE.md. Acrescentar valor aqui
# exige acrescentar no CLAUDE.md também — é de propósito que dê trabalho.
VALID_CATEGORY = {'VERBO', 'VOCABOLARIO', 'ESPRESSIONE', 'GRAMMATICA', 'PRONUNCIA'}
VALID_CHUNK_TYPE = {'fixed', 'semiFixed', 'collocation', 'word'}
VALID_BLOCK = {'lista', 'tabella', 'contrasto', 'paradigma', 'nota'}
VALID_TONO = {'info', 'attenzione', 'eccezione'}
# Precisa casar com o registry em js/exercises/index.js.
REGISTERED_TYPES = {'gap-audio', 'qa-transcribe', 'dialogue', 'paradigm-fill'}

# Mínimos por aula, conforme o passo 7 da checklist.
MINIMUMS = {'gap-audio': 2, 'qa-transcribe': 1}

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


def check_section(name: str, section: dict, ids: Counter) -> None:
    sid = section.get('id', '?')
    ids[sid] += 1

    if section.get('category') not in VALID_CATEGORY:
        err(f'{name} {sid}: category inválida «{section.get("category")}»')

    # O invariante que sustenta a autocontenção do site.
    if not section.get('spiegazione'):
        err(f'{name} {sid}: sem spiegazione — o site precisa ser autocontido')
    elif len(section['spiegazione']) < 2:
        warn(f'{name} {sid}: spiegazione com 1 parágrafo só; a regra pede o "porquê" também')

    for block in section.get('blocks', []):
        btype = block.get('type')
        if btype not in VALID_BLOCK:
            err(f'{name} {sid}: bloco desconhecido «{btype}» (render.js não sabe desenhar)')
        if btype == 'tabella':
            check_table(name, sid, block)
        elif btype == 'paradigma':
            check_paradigma(name, sid, block, ids)
        elif btype == 'nota' and block.get('tono') not in VALID_TONO:
            err(f'{name} {sid}: nota com tono inválido «{block.get("tono")}»')
        elif btype == 'contrasto' and len(block.get('gruppi', [])) < 2:
            err(f'{name} {sid}: contrasto precisa de 2+ grupos')


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
    for section in d.get('sections', []):
        check_section(name, section, ids)

    for chunk in d.get('chunks', []):
        ids[chunk['id']] += 1
        if chunk.get('chunkType') not in VALID_CHUNK_TYPE:
            err(f'{name} {chunk["id"]}: chunkType inválido «{chunk.get("chunkType")}»')
        if chunk.get('category') not in VALID_CATEGORY:
            err(f'{name} {chunk["id"]}: category inválida «{chunk.get("category")}»')
        if chunk.get('chunkType') == 'semiFixed' and '___' not in chunk.get('it', ''):
            err(f'{name} {chunk["id"]}: semiFixed sem slot «___»')

    types: Counter = Counter()
    for ex in d.get('esercizi', []):
        ids[ex['id']] += 1
        etype = ex.get('type')
        types[etype] += 1
        if etype not in REGISTERED_TYPES:
            err(f'{name} {ex["id"]}: type «{etype}» não está no registry de js/exercises/index.js')
        if etype == 'gap-audio':
            check_gap_audio(name, ex)
        elif etype == 'paradigm-fill':
            check_paradigm_fill(name, ex, ids)

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

        for coluna in (lesson.get('header') or {}).values():
            for frase in coluna:
                registra(frase, aula, 'header')

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
        if ex.get('type') == 'paradigm-fill':
            for row in ex.get('righe', []):
                n += len(row.get('nascondi', []))
        else:
            n += 1

    for p in (lesson.get('dialogo') or {}).get('passate', []):
        if p.get('focus') == 'detail':
            n += len(p.get('domande', []))
    return n


def check_manifest(data: dict, files: dict[str, dict]) -> None:
    seen_ids = set()
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
