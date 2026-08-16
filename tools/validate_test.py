#!/usr/bin/env python3
"""
Testes do validador de conteúdo.

    python tools/validate_test.py

`unittest` da stdlib, como o resto: o projeto não tem package.json nem
requirements.txt, e não vai passar a ter por causa de teste.

O foco é o que o validador ganhou para aguentar 30–40 aulas: a contagem
derivada que a home consome e a colheita do léxico que sustenta a regra
do i+1.
"""

import unittest
from collections import Counter
from pathlib import Path
import json
import sys

sys.path.insert(0, str(Path(__file__).resolve().parent))

import validate as v  # noqa: E402

ROOT = Path(__file__).resolve().parent.parent


def aula(**kw):
    """Aula mínima que passa no schema, com os campos do teste por cima."""
    base = {
        'id': '05', 'numero': 5, 'titolo': 'T', 'gloss': 'g',
        'sections': [], 'chunks': [], 'esercizi': [],
    }
    base.update(kw)
    return base


class TestParole(unittest.TestCase):
    def test_remove_markup_e_pontuacao(self):
        self.assertEqual(v.parole('<b>Il</b> cane, <em>la</em> penna!'),
                         ['il', 'cane', 'la', 'penna'])

    def test_preserva_apostrofo(self):
        # Em italiano o apóstrofo é informação gramatical: un amico (masc.)
        # contra un'amica (fem.). Tirá-lo misturaria as duas.
        self.assertIn("l'amico", v.parole("l'amico"))
        self.assertIn("un'amica", v.parole("un'amica"))

    def test_junta_separacao_silabica(self):
        # As aulas de pronúncia escrevem «Ca-stel-li». Sem juntar, o índice
        # ganharia «stel» e «li» como se fossem palavras.
        self.assertEqual(v.parole('Ca-stel-li'), ['castelli'])
        self.assertEqual(v.parole('Puoi ripetere? Ca-stel-li.'),
                         ['puoi', 'ripetere', 'castelli'])

    def test_descarta_o_que_nao_e_palavra(self):
        # «venti» é vocabulário; «20» não é. E «___» é marcador de lacuna.
        self.assertEqual(v.parole('Numeri 0-20 e venti'), ['numeri', 'e', 'venti'])
        self.assertEqual(v.parole('Io sono ___.'), ['io', 'sono'])

    def test_texto_vazio(self):
        self.assertEqual(v.parole(''), [])
        self.assertEqual(v.parole(None), [])


class TestCountItems(unittest.TestCase):
    def test_exercicio_simples_vale_um(self):
        self.assertEqual(v.count_items(aula(esercizi=[
            {'id': 'a', 'type': 'gap-audio'},
            {'id': 'b', 'type': 'qa-transcribe'},
        ])), 2)

    def test_paradigma_vale_uma_celula_oculta_por_item(self):
        # Cada célula tem progresso próprio; o exercício em si não é
        # rastreado. É o que dá granularidade ao progresso.
        self.assertEqual(v.count_items(aula(esercizi=[{
            'id': 'p', 'type': 'paradigm-fill',
            'righe': [{'id': 'r1', 'nascondi': [1, 3]}, {'id': 'r2', 'nascondi': [0]}],
        }])), 3)

    def test_conta_perguntas_de_detalhe_do_dialogo(self):
        self.assertEqual(v.count_items(aula(dialogo={
            'id': 'd', 'passate': [
                {'focus': 'gist'},
                {'focus': 'detail', 'domande': [{'id': 'q1'}, {'id': 'q2'}]},
            ],
        })), 2)

    def test_aula_vazia(self):
        self.assertEqual(v.count_items({}), 0)

    def test_bate_com_o_conteggio_do_manifest(self):
        # O invariante que faz a home poder confiar no manifest.
        manifest = json.loads((ROOT / 'content' / 'manifest.json').read_text(encoding='utf-8'))
        for entry in manifest['lezioni']:
            lesson = json.loads((ROOT / 'content' / entry['file']).read_text(encoding='utf-8'))
            self.assertEqual(v.count_items(lesson), entry.get('conteggio'),
                             f'aula {entry["id"]}: rode python tools/validate.py --fix')


