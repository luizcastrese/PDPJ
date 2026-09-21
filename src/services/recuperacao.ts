import type { Publicacao } from './djen.js';
import { lerData } from './analise.js';
import type { Movimento } from '../types.js';

/**
 * Motor de leitura de processos de recuperação judicial (Lei 11.101/2005).
 *
 * O DataJud publica metadados e movimentos; o DJEN publica o texto das
 * comunicações. Nenhuma das duas bases tem um campo "relação de credores",
 * "motivo do pedido" ou "relação de bens" — o que existe é o **edital**, que
 * por exigência legal (art. 52, §1º, e art. 7º, §2º) sai publicado com a
 * relação nominal de credores e o resumo do pedido do devedor.
 *
 * Por isso tudo aqui é extração de texto, não leitura de campo. Cada item
 * devolvido carrega o trecho de origem e a publicação de onde saiu, para que a
 * conferência humana seja possível — e necessária.
 */

const DIA_MS = 86400000;

/** Normaliza para comparação preservando os índices do texto original. */
function chave(texto: string): string {
  return texto
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase();
}

function contextoDe(texto: string, indice: number, tamanho = 220): string {
  const inicio = Math.max(0, indice - 60);
  return texto.slice(inicio, inicio + tamanho).replace(/\s+/g, ' ').trim();
}

/** "1.234.567,89" -> 1234567.89. Devolve null se não for um valor em reais. */
export function lerValor(bruto: string): number | null {
  const limpo = bruto.replace(/\s/g, '');
  const m = /^(\d{1,3}(?:\.\d{3})*|\d+)(?:,(\d{1,2}))?$/.exec(limpo);
  if (!m) return null;
  const centavos = (m[2] ?? '0').padEnd(2, '0');
  return Number(`${m[1].replace(/\./g, '')}.${centavos}`);
}

/** Formata em reais sem depender do ICU do ambiente. */
export function moeda(valor: number | null | undefined): string {
  if (valor === null || valor === undefined || !Number.isFinite(valor)) return '—';
  const [inteiro, decimal] = valor.toFixed(2).split('.');
  return `R$ ${inteiro.replace(/\B(?=(\d{3})+(?!\d))/g, '.')},${decimal}`;
}

/* ------------------------------ marcos da LRF ----------------------------- */

export interface MarcoRj {
  id: string;
  rotulo: string;
  /** Fundamento legal do marco, para citação no relatório. */
  base: string;
  data: string;
  movimento: string;
  ocorrencias: number;
  /**
   * De onde o marco foi reconhecido. O nome do movimento é evidência mais
   * forte: vem de campo, e a data é a do ato. O texto da publicação é
   * evidência mais fraca e a data é a da disponibilização no diário, alguns
   * dias depois do ato — mas é a única fonte quando o tribunal registra
   * movimentos genéricos.
   */
  origem: 'movimento' | 'publicacao';
  /** Trecho de onde o marco saiu, quando veio de publicação. */
  contexto?: string;
}

interface PadraoMarco {
  id: string;
  rotulo: string;
  base: string;
  padrao: RegExp;
}

/**
 * Reconhecimento dos marcos, usado contra duas superfícies bem diferentes: o
 * **nome do movimento** na Tabela Processual Unificada, que é nominalizado
 * ("Deferimento do processamento"), e o **texto da decisão publicada**, que é
 * escrito na primeira pessoa ("Defiro o processamento", "Concedo", "Nomeio").
 * Por isso cada padrão cobre as duas formas — cobrir só a primeira foi o erro
 * que deixou o reconhecimento cego no texto.
 *
 * A ordem importa: o primeiro padrão que casa vence, e os desfechos (falência,
 * encerramento, concessão) vêm antes dos atos de trâmite para que "concessão
 * da recuperação judicial" não seja lido como um mero "processamento".
 *
 * O `\b` antes de "defiro" não é decoração: sem ele, "indefiro o
 * processamento" casaria como deferimento e inverteria a decisão.
 */
export const PADROES_MARCO: PadraoMarco[] = [
  {
    id: 'falencia',
    rotulo: 'Convolação em falência',
    base: 'art. 73 da Lei 11.101/2005',
    padrao: /convola|decret\w*.{0,20}falencia|falencia.{0,20}decretada/,
  },
  {
    id: 'encerramento',
    rotulo: 'Encerramento da recuperação judicial',
    base: 'art. 63 da Lei 11.101/2005',
    padrao: /encerr\w*.{0,25}recuperacao|encerramento do processo de recuperacao/,
  },
  {
    id: 'concessao',
    rotulo: 'Concessão da recuperação judicial',
    base: 'art. 58 da Lei 11.101/2005',
    padrao: /\bconce[sd]\w*.{0,30}recuperacao|recuperacao judicial concedida/,
  },
  {
    id: 'homologacao_plano',
    rotulo: 'Homologação do plano',
    base: 'art. 58 da Lei 11.101/2005',
    padrao: /homolog\w*.{0,25}plano/,
  },
  {
    id: 'rejeicao_plano',
    rotulo: 'Rejeição do plano em assembleia',
    base: 'art. 56, §4º, da Lei 11.101/2005',
    padrao: /rejei\w*.{0,25}plano|plano.{0,20}rejeitad/,
  },
  {
    id: 'aprovacao_plano',
    rotulo: 'Aprovação do plano em assembleia',
    base: 'art. 45 da Lei 11.101/2005',
    padrao: /aprov\w*.{0,25}plano|plano.{0,20}aprovad/,
  },
  {
    id: 'apresentacao_plano',
    rotulo: 'Apresentação do plano de recuperação',
    base: 'art. 53 da Lei 11.101/2005',
    padrao: /apresentacao do plano|juntada.{0,30}plano de recuperacao|plano de recuperacao.{0,20}apresentad/,
  },
  {
    id: 'assembleia',
    rotulo: 'Assembleia geral de credores',
    base: 'arts. 35 a 46 da Lei 11.101/2005',
    padrao: /assembleia.{0,15}(geral)?.{0,5}de credores|assembleia-geral de credores|\bagc\b/,
  },
  {
    id: 'prorrogacao_stay',
    rotulo: 'Prorrogação do período de suspensão (stay period)',
    base: 'art. 6º, §4º, da Lei 11.101/2005',
    padrao: /prorrog\w*.{0,40}(suspensao|stay|blindagem)|prorrogacao do prazo de suspensao/,
  },
  {
    id: 'suspensao_acoes',
    rotulo: 'Suspensão das ações e execuções',
    base: 'art. 6º da Lei 11.101/2005',
    padrao: /suspensao d[ao]s? (acoes|execucoes)|sobrestamento das execucoes/,
  },
  {
    id: 'deferimento',
    rotulo: 'Deferimento do processamento da recuperação',
    base: 'art. 52 da Lei 11.101/2005',
    padrao: /deferimento do processamento|\bdef[ei]r\w*\s+(?:[oa]\s+|d[eo]\s+)?processamento|processamento.{0,20}deferid/,
  },
  {
    id: 'indeferimento',
    rotulo: 'Indeferimento do pedido',
    base: 'art. 51 c/c art. 52 da Lei 11.101/2005',
    padrao: /indefer\w*\s+d[ao]\s+(?:peticao\s+)?inicial|\bindef[ei]r\w*.{0,30}recuperacao/,
  },
  {
    id: 'constatacao_previa',
    rotulo: 'Constatação prévia',
    base: 'art. 51-A da Lei 11.101/2005',
    padrao: /constatacao previa|pericia previa/,
  },
  {
    id: 'nomeacao_aj',
    rotulo: 'Nomeação do administrador judicial',
    base: 'art. 21 da Lei 11.101/2005',
    padrao: /nome[ai]\w*.{0,30}administrador judicial|administrador judicial nomead/,
  },
  {
    id: 'edital_credores',
    rotulo: 'Edital com relação de credores',
    base: 'art. 52, §1º, e art. 7º, §2º, da Lei 11.101/2005',
    padrao: /edital.{0,40}(credores|art.{0,4}52|art.{0,4}7)|relacao de credores/,
  },
  {
    id: 'quadro_geral',
    rotulo: 'Quadro geral de credores',
    base: 'art. 18 da Lei 11.101/2005',
    padrao: /quadro geral de credores|\bqgc\b/,
  },
  {
    id: 'habilitacao',
    rotulo: 'Habilitação de crédito',
    base: 'arts. 9º e 10 da Lei 11.101/2005',
    padrao: /habilitacao (de|do) credito|habilitacao retardataria/,
  },
  {
    id: 'impugnacao',
    rotulo: 'Impugnação de crédito',
    base: 'art. 8º da Lei 11.101/2005',
    padrao: /impugnacao (de|ao|do) credito/,
  },
  {
    id: 'alienacao_ativo',
    rotulo: 'Alienação de ativo / unidade produtiva isolada',
    base: 'arts. 60, 66 e 142 da Lei 11.101/2005',
    padrao: /unidade produtiva isolada|\bupi\b|alienac.{0,25}(ativo|filial|unidade|bem)/,
  },
  {
    id: 'financiamento',
    rotulo: 'Financiamento do devedor em recuperação (DIP)',
    base: 'arts. 69-A a 69-F da Lei 11.101/2005',
    padrao: /financiamento.{0,30}(devedor|recuperand|empresa)|\bdip\b/,
  },
];

