#!/usr/bin/env node
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { pathToFileURL } from 'node:url';

import { SERVER_NAME, SERVER_VERSION } from './constants.js';
import { config } from './config.js';
import { registrarFerramentasProcesso } from './tools/processo.js';
import { registrarFerramentasBusca } from './tools/busca.js';
import { registrarFerramentaComparar } from './tools/comparar.js';
import { registrarFerramentasReferencia } from './tools/referencia.js';
import { registrarFerramentasPessoas } from './tools/pessoas.js';
import { registrarFerramentasRecuperacao } from './tools/recuperacao.js';
import { registrarPrompts } from './prompts/dossie.js';

/**
 * Servidor MCP da API Pública do DataJud (PDPJ/CNJ).
 * Transporte stdio: o cliente MCP inicia este processo e conversa por
 * stdin/stdout. Todo log precisa ir para stderr, nunca para stdout.
 */
export function criarServidor(): McpServer {
  const server = new McpServer(
    { name: SERVER_NAME, version: SERVER_VERSION },
    {
      instructions: [
        'Este servidor consulta a API Pública do DataJud (CNJ), que reúne os metadados processuais',
        'enviados pelos tribunais brasileiros. Ela contém classe, assuntos, órgão julgador, grau,',
        'datas e a lista de movimentos da Tabela Processual Unificada — nunca o teor das peças,',
        'nomes das partes ou documentos.',
        '',
        'Fluxo recomendado: com um número em mãos, chame pdpj_analisar_processo (diagnóstico) ou',
        'pdpj_consultar_processo (dados crus); o tribunal é deduzido do próprio número. Para',
        'históricos longos use pdpj_listar_movimentos com filtros. Sem número, use',
        'pdpj_buscar_processos informando o tribunal.',
        '',
        'O DataJud não traz partes, advogados nem auxiliares da justiça. Esses nomes vêm do DJEN',
        '(Diário de Justiça Eletrônico Nacional) por pdpj_identificar_envolvidos e',
        'pdpj_buscar_publicacoes. Advogados e partes são dado estruturado; administrador judicial,',
        'perito e demais auxiliares são extraídos do texto das publicações e exigem conferência.',
        '',
        'Para recuperação judicial e falência há um módulo próprio, que lê o que a Lei 11.101/2005',
        'obriga a publicar: pdpj_dossie_recuperacao (dossiê completo: fase, marcos, stay period,',
        'fatores legais, credores e ativos), pdpj_relacao_credores (passivo pelas classes do art. 41),',
        'pdpj_ativos_garantias (bens gravados, constrições e declarados livres) e',
        'pdpj_historico_empresa (achar a recuperação pelo nome da empresa e situar a crise no tempo).',
        'Credores, motivo do pedido e bens são EXTRAÍDOS DO TEXTO dos editais — não são campo de base.',
        'A relação de bens, o plano e os laudos são peças dos autos e nunca aparecem no diário: ao',
        'relatar ativos, jamais trate a lista como inventário patrimonial, e nunca conclua que um bem',
        'é livre por não constar da lista de gravames.',
        '',
        'A situação processual que este servidor reporta é inferida do texto dos movimentos, não é',
        'um campo oficial. Ao relatar resultados ao usuário, deixe claro que se trata de leitura de',
        'metadados públicos e cite a data da última atualização da base.',
      ].join('\n'),
    },
  );

  registrarFerramentasProcesso(server);
  registrarFerramentasBusca(server);
  registrarFerramentaComparar(server);
  registrarFerramentasReferencia(server);
  registrarFerramentasPessoas(server);
  registrarFerramentasRecuperacao(server);
  registrarPrompts(server);

  return server;
}

async function main(): Promise<void> {
  const server = criarServidor();
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error(
    `[${SERVER_NAME} ${SERVER_VERSION}] pronto — base ${config.baseUrl}${config.demo ? ' (modo demonstração)' : ''}`,
  );
}

/**
 * Só sobe o transporte quando este arquivo é o processo principal; ao ser
 * importado (pelos testes, por exemplo), apenas expõe criarServidor().
 */
const executadoDiretamente =
  process.argv[1] !== undefined &&
  import.meta.url === pathToFileURL(process.argv[1]).href;

if (executadoDiretamente) {
  main().catch((erro: unknown) => {
    console.error('[pdpj-mcp-server] falha ao iniciar:', erro);
    process.exit(1);
  });
}