class TestBuildLessico(unittest.TestCase):
    def formas(self, *aulas):
        files = {f'lezione-{a["id"]}.json': a for a in aulas}
        return v.build_lessico(files)['forme']

    def test_colhe_de_chunks_e_slots(self):
        f = self.formas(aula(chunks=[
            {'id': 'c1', 'it': 'Io sono ___.', 'slot': ['brasiliano', 'tedesca']},
        ]))
        self.assertEqual(f['sono']['origine'], 'chunk')
        self.assertEqual(f['brasiliano']['origine'], 'slot')
        self.assertIn('tedesca', f)

    def test_colhe_de_lista_tabella_contrasto_paradigma(self):
        f = self.formas(aula(sections=[{'id': 's', 'blocks': [
            {'type': 'lista', 'items': [{'it': 'Buongiorno', 'pt': 'Bom dia'}]},
            {'type': 'tabella', 'intestazioni': ['Essere'], 'righe': [['siamo']]},
            {'type': 'contrasto', 'gruppi': [{'esempi': [{'it': 'Casa'}]}]},
            {'type': 'paradigma', 'colonne': ['Singolare'],
             'righe': [{'id': 'r', 'forme': ['il cane']}]},
        ]}]))
        self.assertIn('buongiorno', f)
        self.assertIn('siamo', f)
        self.assertIn('casa', f)
        self.assertIn('cane', f)

    def test_celula_marcada_pt_nao_entra(self):
        # É rótulo em português, não vocabulário italiano. Mesma regra do
        # botão de áudio: se não é italiano, não conta.
        f = self.formas(aula(sections=[{'id': 's', 'blocks': [{
            'type': 'tabella',
            'intestazioni': [{'html': 'Artigo', 'pt': True}, 'Esempi'],
            'righe': [[{'html': 'consoante comum', 'pt': True}, 'il cane']],
        }]}]))
        self.assertIn('cane', f)
        self.assertNotIn('artigo', f)
        self.assertNotIn('consoante', f)

    def test_dialogo_e_esercizi_ficam_de_fora(self):
        # Se entrassem, um diálogo fora de escopo se autoautorizaria e a
        # checagem do i+1 viraria decorativa.
        f = self.formas(aula(
            dialogo={'id': 'd', 'battute': [{'it': 'Palavrainventada'}]},
            esercizi=[{'id': 'e', 'type': 'gap-audio', 'testo': 'Outrainventada ___'}],
        ))
        self.assertNotIn('palavrainventada', f)
        self.assertNotIn('outrainventada', f)

    def test_sbagliata_do_correzione_nunca_entra(self):
        # A `sbagliata` é o único texto italiano do site que não se deve
        # ensinar. Se entrasse no léxico, a checagem do i+1 passaria a
        # autorizar um diálogo a usar a forma errada.
        f = self.formas(aula(esercizi=[{
            'id': 'e', 'type': 'correzione',
            'frasi': [{'id': 'f1', 'sbagliata': 'Noi leggiono',
                       'risposta': 'Noi leggiamo', 'pt': 'Nós lemos'}],
        }]))
        self.assertNotIn('leggiono', f)
        # E a certa também não entra por aqui: `esercizi` está fora inteiro.
        self.assertNotIn('leggiamo', f)

    def test_scambio_entra_mas_dialogo_nao(self):
        # A diferença não é o formato — os dois são turnos com falante. É o
        # papel: o scambio é modelo que a aula EXIBE e ensina, como uma
        # lista; o diálogo é o que a checagem de escopo confere.
        f = self.formas(aula(
            sections=[{'id': 's', 'blocks': [
                {'type': 'scambio', 'battute': [{'speaker': 'A', 'it': 'Scambiata'}]},
            ]}],
            dialogo={'id': 'd', 'battute': [{'it': 'Dialogata'}]},
        ))
        self.assertIn('scambiata', f)
        self.assertNotIn('dialogata', f)

    def test_stoplist_fora(self):
        f = self.formas(aula(chunks=[{'id': 'c', 'it': 'Io e Marco'}]))
        self.assertNotIn('io', f)
        self.assertNotIn('e', f)
        self.assertNotIn('marco', f)

    def test_primeira_aula_vence(self):
        # O índice diz quando a forma ENTROU no curso.
        f = self.formas(
            aula(id='02', chunks=[{'id': 'c', 'it': 'cane'}]),
            aula(id='07', chunks=[{'id': 'c', 'it': 'cane'}]),
        )
        self.assertEqual(f['cane']['aula'], '02')

    def test_saida_ordenada_para_diff_estavel(self):
        f = self.formas(aula(chunks=[{'id': 'c', 'it': 'zebra alfa mela'}]))
        self.assertEqual(list(f), sorted(f))


class TestCheckProse(unittest.TestCase):
    """As pseudo-tags <it>/<pt> falham em silêncio no render, então o
    validador é a única rede: tag torta não quebra a página, só deixa a
    forma muda."""

    def setUp(self):
        v.errors.clear()

    def test_tag_bem_formada_passa(self):
        v.check_prose('x.json', 's01', 'plurais como <it><em>amici</em></it> e <it>amiche</it>.')
        self.assertEqual(v.errors, [])

    def test_texto_sem_tag_nenhuma_passa(self):
        v.check_prose('x.json', 's01', 'A regra vale para <b>c</b> e <b>g</b>.')
        self.assertEqual(v.errors, [])

    def test_tag_sem_fechamento_e_erro(self):
        v.check_prose('x.json', 's01', 'vale para <it>amico e <it>amica</it>')
        self.assertEqual(len(v.errors), 1)
        self.assertIn('desbalanceada', v.errors[0])

    def test_fechamento_sobrando_e_erro(self):
        v.check_prose('x.json', 's01', 'vale para amico</it>')
        self.assertEqual(len(v.errors), 1)

    def test_tag_vazia_e_erro(self):
        v.check_prose('x.json', 's01', 'nada <it></it> aqui')
        self.assertEqual(len(v.errors), 1)
        self.assertIn('sem texto', v.errors[0])

    def test_tag_so_com_marcacao_dentro_e_erro(self):
        # <it><em></em></it> renderizaria um botão mudo.
        v.check_prose('x.json', 's01', 'olhe <it><em></em></it> isto')
        self.assertEqual(len(v.errors), 1)

    def test_none_nao_quebra(self):
        v.check_prose('x.json', 's01', None)
        self.assertEqual(v.errors, [])


