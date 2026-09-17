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

export const BuscarPublicacoesInput = {
  numero: NumeroProcesso.optional().describe(
    'Número CNJ do processo cujas publicações se quer. Opcional se for informada uma OAB ou um nome.',
  ),
  oab: z
    .string()
    .optional()
    .describe('Número de inscrição na OAB, só dígitos (ex.: "214556"). Use junto com uf_oab.'),
  uf_oab: z
    .string()
    .length(2)
    .optional()
    .describe('UF da seccional da OAB (ex.: "SP").'),
  nome_advogado: z.string().optional().describe('Nome do advogado a procurar nas intimações.'),
  nome_parte: z.string().optional().describe('Nome da parte a procurar nas publicações.'),
  tribunal: AliasTribunal.optional().describe(
    'Sigla do tribunal para restringir a busca (ex.: "TJSP"). Deduzida do número quando ele é informado.',
  ),
  de: DataIso.optional().describe('Data inicial de disponibilização (AAAA-MM-DD).'),
  ate: DataIso.optional().describe('Data final de disponibilização (AAAA-MM-DD).'),
  incluir_texto: z
    .boolean()
    .default(false)
    .describe('Inclui o corpo completo de cada publicação (respostas ficam bem maiores).'),
  incluir_bruto: z
    .boolean()
    .default(false)
    .describe(
      'Anexa o primeiro registro cru da API, sem normalização. Use para diagnosticar campos não reconhecidos.',
    ),
  limit: Limit,
  offset: Offset,
  ignorar_digito: IgnorarDigito,
  response_format: FormatoResposta,
};

export const IdentificarEnvolvidosInput = {
  numero: NumeroProcesso,
  tribunal: AliasTribunal.optional().describe(
    'Sigla do tribunal, quando a dedução pelo número não servir.',
  ),
  max_publicacoes: z
    .number()
    .int()
    .min(1)
    .max(100)
    .default(50)
    .describe('Quantas publicações varrer para montar o quadro de envolvidos.'),
  incluir_contexto: z
    .boolean()
    .default(true)
    .describe('Mostra o trecho da publicação de onde cada auxiliar da justiça foi extraído.'),
  ignorar_digito: IgnorarDigito,
  response_format: FormatoResposta,
};

/* ------------------------- recuperação judicial -------------------------- */

const MaxPublicacoesRj = z
  .number()
  .int()
  .min(1)
  .max(100)
  .default(60)
  .describe(
    'Quantas publicações do DJEN varrer. Editais de credores costumam estar entre as mais antigas do processo; em recuperações longas, aumente.',
  );

export const DossieRecuperacaoInput = {
  numero: NumeroProcesso.describe(
    'Número CNJ do processo de recuperação judicial, com ou sem máscara.',
  ),
  tribunal: AliasTribunal.optional(),
  max_publicacoes: MaxPublicacoesRj,
  incluir_credores: z
    .boolean()
    .default(true)
    .describe('Tenta ler a relação de credores do edital publicado.'),
  incluir_ativos: z
    .boolean()
    .default(true)
    .describe('Levanta as menções a bens gravados, constrições e ativos declarados livres.'),
  max_credores_por_classe: z
    .number()
    .int()
    .min(1)
    .max(200)
    .default(15)
    .describe(
      'Quantos credores mostrar por classe no dossiê. Para a lista completa, use pdpj_relacao_credores.',
    ),
  ignorar_digito: IgnorarDigito,
  response_format: FormatoResposta,
};

