import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

import { BuscarPublicacoesInput, IdentificarEnvolvidosInput } from '../schemas/index.js';
import { buscarPublicacoes } from '../services/djen.js';
import {
  consolidarAdvogados,
  consolidarPartes,
  extrairAuxiliares,
  oabsNoTexto,
} from '../services/pessoas.js';
import { somenteDigitos, formatar, validar } from '../services/cnj.js';
import { tribunalPeloNumero, buscarTribunal } from '../services/tribunais.js';
import { ErroPdpj } from '../services/datajud.js';
import { data } from '../services/formato.js';
import { comTratamento, responder, SOMENTE_LEITURA } from './comum.js';

/**
 * Resolve o número informado e devolve os dígitos e a sigla do tribunal
 * deduzida, aplicando a mesma validação usada nas ferramentas do DataJud.
 */
function prepararNumero(
  numero: string,
  aliasTribunal: string | undefined,
  ignorarDigito: boolean,
): { digitos: string; tribunal: string | undefined } {
  const digitos = somenteDigitos(numero);
  const v = validar(digitos);

  if (!v.valido && !ignorarDigito) {
    throw new ErroPdpj(`Número CNJ inválido (${formatar(digitos) || numero}): ${v.erro}`, [
      ...(v.numeroCorrigido ? [`O número consistente seria ${v.numeroCorrigido}.`] : []),
      'Para consultar assim mesmo, chame novamente com ignorar_digito=true.',
    ]);
  }

  const informado = aliasTribunal ? buscarTribunal(aliasTribunal) : null;
  if (aliasTribunal && !informado) {
    throw new ErroPdpj(`Tribunal desconhecido: "${aliasTribunal}".`, [
      'Use pdpj_listar_tribunais para ver as siglas aceitas.',
    ]);
  }
  const deduzido = v.partes ? tribunalPeloNumero(v.partes) : null;
  const tribunal = informado ?? deduzido;

  return { digitos, tribunal: tribunal?.sigla };
}