class TestCheckFigura(unittest.TestCase):
    """`chunks[].figura` — o estímulo visual da carta.

    Duas famílias de risco, e elas são bem diferentes. A do emoji é
    PEDAGÓGICA: texto português enfiado no campo apareceria gigante na
    frente da carta e entregaria a resposta, matando o exercício sem
    quebrar nada. A do SVG é de SEGURANÇA: `figura` é o único campo do
    conteúdo que vira marcação crua via innerHTML.
    """

    def setUp(self):
        v.errors.clear()
        v.warnings.clear()

    def fig(self, valor):
        v.check_figura('x.json c1', valor)
        return v.errors

    # --- emoji ---

    def test_emoji_simples_passa(self):
        self.assertEqual(self.fig('🚗'), [])

    def test_emoji_com_seletor_e_zwj_passa(self):
        # ❤️ traz VS16; 👨‍🍳 é uma sequência com ZWJ. As duas são um símbolo
        # só na tela e não podem ser lidas como "texto".
        self.assertEqual(self.fig('❤️'), [])
        self.assertEqual(self.fig('👨‍🍳'), [])

    def test_texto_em_portugues_e_erro(self):
        self.assertEqual(len(self.fig('carro')), 1)
        self.assertIn('não parece um emoji', v.errors[0])

    def test_letra_solta_e_erro(self):
        # Uma letra passaria pelo teto de tamanho; o que a reprova é a faixa
        # de codepoint, não o comprimento.
        self.assertEqual(len(self.fig('A')), 1)

    def test_frase_longa_e_erro_por_tamanho(self):
        self.assertEqual(len(self.fig('um carro vermelho na rua')), 1)
        self.assertIn('parece texto', v.errors[0])

    def test_vazio_e_erro(self):
        self.assertEqual(len(self.fig('   ')), 1)
        self.assertIn('figura vazia', v.errors[0])

    def test_nao_string_e_erro(self):
        self.assertEqual(len(self.fig(42)), 1)

    # --- SVG ---

    def test_svg_bem_formado_passa(self):
        self.assertEqual(self.fig('<svg viewBox="0 0 64 64"><path d="M8 56 L56 8"/></svg>'), [])

    def test_svg_sem_fechamento_e_erro(self):
        self.assertEqual(len(self.fig('<svg viewBox="0 0 8 8"><path/>')), 1)
        self.assertIn('</svg>', v.errors[0])

    def test_svg_com_script_e_erro(self):
        self.assertIn('script', self.fig(
            '<svg viewBox="0 0 8 8"><script>alert(1)</script></svg>')[0])

    def test_svg_com_handler_inline_e_erro(self):
        self.assertIn('handler', self.fig(
            '<svg viewBox="0 0 8 8"><circle onclick="x()" r="1"/></svg>')[0])

    def test_svg_com_href_externo_e_erro(self):
        # Referência externa quebraria «zero CDN» e vazaria a visita.
        self.assertIn('href interno', self.fig(
            '<svg viewBox="0 0 8 8"><use href="https://cdn.exemplo/i.svg#a"/></svg>')[0])

    def test_svg_com_href_interno_passa(self):
        self.assertEqual(self.fig(
            '<svg viewBox="0 0 8 8"><defs><path id="a" d="M0 0"/></defs>'
            '<use href="#a"/></svg>'), [])

    def test_svg_com_image_externa_e_erro(self):
        self.assertEqual(len(self.fig(
            '<svg viewBox="0 0 8 8"><image href="foto.png"/></svg>')), 2)

    def test_svg_sem_viewbox_e_aviso_nao_erro(self):
        # Não escala junto com a carta, mas renderiza — é aviso.
        self.assertEqual(self.fig('<svg width="8"><path d="M0 0"/></svg>'), [])
        self.assertEqual(len(v.warnings), 1)
        self.assertIn('viewBox', v.warnings[0])

    def test_html_que_nao_e_svg_e_erro(self):
        self.assertIn('nem SVG', self.fig('<img src="carro.png">')[0])

    # --- integração com a aula ---

    def test_chunk_com_figura_ruim_reprova_a_aula(self):
        v.check_lesson('x.json', aula(chunks=[{
            'id': 'c1', 'it': 'la macchina', 'pt': 'o carro',
            'chunkType': 'word', 'category': 'VOCABOLARIO', 'figura': 'carro',
        }]), Counter())
        self.assertTrue(any('figura' in e for e in v.errors))

    def test_chunk_sem_figura_e_o_caso_normal(self):
        v.check_lesson('x.json', aula(chunks=[{
            'id': 'c1', 'it': 'la macchina', 'pt': 'o carro',
            'chunkType': 'word', 'category': 'VOCABOLARIO',
        }]), Counter())
        self.assertEqual(v.errors, [])

    def test_figura_nao_entra_no_lexico(self):
        # O léxico é o italiano EXIBIDO; 🚗 não é forma italiana nenhuma.
        files = {'lezione-05.json': aula(chunks=[{
            'id': 'c1', 'it': 'la macchina', 'pt': 'o carro',
            'chunkType': 'word', 'category': 'VOCABOLARIO', 'figura': '🚗',
        }])}
        formas = v.build_lessico(files)['forme']
        self.assertIn('macchina', formas)
        self.assertNotIn('🚗', formas)


