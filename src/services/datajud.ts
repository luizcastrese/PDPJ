import { config } from '../config.js';
import { endpointBusca, buscarTribunal } from './tribunais.js';
import { processoDemo } from './demo.js';
import type { ProcessoBruto, RespostaConsulta } from '../types.js';

/** Erro de negócio/integração com mensagem já pronta para o agente. */
export class ErroPdpj extends Error {
  readonly sugestoes: string[];

  constructor(mensagem: string, sugestoes: string[] = []) {
    super(mensagem);
    this.name = 'ErroPdpj';
    this.sugestoes = sugestoes;
  }
}

/* --------------------------------- cache --------------------------------- */

interface ItemCache {
  valor: RespostaConsulta;
  expira: number;
}

const cache = new Map<string, ItemCache>();

function cacheGet(chave: string): RespostaConsulta | null {
  if (config.cacheTtlMs <= 0) return null;
  const item = cache.get(chave);
  if (!item) return null;
  if (Date.now() > item.expira) {
    cache.delete(chave);
    return null;
  }
  return item.valor;
}

function cacheSet(chave: string, valor: RespostaConsulta): void {
  if (config.cacheTtlMs <= 0) return;
  if (cache.size > 200) cache.clear();
  cache.set(chave, { valor, expira: Date.now() + config.cacheTtlMs });
}

export function limparCache(): void {
  cache.clear();
}

export function tamanhoCache(): number {
  return cache.size;
}

/* ------------------------------ chamada base ----------------------------- */

interface RespostaElastic {
  hits?: {
    total?: { value?: number };
    hits?: { _source: ProcessoBruto }[];
  };
  error?: unknown;
}

/**
 * Executa uma query Elasticsearch no índice público de um tribunal.
 * @param alias alias do endpoint (ex.: "tjsp")
 * @param query corpo da consulta (DSL do Elasticsearch)
 */
