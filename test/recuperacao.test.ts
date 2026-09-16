import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  calcularStay,
  deduzirFase,
  escolherEdital,
  extrairAtivos,
  extrairCredores,
  extrairMarcos,
  extrairMotivos,
  fatoresLegais,
  lerValor,
  moeda,
} from '../src/services/recuperacao.js';
import { lerData, prepararMovimentos } from '../src/services/analise.js';
import { data } from '../src/services/formato.js';
import {
  processoRecuperacaoDemo,
  publicacoesRecuperacaoDemo,
} from '../src/services/demo.js';
import type { Publicacao } from '../src/services/djen.js';
import type { Movimento } from '../src/types.js';

const DIA = 86400000;
const diasAtras = (n: number) => new Date(Date.now() - n * DIA).toISOString();

/** Monta uma publicação mínima a partir de um texto, como o DJEN entregaria. */
function publicacao(texto: string, extras: Partial<Publicacao> = {}): Publicacao {
  return {
    id: 'p1',
    numeroProcesso: '10055447420228260100',
    dataDisponibilizacao: '2024-03-01',
    tribunal: 'TJSP',
    orgao: '1ª Vara de Falências',
    tipoComunicacao: 'Edital',
    classe: 'Recuperação Judicial',
    meio: 'DJEN',
    link: null,
    texto,
    advogados: [],
    destinatarios: [],
    ...extras,
  };
}

const movimentosDemo = (): Movimento[] =>
  prepararMovimentos(processoRecuperacaoDemo().movimentos);

/* ------------------------------ valores ---------------------------------- */

test('lê valores em reais no formato brasileiro', () => {
  assert.equal(lerValor('1.234.567,89'), 1234567.89);
  assert.equal(lerValor('48.320,15'), 48320.15);
  assert.equal(lerValor('900'), 900);
  assert.equal(lerValor('12,5'), 12.5);
  assert.equal(lerValor('1.2.3'), null, 'agrupamento inválido não vira número');
  assert.equal(lerValor('abc'), null);
});

test('formata moeda sem depender do ICU do ambiente', () => {
  assert.equal(moeda(1234567.89), 'R$ 1.234.567,89');
  assert.equal(moeda(0), 'R$ 0,00');
  assert.equal(moeda(null), '—');
});

/* ------------------------------- marcos ---------------------------------- */

test('reconhece os marcos da Lei 11.101/2005 nos nomes dos movimentos', () => {
  const marcos = extrairMarcos(movimentosDemo());
  const ids = marcos.map((m) => m.id);

  for (const esperado of [
    'constatacao_previa',
    'deferimento',
    'nomeacao_aj',
    'apresentacao_plano',
    'habilitacao',
    'impugnacao',
    'prorrogacao_stay',
    'assembleia',
    'aprovacao_plano',
    'concessao',
    'alienacao_ativo',
    'quadro_geral',
  ]) {
    assert.ok(ids.includes(esperado), `marco ausente: ${esperado}`);
  }

  assert.equal(
    marcos.find((m) => m.id === 'assembleia')?.ocorrencias,
    2,
    'designada e realizada contam como duas ocorrências do mesmo marco',
  );
  assert.ok(
    marcos.every((m, i) => i === 0 || marcos[i - 1].data <= m.data),
    'marcos saem em ordem cronológica',
  );
});

test('"concessão da recuperação" não é lida como mero processamento', () => {
  const movs = prepararMovimentos([
    { codigo: 1, nome: 'Concessão da recuperação judicial', dataHora: diasAtras(10) },
  ]);
  assert.equal(extrairMarcos(movs)[0].id, 'concessao');
});