class TestProseMatriz(unittest.TestCase):
    """Matriz modo × tag. São 3 modos e 2 tags: o que precisa de prova é a
    tabela, não cada célula solta — é assim que não se esquece um par."""

    def setUp(self):
        v.errors.clear()

    def test_tag_viva_por_modo(self):
        self.assertEqual(v.tag_viva('pt'), 'it')
        self.assertEqual(v.tag_viva('misto'), 'pt')
        self.assertEqual(v.tag_viva('it'), 'pt')
        # Modo desconhecido cai no default, igual ao render.js.
        self.assertEqual(v.tag_viva('xyz'), 'it')

    def test_matriz_completa(self):
        # (modo, texto, deve_dar_erro, trecho esperado na mensagem)
        casos = [
            ('pt', 'cita <it>parlo</it> aqui', False, None),
            ('pt', 'glosa <pt>falo</pt> aqui', True, 'a tag a usar é <it>'),
            ('misto', 'glosa <pt>falo</pt> aqui', False, None),
            ('misto', 'cita <it>parlo</it> aqui', True, 'a tag a usar é <pt>'),
            ('it', 'glosa <pt>falo</pt> aqui', False, None),
            ('it', 'cita <it>parlo</it> aqui', True, 'a tag a usar é <pt>'),
            # Sem tag nenhuma é válido em todos os modos.
            ('pt', 'texto simples', False, None),
            ('misto', 'texto simples', False, None),
            ('it', 'texto simples', False, None),
        ]
        for modo, texto, deve_falhar, trecho in casos:
            with self.subTest(modo=modo, texto=texto):
                v.errors.clear()
                v.check_prose('x.json', 's01', texto, modo)
                if deve_falhar:
                    self.assertTrue(v.errors, f'esperava erro em modo {modo}: {texto}')
                    self.assertIn(trecho, v.errors[0])
                else:
                    self.assertEqual(v.errors, [], f'não deveria falhar: {modo} / {texto}')

    def test_tag_inerte_desbalanceada_ainda_e_erro(self):
        # <pt> não é a tag viva em modo 'pt', mas torta é bug do mesmo jeito:
        # se a aula virar 'misto' amanhã, ela passa a renderizar errado.
        v.check_prose('x.json', 's01', 'texto <pt>sem fechar', 'pt')
        self.assertTrue(any('desbalanceada' in e for e in v.errors))

    def test_tag_inerte_vazia_ainda_e_erro(self):
        v.check_prose('x.json', 's01', 'texto <pt></pt> aqui', 'it')
        self.assertTrue(any('sem texto' in e for e in v.errors))


class TestModoDaAula(unittest.TestCase):
    def setUp(self):
        v.errors.clear()
        v.warnings.clear()

    def test_modo_ausente_e_valido_e_vale_pt(self):
        v.check_lesson('x.json', aula(), Counter())
        self.assertEqual(v.errors, [])

    def test_modo_valido_passa(self):
        for m in v.MODI:
            with self.subTest(modo=m):
                v.errors.clear()
                v.check_lesson('x.json', aula(modo=m), Counter())
                self.assertEqual(v.errors, [])

    def test_modo_invalido_e_erro(self):
        v.check_lesson('x.json', aula(modo='inglese'), Counter())
        self.assertTrue(any('modo «inglese» inválido' in e for e in v.errors))

    def test_modo_desce_ate_a_spiegazione_da_secao(self):
        # Se o modo não chegasse a check_section, este <it> passaria batido.
        d = aula(modo='it', sections=[{
            'id': 's1', 'category': 'VERBO', 'titolo': 'T', 'gloss': 'g',
            'spiegazione': ['Il verbo <it>parlare</it> è regolare.', 'Secondo paragrafo.'],
        }])
        v.check_lesson('x.json', d, Counter())
        self.assertTrue(any('a tag a usar é <pt>' in e for e in v.errors))

    def test_modo_desce_ate_o_bilancio(self):
        d = aula(modo='it', bilancio=['So <it>parlare</it>.'])
        v.check_lesson('x.json', d, Counter())
        self.assertTrue(any('a tag a usar é <pt>' in e for e in v.errors))


class TestSlotFramePorModo(unittest.TestCase):
    """O único campo que a mudança de língua realmente relaxa."""

    def setUp(self):
        v.errors.clear()

    def _ex(self, giro):
        return {
            'id': 'e01', 'type': 'slot-frame',
            'frame': {'it': 'Io parlo ___.'},
            'giri': [giro],
        }

    def test_giro_sem_pt_falha_em_pt_e_misto(self):
        for modo in ('pt', 'misto'):
            with self.subTest(modo=modo):
                v.errors.clear()
                v.check_slot_frame('x.json', self._ex(
                    {'id': 'g1', 'slot': 'italiano', 'risposta': 'Io parlo italiano.'}
                ), Counter(), modo)
                self.assertTrue(any('sem prompt «pt»' in e for e in v.errors))

    def test_giro_com_slot_basta_em_it(self):
        v.check_slot_frame('x.json', self._ex(
            {'id': 'g1', 'slot': 'italiano', 'risposta': 'Io parlo italiano.'}
        ), Counter(), 'it')
        self.assertEqual(v.errors, [])

    def test_giro_sem_pt_nem_slot_falha_ate_em_it(self):
        v.check_slot_frame('x.json', self._ex(
            {'id': 'g1', 'risposta': 'Io parlo italiano.'}
        ), Counter(), 'it')
        self.assertTrue(any('nem «slot»' in e for e in v.errors))

    def test_giro_com_pt_passa_em_todos_os_modos(self):
        for modo in v.MODI:
            with self.subTest(modo=modo):
                v.errors.clear()
                v.check_slot_frame('x.json', self._ex(
                    {'id': 'g1', 'slot': 'italiano', 'pt': 'italiano',
                     'risposta': 'Io parlo italiano.'}
                ), Counter(), modo)
                self.assertEqual(v.errors, [])


class TestLessicoIndependeDoModo(unittest.TestCase):
    """A spiegazione em modo «it» ganha 🔊 mas NÃO entra no léxico. Se
    entrasse, uma explicação toda em italiano autorizaria qualquer palavra
    no diálogo e a checagem do i+1 morreria."""

    def test_lessico_identico_com_e_sem_modo(self):
        secao = {
            'id': 's1', 'category': 'VERBO', 'titolo': 'T', 'gloss': 'g',
            'spiegazione': ['Il verbo <pt>o verbo</pt> è regolare.', 'Due.'],
            'blocks': [{'type': 'lista', 'items': [{'it': 'parlo', 'pt': 'falo'}]}],
        }
        sem = v.build_lessico({'lezione-05.json': aula(sections=[secao])})
        com = v.build_lessico({'lezione-05.json': aula(modo='it', sections=[secao])})
        self.assertEqual(sem, com)

    def test_palavra_so_da_spiegazione_nao_entra(self):
        lex = v.build_lessico({'lezione-05.json': aula(modo='it', sections=[{
            'id': 's1', 'category': 'VERBO', 'titolo': 'T', 'gloss': 'g',
            'spiegazione': ['Una parola inventata: sgrunfio.', 'Due.'],
        }])})
        self.assertNotIn('sgrunfio', lex['forme'])


