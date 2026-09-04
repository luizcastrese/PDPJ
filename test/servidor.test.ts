import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';

/**
 * Testes de integração ponta a ponta: sobem o servidor MCP em memória e
 * chamam as ferramentas como um cliente faria. O modo demonstração evita
 * qualquer chamada de rede — a fixture local responde no lugar da API.
 */
process.env.PDPJ_DEMO = '1';

let client: Client;

before(async () => {
  const { criarServidor } = await import('../src/index.js');
  const server = criarServidor();
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  client = new Client({ name: 'teste', version: '1.0.0' });
  await Promise.all([client.connect(clientTransport), server.connect(serverTransport)]);
});

after(async () => {
  await client.close();
});

function texto(resultado: unknown): string {
  const r = resultado as { content: { type: string; text: string }[] };
  return r.content.map((c) => c.text).join('\n');
}

/** Acesso tipado ao structuredContent devolvido pela ferramenta. */
function dadosDe<T>(resultado: unknown): T {
  return (resultado as { structuredContent: T }).structuredContent;
}

test('expõe todas as ferramentas esperadas', async () => {
  const { tools } = await client.listTools();
  const nomes = tools.map((t) => t.name).sort();
  assert.deepEqual(nomes, [
    'pdpj_analisar_processo',
    'pdpj_buscar_processos',
    'pdpj_comparar_processos',
    'pdpj_consulta_avancada',
    'pdpj_consultar_processo',
    'pdpj_listar_movimentos',
    'pdpj_listar_tribunais',
    'pdpj_status',
    'pdpj_validar_numero',
  ]);
  for (const t of tools) {
    assert.ok(t.description && t.description.length > 100, `${t.name} precisa de descrição`);
    assert.equal(t.annotations?.readOnlyHint, true, `${t.name} deveria ser somente leitura`);
  }
});

test('pdpj_validar_numero valida offline e identifica o tribunal', async () => {
  const r = await client.callTool({
    name: 'pdpj_validar_numero',
    arguments: { numero: '1000123-69.2023.8.26.0100', response_format: 'json' },
  });
  const dados = dadosDe<Record<string, unknown>>(r);
  assert.equal(dados.valido, true);
  assert.equal(dados.tribunal, 'TJSP');
  assert.equal(dados.tribunal_alias, 'tjsp');
});

test('pdpj_validar_numero explica um dígito verificador errado', async () => {
  const r = await client.callTool({
    name: 'pdpj_validar_numero',
    arguments: { numero: '1000123-45.2023.8.26.0100', response_format: 'json' },
  });
  const dados = dadosDe<Record<string, unknown>>(r);
  assert.equal(dados.valido, false);
  assert.equal(dados.numero_corrigido, '1000123-69.2023.8.26.0100');
});

test('pdpj_listar_tribunais filtra por texto e por segmento', async () => {
  const todos = await client.callTool({
    name: 'pdpj_listar_tribunais',
    arguments: { response_format: 'json' },
  });
  assert.equal(dadosDe<{ total: number }>(todos).total, 91);

  const trts = await client.callTool({
    name: 'pdpj_listar_tribunais',
    arguments: { segmento: 5, response_format: 'json' },
  });
  // 24 TRTs + TST
  assert.equal(dadosDe<{ total: number }>(trts).total, 25);

  const busca = await client.callTool({
    name: 'pdpj_listar_tribunais',
    arguments: { filtro: 'são paulo', response_format: 'json' },
  });
  const siglas = dadosDe<{ tribunais: { sigla: string }[] }>(busca).tribunais.map(
    (t) => t.sigla,
  );
  assert.ok(siglas.includes('TJSP'));
});

test('pdpj_analisar_processo devolve o diagnóstico em markdown', async () => {
  const r = await client.callTool({
    name: 'pdpj_analisar_processo',
    arguments: { numero: '1000123-69.2023.8.26.0100' },
  });
  const md = texto(r);
  assert.match(md, /# Processo 1000123-69\.2023\.8\.26\.0100/);
  assert.match(md, /## Métricas/);
  assert.match(md, /## Marcos processuais/);
  assert.match(md, /Trânsito em julgado/);
});

test('pdpj_consultar_processo respeita o limite de movimentos', async () => {
  const r = await client.callTool({
    name: 'pdpj_consultar_processo',
    arguments: { numero: '1000123-69.2023.8.26.0100', max_movimentos: 5, response_format: 'json' },
  });
  const dados = dadosDe<{ instancias: { movimentos: unknown[] }[] }>(r);
  assert.equal(dados.instancias[0].movimentos.length, 5);
});

test('pdpj_listar_movimentos filtra por categoria e pagina', async () => {
  const r = await client.callTool({
    name: 'pdpj_listar_movimentos',
    arguments: {
      numero: '1000123-69.2023.8.26.0100',
      categoria: 'recurso',
      response_format: 'json',
    },
  });
  const dados = dadosDe<{
    total_filtrado: number;
    movimentos: { categoria: string }[];
  }>(r);
  assert.ok(dados.total_filtrado >= 2);
  assert.ok(dados.movimentos.every((m) => m.categoria === 'recurso'));

  const pagina = await client.callTool({
    name: 'pdpj_listar_movimentos',
    arguments: { numero: '1000123-69.2023.8.26.0100', limit: 3, offset: 0, response_format: 'json' },
  });
  const p = dadosDe<{ count: number; has_more: boolean; next_offset?: number }>(pagina);
  assert.equal(p.count, 3);
  assert.equal(p.has_more, true);
  assert.equal(p.next_offset, 3);
});

test('pdpj_listar_movimentos filtra por texto livre', async () => {
  const r = await client.callTool({
    name: 'pdpj_listar_movimentos',
    arguments: {
      numero: '1000123-69.2023.8.26.0100',
      contem: 'pericia',
      response_format: 'json',
    },
  });
  const dados = dadosDe<{ movimentos: { nome: string }[] }>(r);
  assert.ok(dados.movimentos.length >= 1, 'a busca deve ignorar acentos');
});

test('erros viram resposta acionável, não exceção', async () => {
  const r = await client.callTool({
    name: 'pdpj_analisar_processo',
    arguments: { numero: '1000123-45.2023.8.26.0100' },
  });
  assert.equal((r as { isError?: boolean }).isError, true);
  const md = texto(r);
  assert.match(md, /Dígito verificador inválido/);
  assert.match(md, /ignorar_digito/);
});

test('tribunal inexistente devolve erro com orientação', async () => {
  const r = await client.callTool({
    name: 'pdpj_buscar_processos',
    arguments: { tribunal: 'tjxx' },
  });
  assert.equal((r as { isError?: boolean }).isError, true);
  assert.match(texto(r), /pdpj_listar_tribunais/);
});

test('pdpj_comparar_processos monta a tabela e os agregados', async () => {
  const r = await client.callTool({
    name: 'pdpj_comparar_processos',
    arguments: {
      numeros: ['1000123-69.2023.8.26.0100', '0801234-49.2018.8.19.0001'],
      response_format: 'json',
    },
  });
  const dados = dadosDe<{ total: number; agregados: Record<string, unknown> }>(r);
  assert.equal(dados.total, 2);
  assert.ok(dados.agregados.mais_parado);
});

test('pdpj_status informa o modo de demonstração sem expor a chave', async () => {
  const r = await client.callTool({ name: 'pdpj_status', arguments: {} });
  const md = texto(r);
  assert.match(md, /Modo demonstração/);
  assert.doesNotMatch(md, /cDZHYzlZa0JadVREZDJCendQbXY/);
});
