import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

import {
  ConsultarProcessoInput,
  AnalisarProcessoInput,
  ListarMovimentosInput,
} from '../schemas/index.js';
import { resolverProcesso } from '../services/resolver.js';
import { analiseMarkdown, movimentosMarkdown, data } from '../services/formato.js';
import { CATEGORIAS } from '../services/analise.js';
import { comTratamento, responder, SOMENTE_LEITURA } from './comum.js';
import type { Movimento } from '../types.js';

/** Texto normalizado (minúsculo, sem acentos) para filtros. */
function normalizar(texto: string): string {
  return texto
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

/** Campos garantidos na saída; looseObject permite os extras por ferramenta. */
const saidaProcesso = z.looseObject({
  numero: z.string(),
  tribunal: z.string(),
  situacao: z.string(),
  total_instancias: z.number(),
  instancias: z.array(z.unknown()),
});

export function registrarFerramentasProcesso(server: McpServer): void {
  /* ------------------------- pdpj_consultar_processo ---------------------- */

  server.registerTool(
    'pdpj_consultar_processo',
    {
      title: 'Consultar processo no DataJud',
      description: `Consulta um processo judicial pelo número único CNJ na API Pública do DataJud (PDPJ/CNJ) e retorna seus metadados e movimentações.

O tribunal é deduzido automaticamente do próprio número (segmento e código do tribunal), sem necessidade de informá-lo. Um mesmo número pode retornar mais de um registro quando o processo tramitou em graus diferentes; todos são devolvidos.

Args:
  - numero (string): número CNJ com ou sem máscara.
  - tribunal (string, opcional): alias para sobrepor a dedução automática (ex.: "tjsp", "trf3").
  - incluir_movimentos (boolean): inclui as movimentações (padrão: true).
  - max_movimentos (number): quantos movimentos mais recentes trazer (padrão: 30).
  - ignorar_digito (boolean): consulta mesmo com dígito verificador inconsistente (padrão: false).
  - response_format ('markdown' | 'json'): formato da resposta (padrão: 'markdown').

Retorna: identificação do processo (classe, assuntos, órgão julgador, grau, sistema, sigilo, datas) e a lista de movimentos mais recentes.

Use quando: o pedido é "consultar", "puxar", "ver os dados" ou "ver o andamento" de um processo.
Não use quando: o pedido é uma leitura interpretativa (prazo parado, situação, gargalos) — nesse caso use pdpj_analisar_processo. Para percorrer o histórico completo ou filtrar movimentos, use pdpj_listar_movimentos.

Erros comuns: número com dígito verificador inválido (a mensagem sugere o número corrigido); processo inexistente na base pública (segredo de justiça ou ainda não enviado pelo tribunal ao CNJ).`,
      inputSchema: ConsultarProcessoInput,
      outputSchema: saidaProcesso,
      annotations: SOMENTE_LEITURA,
    },
    comTratamento(async (args) => {
      const r = await resolverProcesso(args.numero, args.tribunal, args.ignorar_digito);

      const blocos: string[] = [];
      const instancias = r.instancias.map((a) => {
        const movs = args.incluir_movimentos
          ? a.movimentos.slice(-args.max_movimentos)
          : [];
        blocos.push(
          analiseMarkdown(a, args.incluir_movimentos ? movs : undefined).split('\n## Métricas')[0],
        );
        if (args.incluir_movimentos) {
          blocos.push(
            movimentosMarkdown(
              movs,
              `## Movimentações (${movs.length} de ${a.movimentos.length})`,
            ).join('\n'),
          );
        }
        return {
          grau: a.processo.grau,
          processo: a.processo,
          situacao: a.situacao,
          total_movimentos: a.movimentos.length,
          movimentos: movs,
        };
      });

      const dados = {
        numero: r.instancias[0].processo.numeroFormatado,
        tribunal: r.tribunal.sigla,
        situacao: r.instancias[0].situacao.rotulo,
        total_instancias: r.instancias.length,
        instancias,
        do_cache: r.doCache,
      };

      const cabecalho =
        r.instancias.length > 1
          ? `_${r.instancias.length} registros encontrados no ${r.tribunal.sigla} para este número (graus distintos)._\n`
          : '';

      return responder(args.response_format, cabecalho + blocos.join('\n\n'), dados);
    }),
  );

  /* -------------------------- pdpj_analisar_processo ---------------------- */

  server.registerTool(
    'pdpj_analisar_processo',
    {
      title: 'Analisar processo (diagnóstico completo)',
      description: `Consulta o processo no DataJud e devolve uma análise processual completa a partir dos metadados públicos: situação inferida, métricas de tempo, marcos, distribuição de movimentos e pontos de atenção.

O que a análise calcula:
  - Situação inferida (em tramitação, movimentação lenta, parado há mais de um ano, suspenso, transitado em julgado, baixado).
  - Tempo total de tramitação, tempo desde o último movimento e maior intervalo sem andamento.
  - Tempo do ajuizamento até a sentença e da sentença até o trânsito em julgado, quando esses marcos existem.
  - Intervalo médio entre movimentos e movimentos por ano.
  - Contagem de movimentos por categoria (recursos, audiências, decisões, perícias, execução etc.) e por ano.
  - Alertas objetivos: paralisação prolongada, sigilo, litigiosidade recursal, defasagem da base do DataJud.

Args:
  - numero (string): número CNJ com ou sem máscara.
  - tribunal (string, opcional): alias para sobrepor a dedução automática.
  - incluir_movimentos (boolean): anexa as movimentações ao relatório (padrão: false).
  - ignorar_digito (boolean): consulta mesmo com dígito verificador inconsistente (padrão: false).
  - response_format ('markdown' | 'json'): formato da resposta (padrão: 'markdown').

Use quando: o pedido é "analisar", "fazer um diagnóstico", "o processo está parado?", "quanto tempo levou até a sentença", "resumir a situação".
Não use quando: basta o dado cru (use pdpj_consultar_processo) ou o histórico de movimentos filtrado (use pdpj_listar_movimentos).

Importante: a situação é inferida do texto dos movimentos da Tabela Processual Unificada do CNJ, não é um campo oficial de status. O DataJud contém apenas metadados públicos — nunca o teor das peças.`,
      inputSchema: AnalisarProcessoInput,
      outputSchema: saidaProcesso,
      annotations: SOMENTE_LEITURA,
    },
    comTratamento(async (args) => {
      const r = await resolverProcesso(args.numero, args.tribunal, args.ignorar_digito);

      const markdown = r.instancias
        .map((a) =>
          analiseMarkdown(a, args.incluir_movimentos ? a.movimentos.slice(-30) : undefined),
        )
        .join('\n\n---\n\n');

      const dados = {
        numero: r.instancias[0].processo.numeroFormatado,
        tribunal: r.tribunal.sigla,
        situacao: r.instancias[0].situacao.rotulo,
        total_instancias: r.instancias.length,
        instancias: r.instancias.map((a) => ({
          grau: a.processo.grau,
          processo: a.processo,
          situacao: a.situacao,
          metricas: a.metricas,
          marcos: a.marcos,
          por_categoria: a.porCategoria,
          por_ano: a.porAno,
          alertas: a.alertas,
          ...(args.incluir_movimentos ? { movimentos: a.movimentos } : {}),
        })),
        do_cache: r.doCache,
      };

      return responder(args.response_format, markdown, dados);
    }),
  );

  /* -------------------------- pdpj_listar_movimentos ---------------------- */

  server.registerTool(
    'pdpj_listar_movimentos',
    {
      title: 'Listar movimentações do processo',
      description: `Lista a linha do tempo de um processo com filtros e paginação. Útil quando o histórico é longo demais para vir inteiro na consulta.

Filtros disponíveis:
  - categoria: ${CATEGORIAS.map((c) => c.id).join(', ')}.
  - contem: texto livre buscado no nome do movimento (ignora acentos e maiúsculas).
  - de / ate: recorte por período (AAAA-MM-DD).

Args:
  - numero (string): número CNJ com ou sem máscara.
  - tribunal (string, opcional): alias para sobrepor a dedução automática.
  - categoria, contem, de, ate: filtros acima, todos opcionais e combináveis.
  - ordem ('recentes' | 'antigos'): ordenação (padrão: 'recentes').
  - limit (number), offset (number): paginação (padrão: 25 itens).
  - response_format ('markdown' | 'json'): formato da resposta (padrão: 'markdown').

Retorna: total de movimentos do processo, total após os filtros, a página pedida e os campos de paginação (has_more, next_offset). Cada movimento traz data, código da TPU, nome, categoria, dias desde o movimento anterior e complementos tabelados.

Use quando: o pedido é "todas as movimentações", "quando houve a audiência", "o que aconteceu em 2024", "buscar penhora no histórico".`,
      inputSchema: ListarMovimentosInput,
      outputSchema: z.looseObject({
        numero: z.string(),
        total_movimentos: z.number(),
        total_filtrado: z.number(),
        count: z.number(),
        offset: z.number(),
        has_more: z.boolean(),
        movimentos: z.array(z.unknown()),
      }),
      annotations: SOMENTE_LEITURA,
    },
    comTratamento(async (args) => {
      const r = await resolverProcesso(args.numero, args.tribunal, args.ignorar_digito);
      const analise = r.instancias[0];

      let movs: Movimento[] = analise.movimentos;
      if (args.categoria) {
        const cat = normalizar(args.categoria);
        movs = movs.filter(
          (m) => m.categoria === cat || normalizar(m.categoriaRotulo).includes(cat),
        );
      }
      if (args.contem) {
        const termo = normalizar(args.contem);
        movs = movs.filter((m) => normalizar(m.nome).includes(termo));
      }
      if (args.de) movs = movs.filter((m) => m.data.slice(0, 10) >= args.de!);
      if (args.ate) movs = movs.filter((m) => m.data.slice(0, 10) <= args.ate!);

      const totalFiltrado = movs.length;
      const ordenados = args.ordem === 'recentes' ? [...movs].reverse() : movs;
      const pagina = ordenados.slice(args.offset, args.offset + args.limit);
      const hasMore = args.offset + pagina.length < totalFiltrado;

      const dados = {
        numero: analise.processo.numeroFormatado,
        tribunal: r.tribunal.sigla,
        total_movimentos: analise.movimentos.length,
        total_filtrado: totalFiltrado,
        count: pagina.length,
        offset: args.offset,
        has_more: hasMore,
        ...(hasMore ? { next_offset: args.offset + pagina.length } : {}),
        movimentos: pagina,
      };

      const titulo = `## Movimentações de ${analise.processo.numeroFormatado} (${pagina.length} de ${totalFiltrado}${totalFiltrado !== analise.movimentos.length ? `, filtrados de ${analise.movimentos.length}` : ''})`;
      // A listagem já vem ordenada; movimentosMarkdown inverte, então desfazemos aqui.
      const linhas = movimentosMarkdown([...pagina].reverse(), titulo);
      if (hasMore) {
        linhas.push('', `_Mais resultados disponíveis: repita com offset=${args.offset + pagina.length}._`);
      }
      const rodape = analise.processo.dataUltimaAtualizacao
        ? `\n\n_Base atualizada em ${data(analise.processo.dataUltimaAtualizacao)}._`
        : '';

      return responder(args.response_format, linhas.join('\n') + rodape, dados);
    }),
  );
}
