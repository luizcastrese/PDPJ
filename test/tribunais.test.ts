import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  TRIBUNAIS,
  buscarTribunal,
  tribunalPeloNumero,
  endpointBusca,
} from '../src/services/tribunais.js';
import { decompor } from '../src/services/cnj.js';

test('cobre os 91 tribunais com índice na API pública', () => {
  // 4 superiores + 6 TRFs + 24 TRTs + 27 TREs + 27 TJs + 3 militares estaduais
  assert.equal(TRIBUNAIS.length, 91);
  const aliases = new Set(TRIBUNAIS.map((t) => t.alias));
  assert.equal(aliases.size, TRIBUNAIS.length, 'não pode haver alias repetido');
});

test('deduz o tribunal a partir do número CNJ', () => {
  const casos: [string, string][] = [
    ['1000123-69.2023.8.26.0100', 'tjsp'],
    ['0801234-49.2018.8.19.0001', 'tjrj'],
    ['5001234-08.2021.4.03.6100', 'trf3'],
    ['0010123-81.2019.5.02.0011', 'trt2'],
    ['0000123-72.2022.3.00.0000', 'stj'],
  ];
  for (const [numero, alias] of casos) {
    const t = tribunalPeloNumero(decompor(numero));
    assert.equal(t?.alias, alias, `${numero} deveria apontar para ${alias}`);
  }
});

test('mapeia corretamente os códigos estaduais que costumam ser confundidos', () => {
  const porCodigo = (codigo: string) =>
    TRIBUNAIS.find((t) => t.segmento === 8 && t.codigo === codigo)?.sigla;
  assert.equal(porCodigo('11'), 'TJMT');
  assert.equal(porCodigo('12'), 'TJMS');
  assert.equal(porCodigo('24'), 'TJSC');
  assert.equal(porCodigo('25'), 'TJSE');
  assert.equal(porCodigo('26'), 'TJSP');
  assert.equal(porCodigo('07'), 'TJDFT');
});

test('busca por alias e por sigla, sem diferenciar maiúsculas', () => {
  assert.equal(buscarTribunal('tjsp')?.sigla, 'TJSP');
  assert.equal(buscarTribunal('TJSP')?.alias, 'tjsp');
  assert.equal(buscarTribunal('TRE-SP')?.alias, 'tre-sp');
  assert.equal(buscarTribunal('inexistente'), null);
  assert.equal(buscarTribunal(null), null);
});

test('monta o endpoint de busca do índice público', () => {
  assert.equal(
    endpointBusca('https://api-publica.datajud.cnj.jus.br/', 'tjsp'),
    'https://api-publica.datajud.cnj.jus.br/api_publica_tjsp/_search',
  );
});
