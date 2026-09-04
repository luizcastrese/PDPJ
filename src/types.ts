/** Tipos do domínio: registros do DataJud e estruturas derivadas da análise. */

export interface CodigoNome {
  codigo?: number | string | null;
  nome?: string | null;
}

export interface OrgaoJulgador extends CodigoNome {
  codigoMunicipioIBGE?: number | null;
}

export interface ComplementoTabelado {
  codigo?: number | null;
  valor?: number | string | null;
  nome?: string | null;
  descricao?: string | null;
}

/** Movimento como vem da API do DataJud. */
export interface MovimentoBruto {
  codigo?: number | null;
  nome?: string | null;
  dataHora?: string | null;
  complementosTabelados?: ComplementoTabelado[];
}

/** Documento `_source` retornado pelo índice público do tribunal. */
export interface ProcessoBruto {
  numeroProcesso: string;
  tribunal?: string | null;
  grau?: string | null;
  dataAjuizamento?: string | null;
  dataHoraUltimaAtualizacao?: string | null;
  nivelSigilo?: number | null;
  id?: string | null;
  classe?: CodigoNome | null;
  assuntos?: CodigoNome[] | null;
  orgaoJulgador?: OrgaoJulgador | null;
  sistema?: CodigoNome | null;
  formato?: CodigoNome | null;
  movimentos?: MovimentoBruto[] | null;
  [chave: string]: unknown;
}

/** Movimento após ordenação e classificação. */
export interface Movimento {
  codigo: number | null;
  nome: string;
  data: string;
  ano: number;
  categoria: string;
  categoriaRotulo: string;
  diasDesdeAnterior: number | null;
  complementos: ComplementoTabelado[];
}

export interface Tribunal {
  alias: string;
  sigla: string;
  nome: string;
  segmento: number;
  codigo: string;
  grupo: string;
}

export interface PartesNumero {
  numero: string;
  sequencial: string;
  digito: string;
  ano: string;
  segmento: string;
  tribunal: string;
  origem: string;
}

export interface Marco {
  nome: string;
  data: string;
  codigo: number | null;
}

export interface Metricas {
  totalMovimentos: number;
  duracaoDias: number | null;
  duracaoTexto: string;
  diasSemMovimento: number | null;
  diasSemMovimentoTexto: string;
  diasAteSentenca: number | null;
  diasSentencaAteTransito: number | null;
  mediaDiasEntreMovimentos: number | null;
  movimentosPorAno: number | null;
  recursos: number;
  suspensoes: number;
  audiencias: number;
  decisoes: number;
  maiorIntervalo: { dias: number; ate: string; movimento: string } | null;
}

export type Tom = 'ok' | 'neutro' | 'alerta' | 'risco';

export interface Situacao {
  id: string;
  rotulo: string;
  tom: Tom;
  justificativa: string;
}

export interface Alerta {
  tom: Tom;
  texto: string;
}

export interface ProcessoNormalizado {
  numero: string;
  numeroFormatado: string;
  tribunal: string | null;
  tribunalSigla: string | null;
  grau: string | null;
  classe: CodigoNome | null;
  assuntos: CodigoNome[];
  orgaoJulgador: OrgaoJulgador | null;
  sistema: CodigoNome | null;
  formato: CodigoNome | null;
  nivelSigilo: number | null;
  dataAjuizamento: string | null;
  dataUltimaAtualizacao: string | null;
  segmento: string | null;
  id: string | null;
}

export interface Analise {
  processo: ProcessoNormalizado;
  movimentos: Movimento[];
  metricas: Metricas;
  marcos: Record<string, Marco>;
  porCategoria: { id: string; rotulo: string; total: number }[];
  porAno: { ano: number; total: number }[];
  situacao: Situacao;
  alertas: Alerta[];
  geradoEm: string;
}

export interface ResumoProcesso {
  numero: string;
  numeroFormatado: string;
  classe: string | null;
  assunto: string | null;
  orgao: string | null;
  grau: string | null;
  dataAjuizamento: string | null;
  totalMovimentos: number;
  ultimoMovimento: string | null;
}

export interface RespostaConsulta {
  tribunal: Tribunal;
  total: number;
  registros: ProcessoBruto[];
  cache: boolean;
}
