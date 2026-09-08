import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  consolidarAdvogados,
  consolidarPartes,
  extrairAuxiliares,
  oabsNoTexto,
} from '../src/services/pessoas.js';
import type { Publicacao } from '../src/services/djen.js';

function pub(texto: string, extras: Partial<Publicacao> = {}): Publicacao {
  return {
    id: 'p1',
    numeroProcesso: '10001236920238260100',
    dataDisponibilizacao: '2025-03-10',
    tribunal: 'TJSP',
    orgao: '5ª Vara Cível',
    tipoComunicacao: 'Intimação',
    classe: null,
    meio: null,
    link: null,
    texto,
    advogados: [],
    destinatarios: [],
    ...extras,
  };
}

test('extrai administrador judicial nomeado no corpo da publicação', () => {
  const achados = extrairAuxiliares([
    pub('Fica intimada a parte da decisão que nomeou administrador judicial Ricardo Alves Monteiro para as providências legais.'),
  ]);
  const aj = achados.find((a) => a.papel === 'administrador_judicial');
  assert.ok(aj, 'deveria encontrar o administrador judicial');
  assert.equal(aj.nome, 'Ricardo Alves Monteiro');
  assert.match(aj.contexto, /administrador judicial/i);
});

test('reconhece administradora judicial pessoa jurídica e para no verbo seguinte', () => {
  const achados = extrairAuxiliares([
    pub('A administradora judicial Consultoria Vieira e Associados prestará contas na forma da lei.'),
  ]);
  const aj = achados.find((a) => a.papel === 'administrador_judicial');
  assert.ok(aj);
  assert.equal(aj.nome, 'Consultoria Vieira e Associados');
});

test('lê o nome quando a publicação vem toda em caixa alta', () => {
  const achados = extrairAuxiliares([
    pub('FICA INTIMADO O ADMINISTRADOR JUDICIAL RICARDO ALVES MONTEIRO PARA AS PROVIDENCIAS CABIVEIS.'),
  ]);
  const aj = achados.find((a) => a.papel === 'administrador_judicial');
  assert.ok(aj, 'caixa alta não pode impedir a leitura');
  assert.equal(aj.nome, 'RICARDO ALVES MONTEIRO');
});

test('não confunde o cargo seguido de verbo com um nome', () => {
  const achados = extrairAuxiliares([
    pub('A administradora judicial apresentou o relatório mensal previsto em lei.'),
  ]);
  assert.equal(achados.filter((a) => a.papel === 'administrador_judicial').length, 0);
});

test('extrai perito judicial', () => {
  const achados = extrairAuxiliares([
    pub('Intime-se o perito judicial Dr. Fernando Lima Castro para apresentar o laudo em 30 dias.'),
  ]);
  const perito = achados.find((a) => a.papel === 'perito');
  assert.ok(perito);
  assert.equal(perito.nome, 'Fernando Lima Castro');
});

test('não inventa auxiliar quando o texto não nomeia ninguém', () => {
  const achados = extrairAuxiliares([
    pub('Fica a parte intimada para pagamento voluntário no prazo de 15 dias, sob pena de multa de 10%.'),
  ]);
  assert.equal(achados.length, 0);
});

test('descarta captura que é texto processual, não nome', () => {
  const achados = extrairAuxiliares([
    pub('O administrador judicial deverá apresentar relatório mensal nos termos da lei.'),
  ]);
  const aj = achados.filter((a) => a.papel === 'administrador_judicial');
  assert.equal(aj.length, 0, 'deverá/nos termos não é nome de pessoa');
});

test('não repete o mesmo auxiliar citado em várias publicações', () => {
  const texto = 'Nomeado administrador judicial Ricardo Alves Monteiro nos autos.';
  const achados = extrairAuxiliares([pub(texto), pub(texto, { id: 'p2' })]);
  assert.equal(achados.filter((a) => a.papel === 'administrador_judicial').length, 1);
});

test('consolida advogados somando intimações e datas extremas', () => {
  const advogado = { nome: 'Mariana Souza Prado', oab: '214556', uf: 'SP' };
  const consolidado = consolidarAdvogados([
    pub('a', { advogados: [advogado], dataDisponibilizacao: '2025-01-10' }),
    pub('b', { advogados: [advogado], dataDisponibilizacao: '2025-06-20' }),
    pub('c', { advogados: [{ nome: 'Carlos Eduardo Nunes', oab: '98771', uf: 'SP' }] }),
  ]);

  assert.equal(consolidado.length, 2);
  assert.equal(consolidado[0].nome, 'Mariana Souza Prado', 'ordena por número de intimações');
  assert.equal(consolidado[0].intimacoes, 2);
  assert.equal(consolidado[0].primeiraIntimacao, '2025-01-10');
  assert.equal(consolidado[0].ultimaIntimacao, '2025-06-20');
});

test('consolida partes preservando o polo', () => {
  const partes = consolidarPartes([
    pub('a', { destinatarios: [{ nome: 'João Batista Ferreira', polo: null }] }),
    pub('b', { destinatarios: [{ nome: 'João Batista Ferreira', polo: 'ATIVO' }] }),
  ]);
  assert.equal(partes.length, 1);
  assert.equal(partes[0].polo, 'ATIVO', 'o polo informado depois preenche o que faltava');
});

test('coleta números de OAB citados no texto', () => {
  const oabs = oabsNoTexto([
    pub('Advogados: Mariana Souza Prado OAB/SP 214556 e Carlos Eduardo Nunes OAB/SP 98771.'),
  ]);
  assert.ok(oabs.includes('SP 214556'));
  assert.ok(oabs.includes('SP 98771'));
});