/** Encontra os marcos da recuperação no histórico de movimentos. */
export function extrairMarcos(movimentos: Movimento[]): MarcoRj[] {
  const mapa = new Map<string, MarcoRj>();

  for (const mov of movimentos) {
    const k = chave(mov.nome);
    const padrao = PADROES_MARCO.find((p) => p.padrao.test(k));
    if (!padrao) continue;

    const atual = mapa.get(padrao.id);
    if (atual) {
      atual.ocorrencias += 1;
      // Para assembleia, habilitação e afins, a ocorrência mais recente é a
      // que interessa; para os marcos de desfecho, a primeira já basta e a
      // data não muda porque não voltam a acontecer.
      if (mov.data > atual.data) {
        atual.data = mov.data;
        atual.movimento = mov.nome;
      }
      continue;
    }
    mapa.set(padrao.id, {
      id: padrao.id,
      rotulo: padrao.rotulo,
      base: padrao.base,
      data: mov.data,
      movimento: mov.nome,
      ocorrencias: 1,
      origem: 'movimento',
    });
  }

  return [...mapa.values()].sort((a, b) => a.data.localeCompare(b.data));
}

/**
 * Reconhece os mesmos marcos no **texto** das publicações.
 *
 * Existe porque a Tabela Processual Unificada é usada com granularidades muito
 * diferentes: há tribunais que registram "Deferimento do processamento da
 * recuperação judicial", e há tribunais — o TJSP entre eles — cujo histórico
 * inteiro é "Petição", "Documento", "Conclusão" e um genérico "Recuperação
 * judicial". Nesses, o marco só existe escrito, no corpo do que foi publicado.
 *
 * A contrapartida é honesta e fica registrada em cada item: a data é a da
 * disponibilização no diário, não a do ato, e prosa admite falso positivo que
 * um nome de movimento não admite. Por isso todo marco assim carrega o trecho
 * de origem e vem marcado como vindo de publicação.
 */
export function extrairMarcosDeTexto(publicacoes: Publicacao[]): MarcoRj[] {
  const mapa = new Map<string, MarcoRj>();

  for (const pub of publicacoes) {
    if (!pub.texto || !pub.dataDisponibilizacao) continue;
    const alvo = chave(pub.texto);

    for (const padrao of PADROES_MARCO) {
      padrao.padrao.lastIndex = 0;
      const m = padrao.padrao.exec(alvo);
      if (!m) continue;

      const data = new Date(pub.dataDisponibilizacao).toISOString();
      const atual = mapa.get(padrao.id);
      if (atual) {
        atual.ocorrencias += 1;
        if (data > atual.data) {
          atual.data = data;
          atual.contexto = contextoDe(pub.texto, m.index);
        }
        continue;
      }

      mapa.set(padrao.id, {
        id: padrao.id,
        rotulo: padrao.rotulo,
        base: padrao.base,
        data,
        movimento: `Reconhecido no texto da publicação de ${pub.dataDisponibilizacao}`,
        ocorrencias: 1,
        origem: 'publicacao',
        contexto: contextoDe(pub.texto, m.index),
      });
    }
  }

  return [...mapa.values()].sort((a, b) => a.data.localeCompare(b.data));
}

/**
 * Reúne os marcos das duas fontes. O movimento ganha sempre que existe: é
 * campo, e a data é a do ato. A publicação entra para os marcos que o
 * histórico de movimentos não nomeou — que, nos tribunais de registro
 * genérico, são quase todos.
 */
export function combinarMarcos(
  dosMovimentos: MarcoRj[],
  dasPublicacoes: MarcoRj[],
): MarcoRj[] {
  const mapa = new Map(dosMovimentos.map((m) => [m.id, m]));
  for (const m of dasPublicacoes) {
    if (!mapa.has(m.id)) mapa.set(m.id, m);
  }
  return [...mapa.values()].sort((a, b) => a.data.localeCompare(b.data));
}

export type FaseRj =
  | 'pedido'
  | 'constatacao_previa'
  | 'processamento_deferido'
  | 'plano_apresentado'
  | 'assembleia'
  | 'concedida'
  | 'encerrada'
  | 'falencia'
  | 'indeferida';

export interface Fase {
  id: FaseRj;
  rotulo: string;
  desde: string | null;
  base: string;
  justificativa: string;
}