test('convolação em falência prevalece sobre os demais marcos', () => {
  const movs = prepararMovimentos([
    { codigo: 1, nome: 'Deferimento do processamento da recuperação judicial', dataHora: diasAtras(400) },
    { codigo: 2, nome: 'Concessão da recuperação judicial', dataHora: diasAtras(200) },
    { codigo: 3, nome: 'Convolação da recuperação judicial em falência', dataHora: diasAtras(10) },
  ]);
  assert.equal(deduzirFase(extrairMarcos(movs)).id, 'falencia');
});

test('sem deferimento, a fase é o pedido em análise', () => {
  const movs = prepararMovimentos([
    { codigo: 1, nome: 'Distribuição por sorteio', dataHora: diasAtras(30) },
  ]);
  const fase = deduzirFase(extrairMarcos(movs));
  assert.equal(fase.id, 'pedido');
  assert.equal(fase.desde, null);
});

/* ----------------------------- stay period -------------------------------- */

test('stay period conta 180 dias do deferimento e 360 com prorrogação', () => {
  const base = prepararMovimentos([
    { codigo: 1, nome: 'Deferimento do processamento da recuperação judicial', dataHora: diasAtras(100) },
  ]);
  const simples = calcularStay(extrairMarcos(base));
  assert.equal(simples?.diasTotais, 180);
  assert.equal(simples?.prorrogado, false);
  assert.equal(simples?.vigente, true);
  assert.ok(simples && simples.diasRestantes > 70 && simples.diasRestantes <= 80);

  const comProrrogacao = prepararMovimentos([
    ...(base.map((m) => ({ codigo: m.codigo, nome: m.nome, dataHora: m.data })) as never[]),
    { codigo: 2, nome: 'Prorrogação do prazo de suspensão das ações e execuções', dataHora: diasAtras(20) },
  ]);
  const prorrogado = calcularStay(extrairMarcos(comProrrogacao));
  assert.equal(prorrogado?.diasTotais, 360);
  assert.equal(prorrogado?.prorrogado, true);
});

test('sem deferimento não há stay period a calcular', () => {
  assert.equal(calcularStay([]), null);
});

/* ------------------------------- motivos ---------------------------------- */

test('classifica as causas da crise citadas no edital', () => {
  const motivos = extrairMotivos(
    publicacoesRecuperacaoDemo().map((p) => publicacao(String(p.texto))),
  );
  const causas = new Set(motivos.map((m) => m.causa));

  for (const esperada of ['pandemia', 'queda_receita', 'endividamento', 'inadimplencia', 'custos']) {
    assert.ok(causas.has(esperada), `causa não identificada: ${esperada}`);
  }
  assert.ok(
    motivos.every((m) => m.trecho.length > 20),
    'todo indício carrega o trecho de origem',
  );
});

/* ------------------------------- credores --------------------------------- */

test('lê a relação de credores do edital, separada pelas classes do art. 41', () => {
  const pubs = publicacoesRecuperacaoDemo().map((p) => publicacao(String(p.texto)));
  const edital = escolherEdital(pubs);
  assert.ok(edital, 'o edital é escolhido entre as publicações');

  const relacao = extrairCredores(edital);
  assert.equal(relacao.totalCredores, 10);

  const porId = new Map(relacao.classes.map((c) => [c.id, c]));
  assert.equal(porId.get('i_trabalhista')?.total, 3);
  assert.equal(porId.get('ii_garantia_real')?.total, 2);
  assert.equal(porId.get('iii_quirografario')?.total, 3);
  assert.equal(porId.get('iv_me_epp')?.total, 2);

  assert.equal(porId.get('ii_garantia_real')?.soma, 6070500);
  assert.equal(relacao.somaGeral, 9449133.82);

  const primeiro = porId.get('i_trabalhista')?.credores[0];
  assert.equal(primeiro?.nome, 'ANTONIO PEREIRA DA SILVA');
  assert.equal(primeiro?.documento, '123.456.789-00');
  assert.equal(primeiro?.valor, 48320.15);

  const banco = porId.get('ii_garantia_real')?.credores[0];
  assert.equal(banco?.nome, 'BANCO INDUSTRIAL DO SUDESTE S.A.', 'o ponto de "S.A." é preservado');
  assert.equal(banco?.documento, '60.111.222/0001-33');
});

