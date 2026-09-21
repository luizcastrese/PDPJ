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
    'pdpj_ativos_garantias',
    'pdpj_buscar_processos',
    'pdpj_buscar_publicacoes',
    'pdpj_comparar_processos',
    'pdpj_consulta_avancada',
    'pdpj_consultar_processo',
    'pdpj_dossie_recuperacao',
    'pdpj_historico_empresa',
    'pdpj_identificar_envolvidos',
    'pdpj_listar_movimentos',
    'pdpj_listar_tribunais',
    'pdpj_localizar_processos',
    'pdpj_relacao_credores',
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

test('pdpj_identificar_envolvidos separa dado estruturado de extração de texto', async () => {
  const r = await client.callTool({
    name: 'pdpj_identificar_envolvidos',
    arguments: { numero: '1000123-69.2023.8.26.0100', response_format: 'json' },
  });
  const dados = dadosDe<{
    advogados: { nome: string; oab: string | null; intimacoes: number }[];
    partes: { nome: string; polo: string | null }[];
    auxiliares: { papel: string; nome: string; origem: string }[];
  }>(r);

  // Advogados vêm de campo estruturado do DJEN.
  const mariana = dados.advogados.find((a) => a.nome === 'Mariana Souza Prado');
  assert.ok(mariana, 'deveria consolidar a advogada das duas publicações');
  assert.equal(mariana.oab, '214556');
  assert.equal(mariana.intimacoes, 2);

  assert.ok(dados.partes.some((p) => p.polo === 'ATIVO'));

  // Auxiliares saem do texto e precisam declarar essa origem.
  const aj = dados.auxiliares.find((a) => a.papel === 'administrador_judicial');
  assert.ok(aj, 'deveria extrair o administrador judicial do texto');
  assert.equal(aj.nome, 'Ricardo Alves Monteiro');
  assert.match(aj.origem, /texto da publicação/);

  assert.ok(dados.auxiliares.some((a) => a.papel === 'perito'));
});

test('pdpj_identificar_envolvidos avisa que a extração precisa de conferência', async () => {
  const r = await client.callTool({
    name: 'pdpj_identificar_envolvidos',
    arguments: { numero: '1000123-69.2023.8.26.0100' },
  });
  const md = texto(r);
  assert.match(md, /Advogados constituídos/);
  assert.match(md, /não de campo estruturado/);
  assert.match(md, /OAB/);
});

test('pdpj_buscar_publicacoes exige ao menos um critério', async () => {
  const r = await client.callTool({ name: 'pdpj_buscar_publicacoes', arguments: {} });
  assert.equal((r as { isError?: boolean }).isError, true);
  assert.match(texto(r), /numero, oab .*nome_advogado/s);
});

test('pdpj_buscar_publicacoes lista as publicações do processo', async () => {
  const r = await client.callTool({
    name: 'pdpj_buscar_publicacoes',
    arguments: { numero: '1000123-69.2023.8.26.0100', response_format: 'json' },
  });
  const dados = dadosDe<{ total: number; publicacoes: { advogados: unknown[] }[] }>(r);
  assert.equal(dados.total, 2);
  assert.ok(dados.publicacoes[0].advogados.length >= 1);
});

test('pdpj_buscar_publicacoes só traz o texto quando pedido', async () => {
  const sem = await client.callTool({
    name: 'pdpj_buscar_publicacoes',
    arguments: { numero: '1000123-69.2023.8.26.0100', response_format: 'json' },
  });
  const com = await client.callTool({
    name: 'pdpj_buscar_publicacoes',
    arguments: {
      numero: '1000123-69.2023.8.26.0100',
      incluir_texto: true,
      response_format: 'json',
    },
  });
  const a = dadosDe<{ publicacoes: Record<string, unknown>[] }>(sem);
  const b = dadosDe<{ publicacoes: Record<string, unknown>[] }>(com);
  assert.equal(a.publicacoes[0].texto, undefined);
  assert.ok(typeof b.publicacoes[0].texto === 'string');
});

/* -------------------- recuperação judicial, ponta a ponta ------------------ */

const RJ = '1005544-74.2022.8.26.0100';

test('pdpj_dossie_recuperacao entrega as seções do dossiê', async () => {
  const r = await client.callTool({ name: 'pdpj_dossie_recuperacao', arguments: { numero: RJ } });
  const md = texto(r);

  for (const secao of [
    '## Identificação',
    '## Motivo do pedido',
    '## Fase e marcos',
    '## Fatores legais mais relevantes',
    '## Relação de credores',
    '## Ativos',
    '## O que não dá para obter por aqui',
  ]) {
    assert.ok(md.includes(secao), `seção ausente: ${secao}`);
  }

  const dados = dadosDe<{
    fase_id: string;
    parece_recuperacao: boolean;
    devedora: string | null;
    cnpj: string | null;
    marcos: unknown[];
    fatores_legais: unknown[];
  }>(r);

  assert.equal(dados.parece_recuperacao, true);
  assert.equal(dados.fase_id, 'concedida');
  assert.match(dados.devedora ?? '', /Metalúrgica Andrade/);
  assert.equal(dados.cnpj, '12.345.678/0001-90');
  assert.ok(dados.marcos.length >= 10);
  assert.ok(dados.fatores_legais.length >= 3);
});