class TestCheckScope(unittest.TestCase):
    def setUp(self):
        v.warnings.clear()

    def test_avisa_sobre_forma_nao_ensinada(self):
        lessico = {'forme': {'cane': {'aula': '01', 'origine': 'chunk'}}}
        v.check_scope('x.json', aula(id='01', dialogo={
            'id': 'd1', 'battute': [{'it': 'Il cane e la giraffa'}],
        }), lessico)

        self.assertEqual(len(v.warnings), 1)
        self.assertIn('giraffa', v.warnings[0])
        self.assertIn('i+1', v.warnings[0])

    def test_silencioso_quando_tudo_esta_no_escopo(self):
        lessico = {'forme': {'cane': {'aula': '00', 'origine': 'chunk'}}}
        v.check_scope('x.json', aula(id='01', dialogo={
            'id': 'd1', 'battute': [{'it': 'Il cane'}],
        }), lessico)
        self.assertEqual(v.warnings, [])

    def test_forma_de_aula_futura_nao_conta(self):
        # O ponto todo do i+1: vocabulário da aula 09 não autoriza a aula 01.
        lessico = {'forme': {'cane': {'aula': '09', 'origine': 'chunk'}}}
        v.check_scope('x.json', aula(id='01', dialogo={
            'id': 'd1', 'battute': [{'it': 'Il cane'}],
        }), lessico)
        self.assertEqual(len(v.warnings), 1)
        self.assertIn('cane', v.warnings[0])

    def test_aula_sem_dialogo_nao_avisa(self):
        v.check_scope('x.json', aula(id='01'), {'forme': {}})
        self.assertEqual(v.warnings, [])

    def test_lista_longa_e_truncada(self):
        battute = [{'it': ' '.join(f'inventata{i}' for i in range(20))}]
        v.check_scope('x.json', aula(id='01', dialogo={'id': 'd', 'battute': battute}),
                      {'forme': {}})
        self.assertIn('(+12)', v.warnings[0])


class TestCheckHeader(unittest.TestCase):
    """O cabeçalho é o sumário da aula, e cada item pode virar atalho.

    O item é string OU {it, sezione} — string continua sendo o caso comum e
    continua sendo texto puro. O que não pode passar é `sezione` apontando
    para o vazio: o link ficaria clicável e simplesmente não rolaria.
    """

    def setUp(self):
        v.errors.clear()
        v.warnings.clear()

    def test_string_simples_continua_valendo(self):
        v.check_header('x.json', aula(header={'comunicazione': ['Presentarsi']}))
        self.assertEqual(v.errors, [])

    def test_sezione_para_secao_existente_passa(self):
        v.check_header('x.json', aula(
            header={'comunicazione': [{'it': 'Salutare', 'sezione': 's1'}]},
            sections=[{'id': 's1'}]))
        self.assertEqual(v.errors, [])

    def test_sezione_para_ancora_de_etapa_passa(self):
        # Item de «comunicazione» costuma apontar para o diálogo, não para
        # uma seção — por isso as âncoras de etapa também valem.
        v.check_header('x.json', aula(
            header={'comunicazione': [{'it': 'Salutare', 'sezione': 'ascolto'}]}))
        self.assertEqual(v.errors, [])

    def test_sezione_inexistente_e_erro(self):
        v.check_header('x.json', aula(
            header={'comunicazione': [{'it': 'Salutare', 'sezione': 'l99-s01'}]},
            sections=[{'id': 's1'}]))
        self.assertIn('l99-s01', v.errors[0])

    def test_objeto_sem_it_e_erro(self):
        v.check_header('x.json', aula(header={'comunicazione': [{'sezione': 'ascolto'}]}))
        self.assertIn('sem «it»', v.errors[0])