/** Deduz em que fase da LRF o processo está, pelo marco mais avançado. */
export function deduzirFase(marcos: MarcoRj[]): Fase {
  const por = (id: string) => marcos.find((m) => m.id === id) ?? null;

  const ordem: { id: FaseRj; rotulo: string; marco: string; base: string; texto: string }[] = [
    { id: 'falencia', rotulo: 'Falência decretada', marco: 'falencia', base: 'art. 73 da Lei 11.101/2005', texto: 'há movimento de convolação em falência ou decretação de falência.' },
    { id: 'encerrada', rotulo: 'Recuperação encerrada', marco: 'encerramento', base: 'art. 63 da Lei 11.101/2005', texto: 'há movimento de encerramento da recuperação judicial.' },
    { id: 'concedida', rotulo: 'Recuperação concedida', marco: 'concessao', base: 'art. 58 da Lei 11.101/2005', texto: 'o plano foi homologado e a recuperação, concedida — segue o biênio de fiscalização judicial do art. 61.' },
    { id: 'assembleia', rotulo: 'Plano em deliberação', marco: 'assembleia', base: 'arts. 35 a 46 da Lei 11.101/2005', texto: 'há assembleia geral de credores designada ou realizada, sem concessão registrada.' },
    { id: 'plano_apresentado', rotulo: 'Plano apresentado', marco: 'apresentacao_plano', base: 'art. 53 da Lei 11.101/2005', texto: 'o plano de recuperação foi apresentado e ainda não há deliberação registrada.' },
    { id: 'processamento_deferido', rotulo: 'Processamento deferido', marco: 'deferimento', base: 'art. 52 da Lei 11.101/2005', texto: 'o processamento foi deferido; corre a fase de verificação de créditos.' },
    { id: 'constatacao_previa', rotulo: 'Constatação prévia', marco: 'constatacao_previa', base: 'art. 51-A da Lei 11.101/2005', texto: 'houve determinação de constatação prévia antes de decidir sobre o processamento.' },
  ];

  const indeferimento = por('indeferimento');
  const deferimento = por('deferimento');
  if (indeferimento && (!deferimento || indeferimento.data > deferimento.data)) {
    return {
      id: 'indeferida',
      rotulo: 'Pedido indeferido',
      desde: indeferimento.data,
      base: 'art. 51 c/c art. 52 da Lei 11.101/2005',
      justificativa: 'o movimento mais recente entre os decisórios é de indeferimento.',
    };
  }

  for (const item of ordem) {
    const marco = por(item.marco);
    if (marco) {
      return {
        id: item.id,
        rotulo: item.rotulo,
        desde: marco.data,
        base: item.base,
        justificativa: item.texto,
      };
    }
  }

  return {
    id: 'pedido',
    rotulo: 'Pedido em análise',
    desde: null,
    base: 'art. 51 da Lei 11.101/2005',
    justificativa: 'não há movimento de deferimento do processamento no histórico consultado.',
  };
}

/* ------------------------------ stay period ------------------------------ */

export interface StayPeriod {
  inicio: string;
  fimPrevisto: string;
  diasTotais: number;
  prorrogado: boolean;
  diasDecorridos: number;
  diasRestantes: number;
  vigente: boolean;
}

/**
 * Calcula o período de blindagem a partir do deferimento: 180 dias corridos,
 * prorrogáveis uma vez por igual período (art. 6º, §4º, com a redação da Lei
 * 14.112/2020). É cálculo de calendário sobre a data do movimento — o juízo
 * pode ter fixado termo diverso, e suspensões próprias não aparecem aqui.
 */
export function calcularStay(marcos: MarcoRj[], referencia = new Date()): StayPeriod | null {
  const deferimento = marcos.find((m) => m.id === 'deferimento');
  if (!deferimento) return null;

  const prorrogado = marcos.some((m) => m.id === 'prorrogacao_stay');
  const diasTotais = prorrogado ? 360 : 180;
  const inicio = lerData(deferimento.data);
  if (!inicio) return null;

  const fim = new Date(inicio.getTime() + diasTotais * DIA_MS);
  const decorridos = Math.floor((referencia.getTime() - inicio.getTime()) / DIA_MS);

  return {
    inicio: inicio.toISOString(),
    fimPrevisto: fim.toISOString(),
    diasTotais,
    prorrogado,
    diasDecorridos: Math.max(0, decorridos),
    diasRestantes: Math.round((fim.getTime() - referencia.getTime()) / DIA_MS),
    vigente: referencia.getTime() <= fim.getTime(),
  };
}

/* --------------------------- motivo do pedido ----------------------------- */

export interface IndicioMotivo {
  causa: string;
  rotulo: string;
  trecho: string;
  publicacao: string | null;
  data: string | null;
}

const CAUSAS: { id: string; rotulo: string; padrao: RegExp }[] = [
  { id: 'pandemia', rotulo: 'Pandemia / covid-19', padrao: /pandemi|covid|coronavirus/g },
  { id: 'queda_receita', rotulo: 'Queda de faturamento ou de vendas', padrao: /queda (d[eoa]s?\s+)?(faturamento|receita|vendas|demanda)|reducao (d[eoa]s?\s+)?(faturamento|receita|vendas)|retracao (d[eoa]s?\s+)?(mercado|vendas|demanda)/g },
  { id: 'endividamento', rotulo: 'Endividamento e custo financeiro', padrao: /endividamento|alavancagem|divida bancaria|custo financeiro|juros elevados|encargos financeiros/g },
  { id: 'inadimplencia', rotulo: 'Inadimplência de clientes', padrao: /inadimplenc|inadimplemento d[oe]s? (clientes|contratantes)/g },
  { id: 'contratos', rotulo: 'Perda ou rescisão de contratos', padrao: /rescisao (contratual|de contrato)|perda d[eo]s? contrato|encerramento d[eo]s? contrato|quebra de contrato/g },
  { id: 'custos', rotulo: 'Aumento de custos e insumos', padrao: /aumento d[oe]s? custo|elevacao d[oe]s? custo|custo d[eo]s? insumo|materia[- ]prima/g },
  { id: 'cambio', rotulo: 'Variação cambial', padrao: /variacao cambial|cambio|dolarizad|exposicao ao dolar/g },
  { id: 'constricoes', rotulo: 'Constrições e execuções em curso', padrao: /(bloqueio|penhora|constric)[a-z]* (judicia|de conta|online)|multiplas execucoes|execucoes fiscais em curso/g },
  { id: 'setor', rotulo: 'Crise setorial ou concorrência', padrao: /crise (setorial|do setor)|crise economica|concorrencia (predatoria|desleal)|mudanca regulatoria/g },
  { id: 'gestao', rotulo: 'Gestão, sucessão ou sociedade', padrao: /ma gestao|gestao anterior|sucessao (familiar|empresarial)|conflito societario|retirada de socio/g },
  { id: 'clima', rotulo: 'Evento climático ou quebra de safra', padrao: /estiagem|\bseca\b|enchente|geada|quebra de safra|evento climatico|intemperie/g },
  { id: 'crise_generica', rotulo: 'Crise econômico-financeira (referência genérica)', padrao: /crise economico[- ]financeira|dificuldade(s)? financeira|desequilibrio economico|insuficiencia de caixa|falta de capital de giro/g },
];

/**
 * Procura, no texto das publicações, o resumo do pedido do devedor — que o
 * edital do art. 52, §1º, I, é obrigado a conter — e classifica as causas
 * mencionadas. O que sai daqui são trechos, não um diagnóstico: a leitura do
 * motivo é do humano, sobre o trecho citado.
 */
export function extrairMotivos(publicacoes: Publicacao[]): IndicioMotivo[] {
  const achados: IndicioMotivo[] = [];
  const vistos = new Set<string>();

  for (const pub of publicacoes) {
    if (!pub.texto) continue;
    const alvo = chave(pub.texto);

    for (const causa of CAUSAS) {
      causa.padrao.lastIndex = 0;
      let m: RegExpExecArray | null;
      while ((m = causa.padrao.exec(alvo)) !== null) {
        const trecho = contextoDe(pub.texto, m.index);
        const id = `${causa.id}|${chave(trecho).slice(0, 60)}`;
        if (vistos.has(id)) continue;
        vistos.add(id);
        achados.push({
          causa: causa.id,
          rotulo: causa.rotulo,
          trecho,
          publicacao: pub.id,
          data: pub.dataDisponibilizacao,
        });
      }
    }
  }
  return achados;
}

/* ---------------------------- relação de credores ------------------------- */