test('o cabeçalho da classe não vira o nome do primeiro credor', () => {
  const relacao = extrairCredores(
    publicacao('CLASSE III — QUIROGRAFÁRIOS: 1) FORNECEDORA ALFA LTDA — R$ 10.000,00.'),
  );
  assert.equal(relacao.classes[0].credores[0].nome, 'FORNECEDORA ALFA LTDA');
});

test('identifica de qual edital veio a relação pelo cabeçalho, não por citação de passagem', () => {
  const art52 = extrairCredores(
    publicacao(
      'EDITAL — art. 52, §1º, da Lei 11.101/2005. Relação de credores. CLASSE I: FULANO DE TAL — R$ 1.000,00. ' +
        'Os credores têm o prazo do art. 7º, §1º, para habilitações.',
    ),
  );
  assert.match(art52.fonte.fundamento, /art\. 52/);

  const art7 = extrairCredores(
    publicacao('EDITAL — art. 7º, §2º. CLASSE I: FULANO DE TAL — R$ 1.000,00.'),
  );
  assert.match(art7.fonte.fundamento, /administrador judicial/);

  const qgc = extrairCredores(
    publicacao('QUADRO GERAL DE CREDORES. CLASSE I: FULANO DE TAL — R$ 1.000,00.'),
  );
  assert.match(qgc.fonte.fundamento, /Quadro geral/);
});

test('valores sem nome legível são contados à parte, e não viram credor inventado', () => {
  const relacao = extrairCredores(
    publicacao('CLASSE I: FULANO DE TAL — R$ 1.000,00. TOTAL DA CLASSE: R$ 1.000,00.'),
  );
  assert.equal(relacao.totalCredores, 1);
  assert.equal(relacao.valoresNaoAtribuidos, 1);
  assert.ok(relacao.avisos.some((a) => /sem um nome legível/.test(a)));
});

test('texto sem par nome → valor devolve relação vazia com aviso, não erro', () => {
  const relacao = extrairCredores(
    publicacao('Fica a relação de credores disponível na secretaria, conforme anexo.'),
  );
  assert.equal(relacao.totalCredores, 0);
  assert.ok(relacao.avisos.length > 0);
});

test('publicação que não é edital não é escolhida como fonte de credores', () => {
  assert.equal(
    escolherEdital([publicacao('Intimação para manifestação em 5 dias.')]),
    null,
  );
});

/* -------------------------------- ativos ---------------------------------- */

test('separa gravames fora do concurso, garantia real e constrição', () => {
  const pubs = publicacoesRecuperacaoDemo().map((p) => publicacao(String(p.texto)));
  const ativos = extrairAtivos(pubs, movimentosDemo(), []);

  const tipos = new Map(ativos.gravados.map((g) => [g.tipo, g]));

  assert.equal(tipos.get('alienacao_fiduciaria')?.submeteASeRj, false);
  assert.equal(tipos.get('cessao_fiduciaria')?.submeteASeRj, false);
  assert.equal(tipos.get('arrendamento')?.submeteASeRj, false);
  assert.equal(tipos.get('hipoteca')?.submeteASeRj, true);
  assert.equal(tipos.get('hipoteca')?.natureza, 'garantia_real');
  assert.equal(tipos.get('penhora')?.natureza, 'constricao');
});

test('lê o bem antes do gravame e o titular depois dele', () => {
  const ativos = extrairAtivos(
    [
      publicacao(
        'Anoto que o galpão industrial da matriz, objeto da matrícula nº 145.332 do 8º CRI, ' +
          'encontra-se gravado por hipoteca em favor do Banco Industrial do Sudeste S.A.',
      ),
    ],
    [],
    [],
  );
  const hipoteca = ativos.gravados.find((g) => g.tipo === 'hipoteca');
  assert.equal(hipoteca?.bem, 'o galpão industrial da matriz');
  assert.equal(hipoteca?.credor, 'Banco Industrial do Sudeste S.A.');
});