class TestCheckFunzioni(unittest.TestCase):
    """`funzioni` agrupa chunks POR REFERÊNCIA de id, nunca copiando texto."""

    def setUp(self):
        v.errors.clear()
        v.warnings.clear()

    def check(self, **kw):
        v.check_funzioni('x.json', aula(**kw), Counter())
        return v.errors

    def test_aula_sem_funzioni_nao_diz_nada(self):
        self.assertEqual(self.check(), [])
        self.assertEqual(v.warnings, [])

    def test_referencia_valida_passa(self):
        self.assertEqual(self.check(
            chunks=[{'id': 'c1', 'it': 'Ciao', 'chunkType': 'fixed'}],
            funzioni=[{'id': 'f1', 'quando': 'Quando saluti', 'gloss': 'g', 'chunks': ['c1']}],
        ), [])

    def test_referencia_a_chunk_inexistente_e_erro(self):
        self.assertIn('fantasma', self.check(
            chunks=[],
            funzioni=[{'id': 'f1', 'quando': 'Q', 'gloss': 'g', 'chunks': ['fantasma']}],
        )[0])

    def test_funzione_vazia_e_erro(self):
        self.assertIn('sem nenhum chunk', self.check(
            funzioni=[{'id': 'f1', 'quando': 'Q', 'gloss': 'g', 'chunks': []}],
        )[0])

    def test_frase_fixa_fora_de_todo_grupo_avisa(self):
        self.check(
            chunks=[
                {'id': 'c1', 'it': 'Ciao', 'chunkType': 'fixed'},
                {'id': 'c2', 'it': 'Grazie', 'chunkType': 'fixed'},
            ],
            funzioni=[{'id': 'f1', 'quando': 'Q', 'gloss': 'g', 'chunks': ['c1']}],
        )
        self.assertIn('c2', v.warnings[0])

    def test_palavra_solta_fora_de_grupo_NAO_avisa(self):
        # `word` e `collocation` são item lexical, não frase com «quando se
        # usa». Cobrá-los encheria a saída de ruído que se aprende a ignorar.
        self.check(
            chunks=[
                {'id': 'c1', 'it': 'Ciao', 'chunkType': 'fixed'},
                {'id': 'c2', 'it': 'il cane', 'chunkType': 'word'},
                {'id': 'c3', 'it': 'i Paesi Bassi', 'chunkType': 'collocation'},
            ],
            funzioni=[{'id': 'f1', 'quando': 'Q', 'gloss': 'g', 'chunks': ['c1']}],
        )
        self.assertEqual(v.warnings, [])

    def test_o_mesmo_chunk_pode_servir_a_duas_intencoes(self):
        self.assertEqual(self.check(
            chunks=[{'id': 'c1', 'it': 'Ciao', 'chunkType': 'fixed'}],
            funzioni=[
                {'id': 'f1', 'quando': 'Quando saluti', 'gloss': 'g', 'chunks': ['c1']},
                {'id': 'f2', 'quando': 'Quando ti congedi', 'gloss': 'g', 'chunks': ['c1']},
            ],
        ), [])

    def test_quando_entra_no_lexico(self):
        # Mesmo caso de header.comunicazione: rótulo funcional em italiano,
        # exibido com 🔊, logo colhido.
        files = {'lezione-01.json': aula(id='01', funzioni=[
            {'id': 'f1', 'quando': 'Quando saluti', 'gloss': 'g', 'chunks': []},
        ])}
        formas = v.build_lessico(files)['forme']
        self.assertEqual(formas['saluti']['origine'], 'funzione')


class TestCheckTrasformazione(unittest.TestCase):
    """A pontuação final é conteúdo neste tipo, e só neste.

    Em italiano a interrogativa não inverte nada: `Tu sei italiano?` difere
    de `Tu sei italiano.` apenas pelo ponto. Por isso a comparação aqui não
    passa por norm(), que descartaria justamente o que distingue as duas.
    """

    def setUp(self):
        v.errors.clear()
        v.warnings.clear()

    def check(self, frase):
        ex = {'id': 'e1', 'type': 'trasformazione', 'frasi': [dict(frase, id='e1-f1')]}
        v.check_trasformazione('x.json', ex, Counter())
        return v.errors

    def test_interrogativa_legitima_passa(self):
        self.assertEqual(self.check({
            'partenza': 'Tu sei italiano.', 'verso': 'interrogativa',
            'risposta': 'Tu sei italiano?'}), [])

    def test_interrogativa_sem_ponto_de_interrogacao_e_erro(self):
        self.assertIn('sem «?»', self.check({
            'partenza': 'Tu sei italiano.', 'verso': 'interrogativa',
            'risposta': 'Tu sei italiano.'})[0])

    def test_negativa_com_ponto_de_interrogacao_e_erro(self):
        self.assertIn('termina em «?»', self.check({
            'partenza': 'Io sono italiano.', 'verso': 'negativa',
            'risposta': 'Io non sono italiano?'})[0])

    def test_partida_igual_a_chegada_e_erro(self):
        self.assertIn('nada a transformar', self.check({
            'partenza': 'Io sono italiano.', 'verso': 'negativa',
            'risposta': 'Io sono italiano.'})[0])

    def test_verso_invalido_e_erro(self):
        self.assertIn('verso', self.check({
            'partenza': 'A.', 'verso': 'esclamativa', 'risposta': 'B!'})[0])


class TestCheckTraduzione(unittest.TestCase):
    def setUp(self):
        v.errors.clear()
        v.warnings.clear()

    def check(self, frase):
        ex = {'id': 'e1', 'type': 'traduzione', 'frasi': [dict(frase, id='e1-f1')]}
        v.check_traduzione('x.json', ex, Counter())
        return v.errors

    def test_frase_completa_passa(self):
        self.assertEqual(self.check({'pt': 'Eu sou.', 'risposta': 'Io sono.'}), [])

    def test_sem_pt_e_erro(self):
        # O `pt` é o único estímulo na tela: sem ele o exercício é impossível.
        self.assertIn('sem «pt»', self.check({'risposta': 'Io sono.'})[0])

    def test_lacuna_e_erro_de_tipo(self):
        self.assertIn('lacuna', self.check(
            {'pt': 'Eu sou ___.', 'risposta': 'Io sono ___.'})[0])