export interface ClasseCredor {
  id: string;
  rotulo: string;
  base: string;
  padrao: RegExp;
}

/**
 * As quatro classes do art. 41, mais um balde para os créditos que o próprio
 * edital costuma listar à parte por não se submeterem ao concurso.
 */
export const CLASSES: ClasseCredor[] = [
  {
    id: 'i_trabalhista',
    rotulo: 'Classe I — Trabalhistas e acidente de trabalho',
    base: 'art. 41, I, da Lei 11.101/2005',
    padrao: /class[ei]\s*(?:i|1)\b(?![iv])|credores?\s+trabalhistas?|derivados?\s+da\s+legislacao\s+do\s+trabalho/g,
  },
  {
    id: 'ii_garantia_real',
    rotulo: 'Classe II — Com garantia real',
    base: 'art. 41, II, da Lei 11.101/2005',
    padrao: /class[ei]\s*(?:ii|2)\b(?!i)|garantia\s+real/g,
  },
  {
    id: 'iii_quirografario',
    rotulo: 'Classe III — Quirografários, com privilégio e subordinados',
    base: 'art. 41, III, da Lei 11.101/2005',
    padrao: /class[ei]\s*(?:iii|3)\b|quirografari/g,
  },
  {
    id: 'iv_me_epp',
    rotulo: 'Classe IV — Microempresas e empresas de pequeno porte',
    base: 'art. 41, IV, da Lei 11.101/2005',
    padrao: /class[ei]\s*(?:iv|4)\b|microempresa|empresas?\s+de\s+pequeno\s+porte|\bme\s*\/\s*epp\b/g,
  },
  {
    id: 'extraconcursal',
    rotulo: 'Extraconcursais / não sujeitos à recuperação',
    base: 'art. 49, §3º, da Lei 11.101/2005',
    padrao: /extraconcursa|nao\s+sujeit|nao\s+submetid/g,
  },
];

export interface Credor {
  nome: string;
  documento: string | null;
  valor: number | null;
  classe: string;
  classeRotulo: string;
  trecho: string;
}

export interface RelacaoCredores {
  fonte: {
    publicacao: string | null;
    data: string | null;
    tipo: string | null;
    orgao: string | null;
    fundamento: string;
  };
  classes: {
    id: string;
    rotulo: string;
    base: string;
    credores: Credor[];
    total: number;
    soma: number | null;
  }[];
  totalCredores: number;
  somaGeral: number | null;
  valoresNaoAtribuidos: number;
  avisos: string[];
}

/** Rótulos que aparecem onde um nome deveria estar e não são credores. */
const NAO_E_NOME =
  /^(total|subtotal|soma|montante|valor|saldo|geral|somatorio|classe|relacao|quadro|edital|prazo|art|artigo|lei|obs|observac)/;

const FUNDAMENTOS: { padrao: RegExp; rotulo: string }[] = [
  {
    padrao: /quadro geral de credores|art\.? ?18/,
    rotulo: 'Quadro geral de credores (art. 18 da Lei 11.101/2005)',
  },
  {
    padrao: /art\.? ?7[^0-9]{0,12}(§ ?2|paragrafo segundo)|relacao de credores (apresentada )?pelo administrador/,
    rotulo: 'Relação de credores do administrador judicial (art. 7º, §2º, da Lei 11.101/2005)',
  },
  {
    padrao: /art\.? ?52/,
    rotulo: 'Edital do deferimento do processamento (art. 52, §1º, da Lei 11.101/2005)',
  },
];

/**
 * Identifica de que dispositivo veio o edital. O cabeçalho é examinado antes
 * do corpo: é ali que o edital se identifica ("EDITAL — art. 52, §1º"), ao
 * passo que o corpo cita vários outros artigos de passagem — o do art. 52, por
 * exemplo, termina remetendo ao prazo do art. 7º, §1º.
 */
function fundamentoDoEdital(texto: string): string {
  const cabecalho = chave(texto.slice(0, 400));
  const corpo = chave(texto);

  for (const alvo of [cabecalho, corpo]) {
    const achado = FUNDAMENTOS.find((f) => f.padrao.test(alvo));
    if (achado) return achado.rotulo;
  }
  return 'Edital com relação de credores (fundamento não identificado no texto)';
}

/** Pontuação de quão "edital de credores" é uma publicação. */
function pontuarEdital(pub: Publicacao): number {
  const k = chave(pub.texto ?? '');
  if (!k) return 0;
  let pontos = 0;
  if (/relacao (nominal )?de credores|quadro geral de credores/.test(k)) pontos += 40;
  if (/\bedital\b/.test(k)) pontos += 15;
  for (const classe of CLASSES) {
    classe.padrao.lastIndex = 0;
    if (classe.padrao.test(k)) pontos += 8;
  }
  const valores = (pub.texto.match(/R\$/g) ?? []).length;
  pontos += Math.min(valores, 60);
  return pontos;
}

/** Escolhe a publicação que mais se parece com um edital de credores. */
export function escolherEdital(
  publicacoes: Publicacao[],
  preferencia?: 'edital_52' | 'edital_7' | 'quadro_geral',
): Publicacao | null {
  const candidatos = publicacoes
    .map((p) => ({ pub: p, pontos: pontuarEdital(p) }))
    .filter((c) => c.pontos >= 20);

  if (!candidatos.length) return null;

  if (preferencia) {
    const alvo =
      preferencia === 'quadro_geral'
        ? /quadro geral de credores|art.{0,5}18/
        : preferencia === 'edital_7'
          ? /art.{0,5}7[^0-9]/
          : /art.{0,5}52/;
    const filtrados = candidatos.filter((c) => alvo.test(chave(c.pub.texto)));
    if (filtrados.length) {
      return filtrados.sort((a, b) => b.pontos - a.pontos)[0].pub;
    }
  }

  return candidatos.sort((a, b) => b.pontos - a.pontos)[0].pub;
}

interface Segmento {
  classe: ClasseCredor | null;
  /** Início do conteúdo, já depois do cabeçalho da classe. */
  inicio: number;
  fim: number;
}

/** Fatia o texto do edital nos trechos de cada classe do art. 41. */
function segmentarPorClasse(texto: string): Segmento[] {
  const alvo = chave(texto);
  const cortes: { classe: ClasseCredor; indice: number; fimCabecalho: number }[] = [];

  for (const classe of CLASSES) {
    classe.padrao.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = classe.padrao.exec(alvo)) !== null) {
      cortes.push({ classe, indice: m.index, fimCabecalho: m.index + m[0].length });
    }
  }

  if (!cortes.length) return [{ classe: null, inicio: 0, fim: texto.length }];

  cortes.sort((a, b) => a.indice - b.indice);

  const segmentos: Segmento[] = [];
  for (let i = 0; i < cortes.length; i += 1) {
    const fim = i + 1 < cortes.length ? cortes[i + 1].indice : texto.length;
    // Cabeçalhos repetidos da mesma classe não abrem um segmento novo vazio.
    if (fim - cortes[i].indice < 8) continue;
    // O conteúdo começa depois do próprio cabeçalho, para que "Classe I" não
    // seja lido como o nome do primeiro credor da lista.
    segmentos.push({ classe: cortes[i].classe, inicio: cortes[i].fimCabecalho, fim });
  }
  return segmentos.length ? segmentos : [{ classe: null, inicio: 0, fim: texto.length }];
}

