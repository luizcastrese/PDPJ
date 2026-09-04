import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

import { CompararProcessosInput } from '../schemas/index.js';
import { resolverProcesso } from '../services/resolver.js';
import { data } from '../services/formato.js';
import { comTratamento, responder, SOMENTE_LEITURA } from './comum.js';

interface LinhaComparacao {
  numero: string;
  tribunal: string | null;
  classe: string | null;
  grau: string | null;
  situacao: string;
  ajuizamento: string | null;
  duracao_dias: number | null;
  dias_sem_movimento: number | null;
  total_movimentos: number;
  recursos: number;
  erro?: string;
}

export function registrarFerramentaComparar(server: McpServer): void {
  server.registerTool(
    'pdpj_comparar_processos',
    {
      title: 'Comparar processos',
      description: `Consulta vários processos de uma vez e os compara lado a lado: situação inferida, tempo de tramitação, tempo desde o último movimento, volume de movimentos e carga recursal.

Cada número é resolvido no seu próprio tribunal (deduzido do número), então é possível comparar processos de tribunais diferentes na mesma chamada. Números que falharem não interrompem a comparação: entram na tabela com o motivo do erro.

Args:
  - numeros (array de string): de 2 a 10 números CNJ, com ou sem máscara.
  - tribunal (string, opcional): força o mesmo tribunal para todos os números.
  - ignorar_digito (boolean): consulta mesmo com dígito verificador inconsistente (padrão: false).
  - response_format ('markdown' | 'json'): formato da resposta (padrão: 'markdown').

Retorna: uma linha por processo e um bloco de agregados (duração média, processo mais antigo, o mais parado, o de maior carga recursal).

Use quando: o pedido envolve uma carteira ou um conjunto de processos ("qual está mais parado", "compare estes três", "quais já transitaram").
Não use quando: for um processo só — pdpj_analisar_processo dá um diagnóstico bem mais detalhado.`,
      inputSchema: CompararProcessosInput,
      outputSchema: z.looseObject({
        total: z.number(),
        com_erro: z.number(),
        processos: z.array(z.unknown()),
        agregados: z.record(z.string(), z.unknown()),
      }),
      annotations: SOMENTE_LEITURA,
    },
    comTratamento(async (args) => {
      const resultados = await Promise.all(
        args.numeros.map(async (numero): Promise<LinhaComparacao> => {
          try {
            const r = await resolverProcesso(numero, args.tribunal, args.ignorar_digito);
            const a = r.instancias[0];
            return {
              numero: a.processo.numeroFormatado,
              tribunal: r.tribunal.sigla,
              classe: a.processo.classe?.nome ?? null,
              grau: a.processo.grau,
              situacao: a.situacao.rotulo,
              ajuizamento: a.processo.dataAjuizamento,
              duracao_dias: a.metricas.duracaoDias,
              dias_sem_movimento: a.metricas.diasSemMovimento,
              total_movimentos: a.metricas.totalMovimentos,
              recursos: a.metricas.recursos,
            };
          } catch (erro) {
            return {
              numero,
              tribunal: null,
              classe: null,
              grau: null,
              situacao: 'não consultado',
              ajuizamento: null,
              duracao_dias: null,
              dias_sem_movimento: null,
              total_movimentos: 0,
              recursos: 0,
              erro: erro instanceof Error ? erro.message : String(erro),
            };
          }
        }),
      );

      const ok = resultados.filter((r) => !r.erro);
      const duracoes = ok.map((r) => r.duracao_dias).filter((d): d is number => d !== null);
      const parados = [...ok].sort(
        (a, b) => (b.dias_sem_movimento ?? -1) - (a.dias_sem_movimento ?? -1),
      );
      const antigos = [...ok].sort((a, b) => (b.duracao_dias ?? -1) - (a.duracao_dias ?? -1));
      const recursais = [...ok].sort((a, b) => b.recursos - a.recursos);

      const agregados = {
        consultados: ok.length,
        duracao_media_dias: duracoes.length
          ? Math.round(duracoes.reduce((s, d) => s + d, 0) / duracoes.length)
          : null,
        mais_antigo: antigos[0]
          ? { numero: antigos[0].numero, dias: antigos[0].duracao_dias }
          : null,
        mais_parado: parados[0]
          ? { numero: parados[0].numero, dias_sem_movimento: parados[0].dias_sem_movimento }
          : null,
        maior_carga_recursal: recursais[0]
          ? { numero: recursais[0].numero, recursos: recursais[0].recursos }
          : null,
      };

      const dados = {
        total: resultados.length,
        com_erro: resultados.length - ok.length,
        processos: resultados,
        agregados,
      };

      const linhas = [
        '# Comparação de processos',
        '',
        '| Processo | Tribunal | Classe | Grau | Situação | Ajuizamento | Tramitação (dias) | Sem movimento (dias) | Movs. | Recursos |',
        '| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |',
      ];
      for (const r of resultados) {
        if (r.erro) {
          linhas.push(
            `| ${r.numero} | — | — | — | ⚠️ ${r.erro.slice(0, 80)} | — | — | — | — | — |`,
          );
          continue;
        }
        linhas.push(
          `| ${r.numero} | ${r.tribunal ?? '—'} | ${r.classe ?? '—'} | ${r.grau ?? '—'} | ${r.situacao} | ${data(r.ajuizamento)} | ${r.duracao_dias ?? '—'} | ${r.dias_sem_movimento ?? '—'} | ${r.total_movimentos} | ${r.recursos} |`,
        );
      }

      linhas.push('', '## Agregados', `- **Processos consultados**: ${agregados.consultados} de ${resultados.length}`);
      if (agregados.duracao_media_dias !== null) {
        linhas.push(`- **Duração média**: ${agregados.duracao_media_dias} dias`);
      }
      if (agregados.mais_antigo) {
        linhas.push(`- **Mais antigo**: ${agregados.mais_antigo.numero} (${agregados.mais_antigo.dias} dias)`);
      }
      if (agregados.mais_parado) {
        linhas.push(
          `- **Mais tempo sem movimento**: ${agregados.mais_parado.numero} (${agregados.mais_parado.dias_sem_movimento} dias)`,
        );
      }
      if (agregados.maior_carga_recursal) {
        linhas.push(
          `- **Maior carga recursal**: ${agregados.maior_carga_recursal.numero} (${agregados.maior_carga_recursal.recursos} movimentos recursais)`,
        );
      }

      return responder(args.response_format, linhas.join('\n'), dados);
    }),
  );
}
