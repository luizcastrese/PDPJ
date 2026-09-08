import { config } from '../config.js';
import { ErroPdpj } from './datajud.js';
import { publicacoesDemo } from './demo.js';

/**
 * Cliente do DJEN — Diário de Justiça Eletrônico Nacional, exposto pela API
 * de comunicações do PJe (Comunica). É a fonte pública que traz o que o
 * DataJud não tem: advogados intimados, com nome e OAB, e o texto das
 * publicações, de onde saem administrador judicial, perito e afins.
 *
 * A API é aberta (sem chave). O formato dos campos varia entre versões e
 * entre tribunais — ora snake_case, ora camelCase, ora tudo minúsculo — por
 * isso a leitura abaixo é deliberadamente tolerante: cada campo é procurado
 * sob vários nomes possíveis, e o registro cru fica acessível para
 * diagnóstico quando algo não for reconhecido.
 */

/** Registro cru, como vem da API: chaves imprevisíveis. */
export type PublicacaoBruta = Record<string, unknown>;

export interface Advogado {
  nome: string;
  oab: string | null;
  uf: string | null;
}

export interface Destinatario {
  nome: string;
  polo: string | null;
}

export interface Publicacao {
  id: string | null;
  numeroProcesso: string | null;
  dataDisponibilizacao: string | null;
  tribunal: string | null;
  orgao: string | null;
  tipoComunicacao: string | null;
  classe: string | null;
  meio: string | null;
  link: string | null;
  texto: string;
  advogados: Advogado[];
  destinatarios: Destinatario[];
  bruto?: PublicacaoBruta;
}

export interface RespostaPublicacoes {
  total: number;
  publicacoes: Publicacao[];
  bruto: PublicacaoBruta | null;
}

/* --------------------------- leitura tolerante --------------------------- */

/** Busca a primeira chave presente, comparando sem diferenciar caixa. */
function campo(obj: Record<string, unknown>, ...nomes: string[]): unknown {
  const mapa = new Map(Object.keys(obj).map((k) => [k.toLowerCase(), k]));
  for (const nome of nomes) {
    const real = mapa.get(nome.toLowerCase());
    if (real !== undefined && obj[real] !== null && obj[real] !== undefined) {
      return obj[real];
    }
  }
  return undefined;
}

function texto(valor: unknown): string | null {
  if (valor === null || valor === undefined) return null;
  const s = String(valor).trim();
  return s ? s : null;
}

function lista(valor: unknown): Record<string, unknown>[] {
  return Array.isArray(valor)
    ? valor.filter((x): x is Record<string, unknown> => typeof x === 'object' && x !== null)
    : [];
}

