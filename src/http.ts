#!/usr/bin/env node
import {
  createServer,
  type IncomingMessage,
  type Server,
  type ServerResponse,
} from 'node:http';
import { pathToFileURL } from 'node:url';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';

import { criarServidor } from './index.js';
import { SERVER_NAME, SERVER_VERSION } from './constants.js';
import { config } from './config.js';

/**
 * Variante HTTP do servidor: é o que permite usar o pdpj como conector
 * remoto, de qualquer aparelho, em vez de um processo local por máquina.
 *
 * O transporte é Streamable HTTP em modo stateless — cada requisição cria
 * seu próprio servidor e transporte, sem estado entre chamadas. Isso torna
 * o serviço trivial de escalar e de hospedar em plataformas que reciclam
 * processos a qualquer momento.
 */

/**
 * Token de acesso. Sem ele, qualquer pessoa que descubra a URL usa o
 * servidor — as ferramentas são só de leitura sobre bases públicas, mas o
 * consumo recai sobre a chave e a cota de quem hospeda.
 *
 * Lido a cada requisição, e não uma vez no carregamento do módulo, para que
 * mudar a variável de ambiente tenha efeito sem reiniciar o processo.
 */
function tokenConfigurado(): string | undefined {
  return process.env.PDPJ_AUTH_TOKEN || undefined;
}

function json(res: ServerResponse, status: number, corpo: unknown): void {
  const texto = JSON.stringify(corpo);
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(texto),
  });
  res.end(texto);
}

/** Compara em tempo constante, para não vazar o token por temporização. */
function iguais(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diferenca = 0;
  for (let i = 0; i < a.length; i++) {
    diferenca |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diferenca === 0;
}

/**
 * Confere o token, quando um foi configurado. Aceita dois lugares:
 *
 *   - cabeçalho `Authorization: Bearer <token>` — o jeito usual, para
 *     clientes que deixam definir cabeçalhos (Claude Code, curl);
 *   - último segmento do caminho, `/mcp/<token>` — para clientes cuja tela
 *     de conector só tem o campo da URL.
 */
function autorizado(req: IncomingMessage, tokenNoCaminho?: string): boolean {
  const esperado = tokenConfigurado();
  if (!esperado) return true;

  const cabecalho = req.headers.authorization ?? '';
  const doCabecalho = cabecalho.replace(/^Bearer\s+/i, '').trim();
  if (doCabecalho && iguais(doCabecalho, esperado)) return true;

  return Boolean(tokenNoCaminho) && iguais(tokenNoCaminho!, esperado);
}

async function lerCorpo(req: IncomingMessage): Promise<unknown> {
  const partes: Buffer[] = [];
  let tamanho = 0;
  for await (const parte of req) {
    const bloco = parte as Buffer;
    tamanho += bloco.length;
    if (tamanho > 4 * 1024 * 1024) throw new Error('Corpo da requisição muito grande.');
    partes.push(bloco);
  }
  if (!partes.length) return undefined;
  return JSON.parse(Buffer.concat(partes).toString('utf8'));
}

async function tratar(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const url = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`);

  // Sonda de saúde: as plataformas de hospedagem checam antes de liberar tráfego.
  if (url.pathname === '/health' || url.pathname === '/') {
    return json(res, 200, {
      ok: true,
      servidor: SERVER_NAME,
      versao: SERVER_VERSION,
      transporte: 'streamable-http',
      protegido: Boolean(tokenConfigurado()),
      modo_demo: config.demo,
    });
  }

  // Aceita /mcp e /mcp/<token>.
  const rotaMcp = /^\/mcp(?:\/([^/]+))?\/?$/.exec(url.pathname);
  if (!rotaMcp) {
    return json(res, 404, {
      error: 'Rota não encontrada. Use /mcp, ou /mcp/<token> se o seu cliente só aceitar a URL.',
    });
  }

  if (!autorizado(req, rotaMcp[1])) {
    res.setHeader('WWW-Authenticate', 'Bearer');
    return json(res, 401, {
      jsonrpc: '2.0',
      error: { code: -32001, message: 'Não autorizado: informe o Bearer token.' },
      id: null,
    });
  }

  // Stateless: um servidor e um transporte por requisição, descartados ao fim.
  const server = criarServidor();
  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
    enableJsonResponse: true,
  });

  res.on('close', () => {
    void transport.close();
    void server.close();
  });

  try {
    await server.connect(transport);
    const corpo = req.method === 'POST' ? await lerCorpo(req) : undefined;
    await transport.handleRequest(req, res, corpo);
  } catch (erro) {
    console.error('[pdpj-http] falha ao tratar requisição:', erro);
    if (!res.headersSent) {
      json(res, 500, {
        jsonrpc: '2.0',
        error: { code: -32603, message: 'Erro interno do servidor.' },
        id: null,
      });
    }
  }
}

/** Monta o servidor HTTP sem colocá-lo no ar. */
export function criarServidorHttp(): Server {
  return createServer((req, res) => {
    void tratar(req, res);
  });
}

function main(): void {
  const porta = Number(process.env.PORT || 8080);
  const httpServer = criarServidorHttp();

  httpServer.listen(porta, () => {
    console.error(
      `[${SERVER_NAME} ${SERVER_VERSION}] HTTP na porta ${porta} — endpoint /mcp` +
        (tokenConfigurado() ? ' (protegido por token)' : ' (SEM token: defina PDPJ_AUTH_TOKEN)') +
        (config.demo ? ' [modo demonstração]' : ''),
    );
  });

  for (const sinal of ['SIGINT', 'SIGTERM'] as const) {
    process.on(sinal, () => {
      httpServer.close(() => process.exit(0));
    });
  }
}

const executadoDiretamente =
  process.argv[1] !== undefined &&
  import.meta.url === pathToFileURL(process.argv[1]).href;

if (executadoDiretamente) main();
