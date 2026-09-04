import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  validar,
  decompor,
  formatar,
  digitoVerificador,
  somenteDigitos,
  nomeSegmento,
} from '../src/services/cnj.js';

/**
 * Dígitos verificadores calculados à parte pelo módulo 97 base 10
 * (ISO 7064), para servirem de referência independente.
 */
const VALIDOS = [
  '1000123-69.2023.8.26.0100',
  '0000001-78.2020.8.26.0100',
  '5001234-08.2021.4.03.6100',
  '0010123-81.2019.5.02.0011',
  '0000123-72.2022.3.00.0000',
  '0801234-49.2018.8.19.0001',
];

test('aceita números com dígito verificador correto', () => {
  for (const numero of VALIDOS) {
    assert.equal(validar(numero).valido, true, `${numero} deveria ser válido`);
  }
});

test('aceita o número sem máscara e com máscara indistintamente', () => {
  const comMascara = '1000123-69.2023.8.26.0100';
  const semMascara = '10001236920238260100';
  assert.equal(somenteDigitos(comMascara), semMascara);
  assert.equal(validar(semMascara).valido, true);
  assert.equal(formatar(semMascara), comMascara);
});

test('rejeita dígito verificador incorreto e sugere o número consistente', () => {
  const r = validar('1000123-45.2023.8.26.0100');
  assert.equal(r.valido, false);
  assert.equal(r.digitoEsperado, '69');
  assert.equal(r.numeroCorrigido, '1000123-69.2023.8.26.0100');
});

test('rejeita número com quantidade de dígitos diferente de 20', () => {
  const r = validar('123456');
  assert.equal(r.valido, false);
  assert.match(r.erro!, /20 dígitos/);
});

test('decompõe o número nos campos da Resolução CNJ 65/2008', () => {
  const p = decompor('1000123-69.2023.8.26.0100');
  assert.deepEqual(p, {
    numero: '10001236920238260100',
    sequencial: '1000123',
    digito: '69',
    ano: '2023',
    segmento: '8',
    tribunal: '26',
    origem: '0100',
  });
});

test('calcula o dígito verificador esperado', () => {
  assert.equal(digitoVerificador('10001230020238260100'), '69');
  assert.equal(digitoVerificador('curto'), null);
});

test('nomeia os segmentos do judiciário', () => {
  assert.equal(nomeSegmento('8'), 'Justiça Estadual');
  assert.equal(nomeSegmento(4), 'Justiça Federal');
  assert.match(nomeSegmento(0), /desconhecido/);
});