export async function consultar(
  alias: string,
  query: Record<string, unknown>,
): Promise<RespostaConsulta> {
  const tribunal = buscarTribunal(alias);
  if (!tribunal) {
    throw new ErroPdpj(`Tribunal desconhecido: "${alias}".`, [
      'Use a ferramenta pdpj_listar_tribunais para ver os aliases válidos.',
    ]);
  }

  // Modo demonstração: responde com a fixture local, sem tocar a rede.
  if (config.demo) {
    return {
      tribunal,
      total: 1,
      registros: [processoDemo()],
      cache: false,
    };
  }

  const chaveCache = `${tribunal.alias}:${JSON.stringify(query)}`;
  const emCache = cacheGet(chaveCache);
  if (emCache) return { ...emCache, cache: true };

  const url = endpointBusca(config.baseUrl, tribunal.alias);
  const controlador = new AbortController();
  const timer = setTimeout(() => controlador.abort(), config.timeoutMs);

  let resposta: Response;
  try {
    resposta = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `APIKey ${config.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(query),
      signal: controlador.signal,
    });
  } catch (erro) {
    const e = erro as Error;
    if (e.name === 'AbortError') {
      throw new ErroPdpj(
        `A API do DataJud não respondeu em ${config.timeoutMs / 1000}s ao consultar o ${tribunal.sigla}.`,
        [
          'Tente novamente: a API pública do CNJ costuma oscilar.',
          'Aumente o tempo limite com a variável de ambiente PDPJ_TIMEOUT (em milissegundos).',
        ],
      );
    }
    throw new ErroPdpj(
      `Falha de rede ao contatar a API do DataJud (${tribunal.sigla}): ${e.message}`,
      [
        `Verifique se este ambiente alcança ${config.baseUrl} (proxy, firewall ou VPN podem bloquear).`,
        'Para inspecionar o servidor sem rede, defina PDPJ_DEMO=1 e use os dados de demonstração.',
      ],
    );
  } finally {
    clearTimeout(timer);
  }

  const texto = await resposta.text();

  if (!resposta.ok) {
    const trecho = texto.slice(0, 300).replace(/\s+/g, ' ').trim();
    if (resposta.status === 401) {
      throw new ErroPdpj('A API do DataJud recusou a chave de acesso (HTTP 401).', [
        'Confira a variável de ambiente PDPJ_API_KEY.',
        'A chave pública do CNJ está documentada em https://datajud-wiki.cnj.jus.br/api-publica/acesso',
      ]);
    }
    if (resposta.status === 403 || resposta.status === 407) {
      throw new ErroPdpj(
        `Acesso negado ao consultar o ${tribunal.sigla} (HTTP ${resposta.status}).`,
        [
          'Se houver proxy, firewall ou VPN entre esta máquina e o CNJ, a recusa pode vir dele, não da API: confirme que este ambiente alcança ' +
            config.baseUrl +
            '.',
          'Se o acesso à rede estiver correto, verifique a chave em PDPJ_API_KEY.',
          'Para inspecionar o servidor sem rede, defina PDPJ_DEMO=1.',
          ...(trecho ? [`Resposta recebida: ${trecho}`] : []),
        ],
      );
    }
    if (resposta.status === 429) {
      throw new ErroPdpj('A API do DataJud aplicou limite de requisições (HTTP 429).', [
        'Aguarde alguns instantes antes de repetir a consulta.',
      ]);
    }
    throw new ErroPdpj(
      `A API do DataJud respondeu HTTP ${resposta.status} para o ${tribunal.sigla}.`,
      [
        ...(trecho ? [`Resposta recebida: ${trecho}`] : []),
        'Repita a consulta; se persistir, o serviço do CNJ pode estar indisponível.',
      ],
    );
  }

  let corpo: RespostaElastic;
  try {
    corpo = texto ? (JSON.parse(texto) as RespostaElastic) : {};
  } catch {
    throw new ErroPdpj(
      `A API do DataJud respondeu HTTP ${resposta.status}, mas o conteúdo não é JSON.`,
      [
        'Isso costuma indicar que a resposta veio de um proxy ou portal intermediário, e não do CNJ.',
        `Trecho recebido: ${texto.slice(0, 200).replace(/\s+/g, ' ').trim()}`,
      ],
    );
  }

  const resultado: RespostaConsulta = {
    tribunal,
    total: corpo.hits?.total?.value ?? 0,
    registros: (corpo.hits?.hits ?? []).map((h) => h._source),
    cache: false,
  };
  cacheSet(chaveCache, resultado);
  return resultado;
}

/* ------------------------------- consultas ------------------------------- */

/** Busca um processo pelo número CNJ (20 dígitos, sem máscara). */
export function buscarProcesso(
  alias: string,
  numero: string,
): Promise<RespostaConsulta> {
  return consultar(alias, {
    size: 10,
    query: { match: { numeroProcesso: numero } },
  });
}

export interface Filtros {
  classe?: string;
  assunto?: string;
  orgao?: string;
  grau?: string;
  ajuizadoDe?: string;
  ajuizadoAte?: string;
  limit: number;
  offset: number;
  ordenarPor?: 'dataAjuizamento' | 'dataHoraUltimaAtualizacao';
  ordem?: 'asc' | 'desc';
}

/** Monta e executa uma busca por filtros combinados. */
export function buscarPorFiltros(
  alias: string,
  filtros: Filtros,
): Promise<RespostaConsulta> {
  const must: Record<string, unknown>[] = [];
  const filter: Record<string, unknown>[] = [];

  const termoOuTexto = (
    valor: string,
    campoCodigo: string,
    campoNome: string,
  ): Record<string, unknown> => {
    const n = Number(valor);
    return Number.isInteger(n) && valor.trim() === String(n)
      ? { term: { [campoCodigo]: n } }
      : { match: { [campoNome]: valor } };
  };

  if (filtros.classe) {
    must.push(termoOuTexto(filtros.classe, 'classe.codigo', 'classe.nome'));
  }
  if (filtros.assunto) {
    must.push(termoOuTexto(filtros.assunto, 'assuntos.codigo', 'assuntos.nome'));
  }
  if (filtros.orgao) {
    must.push({ match: { 'orgaoJulgador.nome': filtros.orgao } });
  }
  if (filtros.grau) {
    filter.push({ term: { grau: filtros.grau.toUpperCase() } });
  }
  if (filtros.ajuizadoDe || filtros.ajuizadoAte) {
    const range: Record<string, string> = {};
    if (filtros.ajuizadoDe) range.gte = filtros.ajuizadoDe;
    if (filtros.ajuizadoAte) range.lte = filtros.ajuizadoAte;
    filter.push({ range: { dataAjuizamento: range } });
  }

  const campoOrdem = filtros.ordenarPor ?? 'dataAjuizamento';

  return consultar(alias, {
    size: filtros.limit,
    from: filtros.offset,
    query:
      must.length || filter.length ? { bool: { must, filter } } : { match_all: {} },
    sort: [{ [campoOrdem]: { order: filtros.ordem ?? 'desc' } }],
  });
}
