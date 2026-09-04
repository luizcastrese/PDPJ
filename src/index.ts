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
