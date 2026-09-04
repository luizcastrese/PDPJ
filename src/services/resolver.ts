import { validar, somenteDigitos, formatar } from './cnj.js';
import { buscarTribunal, tribunalPeloNumero } from './tribunais.js';
import { buscarProcesso, ErroPdpj } from './datajud.js';
import { analisarProcesso } from './analise.js';
import type { Analise, Tribunal } from '../types.js';

export interface ProcessoResolvido {
  tribunal: Tribunal;
  tribunalDeduzido: Tribunal | null;
  digitoValido: boolean;
  totalRegistros: number;
  doCache: boolean;
  /** Uma análise por registro; um mesmo número pode existir em mais de um grau. */
  instancias: Analise[];
}

/**
 * Fluxo comum das ferramentas de processo: valida o número, descobre o
 * tribunal (pelo número ou pelo alias informado), consulta e analisa.
 *
 * @param numeroEntrada número CNJ com ou sem máscara
 * @param aliasTribunal alias/sigla para sobrepor a dedução automática
 * @param ignorarDigito segue mesmo com dígito verificador inconsistente
 */
export async function resolverProcesso(
  numeroEntrada: string,
  aliasTribunal?: string,
  ignorarDigito = false,
): Promise<ProcessoResolvido> {
  const numero = somenteDigitos(numeroEntrada);
  const verificacao = validar(numero);

  if (!verificacao.valido && !ignorarDigito) {
    const sugestoes = [
      'Confira a digitação do número.',
      ...(verificacao.numeroCorrigido
        ? [`Com este sequencial, ano e origem, o número consistente seria ${verificacao.numeroCorrigido}.`]
        : []),
      'Para consultar assim mesmo, chame novamente com ignorar_digito=true.',
    ];
    throw new ErroPdpj(
      `Número CNJ inválido (${formatar(numero) || numeroEntrada}): ${verificacao.erro}`,
      sugestoes,
    );
  }

  if (numero.length !== 20) {
    throw new ErroPdpj(
      `O número informado tem ${numero.length} dígitos; o padrão CNJ exige 20.`,
      ['Formato esperado: NNNNNNN-DD.AAAA.J.TR.OOOO'],
    );
  }

  const partes = verificacao.partes ?? null;
  const deduzido = tribunalPeloNumero(partes);
  const informado = aliasTribunal ? buscarTribunal(aliasTribunal) : null;

  if (aliasTribunal && !informado) {
    throw new ErroPdpj(`Tribunal desconhecido: "${aliasTribunal}".`, [
      'Use pdpj_listar_tribunais para ver os aliases aceitos (ex.: tjsp, trf3, trt2, stj).',
    ]);
  }

  const tribunal = informado ?? deduzido;
  if (!tribunal) {
    throw new ErroPdpj(
      `Não foi possível deduzir o tribunal a partir do número (segmento ${partes?.segmento ?? '?'}, código ${partes?.tribunal ?? '?'}).`,
      [
        'Informe o parâmetro tribunal explicitamente.',
        'O STF (segmento 1) e o CNJ (segmento 2) não têm índice na API pública do DataJud.',
      ],
    );
  }

  const resultado = await buscarProcesso(tribunal.alias, numero);

  if (!resultado.registros.length) {
    throw new ErroPdpj(
      `Processo ${formatar(numero)} não encontrado na base pública do ${tribunal.sigla}.`,
      [
        'O DataJud publica apenas metadados; processos em segredo de justiça não aparecem.',
        'Processos muito recentes podem ainda não ter sido enviados pelo tribunal ao CNJ.',
        deduzido && informado && deduzido.alias !== informado.alias
          ? `O número aponta para o ${deduzido.sigla}; tente sem informar o tribunal.`
          : 'Se o processo tramitou em outro tribunal ou grau, informe o parâmetro tribunal.',
      ],
    );
  }

  const instancias = resultado.registros
    .map(analisarProcesso)
    .sort((a, b) => String(a.processo.grau).localeCompare(String(b.processo.grau)));

  return {
    tribunal,
    tribunalDeduzido: deduzido,
    digitoValido: verificacao.valido,
    totalRegistros: resultado.total,
    doCache: resultado.cache,
    instancias,
  };
}