test('o dossiê sempre carrega a ressalva sobre extração de texto', async () => {
  const md = texto(
    await client.callTool({ name: 'pdpj_dossie_recuperacao', arguments: { numero: RJ } }),
  );
  assert.match(md, /extraídos de texto/);
  assert.match(md, /não um inventário patrimonial/);
});

test('pdpj_relacao_credores pagina e filtra por classe', async () => {
  const r = await client.callTool({
    name: 'pdpj_relacao_credores',
    arguments: { numero: RJ, classe: 'ii_garantia_real', response_format: 'json' },
  });
  const dados = dadosDe<{
    credores: { nome: string; valor: number; classe: string }[];
    total_credores: number;
    credores_apos_filtros: number;
  }>(r);

  assert.equal(dados.total_credores, 10, 'o total original é preservado');
  assert.equal(dados.credores_apos_filtros, 2);
  assert.ok(dados.credores.every((c) => c.classe === 'ii_garantia_real'));
  assert.ok(
    dados.credores[0].valor >= dados.credores[1].valor,
    'a ordenação padrão é por valor, do maior para o menor',
  );
});

test('pdpj_relacao_credores filtra por valor mínimo e por nome', async () => {
  const porValor = dadosDe<{ credores_apos_filtros: number }>(
    await client.callTool({
      name: 'pdpj_relacao_credores',
      arguments: { numero: RJ, valor_minimo: 1000000, response_format: 'json' },
    }),
  );
  assert.equal(porValor.credores_apos_filtros, 3);

  const porNome = dadosDe<{ credores: { nome: string }[] }>(
    await client.callTool({
      name: 'pdpj_relacao_credores',
      arguments: { numero: RJ, contem: 'sindicato', response_format: 'json' },
    }),
  );
  assert.equal(porNome.credores.length, 1);
  assert.match(porNome.credores[0].nome, /SINDICATO/);
});

test('pdpj_ativos_garantias recorta os créditos fora do concurso', async () => {
  const dados = dadosDe<{ gravados: { submeteASeRj: boolean; tipo: string }[] }>(
    await client.callTool({
      name: 'pdpj_ativos_garantias',
      arguments: { numero: RJ, situacao: 'fora_do_concurso', response_format: 'json' },
    }),
  );
  assert.ok(dados.gravados.length >= 3);
  assert.ok(dados.gravados.every((g) => g.submeteASeRj === false));
});

test('pdpj_ativos_garantias sabe excluir as constrições', async () => {
  const com = dadosDe<{ total_gravados: number }>(
    await client.callTool({
      name: 'pdpj_ativos_garantias',
      arguments: { numero: RJ, response_format: 'json' },
    }),
  );
  const sem = dadosDe<{ total_gravados: number }>(
    await client.callTool({
      name: 'pdpj_ativos_garantias',
      arguments: { numero: RJ, incluir_constricoes: false, response_format: 'json' },
    }),
  );
  assert.ok(sem.total_gravados < com.total_gravados);
});

test('pdpj_historico_empresa agrupa as publicações por processo', async () => {
  const dados = dadosDe<{
    processos: { numero: string; publicacoes: number }[];
    empresa: string;
  }>(
    await client.callTool({
      name: 'pdpj_historico_empresa',
      arguments: { nome_empresa: 'Metalúrgica Andrade', response_format: 'json' },
    }),
  );
  assert.equal(dados.processos.length, 1);
  assert.equal(dados.processos[0].numero, RJ);
  assert.equal(dados.processos[0].publicacoes, 2);
});

test('os prompts do dossiê estão registrados e produzem roteiro', async () => {
  const { prompts } = await client.listPrompts();
  const nomes = prompts.map((p) => p.name).sort();
  assert.deepEqual(nomes, [
    'ativos_livres_e_gravados',
    'dossie_recuperacao_judicial',
    'relacao_de_credores',
  ]);

  const p = await client.getPrompt({
    name: 'dossie_recuperacao_judicial',
    arguments: { numero: RJ },
  });
  const conteudo = p.messages[0].content;
  assert.equal(conteudo.type, 'text');
  assert.match(conteudo.text as string, /pdpj_dossie_recuperacao/);
  assert.match(conteudo.text as string, new RegExp(RJ));
});

test('processo que não é recuperação recebe aviso, e não um dossiê inventado', async () => {
  const r = await client.callTool({
    name: 'pdpj_dossie_recuperacao',
    arguments: { numero: '1000123-69.2023.8.26.0100' },
  });
  assert.equal(dadosDe<{ parece_recuperacao: boolean }>(r).parece_recuperacao, false);
  assert.match(texto(r), /Nem a classe processual nem os movimentos indicam recuperação judicial/);
});