test('quando a redação põe o objeto adiante, o bem é lido adiante', () => {
  const ativos = extrairAtivos(
    [publicacao('Comunique-se a penhora do imóvel da filial, para as providências cabíveis.')],
    [],
    [],
  );
  assert.equal(ativos.gravados[0].bem, 'imóvel da filial');
});

test('"livres e desembaraçados" e "sem ônus" na mesma frase são um só registro', () => {
  const ativos = extrairAtivos(
    [
      publicacao(
        'Permanecem livres e desembaraçados o imóvel da Rua Aurora, nº 512, ' +
          'e o terreno da matrícula nº 98.771, ambos sem qualquer ônus real averbado.',
      ),
    ],
    [],
    [],
  );
  assert.equal(ativos.livres.length, 1);
  assert.match(ativos.livres[0].bem ?? '', /im[óo]vel da Rua Aurora/);
});

test('o levantamento de ativos sempre sai com a ressalva de que não é inventário', () => {
  const ativos = extrairAtivos([], [], []);
  assert.ok(ativos.avisos.some((a) => /não um inventário patrimonial/.test(a)));
  assert.ok(ativos.avisos.some((a) => /ausência de gravame/.test(a)));
});

/* ---------------------------- fatores legais ------------------------------ */

test('aponta o crédito fora do concurso como fator de risco', () => {
  const movs = movimentosDemo();
  const marcos = extrairMarcos(movs);
  const ativos = extrairAtivos(
    publicacoesRecuperacaoDemo().map((p) => publicacao(String(p.texto))),
    movs,
    [],
  );
  const fatores = fatoresLegais(deduzirFase(marcos), marcos, calcularStay(marcos), ativos, null);

  const foraDoConcurso = fatores.find((f) => /fora do concurso/i.test(f.titulo));
  assert.ok(foraDoConcurso, 'o art. 49, §3º é sinalizado');
  assert.equal(foraDoConcurso?.tom, 'risco');
  assert.match(foraDoConcurso?.base ?? '', /49/);
});

test('plano não apresentado 60 dias após o deferimento vira alerta do art. 53', () => {
  const movs = prepararMovimentos([
    { codigo: 1, nome: 'Deferimento do processamento da recuperação judicial', dataHora: diasAtras(120) },
  ]);
  const marcos = extrairMarcos(movs);
  const fatores = fatoresLegais(deduzirFase(marcos), marcos, calcularStay(marcos), null, null);
  assert.ok(fatores.some((f) => /Plano não localizado/.test(f.titulo) && f.base.includes('53')));
});

test('sem marcos, ainda assim sai um fator explicando o vazio', () => {
  const fatores = fatoresLegais(deduzirFase([]), [], null, null, null);
  assert.equal(fatores.length, 1);
  assert.match(fatores[0].texto, /carga incompleta/);
});

/* ------------------------- formatos reais do DataJud ---------------------- */

test('lê tanto a data ISO quanto o carimbo compacto do DataJud', () => {
  const compacta = lerData('20170816013642');
  assert.equal(compacta?.toISOString(), '2017-08-16T01:36:42.000Z');

  const soDia = lerData('20170816');
  assert.equal(soDia?.toISOString(), '2017-08-16T00:00:00.000Z');

  const iso = lerData('2017-08-16T02:02:12.000Z');
  assert.equal(iso?.toISOString(), '2017-08-16T02:02:12.000Z');

  assert.equal(lerData(null), null);
  assert.equal(lerData('nem data nem carimbo'), null);
});

test('a data de ajuizamento compacta é formatada, e não devolvida crua', () => {
  assert.equal(data('20170816013642'), '16/08/2017');
});
