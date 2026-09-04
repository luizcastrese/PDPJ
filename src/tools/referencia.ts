import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

import { ValidarNumeroInput, ListarTribunaisInput, FormatoResposta } from '../schemas/index.js';
import { validar, decompor, formatar, nomeSegmento, somenteDigitos } from '../services/cnj.js';
import { TRIBUNAIS, tribunalPeloNumero } from '../services/tribunais.js';
import { config } from '../config.js';
import { tamanhoCache } from '../services/datajud.js';
import { comTratamento, responder, SOMENTE_LEITURA } from './comum.js';

function normalizar(texto: string): string {
  return texto
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

export function registrarFerramentasReferencia(server: McpServer): void {
  /* ---------------------------- pdpj_validar_numero ----------------------- */

  server.registerTool(
    'pdpj_validar_numero',
    {
      title: 'Validar número CNJ',
      description: `Valida e decompõe um número único de processo (Resolução CNJ 65/2008) sem consultar a API: confere o dígito verificador pelo módulo 97 base 10 e identifica o tribunal competente.

Retorna o número formatado, cada campo do padrão NNNNNNN-DD.AAAA.J.TR.OOOO, o segmento do judiciário, o tribunal correspondente e — quando o dígito não confere — o número que seria consistente.

Args:
  - numero (string): número a validar, com ou sem máscara.
  - response_format ('markdown' | 'json'): formato da resposta (padrão: 'markdown').

Use quando: for preciso conferir um número antes de consultar, descobrir de que tribunal ele é, ou explicar por que uma consulta falhou.
Esta ferramenta é offline: não faz nenhuma chamada de rede.`,
      inputSchema: ValidarNumeroInput,
      outputSchema: z.looseObject({
        valido: z.boolean(),
        numero_formatado: z.string(),
        tribunal: z.string().nullable(),
        partes: z.record(z.string(), z.unknown()).nullable(),
      }),
      annotations: { ...SOMENTE_LEITURA, openWorldHint: false },
    },
    comTratamento(async (args) => {
      const v = validar(args.numero);
      const partes = v.partes ?? decompor(args.numero);
      const tribunal = partes ? tribunalPeloNumero(partes) : null;
      const digitos = somenteDigitos(args.numero);

      const dados = {
        valido: v.valido,
        numero_formatado: formatar(digitos),
        numero_limpo: digitos,
        tribunal: tribunal ? tribunal.sigla : null,
        tribunal_alias: tribunal ? tribunal.alias : null,
        segmento: partes ? nomeSegmento(partes.segmento) : null,
        partes: partes
          ? {
              sequencial: partes.sequencial,
              digito_verificador: partes.digito,
              ano: partes.ano,
              segmento: partes.segmento,
              codigo_tribunal: partes.tribunal,
              unidade_origem: partes.origem,
            }
          : null,
        ...(v.valido ? {} : { erro: v.erro, numero_corrigido: v.numeroCorrigido ?? null }),
      };

      const linhas = [
        `# ${v.valido ? '✅' : '❌'} ${dados.numero_formatado}`,
        '',
        v.valido
          ? 'Número válido: o dígito verificador confere.'
          : `Número inválido: ${v.erro}${v.numeroCorrigido ? ` O número consistente seria **${v.numeroCorrigido}**.` : ''}`,
      ];
      if (partes) {
        linhas.push(
          '',
          '## Decomposição',
          `- **Sequencial**: ${partes.sequencial}`,
          `- **Dígito verificador**: ${partes.digito}`,
          `- **Ano de ajuizamento**: ${partes.ano}`,
          `- **Segmento (J)**: ${partes.segmento} — ${nomeSegmento(partes.segmento)}`,
          `- **Tribunal (TR)**: ${partes.tribunal}${tribunal ? ` — ${tribunal.sigla} (${tribunal.nome}), alias \`${tribunal.alias}\`` : ' — sem índice na API pública'}`,
          `- **Unidade de origem**: ${partes.origem}`,
        );
      }

      return responder(args.response_format, linhas.join('\n'), dados);
    }),
  );

  /* --------------------------- pdpj_listar_tribunais ---------------------- */

  server.registerTool(
    'pdpj_listar_tribunais',
    {
      title: 'Listar tribunais disponíveis',
      description: `Lista os tribunais cobertos pela API Pública do DataJud e o alias de endpoint de cada um, opcionalmente filtrados por texto ou segmento do judiciário.

São 91 tribunais: STJ, TST, TSE, STM, os 6 TRFs, os 24 TRTs, os 27 TREs, os 27 TJs e os 3 tribunais de justiça militar estadual. O STF e o CNJ não têm índice público no DataJud.

Args:
  - filtro (string, opcional): texto casado contra sigla, nome ou alias (ex.: "trt", "são paulo", "federal").
  - segmento (number, opcional): 3 STJ, 4 Justiça Federal, 5 Trabalho, 6 Eleitoral, 7 Militar da União, 8 Estadual, 9 Militar Estadual.
  - response_format ('markdown' | 'json'): formato da resposta (padrão: 'markdown').

Use quando: for preciso descobrir o alias de um tribunal para as demais ferramentas, ou quando a dedução automática pelo número falhar.
Esta ferramenta é offline: não faz nenhuma chamada de rede.`,
      inputSchema: ListarTribunaisInput,
      outputSchema: z.looseObject({
        total: z.number(),
        tribunais: z.array(z.unknown()),
      }),
      annotations: { ...SOMENTE_LEITURA, openWorldHint: false },
    },
    comTratamento(async (args) => {
      let lista = TRIBUNAIS;
      if (args.segmento !== undefined) {
        lista = lista.filter((t) => t.segmento === args.segmento);
      }
      if (args.filtro) {
        const f = normalizar(args.filtro);
        lista = lista.filter(
          (t) =>
            normalizar(t.sigla).includes(f) ||
            normalizar(t.nome).includes(f) ||
            normalizar(t.alias).includes(f),
        );
      }

      const dados = {
        total: lista.length,
        tribunais: lista.map((t) => ({
          alias: t.alias,
          sigla: t.sigla,
          nome: t.nome,
          grupo: t.grupo,
          segmento: t.segmento,
          codigo_cnj: `${t.segmento}.${t.codigo}`,
        })),
      };

      const grupos = new Map<string, typeof lista>();
      for (const t of lista) {
        if (!grupos.has(t.grupo)) grupos.set(t.grupo, []);
        grupos.get(t.grupo)!.push(t);
      }

      const linhas = [`# Tribunais na API Pública do DataJud (${lista.length})`];
      for (const [grupo, itens] of grupos) {
        linhas.push('', `## ${grupo}`);
        for (const t of itens) {
          linhas.push(`- \`${t.alias}\` — **${t.sigla}**: ${t.nome} (código CNJ ${t.segmento}.${t.codigo})`);
        }
      }
      if (!lista.length) {
        linhas.push('', '_Nenhum tribunal corresponde a esse filtro._');
      }

      return responder(args.response_format, linhas.join('\n'), dados);
    }),
  );

  /* -------------------------------- pdpj_status --------------------------- */

  server.registerTool(
    'pdpj_status',
    {
      title: 'Status da configuração do servidor',
      description: `Mostra como este servidor MCP está configurado para falar com a API Pública do DataJud: endereço base, origem da chave de acesso, tempo limite, cache e se o modo de demonstração está ligado.

A chave em si nunca é exibida — apenas se veio da variável de ambiente PDPJ_API_KEY ou se está sendo usada a chave pública divulgada pelo CNJ.

Args:
  - response_format ('markdown' | 'json'): formato da resposta (padrão: 'markdown').

Use quando: uma consulta falhar e for preciso separar problema de configuração de problema de dado, ou para confirmar se as respostas estão vindo da API real ou do modo de demonstração.
Esta ferramenta é offline: não faz nenhuma chamada de rede.`,
      inputSchema: { response_format: FormatoResposta },
      outputSchema: z.looseObject({
        base_url: z.string(),
        origem_da_chave: z.string(),
        modo_demo: z.boolean(),
      }),
      annotations: { ...SOMENTE_LEITURA, openWorldHint: false },
    },
    comTratamento(async (args) => {
      const dados = {
        base_url: config.baseUrl,
        origem_da_chave: config.usandoChavePadrao
          ? 'chave pública do CNJ (padrão do servidor)'
          : 'variável de ambiente PDPJ_API_KEY',
        modo_demo: config.demo,
        timeout_ms: config.timeoutMs,
        cache_segundos: config.cacheTtlMs / 1000,
        consultas_em_cache: tamanhoCache(),
        tribunais_mapeados: TRIBUNAIS.length,
      };

      const linhas = [
        '# Status do servidor PDPJ',
        '',
        `- **API base**: ${dados.base_url}`,
        `- **Chave de acesso**: ${dados.origem_da_chave}`,
        `- **Modo demonstração**: ${dados.modo_demo ? '🟡 ligado (respostas vêm de uma fixture local, sem rede)' : 'desligado (consultas reais)'}`,
        `- **Tempo limite**: ${dados.timeout_ms} ms`,
        `- **Cache**: ${dados.cache_segundos} s (${dados.consultas_em_cache} consulta(s) em memória)`,
        `- **Tribunais mapeados**: ${dados.tribunais_mapeados}`,
      ];

      return responder(args.response_format, linhas.join('\n'), dados);
    }),
  );
}