const DOCUMENTO = /(\d{2}\.?\d{3}\.?\d{3}\/?\d{4}-?\d{2}|\d{3}\.?\d{3}\.?\d{3}-?\d{2})/;

/** Limpa o pedaço de texto que antecede um valor e tenta ler dele um credor. */
function lerCredor(bruto: string): { nome: string; documento: string | null } | null {
  let trecho = bruto.replace(/\s+/g, ' ').trim();

  const doc = DOCUMENTO.exec(trecho);
  const documento = doc ? doc[1] : null;
  if (doc) trecho = trecho.replace(doc[1], ' ');

  trecho = trecho
    // Restos da entrada anterior: ponto-e-vírgula, quebra de linha, bullet ou
    // dois-pontos de um rótulo ("Classe I — trabalhistas: Fulano R$ ...").
    .split(/[;\n:•|]/)
    .pop()!
    // Numeração da lista: "12)", "12 -", "012.".
    .replace(/^\s*\d{1,5}\s*[).\-–—]?\s*/, '')
    // Rótulos de coluna que precedem o valor.
    .replace(/\b(cnpj|cpf|valor|credito|crédito|r\$|classe|moeda|brl)\b\s*[:\-–—]?\s*$/gi, '')
    .replace(/[\s:,\-–—]+$/, '')
    // Tira o ponto final da frase, mas preserva o de abreviaturas como "S.A.".
    .replace(/(?<![A-ZÀ-Ý])\.+$/, '')
    .replace(/[\s:,\-–—]+$/, '')
    .replace(/^[\s:,\-–—.]+/, '')
    .trim();

  // O nome fica no fim do pedaço; palavras demais são texto corrido do edital.
  const palavras = trecho.split(/\s+/);
  if (palavras.length > 14) trecho = palavras.slice(-14).join(' ');

  if (trecho.length < 4) return null;
  if (!/[A-Za-zÀ-ÿ]{3}/.test(trecho)) return null;
  if (NAO_E_NOME.test(chave(trecho))) return null;

  return { nome: trecho, documento };
}

/**
 * Lê a relação de credores do texto de um edital.
 *
 * O formato não é padronizado: cada tribunal, cada administrador judicial e
 * cada sistema imprime de um jeito. O que é constante é o par nome → valor em
 * reais, e é sobre isso que a leitura se apoia — o nome é o texto que antecede
 * cada "R$" dentro do segmento da classe. Valores sem nome legível são
 * contados à parte, em vez de virarem um credor inventado.
 */
export function extrairCredores(pub: Publicacao): RelacaoCredores {
  const texto = pub.texto ?? '';
  const segmentos = segmentarPorClasse(texto);
  const avisos: string[] = [];
  let naoAtribuidos = 0;

  const porClasse = new Map<string, Credor[]>();

  for (const seg of segmentos) {
    const pedaco = texto.slice(seg.inicio, seg.fim);
    const classe = seg.classe;
    const idClasse = classe?.id ?? 'nao_informada';
    const rotuloClasse = classe?.rotulo ?? 'Classe não identificada no texto';

    const valores = /R\$\s*([\d.]{1,20}(?:,\d{1,2})?)/g;
    let m: RegExpExecArray | null;
    let cursor = 0;

    while ((m = valores.exec(pedaco)) !== null) {
      const antes = pedaco.slice(cursor, m.index);
      cursor = m.index + m[0].length;

      const valor = lerValor(m[1]);
      const credor = lerCredor(antes);

      if (!credor) {
        naoAtribuidos += 1;
        continue;
      }

      const lista = porClasse.get(idClasse) ?? [];
      lista.push({
        nome: credor.nome,
        documento: credor.documento,
        valor,
        classe: idClasse,
        classeRotulo: rotuloClasse,
        trecho: `${antes.replace(/\s+/g, ' ').trim()} ${m[0]}`.trim().slice(-200),
      });
      porClasse.set(idClasse, lista);
    }
  }

  const classes = [...porClasse.entries()].map(([id, credores]) => {
    const meta = CLASSES.find((c) => c.id === id);
    const comValor = credores.filter((c) => c.valor !== null);
    return {
      id,
      rotulo: meta?.rotulo ?? 'Classe não identificada no texto',
      base: meta?.base ?? '—',
      credores,
      total: credores.length,
      soma: comValor.length ? comValor.reduce((s, c) => s + (c.valor ?? 0), 0) : null,
    };
  });

  // Mantém a ordem legal das classes, com a não identificada por último.
  const ordem = CLASSES.map((c) => c.id);
  classes.sort((a, b) => {
    const ia = ordem.indexOf(a.id);
    const ib = ordem.indexOf(b.id);
    return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib);
  });

  const totalCredores = classes.reduce((s, c) => s + c.total, 0);
  const somaGeral = classes.some((c) => c.soma !== null)
    ? classes.reduce((s, c) => s + (c.soma ?? 0), 0)
    : null;

  if (!totalCredores) {
    avisos.push(
      'Nenhum par nome → valor foi reconhecido no texto. O edital pode estar publicado só como link para anexo, ou em layout de tabela que a publicação perdeu.',
    );
  }
  if (naoAtribuidos) {
    avisos.push(
      `${naoAtribuidos} valor(es) em reais apareceram sem um nome legível antes deles e foram deixados de fora — podem ser totais, juros ou quebras de linha do próprio edital.`,
    );
  }
  if (classes.some((c) => c.id === 'nao_informada')) {
    avisos.push(
      'Parte dos credores não pôde ser atribuída a uma classe do art. 41: o texto não trazia o cabeçalho de classe antes deles.',
    );
  }

  return {
    fonte: {
      publicacao: pub.id,
      data: pub.dataDisponibilizacao,
      tipo: pub.tipoComunicacao,
      orgao: pub.orgao,
      fundamento: fundamentoDoEdital(texto),
    },
    classes,
    totalCredores,
    somaGeral,
    valoresNaoAtribuidos: naoAtribuidos,
    avisos,
  };
}

/* ------------------------------- ativos ---------------------------------- */

export type NaturezaGravame = 'propriedade_fiduciaria' | 'garantia_real' | 'constricao' | 'contratual';

export interface Gravame {
  tipo: string;
  rotulo: string;
  natureza: NaturezaGravame;
  /** Se o titular se submete ou não ao concurso de credores. */
  submeteASeRj: boolean;
  base: string;
  bem: string | null;
  /** Titular da garantia, quando o texto o apresenta. */
  credor: string | null;
  trecho: string;
  publicacao: string | null;
  data: string | null;
  origem: 'publicacao' | 'movimento';
}

export interface AtivoLivre {
  trecho: string;
  bem: string | null;
  publicacao: string | null;
  data: string | null;
}

interface PadraoGravame {
  tipo: string;
  rotulo: string;
  natureza: NaturezaGravame;
  submeteASeRj: boolean;
  base: string;
  padrao: RegExp;
}

/**
 * Tipos de oneração e de constrição, com a consequência que cada um tem na
 * recuperação. A distinção que mais importa na prática é a do art. 49, §3º: o
 * titular de propriedade fiduciária, de arrendamento mercantil ou de reserva
 * de domínio **não** se submete ao plano — o bem é gravado e está fora do
 * concurso, ressalvada a trava dos bens de capital essenciais.
 */