class TestCheckCorrezione(unittest.TestCase):
    """Ler uma frase errada e reescrevê-la certa.

    A regra dura é a mesma ideia da pontuação em `trasformazione`: se as
    duas frases forem iguais depois de normalizar, copiar vale ponto e o
    drill não exercita nada. Aqui é mais insidioso, porque as duas são
    frases inteiras e a diferença pode ser uma letra só.
    """

    def setUp(self):
        v.errors.clear()
        v.warnings.clear()

    def check(self, **kw):
        f = {'id': 'f1', 'sbagliata': 'Lui legge i giornale.',
             'risposta': 'Lui legge il giornale.', 'pt': 'Ele lê o jornal.'}
        f.update(kw)
        v.errors.clear()
        v.check_correzione('t.json', {'id': 'e1', 'type': 'correzione', 'frasi': [f]}, Counter())
        return v.errors

    def test_exercicio_minimo_passa(self):
        self.assertEqual(self.check(), [])

    def test_frases_iguais_e_erro(self):
        errs = self.check(sbagliata='Lui legge il giornale.')
        self.assertTrue(any('mesma frase' in e for e in errs))

    def test_diferenca_so_de_pontuacao_tambem_e_erro(self):
        # `norm` descarta pontuação final: se é só isso que separa as duas,
        # o aluno acerta copiando.
        errs = self.check(sbagliata='Lui legge il giornale')
        self.assertTrue(any('mesma frase' in e for e in errs))

    def test_sem_pt_e_erro(self):
        # Sem o sentido pretendido o aluno não sabe qual leitura é a certa.
        errs = self.check(pt='')
        self.assertTrue(any('«pt»' in e for e in errs))

    def test_sem_sbagliata_e_erro(self):
        self.assertTrue(any('sbagliata' in e for e in self.check(sbagliata='')))

    def test_lacuna_e_erro_de_tipo(self):
        errs = self.check(sbagliata='Lui legge ___ giornale.')
        self.assertTrue(any('lacuna' in e for e in errs))

    def test_conta_um_id_por_frase(self):
        # `SUBITEM_FIELD` é o espelho de `subItemIds` em correzione.js: sem
        # ele o conteggio contaria 1 onde há 5, e o Ripasso nunca traria os
        # sub-itens de volta.
        self.assertEqual(v.SUBITEM_FIELD['correzione'], 'frasi')
        ex = {'id': 'e', 'type': 'correzione', 'frasi': [{'id': 'a'}, {'id': 'b'}]}
        self.assertEqual(v.count_items({'esercizi': [ex]}), 2)


class TestCheckScambio(unittest.TestCase):
    """`scambio` — o microdiálogo de 2 a 4 linhas.

    Bloco de seção, não exercício: é leitura, sem id e sem progresso. As
    duas regras vêm do diálogo, e pelo mesmo motivo — dois falantes porque
    é o que `voiceFor()` diferencia, alternados porque dois turnos na mesma
    voz leem como uma frase só.
    """

    def setUp(self):
        v.errors.clear()
        v.warnings.clear()

    def check(self, battute):
        v.errors.clear()
        v.check_scambio('t.json', 's1', {'battute': battute})
        return v.errors

    OK = [
        {'speaker': 'A', 'it': 'Qualcosa da bere?', 'pt': 'Algo pra beber?'},
        {'speaker': 'B', 'it': 'Un caffè, per favore.', 'pt': 'Um café, por favor.'},
    ]

    def test_troca_minima_passa(self):
        self.assertEqual(self.check(self.OK), [])

    def test_um_turno_so_nao_e_troca(self):
        self.assertTrue(any('turno' in e for e in self.check(self.OK[:1])))

    def test_cinco_turnos_ja_e_dialogo(self):
        # Mais que quatro é diálogo, e diálogo tem passadas.
        longo = [dict(b, speaker='AB'[i % 2]) for i, b in enumerate(self.OK * 3)][:5]
        self.assertTrue(any('turno' in e for e in self.check(longo)))

    def test_falante_repetido_e_erro(self):
        battute = [dict(b, speaker='A') for b in self.OK]
        self.assertTrue(any('repete o falante' in e for e in self.check(battute)))

    def test_terceiro_falante_e_erro(self):
        battute = [dict(self.OK[0]), dict(self.OK[1], speaker='C')]
        self.assertTrue(any('speaker' in e for e in self.check(battute)))

    def test_sem_pt_e_erro(self):
        # É modelo para ler, não exercício de compreensão.
        battute = [dict(self.OK[0]), {k: x for k, x in self.OK[1].items() if k != 'pt'}]
        self.assertTrue(any('«pt»' in e for e in self.check(battute)))


class TestCheckDictogloss(unittest.TestCase):
    """Ouvir um texto curto e reconstruí-lo de memória.

    O tipo estava no registry desde sempre, com módulo e suíte próprios, e
    passava batido pelo dispatch do validador porque nenhuma aula o usava.
    Autorar o primeiro expôs o buraco.
    """

    def setUp(self):
        v.errors.clear()
        v.warnings.clear()

    def base(self, **kw):
        d = {
            'id': 'e1',
            'testo': 'Io leggo un giornale ogni mattina.',
            'audio': {'tts': 'Io leggo un giornale ogni mattina.'},
            'pt': 'Eu leio um jornal toda manhã.',
            'preinsegnamento': [{'it': 'ogni mattina', 'pt': 'toda manhã'}],
        }
        d.update(kw)
        return d

    def check(self, **kw):
        v.errors.clear()
        v.check_dictogloss('t.json', self.base(**kw))
        return v.errors

    def test_exercicio_minimo_passa(self):
        self.assertEqual(self.check(), [])

    def test_tts_divergente_e_erro(self):
        # Pior que num gap-audio: aqui o diff compara a reconstrução inteira
        # contra o `testo`, então acusaria erro numa palavra nunca dita.
        errs = self.check(audio={'tts': 'Io leggo una rivista ogni sera.'})
        self.assertIn('não bate', errs[0])

    def test_tts_ausente_passa(self):
        # `audio.tts` é opcional: o módulo cai para o próprio `testo`.
        self.assertEqual(self.check(audio={}), [])

    def test_pontuacao_e_caixa_nao_contam(self):
        self.assertEqual(self.check(audio={'tts': 'io leggo un giornale ogni mattina'}), [])

    def test_sem_preinsegnamento_e_erro(self):
        errs = self.check(preinsegnamento=[])
        self.assertTrue(any('preinsegnamento' in e for e in errs))

    def test_preinsegnamento_fora_do_texto_e_erro(self):
        # Pré-ensinar o que não vai ser ouvido só gasta a atenção do aluno.
        errs = self.check(preinsegnamento=[{'it': 'la tesi', 'pt': 'a tese'}])
        self.assertTrue(any('não aparece no texto' in e for e in errs))

    def test_sem_testo_e_erro(self):
        errs = self.check(testo='')
        self.assertTrue(any('testo' in e for e in errs))

    def test_sem_pt_e_erro(self):
        errs = self.check(pt='')
        self.assertTrue(any('«pt»' in e for e in errs))


