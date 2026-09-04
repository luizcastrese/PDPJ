import { ErroPdpj } from '../services/datajud.js';
import { limitar } from '../services/formato.js';

/**
 * Resultado no formato esperado pelo SDK do MCP. A assinatura de índice
 * acompanha o tipo CallToolResult, que aceita campos adicionais.
 */
export interface Resultado {
  [chave: string]: unknown;
  content: { type: 'text'; text: string }[];
  structuredContent?: Record<string, unknown>;
  isError?: boolean;
}

/** Anotações comuns: todas as ferramentas deste servidor são de leitura. */
export const SOMENTE_LEITURA = {
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: true,
} as const;

/** Monta a resposta escolhendo entre markdown e JSON. */
export function responder(
  formato: 'markdown' | 'json',
  markdown: string,
  dados: Record<string, unknown>,
): Resultado {
  const texto =
    formato === 'json' ? JSON.stringify(dados, null, 2) : markdown;
  return {
    content: [{ type: 'text', text: limitar(texto) }],
    structuredContent: dados,
  };
}

/**
 * Converte qualquer exceção em uma resposta de erro acionável, com o
 * diagnóstico e as sugestões de próximo passo em texto legível.
 */
export function responderErro(erro: unknown): Resultado {
  if (erro instanceof ErroPdpj) {
    const linhas = [`**Erro:** ${erro.message}`];
    if (erro.sugestoes.length) {
      linhas.push('', 'Próximos passos possíveis:');
      linhas.push(...erro.sugestoes.map((s) => `- ${s}`));
    }
    return { content: [{ type: 'text', text: linhas.join('\n') }], isError: true };
  }
  const mensagem = erro instanceof Error ? erro.message : String(erro);
  return {
    content: [{ type: 'text', text: `**Erro inesperado:** ${mensagem}` }],
    isError: true,
  };
}

/** Envolve o handler de uma ferramenta com o tratamento padrão de erros. */
export function comTratamento<Args>(
  handler: (args: Args) => Promise<Resultado>,
): (args: Args) => Promise<Resultado> {
  return async (args: Args) => {
    try {
      return await handler(args);
    } catch (erro) {
      return responderErro(erro);
    }
  };
}
