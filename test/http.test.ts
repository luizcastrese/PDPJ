import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';

/**
 * Testes do modo conector remoto: sobem o servidor HTTP numa porta livre e
 * falam com ele por rede, como o Claude faria. O modo demonstração evita
 * qualquer chamada externa.
 */
process.env.PDPJ_DEMO = '1';
process.env.PDPJ_AUTH_TOKEN = 'token-de-teste';

let servidor: Server;
let base: string;

before(async () => {
  const { criarServidorHttp } = await import('../src/http.js');
  servidor = criarServidorHttp();
  await new Promise<void>((resolve) => servidor.listen(0, '127.0.0.1', resolve));
  const { port } = servidor.address() as AddressInfo;
  base = `http://127.0.0.1:${port}`;
});

after(async () => {
  await new Promise<void>((resolve) => servidor.close(() => resolve()));
});

function chamar(corpo: unknown, token = 'token-de-teste'): Promise<Response> {
  return fetch(`${base}/mcp`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json, text/event-stream',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(corpo),
  });
}

test('/health responde e informa que o token está ativo', async () => {
  const r = await fetch(`${base}/health`);
  assert.equal(r.status, 200);
  const corpo = (await r.json()) as Record<string, unknown>;
  assert.equal(corpo.ok, true);
  assert.equal(corpo.transporte, 'streamable-http');
  assert.equal(corpo.protegido, true);
});

test('/health não revela o token', async () => {
  const texto = await (await fetch(`${base}/health`)).text();
  assert.doesNotMatch(texto, /token-de-teste/);
});

test('recusa requisição sem token', async () => {
  const r = await chamar({ jsonrpc: '2.0', id: 1, method: 'tools/list', params: {} }, '');
  assert.equal(r.status, 401);
  assert.match(r.headers.get('www-authenticate') ?? '', /Bearer/);
});

test('recusa token errado, mesmo com o comprimento certo', async () => {
  const r = await chamar(
    { jsonrpc: '2.0', id: 1, method: 'tools/list', params: {} },
    'token-de-testX',
  );
  assert.equal(r.status, 401);
});

test('rota desconhecida devolve 404 apontando /mcp', async () => {
  const r = await fetch(`${base}/qualquer-coisa`);
  assert.equal(r.status, 404);
  assert.match(JSON.stringify(await r.json()), /\/mcp/);
});

test('faz o handshake de initialize por HTTP', async () => {
  const r = await chamar({
    jsonrpc: '2.0',
    id: 1,
    method: 'initialize',
    params: {
      protocolVersion: '2025-06-18',
      capabilities: {},
      clientInfo: { name: 'teste', version: '1.0.0' },
    },
  });
  assert.equal(r.status, 200);
  const corpo = (await r.json()) as { result: { serverInfo: { name: string } } };
  assert.equal(corpo.result.serverInfo.name, 'pdpj-mcp-server');
});

test('lista as 11 ferramentas por HTTP', async () => {
  const r = await chamar({ jsonrpc: '2.0', id: 2, method: 'tools/list', params: {} });
  const corpo = (await r.json()) as { result: { tools: { name: string }[] } };
  assert.equal(corpo.result.tools.length, 11);
  assert.ok(corpo.result.tools.some((t) => t.name === 'pdpj_identificar_envolvidos'));
});

test('executa uma ferramenta por HTTP', async () => {
  const r = await chamar({
    jsonrpc: '2.0',
    id: 3,
    method: 'tools/call',
    params: {
      name: 'pdpj_validar_numero',
      arguments: { numero: '1000123-69.2023.8.26.0100', response_format: 'json' },
    },
  });
  const corpo = (await r.json()) as { result: { structuredContent: { tribunal: string } } };
  assert.equal(corpo.result.structuredContent.tribunal, 'TJSP');
});

test('é stateless: cada requisição vale por si, sem sessão', async () => {
  // Sem initialize antes, e sem cabeçalho de sessão: ainda assim responde.
  const r = await chamar({ jsonrpc: '2.0', id: 4, method: 'tools/call', params: { name: 'pdpj_status', arguments: {} } });
  assert.equal(r.status, 200);
  assert.equal(r.headers.get('mcp-session-id'), null);
  const corpo = (await r.json()) as { result: { structuredContent: { base_url: string } } };
  assert.match(corpo.result.structuredContent.base_url, /datajud/);
});

test('aceita o token no caminho, para clientes que só têm o campo da URL', async () => {
  const r = await fetch(`${base}/mcp/token-de-teste`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 6, method: 'tools/list', params: {} }),
  });
  assert.equal(r.status, 200);
  const corpo = (await r.json()) as { result: { tools: unknown[] } };
  assert.equal(corpo.result.tools.length, 11);
});

test('recusa token errado no caminho', async () => {
  const r = await fetch(`${base}/mcp/token-errado`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 7, method: 'tools/list', params: {} }),
  });
  assert.equal(r.status, 401);
});

test('a chave da API nunca aparece na resposta', async () => {
  const r = await chamar({ jsonrpc: '2.0', id: 5, method: 'tools/call', params: { name: 'pdpj_status', arguments: {} } });
  assert.doesNotMatch(await r.text(), /cDZHYzlZa0JadVREZDJCendQbXY/);
});
