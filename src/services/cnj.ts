import type { PartesNumero } from '../types.js';

/**
 * Utilitários para o número único de processo (Res. CNJ 65/2008):
 *
 *   NNNNNNN-DD.AAAA.J.TR.OOOO
 *
 *   NNNNNNN (7) sequencial por ano e origem
 *   DD      (2) dígito verificador (módulo 97 base 10 — ISO 7064)
 *   AAAA    (4) ano do ajuizamento
 *   J       (1) segmento do judiciário
 *   TR      (2) tribunal do segmento
 *   OOOO    (4) unidade de origem
 */

export const SEGMENTOS: Record<number, string> = {
  1: 'Supremo Tribunal Federal',
  2: 'Conselho Nacional de Justiça',
  3: 'Superior Tribunal de Justiça',
  4: 'Justiça Federal',
  5: 'Justiça do Trabalho',
  6: 'Justiça Eleitoral',
  7: 'Justiça Militar da União',
  8: 'Justiça Estadual',
  9: 'Justiça Militar Estadual',
};

export function somenteDigitos(valor: unknown): string {
  return String(valor ?? '').replace(/\D/g, '');
}

/** Divide o número em suas partes. Aceita com ou sem máscara. */
export function decompor(valor: unknown): PartesNumero | null {
  const n = somenteDigitos(valor);
  if (n.length !== 20) return null;
  return {
    numero: n,
    sequencial: n.slice(0, 7),
    digito: n.slice(7, 9),
    ano: n.slice(9, 13),
    segmento: n.slice(13, 14),
    tribunal: n.slice(14, 16),
    origem: n.slice(16, 20),
  };
}

/** Aplica a máscara NNNNNNN-DD.AAAA.J.TR.OOOO. */
export function formatar(valor: unknown): string {
  const p = decompor(valor);
  if (!p) return String(valor ?? '');
  return `${p.sequencial}-${p.digito}.${p.ano}.${p.segmento}.${p.tribunal}.${p.origem}`;
}

/**
 * Calcula o dígito verificador esperado (módulo 97 base 10).
 * O resto é obtido sobre sequencial+ano+segmento+tribunal+origem concatenado de "00".
 */
export function digitoVerificador(valor: unknown): string | null {
  const p = decompor(valor);
  if (!p) return null;
  const base = `${p.sequencial}${p.ano}${p.segmento}${p.tribunal}${p.origem}00`;
  let resto = 0;
  for (const ch of base) resto = (resto * 10 + Number(ch)) % 97;
  return String(98 - resto).padStart(2, '0');
}

export interface Validacao {
  valido: boolean;
  erro?: string;
  digitoEsperado?: string;
  numeroCorrigido?: string;
  partes?: PartesNumero;
}

/** Verifica comprimento e dígito verificador. */
export function validar(valor: unknown): Validacao {
  const p = decompor(valor);
  if (!p) {
    const n = somenteDigitos(valor);
    return {
      valido: false,
      erro: `O número precisa ter exatamente 20 dígitos no padrão CNJ; foram informados ${n.length}.`,
    };
  }
  const esperado = digitoVerificador(p.numero)!;
  if (esperado !== p.digito) {
    const corrigido = p.sequencial + esperado + p.numero.slice(9);
    return {
      valido: false,
      erro: `Dígito verificador inválido: informado ${p.digito}, esperado ${esperado}.`,
      digitoEsperado: esperado,
      numeroCorrigido: formatar(corrigido),
      partes: p,
    };
  }
  return { valido: true, partes: p };
}

export function nomeSegmento(codigo: string | number): string {
  return SEGMENTOS[Number(codigo)] ?? 'Segmento desconhecido';
}
