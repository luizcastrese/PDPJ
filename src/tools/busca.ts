import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

import { BuscarProcessosInput, ConsultaAvancadaInput } from '../schemas/index.js';
import { buscarPorFiltros, consultar, ErroPdpj } from '../services/datajud.js';
import { buscarTribunal } from '../services/tribunais.js';
import { resumirProcesso } from '../services/analise.js';
import { resumosMarkdown } from '../services/formato.js';
import { comTratamento, responder, SOMENTE_LEITURA } from './comum.js';

function exigirTribunal(alias: string) {
  const t = buscarTribunal(alias);
  if (!t) {
    throw new ErroPdpj(`Tribunal desconhecido: "${alias}".`, [
      'Use pdpj_listar_tribunais para ver os aliases aceitos (ex.: tjsp, trf3, trt2, stj).',
    ]);
  }
  return t;
}

export function registrarFerramentasBusca(server: McpServer): void {
  /* --------------------------- pdpj_buscar_processos ---------------------- */

  server.registerTool(
    'pdpj_buscar_processos',
    {
      title: 'Buscar processos por filtros',
      description: `Busca processos em um tribunal por classe, assunto, órgão julgador, grau e período de ajuizamento. Retorna uma lista resumida, com paginação.

O tribunal é obrigatório: no DataJud cada tribunal é um índice separado, não existe busca nacional em uma única chamada. Para varrer vários tribunais, chame a ferramenta uma vez por tribunal.

Classe e assunto aceitam o código numérico da Tabela Processual Unificada (busca exata) ou um texto (busca por correspondência no nome). O texto é casado pelo Elasticsearch, então termos parciais funcionam.

Args:
  - tribunal (string): alias ou sigla do tribunal (obrigatório).
  - classe (string, opcional): código ou nome da classe processual.
  - assunto (string, opcional): código ou nome do assunto.
  - orgao_julgador (string, opcional): nome do órgão julgador.
  - grau (string, opcional): grau de jurisdição (ex.: "G1", "G2", "JE").
  - ajuizado_de / ajuizado_ate (string, opcional): período de ajuizamento (AAAA-MM-DD).
  - ordenar_por ('dataAjuizamento' | 'dataHoraUltimaAtualizacao'), ordem ('asc' | 'desc').
  - limit (number), offset (number): paginação (padrão: 25 itens).
  - response_format ('markdown' | 'json'): formato da resposta (padrão: 'markdown').

Retorna: total de processos que casam com os filtros, a página pedida (número, classe, assunto, órgão, grau, ajuizamento, quantidade de movimentos, data do último movimento) e os campos has_more / next_offset.

Use quando: o pedido é levantar um conjunto de processos ("execuções fiscais ajuizadas em 2023 no TJSP", "processos da 5ª Vara Cível").
Não use quando: já se tem o número do processo — use pdpj_consultar_processo ou pdpj_analisar_processo.`,
      inputSchema: BuscarProcessosInput,
      outputSchema: z.looseObject({
        tribunal: z.string(),
        total: z.number(),
        count: z.number(),
        offset: z.number(),
        has_more: z.boolean(),
        processos: z.array(z.unknown()),
      }),
      annotations: SOMENTE_LEITURA,
    },
    comTratamento(async (args) => {
      const tribunal = exigirTribunal(args.tribunal);
      const r = await buscarPorFiltros(tribunal.alias, {
        classe: args.classe,
        assunto: args.assunto,
        orgao: args.orgao_julgador,
        grau: args.grau,
        ajuizadoDe: args.ajuizado_de,
        ajuizadoAte: args.ajuizado_ate,
        limit: args.limit,
        offset: args.offset,
        ordenarPor: args.ordenar_por,
        ordem: args.ordem,
      });

      const itens = r.registros.map(resumirProcesso);
      const hasMore = r.total > args.offset + itens.length;

      const dados = {
        tribunal: tribunal.sigla,
        total: r.total,
        count: itens.length,
        offset: args.offset,
        has_more: hasMore,
        ...(hasMore ? { next_offset: args.offset + itens.length } : {}),
        processos: itens,
      };

      const filtrosUsados = [
        args.classe && `classe: ${args.classe}`,
        args.assunto && `assunto: ${args.assunto}`,
        args.orgao_julgador && `órgão: ${args.orgao_julgador}`,
        args.grau && `grau: ${args.grau}`,
        args.ajuizado_de && `ajuizado de: ${args.ajuizado_de}`,
        args.ajuizado_ate && `ajuizado até: ${args.ajuizado_ate}`,
      ].filter(Boolean);

      const markdown = [
        `# Busca no ${tribunal.sigla}`,
        '',
        filtrosUsados.length ? `Filtros — ${filtrosUsados.join(' · ')}` : 'Sem filtros (amostra do índice).',
        '',
        `${r.total} processo(s) no total; exibindo ${itens.length} a partir do item ${args.offset + 1}.`,
        '',
        resumosMarkdown(itens),
        ...(hasMore
          ? ['', `_Mais resultados disponíveis: repita com offset=${args.offset + itens.length}._`]
          : []),
      ].join('\n');

      return responder(args.response_format, markdown, dados);
    }),
  );

  /* --------------------------- pdpj_consulta_avancada --------------------- */

  server.registerTool(
    'pdpj_consulta_avancada',
    {
      title: 'Consulta Elasticsearch avançada',
      description: `Executa uma query Elasticsearch arbitrária no índice público de um tribunal. É a saída de emergência para consultas que os filtros de pdpj_buscar_processos não cobrem (agregações não são retornadas: apenas documentos).

A API do DataJud expõe um índice Elasticsearch por tribunal, com estes campos principais: numeroProcesso, classe.codigo, classe.nome, assuntos.codigo, assuntos.nome, orgaoJulgador.codigo, orgaoJulgador.nome, orgaoJulgador.codigoMunicipioIBGE, grau, tribunal, dataAjuizamento, dataHoraUltimaAtualizacao, nivelSigilo, formato.nome, sistema.nome, movimentos.codigo, movimentos.nome, movimentos.dataHora.

Args:
  - tribunal (string): alias ou sigla do tribunal (obrigatório).
  - query (object): a cláusula "query" do Elasticsearch. Ex.: {"bool":{"must":[{"match":{"classe.nome":"Execução Fiscal"}}],"filter":[{"range":{"dataAjuizamento":{"gte":"2023-01-01"}}}]}}.
  - size (number), from (number): paginação (padrão: 25 e 0).
  - sort (array, opcional): cláusula "sort". Ex.: [{"dataAjuizamento":{"order":"desc"}}].
  - response_format ('markdown' | 'json'): formato da resposta (padrão: 'markdown').

Use quando: for preciso combinar cláusulas que as outras ferramentas não expõem (nested em movimentos, term em códigos IBGE, múltiplos should).
Não use quando: pdpj_buscar_processos já resolve — ela é mais simples e menos sujeita a erro de sintaxe.`,
      inputSchema: ConsultaAvancadaInput,
      outputSchema: z.looseObject({
        tribunal: z.string(),
        total: z.number(),
        count: z.number(),
        from: z.number(),
        processos: z.array(z.unknown()),
      }),
      annotations: SOMENTE_LEITURA,
    },
    comTratamento(async (args) => {
      const tribunal = exigirTribunal(args.tribunal);
      const corpo: Record<string, unknown> = {
        size: args.size,
        from: args.from,
        query: args.query,
      };
      if (args.sort) corpo.sort = args.sort;

      const r = await consultar(tribunal.alias, corpo);
      const itens = r.registros.map(resumirProcesso);

      const dados = {
        tribunal: tribunal.sigla,
        total: r.total,
        count: itens.length,
        from: args.from,
        has_more: r.total > args.from + itens.length,
        processos: itens,
      };

      const markdown = [
        `# Consulta avançada no ${tribunal.sigla}`,
        '',
        `${r.total} documento(s) no total; exibindo ${itens.length}.`,
        '',
        resumosMarkdown(itens),
      ].join('\n');

      return responder(args.response_format, markdown, dados);
    }),
  );
}
