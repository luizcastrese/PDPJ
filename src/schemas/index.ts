import { z } from 'zod';
import { DEFAULT_LIMIT, MAX_LIMIT, DEFAULT_MOVIMENTOS } from '../constants.js';

/** Formato de saída aceito por todas as ferramentas que retornam dados. */
export const FormatoResposta = z
  .enum(['markdown', 'json'])
  .default('markdown')
  .describe(
    "Formato do texto retornado: 'markdown' para leitura humana (padrão) ou 'json' para dados completos.",
  );

export const NumeroProcesso = z
  .string()
  .min(15)
  .max(30)
  .describe(
    'Número único CNJ do processo, com ou sem máscara. Ex.: "1000123-45.2023.8.26.0100" ou "10001234520238260100".',
  );

export const AliasTribunal = z
  .string()
  .min(2)
  .max(12)
  .describe(
    'Alias ou sigla do tribunal (ex.: "tjsp", "trf3", "trt2", "stj"). Opcional: normalmente é deduzido do próprio número CNJ. Use para sobrepor a dedução.',
  );

export const IgnorarDigito = z
  .boolean()
  .default(false)
  .describe(
    'Consulta mesmo que o dígito verificador do número não confira. Use apenas se tiver certeza de que o número está correto.',
  );

export const Limit = z
  .number()
  .int()
  .min(1)
  .max(MAX_LIMIT)
  .default(DEFAULT_LIMIT)
  .describe(`Máximo de itens a retornar (1 a ${MAX_LIMIT}).`);

export const Offset = z
  .number()
  .int()
  .min(0)
  .default(0)
  .describe('Quantidade de itens a pular, para paginação.');

export const DataIso = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Use o formato AAAA-MM-DD.')
  .describe('Data no formato AAAA-MM-DD.');

/* ------------------------------ ferramentas ------------------------------ */

export const ConsultarProcessoInput = {
  numero: NumeroProcesso,
  tribunal: AliasTribunal.optional(),
  incluir_movimentos: z
    .boolean()
    .default(true)
    .describe('Inclui a lista de movimentações no resultado.'),
  max_movimentos: z
    .number()
    .int()
    .min(1)
    .max(500)
    .default(DEFAULT_MOVIMENTOS)
    .describe(
      `Quantos movimentos mais recentes trazer (padrão ${DEFAULT_MOVIMENTOS}). Use pdpj_listar_movimentos para percorrer o histórico completo.`,
    ),
  ignorar_digito: IgnorarDigito,
  response_format: FormatoResposta,
};

export const AnalisarProcessoInput = {
  numero: NumeroProcesso,
  tribunal: AliasTribunal.optional(),
  incluir_movimentos: z
    .boolean()
    .default(false)
    .describe('Anexa ao relatório a lista de movimentações mais recentes.'),
  ignorar_digito: IgnorarDigito,
  response_format: FormatoResposta,
};

export const ListarMovimentosInput = {
  numero: NumeroProcesso,
  tribunal: AliasTribunal.optional(),
  categoria: z
    .string()
    .optional()
    .describe(
      'Filtra por categoria de movimento (ex.: "sentenca", "recurso", "audiencia", "execucao"). Consulte as categorias disponíveis em pdpj_analisar_processo.',
    ),
  contem: z
    .string()
    .optional()
    .describe('Filtra movimentos cujo nome contenha este texto (sem diferenciar acentos ou maiúsculas).'),
  de: DataIso.optional().describe('Considera apenas movimentos a partir desta data (AAAA-MM-DD).'),
  ate: DataIso.optional().describe('Considera apenas movimentos até esta data (AAAA-MM-DD).'),
  ordem: z
    .enum(['recentes', 'antigos'])
    .default('recentes')
    .describe('Ordem da listagem: do mais recente ou do mais antigo.'),
  limit: Limit,
  offset: Offset,
  ignorar_digito: IgnorarDigito,
  response_format: FormatoResposta,
};

export const BuscarProcessosInput = {
  tribunal: AliasTribunal.describe(
    'Alias ou sigla do tribunal onde buscar (obrigatório: cada tribunal é um índice separado). Ex.: "tjsp", "trf3".',
  ),
  classe: z
    .string()
    .optional()
    .describe('Classe processual, por código (ex.: "7") ou por texto do nome (ex.: "Procedimento Comum Cível").'),
  assunto: z
    .string()
    .optional()
    .describe('Assunto, por código (ex.: "7681") ou por texto do nome (ex.: "Dano Moral").'),
  orgao_julgador: z
    .string()
    .optional()
    .describe('Texto do nome do órgão julgador (ex.: "5ª Vara Cível").'),
  grau: z
    .string()
    .optional()
    .describe('Grau de jurisdição, como registrado no DataJud (ex.: "G1", "G2", "JE").'),
  ajuizado_de: DataIso.optional().describe('Data inicial de ajuizamento (AAAA-MM-DD).'),
  ajuizado_ate: DataIso.optional().describe('Data final de ajuizamento (AAAA-MM-DD).'),
  ordenar_por: z
    .enum(['dataAjuizamento', 'dataHoraUltimaAtualizacao'])
    .default('dataAjuizamento')
    .describe('Campo de ordenação dos resultados.'),
  ordem: z.enum(['asc', 'desc']).default('desc').describe('Sentido da ordenação.'),
  limit: Limit,
  offset: Offset,
  response_format: FormatoResposta,
};

export const CompararProcessosInput = {
  numeros: z
    .array(NumeroProcesso)
    .min(2)
    .max(10)
    .describe('Lista de 2 a 10 números CNJ a comparar.'),
  tribunal: AliasTribunal.optional().describe(
    'Alias do tribunal aplicado a todos os números. Opcional: por padrão cada número é resolvido individualmente.',
  ),
  ignorar_digito: IgnorarDigito,
  response_format: FormatoResposta,
};

export const ConsultaAvancadaInput = {
  tribunal: AliasTribunal.describe('Alias ou sigla do tribunal cujo índice será consultado.'),
  query: z
    .record(z.string(), z.unknown())
    .describe(
      'Cláusula "query" do Elasticsearch, como objeto. Ex.: {"bool":{"must":[{"match":{"classe.nome":"Execução Fiscal"}}]}}.',
    ),
  size: z.number().int().min(1).max(MAX_LIMIT).default(DEFAULT_LIMIT).describe('Tamanho da página.'),
  from: z.number().int().min(0).default(0).describe('Deslocamento inicial.'),
  sort: z
    .array(z.record(z.string(), z.unknown()))
    .optional()
    .describe('Cláusula "sort" do Elasticsearch. Ex.: [{"dataAjuizamento":{"order":"desc"}}].'),
  response_format: FormatoResposta,
};

export const ValidarNumeroInput = {
  numero: z
    .string()
    .min(1)
    .describe('Número de processo a validar, com ou sem máscara.'),
  response_format: FormatoResposta,
};

export const ListarTribunaisInput = {
  filtro: z
    .string()
    .optional()
    .describe('Texto para filtrar por sigla, nome ou alias (ex.: "trt", "são paulo", "federal").'),
  segmento: z
    .number()
    .int()
    .min(1)
    .max(9)
    .optional()
    .describe(
      'Segmento do judiciário: 3 STJ, 4 Justiça Federal, 5 Trabalho, 6 Eleitoral, 7 Militar da União, 8 Estadual, 9 Militar Estadual.',
    ),
  response_format: FormatoResposta,
};