const PADROES_GRAVAME: PadraoGravame[] = [
  {
    tipo: 'alienacao_fiduciaria',
    rotulo: 'Alienação fiduciária',
    natureza: 'propriedade_fiduciaria',
    submeteASeRj: false,
    base: 'art. 49, §3º, da Lei 11.101/2005',
    padrao: /alienac[ao]{1,2}[a-z]* fiduciari[ao]|propriedade fiduciaria/g,
  },
  {
    tipo: 'cessao_fiduciaria',
    rotulo: 'Cessão fiduciária de recebíveis (trava bancária)',
    natureza: 'propriedade_fiduciaria',
    submeteASeRj: false,
    base: 'art. 49, §3º, da Lei 11.101/2005',
    padrao: /cessao fiduciaria|trava bancaria|recebiveis cedidos/g,
  },
  {
    tipo: 'arrendamento',
    rotulo: 'Arrendamento mercantil (leasing)',
    natureza: 'contratual',
    submeteASeRj: false,
    base: 'art. 49, §3º, da Lei 11.101/2005',
    padrao: /arrendamento mercantil|\bleasing\b/g,
  },
  {
    tipo: 'reserva_dominio',
    rotulo: 'Reserva de domínio',
    natureza: 'contratual',
    submeteASeRj: false,
    base: 'art. 49, §3º, da Lei 11.101/2005',
    padrao: /reserva de dominio/g,
  },
  {
    tipo: 'hipoteca',
    rotulo: 'Hipoteca',
    natureza: 'garantia_real',
    submeteASeRj: true,
    base: 'art. 41, II, da Lei 11.101/2005',
    padrao: /hipotec[a-z]*/g,
  },
  {
    tipo: 'penhor',
    rotulo: 'Penhor',
    natureza: 'garantia_real',
    submeteASeRj: true,
    base: 'art. 41, II, da Lei 11.101/2005',
    padrao: /\bpenhor(?!a)[a-z]*/g,
  },
  {
    tipo: 'anticrese',
    rotulo: 'Anticrese',
    natureza: 'garantia_real',
    submeteASeRj: true,
    base: 'art. 41, II, da Lei 11.101/2005',
    padrao: /anticrese/g,
  },
  {
    tipo: 'caucao',
    rotulo: 'Caução',
    natureza: 'garantia_real',
    submeteASeRj: true,
    base: 'art. 41, II, da Lei 11.101/2005',
    padrao: /caucao (de|em)|bem caucionado/g,
  },
  {
    tipo: 'penhora',
    rotulo: 'Penhora',
    natureza: 'constricao',
    submeteASeRj: true,
    base: 'art. 6º, §7º-B, da Lei 11.101/2005 (atos de constrição e competência do juízo da recuperação)',
    padrao: /penhora[a-z]*|bloqueio (de valores|judicial)|sisbajud|renajud/g,
  },
  {
    tipo: 'arresto',
    rotulo: 'Arresto ou sequestro',
    natureza: 'constricao',
    submeteASeRj: true,
    base: 'art. 6º da Lei 11.101/2005',
    padrao: /arresto|sequestro de bens/g,
  },
  {
    tipo: 'indisponibilidade',
    rotulo: 'Indisponibilidade de bens',
    natureza: 'constricao',
    submeteASeRj: true,
    base: 'art. 6º da Lei 11.101/2005',
    padrao: /indisponibilidade de bens|\bcnib\b|averbacao premonitoria/g,
  },
];

const LIVRES = /liv(re|res)[a-z]* (e|de) (desembaracad|onus)[a-z]*|sem (qualquer )?onus|desembaracad[ao]s?|nao (ha|existe) (onus|gravame)/g;

/**
 * Fim de frase de verdade: ponto ou ponto-e-vírgula seguido de espaço. Um
 * ponto entre dígitos ("145.332") ou de abreviatura ("S.A.") não encerra nada.
 */
const FIM_DE_FRASE = /[.;](?=\s)|\n/;

/** Tenta ler o bem no texto que vem DEPOIS da menção (ex.: "penhora do imóvel X"). */
function lerBemAdiante(trecho: string): string | null {
  const resto = trecho
    .replace(/^[\s:,;.\-–—]+/, '')
    .replace(/^(sobre|do|da|de|dos|das|no|na|em|que recai sobre|incidente sobre|constituid[ao] sobre)\s+/i, '');

  // Encerra no fim da frase ou na vírgula que abre uma nova oração — é o que
  // evita colar "para as providências do art. 6º" no fim de "imóvel da filial".
  const corte = resto.search(
    /[.;](?=\s)|\n|\s-\s|,\s*(?=(?:para|e|que|nos termos|conforme|sob|a fim|razao|razão|sendo|devendo|cujo|cuja|na forma|ambos|ambas)\b)/i,
  );
  const bruto = (corte >= 0 ? resto.slice(0, corte) : resto).trim();
  if (!bruto) return null;

  const palavras = bruto.split(/\s+/).slice(0, 14).join(' ').replace(/[,\s]+$/, '');
  return palavras.length >= 4 ? palavras : null;
}

/**
 * Verbos e locuções que ligam o bem ao gravame. Encontrá-los marca o fim da
 * descrição do bem: "o galpão da matriz **encontra-se gravado por** hipoteca".
 */
const LIGACAO_GRAVAME =
  /\s+(?:e\s+|ja\s+)?(?:[eé]|esta|está|encontra-?se|acha-?se|foi|fica|permanece|sera|será|sao|são|estao|estão|constitui|figura)?\s*(?:objeto|gravad|onerad|dad[oa]s?\s+em|submetid|garantid|vinculad|alienad|hipotecad|empenhad|constrit|caucionad)/i;

/**
 * Lê o bem no texto que vem ANTES da menção ao gravame, que é onde ele quase
 * sempre está na redação forense: primeiro se descreve o bem, depois se diz o
 * que pesa sobre ele.
 */
function lerBemAtras(anterior: string): string | null {
  // Último período e, dentro dele, a última oração coordenada — duas menções
  // costumam dividir a mesma frase ("o maquinário … e os recebíveis …").
  let clausula = anterior.split(FIM_DE_FRASE).pop() ?? '';
  const partes = clausula.split(/,\s+(?:e|que)\s+/);
  clausula = partes[partes.length - 1];

  // "Anoto que o galpão…" — o verbo de abertura não faz parte do bem.
  clausula = clausula.replace(/^\s*(?![OoAaUu][s]?\s)(?:[A-Za-zÀ-ÿ]+\s+){1,2}que\s+/, '');

  const ligacao = LIGACAO_GRAVAME.exec(clausula);
  if (ligacao) clausula = clausula.slice(0, ligacao.index);

  const bruto = clausula.split(/,/)[0].replace(/^[\s:,;.\-–—]+/, '').trim();
  if (!bruto) return null;

  const palavras = bruto.split(/\s+/).slice(0, 14).join(' ').replace(/[,\s]+$/, '');
  return palavras.length >= 5 ? palavras : null;
}

/** Marcadores que introduzem o titular da garantia depois do gravame. */
const BENEFICIARIO = /^[\s,;]*(?:em favor d[eoa]s?|junto [àa]o?|junto a|contratad[ao] com|celebrad[ao] com|em garantia d[eoa]s?|credor[a]?|titular)\s+/i;

/**
 * Lê o titular da garantia, quando o texto o apresenta logo após o gravame.
 * O corte usa lookbehind para manter o ponto final de "S.A." dentro do nome e
 * ainda assim parar quando a frase seguinte começa.
 */
