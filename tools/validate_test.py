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
    """A pseudo-tag <it> falha em silêncio no render, então o validador é a
    única rede: uma tag torta não quebra a página, só deixa a forma muda."""

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


class TestConteudoReal(unittest.TestCase):
    """O conteúdo versionado passa no próprio validador."""

    def test_dados_derivados_estao_em_dia(self):
        # Se este teste falha, rode `python tools/validate.py --fix`.
        v.errors.clear()
        v.warnings.clear()
        self.assertEqual(v.main([]), 0, '\n'.join(v.errors))


if __name__ == '__main__':
    unittest.main(verbosity=2)