/** Remove marcação HTML que às vezes acompanha o corpo da publicação. */
function limparTexto(valor: unknown): string {
  return String(valor ?? '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/**
 * Extrai os advogados de um registro. Eles podem vir em `destinatarioadvogados`
 * (cada item com um objeto `advogado` aninhado) ou já achatados em `advogados`.
 */
function lerAdvogados(item: Record<string, unknown>): Advogado[] {
  const cru = lista(
    campo(item, 'destinatarioadvogados', 'destinatarioAdvogados', 'advogados', 'advogado'),
  );

  const advogados: Advogado[] = [];
  for (const entrada of cru) {
    const alvo =
      typeof entrada.advogado === 'object' && entrada.advogado !== null
        ? (entrada.advogado as Record<string, unknown>)
        : entrada;

    const nome = texto(campo(alvo, 'nome', 'nomeAdvogado', 'nome_advogado'));
    if (!nome) continue;

    advogados.push({
      nome,
      oab: texto(campo(alvo, 'numero_oab', 'numeroOab', 'oab', 'numeroInscricao')),
      uf: texto(campo(alvo, 'uf_oab', 'ufOab', 'uf', 'seccional')),
    });
  }
  return deduplicarAdvogados(advogados);
}

function lerDestinatarios(item: Record<string, unknown>): Destinatario[] {
  return lista(campo(item, 'destinatarios', 'destinatario', 'partes'))
    .map((d) => ({
      nome: texto(campo(d, 'nome', 'nomeParte', 'nome_parte')) ?? '',
      polo: texto(campo(d, 'polo', 'tipoPolo', 'poloParte')),
    }))
    .filter((d) => d.nome);
}

/** Uma pessoa aparece em várias publicações; a chave é nome + OAB. */
export function deduplicarAdvogados(advogados: Advogado[]): Advogado[] {
  const mapa = new Map<string, Advogado>();
  for (const a of advogados) {
    const chave = `${a.nome.toLowerCase()}|${a.oab ?? ''}|${a.uf ?? ''}`;
    if (!mapa.has(chave)) mapa.set(chave, a);
  }
  return [...mapa.values()];
}

function normalizarPublicacao(item: Record<string, unknown>, incluirBruto: boolean): Publicacao {
  return {
    id: texto(campo(item, 'id', 'numeroComunicacao', 'hash')),
    numeroProcesso: texto(
      campo(item, 'numero_processo', 'numeroProcesso', 'numeroprocessocommascara'),
    ),
    dataDisponibilizacao: texto(
      campo(item, 'data_disponibilizacao', 'dataDisponibilizacao', 'datadisponibilizacao'),
    ),
    tribunal: texto(campo(item, 'siglaTribunal', 'sigla_tribunal', 'tribunal')),
    orgao: texto(campo(item, 'nomeOrgao', 'nome_orgao', 'orgao', 'orgaoJulgador')),
    tipoComunicacao: texto(campo(item, 'tipoComunicacao', 'tipo_comunicacao', 'tipoDocumento')),
    classe: texto(campo(item, 'nomeClasse', 'nome_classe', 'classe')),
    meio: texto(campo(item, 'meiocompleto', 'meioCompleto', 'meio')),
    link: texto(campo(item, 'link', 'url')),
    texto: limparTexto(campo(item, 'texto', 'conteudo', 'textoComunicacao')),
    advogados: lerAdvogados(item),
    destinatarios: lerDestinatarios(item),
    ...(incluirBruto ? { bruto: item } : {}),
  };
}

/* -------------------------------- consulta ------------------------------- */

export interface FiltrosDjen {
  numeroProcesso?: string;
  tribunal?: string;
  oab?: string;
  ufOab?: string;
  nomeAdvogado?: string;
  nomeParte?: string;
  de?: string;
  ate?: string;
  pagina: number;
  itensPorPagina: number;
  incluirBruto?: boolean;
}

/** Consulta as comunicações do DJEN com os filtros informados. */
export async function buscarPublicacoes(
  filtros: FiltrosDjen,
): Promise<RespostaPublicacoes> {
  if (config.demo) {
    const itens = publicacoesDemo();
    return {
      total: itens.length,
      publicacoes: itens.map((i) => normalizarPublicacao(i, Boolean(filtros.incluirBruto))),
      bruto: filtros.incluirBruto ? (itens[0] ?? null) : null,
    };
  }

  const params = new URLSearchParams();
  if (filtros.numeroProcesso) params.set('numeroProcesso', filtros.numeroProcesso);
  if (filtros.tribunal) params.set('siglaTribunal', filtros.tribunal.toUpperCase());
  if (filtros.oab) params.set('numeroOab', filtros.oab);
  if (filtros.ufOab) params.set('ufOab', filtros.ufOab.toUpperCase());
  if (filtros.nomeAdvogado) params.set('nomeAdvogado', filtros.nomeAdvogado);
  if (filtros.nomeParte) params.set('nomeParte', filtros.nomeParte);
  if (filtros.de) params.set('dataDisponibilizacaoInicio', filtros.de);
  if (filtros.ate) params.set('dataDisponibilizacaoFim', filtros.ate);
  params.set('pagina', String(filtros.pagina));
  params.set('itensPorPagina', String(filtros.itensPorPagina));

  const url = `${config.djenUrl.replace(/\/+$/, '')}/api/v1/comunicacao?${params}`;
  const controlador = new AbortController();
  const timer = setTimeout(() => controlador.abort(), config.timeoutMs);

  let resposta: Response;
  try {
    resposta = await fetch(url, {
      headers: { Accept: 'application/json' },
      signal: controlador.signal,
    });
  } catch (erro) {
    const e = erro as Error;
    if (e.name === 'AbortError') {
      throw new ErroPdpj(
        `O DJEN não respondeu em ${config.timeoutMs / 1000}s.`,
        ['Tente novamente ou aumente PDPJ_TIMEOUT.'],
      );
    }
    throw new ErroPdpj(`Falha de rede ao contatar o DJEN: ${e.message}`, [
      `Verifique se este ambiente alcança ${config.djenUrl} (proxy, firewall ou VPN podem bloquear).`,
      'Para inspecionar as ferramentas sem rede, defina PDPJ_DEMO=1.',
    ]);
  } finally {
    clearTimeout(timer);
  }

  const corpoTexto = await resposta.text();

  if (!resposta.ok) {
    const trecho = corpoTexto.slice(0, 300).replace(/\s+/g, ' ').trim();
    if (resposta.status === 403 || resposta.status === 407) {
      throw new ErroPdpj(`Acesso negado ao DJEN (HTTP ${resposta.status}).`, [
        `A recusa pode vir de um proxy ou firewall entre esta máquina e ${config.djenUrl}, não do serviço.`,
        ...(trecho ? [`Resposta recebida: ${trecho}`] : []),
      ]);
    }
    if (resposta.status === 429) {
      throw new ErroPdpj('O DJEN aplicou limite de requisições (HTTP 429).', [
        'Aguarde alguns instantes antes de repetir a consulta.',
      ]);
    }
    throw new ErroPdpj(`O DJEN respondeu HTTP ${resposta.status}.`, [
      ...(trecho ? [`Resposta recebida: ${trecho}`] : []),
    ]);
  }

  let corpo: unknown;
  try {
    corpo = corpoTexto ? JSON.parse(corpoTexto) : {};
  } catch {
    throw new ErroPdpj('O DJEN respondeu com conteúdo que não é JSON.', [
      'Isso costuma indicar resposta de um proxy intermediário, e não do serviço.',
      `Trecho recebido: ${corpoTexto.slice(0, 200).replace(/\s+/g, ' ').trim()}`,
    ]);
  }

  const raiz = (corpo ?? {}) as Record<string, unknown>;
  const itens = lista(campo(raiz, 'items', 'itens', 'content', 'data', 'comunicacoes'));
  const total = Number(campo(raiz, 'count', 'total', 'totalElements') ?? itens.length);

  return {
    total: Number.isFinite(total) ? total : itens.length,
    publicacoes: itens.map((i) => normalizarPublicacao(i, Boolean(filtros.incluirBruto))),
    bruto: filtros.incluirBruto ? (itens[0] ?? null) : null,
  };
}