function lerBeneficiario(posterior: string): string | null {
  const janela = posterior.slice(0, 140);
  const marcador = BENEFICIARIO.exec(janela);
  if (!marcador) return null;

  const resto = janela.slice(marcador[0].length);
  const corte = resto.search(/[;,\n]|(?<=\.)\s+(?=[A-ZÀ-Ý])/);
  const nome = (corte >= 0 ? resto.slice(0, corte) : resto)
    .trim()
    // Tira o ponto que fecha a frase, mas preserva o de "S.A.".
    .replace(/(?<![A-ZÀ-Ý])\.+$/, '')
    .trim();
  return nome.length >= 4 ? nome.split(/\s+/).slice(0, 10).join(' ') : null;
}

/**
 * Onde procurar o bem depende da redação. "Penhora **do** imóvel X" descreve o
 * bem adiante; "o galpão … encontra-se gravado por hipoteca" o descreve atrás.
 * A preposição logo após o gravame é o que distingue os dois casos.
 */
const OBJETO_ADIANTE = /^\s*(?:d[eoa]s?|sobre|incidente sobre|que recai sobre)\s+/i;

function lerBemDoGravame(anterior: string, posterior: string): string | null {
  return OBJETO_ADIANTE.test(posterior)
    ? (lerBemAdiante(posterior) ?? lerBemAtras(anterior))
    : (lerBemAtras(anterior) ?? lerBemAdiante(posterior));
}

export interface Ativos {
  gravados: Gravame[];
  livres: AtivoLivre[];
  /** Credores da classe II: por definição, há bem gravado por trás deles. */
  garantiasPorCredor: { credor: string; valor: number | null }[];
  avisos: string[];
}

/**
 * Levanta os indícios de ativos onerados e livres.
 *
 * Aqui a ressalva é mais forte do que em qualquer outra parte deste servidor:
 * a relação de bens do devedor é peça dos autos (art. 51, III e IV), e peça
 * não é publicada em diário. O que aparece no DJEN são menções a bens em
 * decisões e editais. Portanto isto **não é um inventário de ativos** — é o
 * conjunto de menções encontradas, cada uma com o trecho de onde saiu.
 */
export function extrairAtivos(
  publicacoes: Publicacao[],
  movimentos: Movimento[],
  credoresClasseII: { nome: string; valor: number | null }[] = [],
): Ativos {
  const gravados: Gravame[] = [];
  const livres: AtivoLivre[] = [];
  const vistos = new Set<string>();

  for (const pub of publicacoes) {
    if (!pub.texto) continue;
    const alvo = chave(pub.texto);

    for (const padrao of PADROES_GRAVAME) {
      padrao.padrao.lastIndex = 0;
      let m: RegExpExecArray | null;
      while ((m = padrao.padrao.exec(alvo)) !== null) {
        const trecho = contextoDe(pub.texto, m.index);
        const id = `${padrao.tipo}|${chave(trecho).slice(0, 70)}`;
        if (vistos.has(id)) continue;
        vistos.add(id);
        gravados.push({
          tipo: padrao.tipo,
          rotulo: padrao.rotulo,
          natureza: padrao.natureza,
          submeteASeRj: padrao.submeteASeRj,
          base: padrao.base,
          bem: lerBemDoGravame(
            pub.texto.slice(0, m.index),
            pub.texto.slice(m.index + m[0].length),
          ),
          credor: lerBeneficiario(pub.texto.slice(m.index + m[0].length)),
          trecho,
          publicacao: pub.id,
          data: pub.dataDisponibilizacao,
          origem: 'publicacao',
        });
      }
    }

    LIVRES.lastIndex = 0;
    let l: RegExpExecArray | null;
    while ((l = LIVRES.exec(alvo)) !== null) {
      // A frase inteira, e não uma janela fixa: "livres e desembaraçados" e
      // "sem qualquer ônus" costumam aparecer na mesma frase, sobre os mesmos
      // bens, e não devem virar dois registros.
      const antes = pub.texto.slice(0, l.index);
      const inicioFrase = antes.length - (antes.split(FIM_DE_FRASE).pop() ?? '').length;
      const depois = pub.texto.slice(l.index + l[0].length);
      const avanco = depois.search(FIM_DE_FRASE);
      const frase = pub.texto
        .slice(inicioFrase, avanco < 0 ? undefined : l.index + l[0].length + avanco + 1)
        .trim();

      const id = `livre|${chave(frase).slice(0, 80)}`;
      if (vistos.has(id)) continue;
      vistos.add(id);

      livres.push({
        trecho: frase.replace(/\s+/g, ' '),
        bem:
          lerBemAdiante(pub.texto.slice(l.index + l[0].length)) ??
          lerBemAtras(pub.texto.slice(inicioFrase, l.index)),
        publicacao: pub.id,
        data: pub.dataDisponibilizacao,
      });
    }
  }

  // Os movimentos não descrevem o bem, mas datam a constrição — e a data é o
  // que permite dizer se ela é anterior ou posterior ao deferimento.
  for (const mov of movimentos) {
    const k = chave(mov.nome);
    for (const padrao of PADROES_GRAVAME) {
      padrao.padrao.lastIndex = 0;
      if (!padrao.padrao.test(k)) continue;
      const id = `${padrao.tipo}|mov|${k.slice(0, 70)}|${mov.data.slice(0, 10)}`;
      if (vistos.has(id)) continue;
      vistos.add(id);
      gravados.push({
        tipo: padrao.tipo,
        rotulo: padrao.rotulo,
        natureza: padrao.natureza,
        submeteASeRj: padrao.submeteASeRj,
        base: padrao.base,
        bem: null,
        credor: null,
        trecho: mov.nome,
        publicacao: null,
        data: mov.data,
        origem: 'movimento',
      });
      break;
    }
  }

  const avisos = [
    'A relação de bens do devedor é peça dos autos (art. 51, III e IV, da Lei 11.101/2005) e não é publicada em diário. O que está aqui são menções a bens e gravames no texto de publicações e nos nomes dos movimentos — não um inventário patrimonial.',
    'Um ativo só pode ser dado como **livre** se essa qualidade constar de documento; a ausência de gravame nesta lista não faz um bem ser livre.',
  ];

  if (credoresClasseII.length) {
    avisos.push(
      'Os credores da Classe II estão listados como garantia por definição legal (art. 41, II): existe bem gravado por trás de cada um, ainda que o edital não descreva qual.',
    );
  }

  return {
    gravados: gravados.sort((a, b) => (b.data ?? '').localeCompare(a.data ?? '')),
    livres,
    garantiasPorCredor: credoresClasseII.map((c) => ({ credor: c.nome, valor: c.valor })),
    avisos,
  };
}

/* ---------------------------- fatores legais ------------------------------ */

export interface FatorLegal {
  tom: 'ok' | 'neutro' | 'alerta' | 'risco';
  titulo: string;
  base: string;
  texto: string;
}

/**
 * Traduz o estado do processo nos pontos que mudam a posição de quem lê:
 * prazos da LRF em curso, desfechos, créditos fora do concurso, constrições.
 */