class TestCheckFrasi(unittest.TestCase):
    """`content/frasi.json` — as frases que atravessam todas as aulas.

    A checagem que justifica o arquivo é a do id reusado. Uma frase que a
    Aula 0 já ensina aparece lá com o MESMO id, porque id é a chave do
    caderno e dois ids para a mesma frase a guardariam duas vezes. O preço
    é o texto duplicado — então o texto é conferido, e editar um lado só
    quebra o build em vez de deixar o site se contradizendo em silêncio.
    """

    def setUp(self):
        v.errors.clear()
        v.warnings.clear()

    AULAS = {
        'lezione-00.json': {
            'id': '00',
            'chunks': [{'id': 'l00-c03', 'it': 'Puoi ripetere?', 'pt': 'Pode repetir?'}],
        },
    }

    def base(self, **kw):
        d = {
            'titolo': 'T',
            'chunks': [
                {'id': 'fr-c01', 'it': 'Non ho capito.', 'pt': 'Não entendi.',
                 'category': 'ESPRESSIONE', 'chunkType': 'fixed'},
            ],
            'gruppi': [
                {'id': 'g1', 'titolo': 'G', 'spiegazione': ['por quê'],
                 'funzioni': [{'id': 'fr-f01', 'quando': 'Q', 'gloss': 'g',
                               'chunks': ['fr-c01']}]},
            ],
        }
        d.update(kw)
        return d

    def check(self, d):
        v.errors.clear()
        v.check_frasi(d, self.AULAS)
        return v.errors

    def test_arquivo_minimo_passa(self):
        self.assertEqual(self.check(self.base()), [])

    def test_id_reusado_com_texto_identico_passa(self):
        d = self.base()
        d['chunks'].append({'id': 'l00-c03', 'it': 'Puoi ripetere?', 'pt': 'Pode repetir?',
                            'category': 'ESPRESSIONE', 'chunkType': 'fixed'})
        d['gruppi'][0]['funzioni'][0]['chunks'].append('l00-c03')
        self.assertEqual(self.check(d), [])

    def test_id_reusado_com_texto_divergente_e_erro(self):
        # É o cenário que o arquivo existe para impedir: alguém edita a
        # frase na Aula 0 e o frasi.json passa a mostrar outra coisa.
        d = self.base()
        d['chunks'].append({'id': 'l00-c03', 'it': 'Puoi ripetere, per favore?',
                            'pt': 'Pode repetir?', 'category': 'ESPRESSIONE',
                            'chunkType': 'fixed'})
        d['gruppi'][0]['funzioni'][0]['chunks'].append('l00-c03')
        self.assertIn('diverge', self.check(d)[0])

    def test_id_novo_fora_do_prefixo_e_erro(self):
        # Sem o prefixo, um id inventado aqui pode colidir com o de uma
        # aula que ainda nem foi escrita — e id colidido mistura progresso.
        d = self.base()
        d['chunks'][0]['id'] = 'l09-c01'
        d['gruppi'][0]['funzioni'][0]['chunks'] = ['l09-c01']
        self.assertIn('fr-', self.check(d)[0])

    def test_funzione_apontando_para_chunk_inexistente(self):
        d = self.base()
        d['gruppi'][0]['funzioni'][0]['chunks'] = ['fantasma']
        self.assertTrue(any('fantasma' in e for e in self.check(d)))

    def test_chunk_fora_de_toda_funzione_e_erro(self):
        # A página só desenha o que alguma funzione referencia.
        d = self.base()
        d['chunks'].append({'id': 'fr-c99', 'it': 'Ciao.', 'pt': 'Oi.',
                            'category': 'ESPRESSIONE', 'chunkType': 'fixed'})
        self.assertTrue(any('fr-c99' in e for e in self.check(d)))

    def test_grupo_sem_spiegazione_e_erro(self):
        d = self.base()
        d['gruppi'][0]['spiegazione'] = []
        self.assertTrue(any('spiegazione' in e for e in self.check(d)))

    def test_it_desbalanceada_na_spiegazione_e_erro(self):
        d = self.base()
        d['gruppi'][0]['spiegazione'] = ['diga <it>ciao']
        self.assertTrue(any('desbalanceada' in e for e in self.check(d)))

    def test_fora_do_lexico_cumulativo(self):
        # Se as frases de sobrevivência alimentassem o léxico, um diálogo
        # poderia usá-las sem disparar o aviso de escopo do i+1.
        self.assertIn('frasi.json', v.NAO_LEZIONE)


class TestConteudoReal(unittest.TestCase):
    """O conteúdo versionado passa no próprio validador."""

    def test_dados_derivados_estao_em_dia(self):
        # Se este teste falha, rode `python tools/validate.py --fix`.
        v.errors.clear()
        v.warnings.clear()
        self.assertEqual(v.main([]), 0, '\n'.join(v.errors))


if __name__ == '__main__':
    unittest.main(verbosity=2)
