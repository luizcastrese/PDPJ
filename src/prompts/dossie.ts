import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

/**
 * Prompts MCP: a forma de expor um roteiro pronto que o usuário aciona no
 * próprio cliente, sem terminal. No Claude Code eles aparecem como comandos
 * de barra (`/pdpj:dossie_recuperacao_judicial`); em clientes gráficos, como
 * itens de menu do conector.
 *
 * Um prompt não executa nada: ele entrega ao assistente o roteiro de quais
 * ferramentas chamar, em que ordem, e como relatar o resultado — inclusive as
 * ressalvas que não podem ser omitidas ao falar de crédito e de patrimônio.
 */

const ROTEIRO_DOSSIE = [
  '1. Chame `pdpj_dossie_recuperacao` com o número informado. Ele já traz identificação, fase, marcos da Lei 11.101/2005, stay period, fatores legais, credores e ativos.',
  '2. Se a devedora tiver sido identificada e o pedido mencionar a história da empresa, chame `pdpj_historico_empresa` com a razão social para situar a crise no tempo (execuções fiscais e trabalhistas anteriores ao pedido).',
  '3. Se a relação de credores vier truncada, ou se o pedido pedir o passivo completo, chame `pdpj_relacao_credores` — use `fonte="quadro_geral"` quando houver, `fonte="edital_7"` em seguida, e só então a relação do devedor.',
  '4. Se o pedido detalhar ativos, chame `pdpj_ativos_garantias` com `situacao="todos"` para o detalhe dos gravames.',
  '5. Se nenhum edital for localizado, tente de novo com `max_publicacoes=100` antes de concluir que a lista não existe.',
].join('\n');

const COMO_RELATAR = [
  '- Escreva em português, em prosa, na ordem: **história e identificação → motivo do pedido → fatores legais → credores → ativos (gravados e livres) → o que falta**.',
  '- Cite o dispositivo da Lei 11.101/2005 sempre que afirmar uma consequência jurídica; as ferramentas devolvem a base de cada marco e de cada fator.',
  '- Separe com clareza o que é **dado** (classe, datas, movimentos, advogados) do que é **extraído de texto** (credores, motivo, bens). Nunca apresente extração como se fosse campo de base.',
  '- Na seção de ativos, mantenha separados: fora do concurso (art. 49, §3º), garantia real sujeita ao plano (Classe II), constrições e declarados livres. É a distinção que muda o valor do ativo.',
  '- Não complete lacuna com conhecimento geral sobre a empresa. Se o dado não veio das ferramentas, diga que não veio e aponte onde obtê-lo.',
  '- Feche com o que não é obtenível por fonte pública processual e onde está (autos, Junta Comercial, Receita, cartório de imóveis).',
].join('\n');

export function registrarPrompts(server: McpServer): void {
  server.registerPrompt(
    'dossie_recuperacao_judicial',
    {
      title: 'Dossiê de recuperação judicial',
      description:
        'Levanta o dossiê completo de uma recuperação judicial: história e identificação da devedora, motivo do pedido, fatores legais relevantes, relação de credores por classe e ativos separados entre livres e gravados.',
      argsSchema: {
        numero: z
          .string()
          .describe('Número CNJ do processo de recuperação judicial, com ou sem máscara.'),
        empresa: z
          .string()
          .optional()
          .describe('Razão social da devedora, se conhecida. Melhora a busca pelo histórico judicial.'),
      },
    },
    ({ numero, empresa }) => ({
      messages: [
        {
          role: 'user' as const,
          content: {
            type: 'text' as const,
            text: [
              `Monte o dossiê da recuperação judicial ${numero}${empresa ? ` (devedora: ${empresa})` : ''}.`,
              '',
              'Roteiro de ferramentas:',
              ROTEIRO_DOSSIE,
              '',
              'Como relatar:',
              COMO_RELATAR,
            ].join('\n'),
          },
        },
      ],
    }),
  );

  server.registerPrompt(
    'relacao_de_credores',
    {
      title: 'Relação de credores por classe',
      description:
        'Lê a relação de credores do edital publicado e apresenta o passivo separado pelas quatro classes do art. 41 da Lei 11.101/2005, com as somas por classe.',
      argsSchema: {
        numero: z.string().describe('Número CNJ da recuperação judicial.'),
        classe: z
          .string()
          .optional()
          .describe(
            'Classe a destacar: i_trabalhista, ii_garantia_real, iii_quirografario, iv_me_epp ou extraconcursal.',
          ),
      },
    },
    ({ numero, classe }) => ({
      messages: [
        {
          role: 'user' as const,
          content: {
            type: 'text' as const,
            text: [
              `Levante a relação de credores da recuperação judicial ${numero}${classe ? `, destacando a classe ${classe}` : ''}.`,
              '',
              'Chame `pdpj_relacao_credores`. Prefira, nesta ordem, o quadro geral do art. 18, a relação do administrador judicial (art. 7º, §2º) e por último a do devedor (art. 52, §1º) — e **diga qual delas foi usada**, porque a diferença entre elas é material.',
              'Apresente uma tabela por classe com soma, e depois os maiores credores. Informe quantos valores não puderam ser atribuídos a um nome.',
              'Encerre lembrando que a lista só é definitiva depois de julgadas as impugnações do art. 8º, e que a leitura foi extraída do texto do edital — não de campo estruturado.',
            ].join('\n'),
          },
        },
      ],
    }),
  );

  server.registerPrompt(
    'ativos_livres_e_gravados',
    {
      title: 'Ativos: livres e gravados',
      description:
        'Separa as menções a bens da devedora entre ativos gravados (com a distinção do art. 49, §3º), constrições judiciais e bens declarados livres.',
      argsSchema: {
        numero: z.string().describe('Número CNJ da recuperação judicial.'),
      },
    },
    ({ numero }) => ({
      messages: [
        {
          role: 'user' as const,
          content: {
            type: 'text' as const,
            text: [
              `Levante os ativos da recuperação judicial ${numero}, separando livres de gravados.`,
              '',
              'Chame `pdpj_ativos_garantias` com `situacao="todos"`. Organize a resposta em quatro blocos, nesta ordem:',
              '1. **Fora do concurso** (art. 49, §3º): alienação e cessão fiduciária, arrendamento mercantil, reserva de domínio — o titular não se submete ao plano, e os bens de capital essenciais não podem ser retirados durante a suspensão.',
              '2. **Garantia real sujeita ao plano** (Classe II, art. 41, II): hipoteca, penhor, anticrese, caução — a supressão da garantia depende de aprovação do credor titular (art. 50, §1º).',
              '3. **Constrições**: penhora, bloqueio, indisponibilidade — não são garantia; a substituição sobre bem essencial compete ao juízo da recuperação (art. 6º, §7º-B).',
              '4. **Declarados livres**: apenas o que o texto publicado afirma desembaraçado.',
              '',
              'Deixe explícito, e sem suavizar: a relação de bens é peça dos autos (art. 51, III e IV) e não vai ao diário. Isto não é inventário patrimonial, e a ausência de gravame na lista não torna um bem livre.',
            ].join('\n'),
          },
        },
      ],
    }),
  );
}