export function fatoresLegais(
  fase: Fase,
  marcos: MarcoRj[],
  stay: StayPeriod | null,
  ativos: Ativos | null,
  dataAjuizamento: string | null,
  referencia = new Date(),
): FatorLegal[] {
  const fatores: FatorLegal[] = [];
  const por = (id: string) => marcos.find((m) => m.id === id) ?? null;
  const dias = (iso: string) => {
    const d = lerData(iso);
    return d ? Math.floor((referencia.getTime() - d.getTime()) / DIA_MS) : 0;
  };

  if (fase.id === 'falencia') {
    fatores.push({
      tom: 'risco',
      titulo: 'Falência decretada',
      base: 'art. 73 da Lei 11.101/2005',
      texto:
        'A recuperação foi convolada em falência. A partir daí o regime é o da liquidação: vencimento antecipado das dívidas, arrecadação dos bens e classificação dos créditos pelo art. 83.',
    });
  }

  if (fase.id === 'pedido' && dataAjuizamento) {
    const espera = dias(dataAjuizamento);
    if (espera > 60) {
      fatores.push({
        tom: 'alerta',
        titulo: `Pedido sem deferimento há ${espera} dias`,
        base: 'arts. 51, 51-A e 52 da Lei 11.101/2005',
        texto:
          'Não há movimento de deferimento do processamento no histórico. Pode significar emenda à inicial pendente, constatação prévia em curso, ou simples defasagem da carga do tribunal no DataJud.',
      });
    }
  }

  if (stay) {
    if (stay.vigente) {
      fatores.push({
        tom: 'alerta',
        titulo: `Período de suspensão em curso — ${stay.diasRestantes} dia(s) restantes`,
        base: 'art. 6º, §4º, da Lei 11.101/2005',
        texto: `Contados ${stay.diasTotais} dias corridos do deferimento${stay.prorrogado ? ', já computada a prorrogação registrada nos movimentos' : ' (prorrogável uma vez, por igual período)'}. Durante a suspensão, execuções contra a devedora ficam sobrestadas e atos de constrição competem ao juízo da recuperação.`,
      });
    } else {
      fatores.push({
        tom: por('concessao') ? 'neutro' : 'risco',
        titulo: `Período de suspensão encerrado há ${Math.abs(stay.diasRestantes)} dia(s)`,
        base: 'art. 6º, §4º, da Lei 11.101/2005',
        texto: por('concessao')
          ? 'A blindagem se esgotou, mas a recuperação foi concedida: os créditos sujeitos passam a seguir o plano homologado.'
          : 'A blindagem se esgotou sem concessão registrada. Findo o prazo, as execuções contra a devedora podem retomar — verifique nos autos se houve prorrogação não refletida nos movimentos.',
      });
    }
  }

  const deferimento = por('deferimento');
  if (deferimento && !por('apresentacao_plano') && fase.id === 'processamento_deferido') {
    const desde = dias(deferimento.data);
    if (desde > 60) {
      fatores.push({
        tom: 'risco',
        titulo: `Plano não localizado ${desde} dias após o deferimento`,
        base: 'art. 53 da Lei 11.101/2005',
        texto:
          'O prazo legal para apresentar o plano é de 60 dias da publicação da decisão de processamento, sob pena de convolação em falência (art. 73, II). A juntada pode simplesmente não ter gerado movimento próprio — confirme nos autos antes de concluir.',
      });
    }
  }

  if (por('rejeicao_plano') && !por('concessao')) {
    fatores.push({
      tom: 'risco',
      titulo: 'Plano rejeitado em assembleia',
      base: 'art. 56, §4º, e art. 58, §1º, da Lei 11.101/2005',
      texto:
        'Rejeitado o plano, abrem-se o prazo para plano alternativo dos credores e a possibilidade de concessão pelo quórum alternativo (cram down); não havendo nenhum dos dois, o caminho é a falência.',
    });
  }

  const concessao = por('concessao');
  if (concessao) {
    const desde = dias(concessao.data);
    const restante = 730 - desde;
    fatores.push({
      tom: restante > 0 ? 'neutro' : 'ok',
      titulo:
        restante > 0
          ? `Em fiscalização judicial — ${restante} dia(s) para completar o biênio`
          : 'Biênio de fiscalização judicial completado',
      base: 'arts. 61 e 63 da Lei 11.101/2005',
      texto:
        restante > 0
          ? 'Durante o biênio, o descumprimento de obrigação do plano autoriza a convolação em falência (art. 61, §1º), e a devedora permanece sob fiscalização do administrador judicial.'
          : 'Passado o biênio, o juiz decreta o encerramento; o descumprimento posterior se resolve por execução específica ou novo pedido de falência (art. 62).',
    });
  }

  if (por('habilitacao') || por('impugnacao')) {
    fatores.push({
      tom: 'alerta',
      titulo: 'Verificação de créditos ainda em disputa',
      base: 'arts. 7º a 15 da Lei 11.101/2005',
      texto:
        'Há habilitações ou impugnações no histórico: a lista de credores publicada pode não ser a definitiva. O quadro geral do art. 18 é o que consolida — e ele só se fecha depois de julgadas as impugnações.',
    });
  }

  if (por('alienacao_ativo')) {
    fatores.push({
      tom: 'alerta',
      titulo: 'Alienação de ativo ou de unidade produtiva isolada',
      base: 'arts. 60, 66 e 142 da Lei 11.101/2005',
      texto:
        'Há movimento de alienação. Quando feita na forma do art. 60 e do art. 142, o objeto vai ao adquirente livre de ônus e sem sucessão nas obrigações do devedor, inclusive as tributárias e trabalhistas — ponto central para avaliar o ativo.',
    });
  }

  if (por('financiamento')) {
    fatores.push({
      tom: 'neutro',
      titulo: 'Financiamento do devedor em recuperação (DIP)',
      base: 'arts. 69-A a 69-F da Lei 11.101/2005',
      texto:
        'O crédito decorrente de financiamento autorizado é extraconcursal e, em caso de falência, tem a preferência do art. 84, I-A. Bens da devedora podem ter sido dados em garantia dessa operação.',
    });
  }

  const foraDoConcurso = (ativos?.gravados ?? []).filter((g) => !g.submeteASeRj);
  if (foraDoConcurso.length) {
    const tipos = [...new Set(foraDoConcurso.map((g) => g.rotulo))].join(', ');
    fatores.push({
      tom: 'risco',
      titulo: 'Créditos fora do concurso identificados',
      base: 'art. 49, §3º, da Lei 11.101/2005',
      texto: `Há menção a ${tipos}. Esses titulares não se submetem ao plano e seus bens não entram no rateio — mas, durante a suspensão, não se permite a retirada dos bens de capital essenciais à atividade. É a distinção que mais altera o valor efetivo do ativo.`,
    });
  }

  const constricoes = (ativos?.gravados ?? []).filter((g) => g.natureza === 'constricao');
  if (constricoes.length) {
    fatores.push({
      tom: 'alerta',
      titulo: `${constricoes.length} menção(ões) a constrição sobre bens`,
      base: 'art. 6º, §7º-B, da Lei 11.101/2005',
      texto:
        'Penhoras, bloqueios e indisponibilidades aparecem no histórico. Mesmo nas execuções fiscais, que não se suspendem, a substituição dos atos de constrição sobre bens de capital essenciais compete ao juízo da recuperação.',
    });
  }

  if (!fatores.length) {
    fatores.push({
      tom: 'neutro',
      titulo: 'Nenhum fator de risco identificável nos metadados',
      base: '—',
      texto:
        'O histórico consultado não trouxe marcos suficientes para apontar prazos ou desfechos. Isso costuma indicar carga incompleta no DataJud, e não ausência de andamento.',
    });
  }

  return fatores;
}