export function registrarFerramentasPessoas(server: McpServer): void {
  /* -------------------------- pdpj_buscar_publicacoes --------------------- */

  server.registerTool(
    'pdpj_buscar_publicacoes',
    {
      title: 'Buscar publicações no DJEN',
      description: `Busca as comunicações e intimações de um processo no DJEN (Diário de Justiça Eletrônico Nacional), a fonte pública que traz o que o DataJud não tem: os advogados intimados, com nome e número de OAB, e o corpo da publicação.

Aceita busca por processo, por advogado (OAB ou nome), por parte e por período de disponibilização. A busca por OAB é o caminho para levantar a carteira de um escritório.

Args:
  - numero (string, opcional): número CNJ do processo.
  - oab (string, opcional) + uf_oab (string, opcional): inscrição do advogado (ex.: "214556" + "SP").
  - nome_advogado (string, opcional), nome_parte (string, opcional): busca por nome.
  - tribunal (string, opcional): sigla para restringir; deduzida do número quando ele é informado.
  - de / ate (string, opcional): período de disponibilização (AAAA-MM-DD).
  - incluir_texto (boolean): traz o corpo completo de cada publicação (padrão: false, respostas ficam grandes).
  - incluir_bruto (boolean): anexa o primeiro registro cru da API, para diagnóstico (padrão: false).
  - limit (number), offset (number): paginação (padrão: 25).
  - response_format ('markdown' | 'json'): formato da resposta (padrão: 'markdown').

Retorna: total de publicações, a página pedida com data, órgão, tipo, advogados intimados (nome e OAB) e destinatários, além de has_more / next_offset.

Use quando: o pedido é "quem são os advogados do processo", "quais publicações saíram", "o que foi intimado em janeiro", "quais processos deste advogado".
Não use quando: o pedido é sobre andamento processual — para isso use pdpj_analisar_processo. Para um retrato consolidado de quem atua no processo, prefira pdpj_identificar_envolvidos.

Pelo menos um critério é obrigatório: número, OAB, nome de advogado ou nome de parte.`,
      inputSchema: BuscarPublicacoesInput,
      outputSchema: z.looseObject({
        total: z.number(),
        count: z.number(),
        offset: z.number(),
        has_more: z.boolean(),
        publicacoes: z.array(z.unknown()),
      }),
      annotations: SOMENTE_LEITURA,
    },
    comTratamento(async (args) => {
      if (!args.numero && !args.oab && !args.nome_advogado && !args.nome_parte) {
        throw new ErroPdpj('Nenhum critério de busca informado.', [
          'Informe ao menos um: numero, oab (com uf_oab), nome_advogado ou nome_parte.',
        ]);
      }

      let digitos: string | undefined;
      let tribunal = args.tribunal;
      if (args.numero) {
        const p = prepararNumero(args.numero, args.tribunal, args.ignorar_digito);
        digitos = p.digitos;
        tribunal = args.tribunal ?? p.tribunal;
      }

      // O DJEN pagina por página inteira; convertemos o offset para isso.
      const pagina = Math.floor(args.offset / args.limit) + 1;

      const r = await buscarPublicacoes({
        numeroProcesso: digitos,
        tribunal,
        oab: args.oab,
        ufOab: args.uf_oab,
        nomeAdvogado: args.nome_advogado,
        nomeParte: args.nome_parte,
        de: args.de,
        ate: args.ate,
        pagina,
        itensPorPagina: args.limit,
        incluirBruto: args.incluir_bruto,
      });

      const publicacoes = r.publicacoes.map((p) => ({
        id: p.id,
        processo: p.numeroProcesso ? formatar(p.numeroProcesso) : null,
        data: p.dataDisponibilizacao,
        tribunal: p.tribunal,
        orgao: p.orgao,
        tipo: p.tipoComunicacao,
        classe: p.classe,
        link: p.link,
        advogados: p.advogados,
        destinatarios: p.destinatarios,
        ...(args.incluir_texto ? { texto: p.texto } : {}),
      }));

      const hasMore = r.total > args.offset + publicacoes.length;
      const dados = {
        total: r.total,
        count: publicacoes.length,
        offset: args.offset,
        has_more: hasMore,
        ...(hasMore ? { next_offset: args.offset + publicacoes.length } : {}),
        publicacoes,
        ...(args.incluir_bruto ? { registro_bruto: r.bruto } : {}),
      };

      const linhas = [
        '# Publicações no DJEN',
        '',
        `${r.total} publicação(ões) encontrada(s); exibindo ${publicacoes.length}.`,
      ];

      if (!publicacoes.length) {
        linhas.push(
          '',
          '_Nenhuma publicação para esses critérios._',
          '',
          'O DJEN cobre as comunicações a partir da adesão de cada tribunal; processos antigos ou que tramitaram só em papel podem não ter publicações eletrônicas.',
        );
      }

      for (const p of r.publicacoes) {
        linhas.push('', `## ${data(p.dataDisponibilizacao)} — ${p.tipoComunicacao ?? 'Comunicação'}`);
        if (p.orgao) linhas.push(`- **Órgão**: ${p.orgao}`);
        if (p.numeroProcesso) linhas.push(`- **Processo**: ${formatar(p.numeroProcesso)}`);
        if (p.advogados.length) {
          linhas.push(
            `- **Advogados intimados**: ${p.advogados
              .map((a) => `${a.nome}${a.oab ? ` (OAB ${a.uf ?? ''} ${a.oab})`.replace(/\s+/g, ' ') : ''}`)
              .join('; ')}`,
          );
        }
        if (p.destinatarios.length) {
          linhas.push(
            `- **Destinatários**: ${p.destinatarios
              .map((d) => `${d.nome}${d.polo ? ` (${d.polo})` : ''}`)
              .join('; ')}`,
          );
        }
        if (p.link) linhas.push(`- **Link**: ${p.link}`);
        if (args.incluir_texto && p.texto) {
          linhas.push('', '> ' + p.texto.replace(/\n/g, '\n> '));
        }
      }

      if (hasMore) {
        linhas.push('', `_Mais resultados: repita com offset=${args.offset + publicacoes.length}._`);
      }

      return responder(args.response_format, linhas.join('\n'), dados);
    }),
  );

  /* ------------------------ pdpj_identificar_envolvidos ------------------- */

  server.registerTool(
    'pdpj_identificar_envolvidos',
    {
      title: 'Identificar advogados, partes e auxiliares',
      description: `Monta o quadro de quem atua no processo, varrendo as publicações do DJEN: advogados constituídos (nome e OAB, com a contagem de intimações), partes destinatárias e auxiliares da justiça — administrador judicial, perito, curador, inventariante, leiloeiro.

Distinção importante entre os dois tipos de resultado:
  - Advogados e partes vêm em campos estruturados do DJEN. São dado, não interpretação.
  - Auxiliares da justiça NÃO existem como campo em lugar nenhum: são extraídos por padrão de texto do corpo das publicações. Por isso cada um vem acompanhado do trecho de onde saiu, e o resultado precisa de conferência humana antes de qualquer uso profissional. Pode haver falso positivo (um nome capturado errado) e falso negativo (a nomeação nunca foi publicada, ou usou redação fora do padrão).

Args:
  - numero (string): número CNJ do processo.
  - tribunal (string, opcional): sigla, quando a dedução pelo número não servir.
  - max_publicacoes (number): quantas publicações varrer (padrão: 50).
  - incluir_contexto (boolean): mostra o trecho de onde cada auxiliar foi extraído (padrão: true).
  - ignorar_digito (boolean): segue mesmo com dígito verificador inconsistente (padrão: false).
  - response_format ('markdown' | 'json'): formato da resposta (padrão: 'markdown').

Use quando: o pedido é "quem é o advogado da parte", "quem foi nomeado administrador judicial", "quem é o perito", "quem atua neste processo".
Não use quando: o interesse é o andamento (use pdpj_analisar_processo) ou a lista de publicações em si (use pdpj_buscar_publicacoes).

Se o processo estiver em segredo de justiça, ou se o tribunal ainda não publicar no DJEN, o resultado virá vazio — isso não significa que não haja advogado constituído.`,
      inputSchema: IdentificarEnvolvidosInput,
      outputSchema: z.looseObject({
        numero: z.string(),
        publicacoes_analisadas: z.number(),
        advogados: z.array(z.unknown()),
        partes: z.array(z.unknown()),
        auxiliares: z.array(z.unknown()),
      }),
      annotations: SOMENTE_LEITURA,
    },
    comTratamento(async (args) => {
      const { digitos, tribunal } = prepararNumero(
        args.numero,
        args.tribunal,
        args.ignorar_digito,
      );

      const r = await buscarPublicacoes({
        numeroProcesso: digitos,
        tribunal,
        pagina: 1,
        itensPorPagina: args.max_publicacoes,
      });

      const advogados = consolidarAdvogados(r.publicacoes);
      const partes = consolidarPartes(r.publicacoes);
      const auxiliares = extrairAuxiliares(r.publicacoes);
      const oabsCitadas = oabsNoTexto(r.publicacoes);

      const dados = {
        numero: formatar(digitos),
        tribunal: tribunal ?? null,
        publicacoes_analisadas: r.publicacoes.length,
        total_publicacoes: r.total,
        advogados,
        partes,
        auxiliares: auxiliares.map((a) => ({
          papel: a.papel,
          nome: a.nome,
          data: a.data,
          origem: 'extraído do texto da publicação',
          ...(args.incluir_contexto ? { contexto: a.contexto } : {}),
        })),
        oabs_citadas_no_texto: oabsCitadas,
      };

      const linhas = [
        `# Envolvidos em ${formatar(digitos)}`,
        '',
        `Base: ${r.publicacoes.length} publicação(ões) do DJEN${r.total > r.publicacoes.length ? ` de ${r.total} existentes` : ''}.`,
      ];

      linhas.push('', '## Advogados constituídos');
      if (advogados.length) {
        linhas.push('', '| Advogado | OAB | Intimações | Primeira | Última |', '| --- | --- | --- | --- | --- |');
        for (const a of advogados) {
          const oab = a.oab ? `${a.uf ?? ''} ${a.oab}`.trim() : '—';
          linhas.push(
            `| ${a.nome} | ${oab} | ${a.intimacoes} | ${data(a.primeiraIntimacao)} | ${data(a.ultimaIntimacao)} |`,
          );
        }
      } else {
        linhas.push('', '_Nenhum advogado identificado nas publicações analisadas._');
      }

      linhas.push('', '## Partes');
      if (partes.length) {
        for (const p of partes) linhas.push(`- ${p.nome}${p.polo ? ` — polo ${p.polo.toLowerCase()}` : ''}`);
      } else {
        linhas.push('_Nenhuma parte destinatária identificada._');
      }

      linhas.push('', '## Auxiliares da justiça');
      if (auxiliares.length) {
        linhas.push(
          '',
          '⚠️ Extraídos do **texto** das publicações, não de campo estruturado. Confira cada um no trecho de origem antes de usar.',
          '',
        );
        for (const a of auxiliares) {
          linhas.push(`- **${a.rotulo}**: ${a.nome}${a.data ? ` (publicação de ${data(a.data)})` : ''}`);
          if (args.incluir_contexto) linhas.push(`  - _"…${a.contexto}…"_`);
        }
      } else {
        linhas.push(
          '',
          '_Nenhum administrador judicial, perito ou outro auxiliar localizado no texto das publicações analisadas._',
          '',
          'Isso não descarta a existência de um: a nomeação pode não ter sido publicada no recorte analisado, ou ter usado redação fora dos padrões reconhecidos. Aumente max_publicacoes ou confira a íntegra com pdpj_buscar_publicacoes usando incluir_texto=true.',
        );
      }

      return responder(args.response_format, linhas.join('\n'), dados);
    }),
  );
}
