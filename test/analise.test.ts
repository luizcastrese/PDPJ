import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  analisarProcesso,
  classificar,
  humanizarDias,
  prepararMovimentos,
  resumirProcesso,
} from '../src/services/analise.js';
import { processoDemo } from '../src/services/demo.js';
import type { ProcessoBruto } from '../src/types.js';

const DIA = 86400000;
const diasAtras = (n: number) => new Date(Date.now() - n * DIA).toISOString();

test('classifica movimentos pelo nome da TPU, ignorando acentos', () => {
  assert.equal(classificar('Distribuição por sorteio').id, 'distribuicao');
  assert.equal(classificar('TRANSITO EM JULGADO').id, 'transito');
  assert.equal(classificar('Trânsito em Julgado').id, 'transito');
  assert.equal(classificar('Julgado procedente o pedido').id, 'sentenca');
  assert.equal(classificar('Interposição de Recurso de Apelação').id, 'recurso');
  assert.equal(classificar('Audiência de conciliação realizada').id, 'audiencia');
  assert.equal(classificar('Penhora online determinada').id, 'execucao');
  assert.equal(classificar('Baixa Definitiva').id, 'baixa');
  assert.equal(classificar('Movimento sem correspondência conhecida').id, 'outros');
});

test('ordena os movimentos cronologicamente e mede o intervalo entre eles', () => {
  const movs = prepararMovimentos([
    { codigo: 2, nome: 'Conclusão', dataHora: diasAtras(10) },
    { codigo: 1, nome: 'Distribuição', dataHora: diasAtras(40) },
    { codigo: 3, nome: 'Sem data', dataHora: null },
  ]);
  assert.equal(movs.length, 2, 'movimentos sem data são descartados');
  assert.equal(movs[0].nome, 'Distribuição');
  assert.equal(movs[0].diasDesdeAnterior, null);
  assert.equal(movs[1].diasDesdeAnterior, 30);
});

test('humaniza durações em anos, meses e dias', () => {
  assert.equal(humanizarDias(null), 'indisponível');
  assert.equal(humanizarDias(0), 'menos de 1 dia');
  assert.equal(humanizarDias(5), '5 dias');
  assert.equal(humanizarDias(60), '2 meses');
  assert.equal(humanizarDias(400), '1 ano e 1 mês');
});

test('analisa a fixture de demonstração e extrai marcos e métricas', () => {
  const a = analisarProcesso(processoDemo());

  assert.equal(a.processo.numeroFormatado, '1000123-69.2023.8.26.0100');
  assert.equal(a.processo.segmento, 'Justiça Estadual');
  assert.ok(a.metricas.totalMovimentos > 20);
  assert.ok(a.metricas.duracaoDias! > 900);

  // Os marcos vêm do roteiro da fixture.
  assert.ok(a.marcos.distribuicao, 'deveria identificar a distribuição');
  assert.ok(a.marcos.sentenca, 'deveria identificar a sentença');
  assert.ok(a.marcos.transito, 'deveria identificar o trânsito em julgado');
  assert.ok(a.metricas.diasAteSentenca! > 0);
  assert.ok(a.metricas.recursos >= 2, 'apelação e embargos são movimentos recursais');

  // Distribuição por categoria e por ano devem somar o total de movimentos.
  const somaCategorias = a.porCategoria.reduce((s, c) => s + c.total, 0);
  const somaAnos = a.porAno.reduce((s, x) => s + x.total, 0);
  assert.equal(somaCategorias, a.metricas.totalMovimentos);
  assert.equal(somaAnos, a.metricas.totalMovimentos);
});

test('infere "em tramitação" quando há movimento recente', () => {
  const a = analisarProcesso(processoDemo());
  assert.equal(a.situacao.id, 'tramitando');
});

test('infere paralisação quando o último movimento é antigo', () => {
  const bruto: ProcessoBruto = {
    numeroProcesso: '10001236920238260100',
    dataAjuizamento: diasAtras(1500),
    movimentos: [
      { codigo: 26, nome: 'Distribuição por sorteio', dataHora: diasAtras(1500) },
      { codigo: 60, nome: 'Expedição de Citação', dataHora: diasAtras(800) },
    ],
  };
  const a = analisarProcesso(bruto);
  assert.equal(a.situacao.id, 'parado');
  assert.equal(a.situacao.tom, 'risco');
  assert.ok(a.alertas.some((x) => x.tom === 'risco'));
});

test('infere baixa definitiva e a desfaz após desarquivamento', () => {
  const base: ProcessoBruto = {
    numeroProcesso: '10001236920238260100',
    dataAjuizamento: diasAtras(500),
    movimentos: [
      { codigo: 26, nome: 'Distribuição por sorteio', dataHora: diasAtras(500) },
      { codigo: 848, nome: 'Baixa Definitiva', dataHora: diasAtras(60) },
    ],
  };
  assert.equal(analisarProcesso(base).situacao.id, 'baixado');

  const comDesarquivamento: ProcessoBruto = {
    ...base,
    movimentos: [
      ...base.movimentos!,
      { codigo: 893, nome: 'Desarquivamento dos autos', dataHora: diasAtras(20) },
    ],
  };
  assert.notEqual(analisarProcesso(comDesarquivamento).situacao.id, 'baixado');
});

test('trata processo sem movimentos sem quebrar', () => {
  const a = analisarProcesso({
    numeroProcesso: '10001236920238260100',
    dataAjuizamento: diasAtras(30),
    movimentos: [],
  });
  assert.equal(a.situacao.id, 'sem_movimentos');
  assert.equal(a.metricas.totalMovimentos, 0);
  assert.equal(a.metricas.diasSemMovimento, null);
  assert.ok(a.alertas.length > 0);
});

test('sinaliza processo sigiloso', () => {
  const a = analisarProcesso({
    numeroProcesso: '10001236920238260100',
    nivelSigilo: 2,
    dataAjuizamento: diasAtras(30),
    movimentos: [{ codigo: 26, nome: 'Distribuição', dataHora: diasAtras(30) }],
  });
  assert.ok(a.alertas.some((x) => /sigilo/i.test(x.texto)));
});

test('resume um processo para listagens', () => {
  const r = resumirProcesso(processoDemo());
  assert.equal(r.numeroFormatado, '1000123-69.2023.8.26.0100');
  assert.equal(r.classe, 'Procedimento Comum Cível');
  assert.equal(r.assunto, 'Indenização por Dano Moral');
  assert.ok(r.totalMovimentos > 20);
  assert.ok(r.ultimoMovimento);
});