export const RelacaoCredoresInput = {
  numero: NumeroProcesso,
  tribunal: AliasTribunal.optional(),
  fonte: z
    .enum(['auto', 'edital_52', 'edital_7', 'quadro_geral'])
    .default('auto')
    .describe(
      "Qual edital usar: 'edital_52' (relação do devedor, art. 52, §1º), 'edital_7' (relação do administrador judicial, art. 7º, §2º), 'quadro_geral' (art. 18) ou 'auto' para o mais completo encontrado.",
    ),
  classe: z
    .enum(['i_trabalhista', 'ii_garantia_real', 'iii_quirografario', 'iv_me_epp', 'extraconcursal'])
    .optional()
    .describe('Restringe a uma classe do art. 41 da Lei 11.101/2005.'),
  contem: z
    .string()
    .optional()
    .describe('Filtra credores cujo nome contenha este texto (sem diferenciar acentos ou caixa).'),
  valor_minimo: z
    .number()
    .min(0)
    .optional()
    .describe('Mostra apenas créditos de valor igual ou superior a este (em reais).'),
  ordenar_por: z
    .enum(['valor', 'nome', 'ordem_do_edital'])
    .default('valor')
    .describe('Ordenação dos credores dentro de cada classe.'),
  incluir_trecho: z
    .boolean()
    .default(false)
    .describe('Anexa a cada credor o trecho do edital de onde ele foi lido.'),
  max_publicacoes: MaxPublicacoesRj,
  limit: Limit,
  offset: Offset,
  ignorar_digito: IgnorarDigito,
  response_format: FormatoResposta,
};

export const AtivosGarantiasInput = {
  numero: NumeroProcesso,
  tribunal: AliasTribunal.optional(),
  situacao: z
    .enum(['todos', 'gravados', 'livres', 'fora_do_concurso'])
    .default('todos')
    .describe(
      "Recorte: 'gravados' (com ônus ou constrição), 'livres' (declarados desembaraçados), 'fora_do_concurso' (art. 49, §3º: fiduciária, leasing, reserva de domínio) ou 'todos'.",
    ),
  incluir_constricoes: z
    .boolean()
    .default(true)
    .describe('Inclui penhoras, bloqueios e indisponibilidades, que são constrição e não garantia.'),
  max_publicacoes: MaxPublicacoesRj,
  limit: Limit,
  ignorar_digito: IgnorarDigito,
  response_format: FormatoResposta,
};

export const HistoricoEmpresaInput = {
  nome_empresa: z
    .string()
    .min(3)
    .describe(
      'Razão social ou nome de fantasia da empresa, como aparece nas publicações (ex.: "Metalúrgica Andrade Ltda").',
    ),
  tribunal: AliasTribunal.optional().describe(
    'Sigla do tribunal para restringir a busca. Sem ela, a busca é nacional.',
  ),
  de: DataIso.optional().describe('Data inicial de disponibilização (AAAA-MM-DD).'),
  ate: DataIso.optional().describe('Data final de disponibilização (AAAA-MM-DD).'),
  max_publicacoes: z
    .number()
    .int()
    .min(1)
    .max(100)
    .default(100)
    .describe('Quantas publicações varrer para montar o histórico.'),
  response_format: FormatoResposta,
};

export const LocalizarProcessosInput = {
  nome: z
    .string()
    .min(3)
    .describe(
      'Nome do grupo econômico, razão social ou nome de fantasia. Aceita a forma como o grupo é conhecido ("Grupo Andrade"): o prefixo e a forma jurídica são removidos para chegar ao núcleo distintivo.',
    ),
  tribunal: AliasTribunal.optional().describe(
    'Sigla para restringir a busca. Sem ela, a busca é nacional.',
  ),
  somente_insolvencia: z
    .boolean()
    .default(true)
    .describe(
      'Mantém apenas processos de recuperação judicial, extrajudicial ou falência. Desligue para ver toda a carteira do grupo.',
    ),
  confirmar_no_datajud: z
    .boolean()
    .default(true)
    .describe(
      'Confirma os candidatos mais prováveis no DataJud, trazendo a classe oficial, o órgão julgador e a data de ajuizamento. Custa uma consulta por candidato e a API do CNJ é lenta.',
    ),
  max_confirmacoes: z
    .number()
    .int()
    .min(1)
    .max(5)
    .default(3)
    .describe('Quantos candidatos confirmar no DataJud (as consultas são feitas em paralelo).'),
  de: DataIso.optional().describe('Data inicial de disponibilização (AAAA-MM-DD).'),
  ate: DataIso.optional().describe('Data final de disponibilização (AAAA-MM-DD).'),
  max_publicacoes_por_variante: z
    .number()
    .int()
    .min(1)
    .max(100)
    .default(100)
    .describe('Quantas publicações varrer por variante do nome.'),
  limit: Limit,
  response_format: FormatoResposta,
};
