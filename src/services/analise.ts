import { formatar, decompor, nomeSegmento } from './cnj.js';
import type {
  Alerta,
  Analise,
  Marco,
  Metricas,
  Movimento,
  MovimentoBruto,
  ProcessoBruto,
  ResumoProcesso,
  Situacao,
} from '../types.js';

const DIA_MS = 86400000;

/** Normaliza texto para comparação: minúsculas e sem acentos. */
function chave(texto: unknown): string {
  return String(texto ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

interface Categoria {
  id: string;
  rotulo: string;
  padrao: RegExp;
}

/**
 * Categorias de movimento, reconhecidas pelo nome da Tabela Processual
 * Unificada do CNJ. A ordem importa: o primeiro padrão que casa vence.
 * A comparação é feita sobre o texto sem acentos e em minúsculas.
 */
export const CATEGORIAS: Categoria[] = [
  // Marcos inequívocos primeiro.
  { id: 'transito', rotulo: 'Trânsito em julgado', padrao: /transito em julgado/ },
  { id: 'baixa', rotulo: 'Baixa / Arquivamento', padrao: /baixa definitiva|baixa dos autos|arquivamento definitivo|arquivado defin/ },
  { id: 'desarquivamento', rotulo: 'Desarquivamento', padrao: /desarquiv/ },
  { id: 'distribuicao', rotulo: 'Distribuição', padrao: /distribui|autua|redistribui/ },
  { id: 'acordao', rotulo: 'Acórdão', padrao: /acordao/ },
  // Estes vêm antes de "sentença" porque contêm as palavras "sentença" ou
  // "julgamento" sem serem o ato de julgar: "cumprimento de sentença",
  // "conclusão para julgamento", "sessão de julgamento", "publicação de sentença".
  { id: 'execucao', rotulo: 'Execução / Cumprimento', padrao: /cumprimento de senten|execuc|penhora|bloqueio|sisbajud|renajud|arresto/ },
  { id: 'conclusao', rotulo: 'Conclusão', padrao: /conclus/ },
  { id: 'audiencia', rotulo: 'Audiências e sessões', padrao: /audiencia|sessao/ },
  { id: 'publicacao', rotulo: 'Publicação', padrao: /public|disponibiliza/ },
  { id: 'recurso', rotulo: 'Recursos', padrao: /recurso|apela|agravo|embargo|remessa necess/ },
  // Agora sim o ato de julgar.
  { id: 'sentenca', rotulo: 'Sentença / Julgamento', padrao: /senten|julgad|julgamento|homologa|extinc/ },
  { id: 'decisao', rotulo: 'Decisões e despachos', padrao: /decis|despacho|mero expediente|liminar|tutela/ },
  { id: 'pericia', rotulo: 'Perícia', padrao: /pericia|laudo|perit/ },
  { id: 'suspensao', rotulo: 'Suspensão / Sobrestamento', padrao: /suspens|sobresta|arquivamento provis/ },
  { id: 'citacao', rotulo: 'Citações e intimações', padrao: /citac|intima|notifica/ },
  { id: 'juntada', rotulo: 'Juntada / Petição', padrao: /juntada|petic|protocol/ },
  { id: 'expedicao', rotulo: 'Expedição de documento', padrao: /expedi|mandado|carta precat|oficio/ },
  { id: 'outros', rotulo: 'Outros', padrao: /.*/ },
];

/** Classifica um movimento em uma das categorias acima. */
export function classificar(nomeMovimento: unknown): Categoria {
  const k = chave(nomeMovimento);
  return CATEGORIAS.find((c) => c.padrao.test(k)) ?? CATEGORIAS[CATEGORIAS.length - 1];
}

function paraData(valor?: string | null): Date | null {
  if (!valor) return null;
  const d = new Date(valor);
  return Number.isNaN(d.getTime()) ? null : d;
}

function diasEntre(a: Date | null, b: Date | null): number | null {
  if (!a || !b) return null;
  return Math.max(0, Math.round((b.getTime() - a.getTime()) / DIA_MS));
}

/** Converte um total de dias em "1 ano, 3 meses". */
export function humanizarDias(dias: number | null | undefined): string {
  if (dias === null || dias === undefined) return 'indisponível';
  if (dias < 1) return 'menos de 1 dia';
  const anos = Math.floor(dias / 365);
  const meses = Math.floor((dias % 365) / 30);
  const resto = (dias % 365) % 30;
  const partes: string[] = [];
  if (anos) partes.push(`${anos} ano${anos > 1 ? 's' : ''}`);
  if (meses) partes.push(`${meses} ${meses > 1 ? 'meses' : 'mês'}`);
  if (resto && !anos) partes.push(`${resto} dia${resto > 1 ? 's' : ''}`);
  return partes.join(' e ') || `${dias} dias`;
}

/**
 * Ordena cronologicamente e enriquece os movimentos com categoria e o
 * intervalo em dias desde o movimento anterior.
 */
export function prepararMovimentos(movimentos?: MovimentoBruto[] | null): Movimento[] {
  const lista = (movimentos ?? [])
    .map((m) => ({
      codigo: m.codigo ?? null,
      nome: m.nome ?? 'Movimento sem descrição',
      complementos: m.complementosTabelados ?? [],
      data: paraData(m.dataHora),
    }))
    .filter((m): m is typeof m & { data: Date } => m.data !== null)
    .sort((a, b) => a.data.getTime() - b.data.getTime());

  return lista.map((m, i) => {
    const cat = classificar(m.nome);
    return {
      codigo: m.codigo,
      nome: m.nome,
      complementos: m.complementos,
      data: m.data.toISOString(),
      ano: m.data.getUTCFullYear(),
      categoria: cat.id,
      categoriaRotulo: cat.rotulo,
      diasDesdeAnterior: i === 0 ? null : diasEntre(lista[i - 1].data, m.data),
    };
  });
}

function primeiroDe(movs: Movimento[], categoria: string): Movimento | null {
  return movs.find((m) => m.categoria === categoria) ?? null;
}

function ultimoDe(movs: Movimento[], categoria: string): Movimento | null {
  for (let i = movs.length - 1; i >= 0; i--) {
    if (movs[i].categoria === categoria) return movs[i];
  }
  return null;
}

/**
 * Situação inferida a partir dos marcos encontrados. É uma leitura dos
 * metadados públicos — não é um campo oficial de status do processo.
 */
function inferirSituacao(movs: Movimento[], diasSemMovimento: number | null): Situacao {
  const baixa = ultimoDe(movs, 'baixa');
  const desarquivamento = ultimoDe(movs, 'desarquivamento');
  const transito = ultimoDe(movs, 'transito');
  const suspensao = ultimoDe(movs, 'suspensao');
  const ultimo = movs.length ? movs[movs.length - 1] : null;

  if (!movs.length) {
    return {
      id: 'sem_movimentos',
      rotulo: 'Sem movimentos na base pública',
      tom: 'neutro',
      justificativa: 'O registro não traz movimentações, o que impede inferir a situação.',
    };
  }

  const baixaVigente = baixa && (!desarquivamento || desarquivamento.data < baixa.data);
  if (baixaVigente) {
    return {
      id: 'baixado',
      rotulo: 'Baixado / arquivado definitivamente',
      tom: 'neutro',
      justificativa: `Baixa/arquivamento em ${baixa.data.slice(0, 10)} sem desarquivamento posterior.`,
    };
  }
  if (transito && ultimo && transito.data === ultimo.data) {
    return {
      id: 'transitado',
      rotulo: 'Transitado em julgado',
      tom: 'ok',
      justificativa: `Trânsito em julgado em ${transito.data.slice(0, 10)}, movimento mais recente do processo.`,
    };
  }
  if (suspensao && ultimo && suspensao.data === ultimo.data) {
    return {
      id: 'suspenso',
      rotulo: 'Suspenso / sobrestado',
      tom: 'alerta',
      justificativa: `O movimento mais recente é de suspensão/sobrestamento (${suspensao.data.slice(0, 10)}).`,
    };
  }
  if (diasSemMovimento !== null && diasSemMovimento > 365) {
    return {
      id: 'parado',
      rotulo: 'Sem movimentação há mais de um ano',
      tom: 'risco',
      justificativa: `Último movimento há ${diasSemMovimento} dias.`,
    };
  }
  if (diasSemMovimento !== null && diasSemMovimento > 180) {
    return {
      id: 'lento',
      rotulo: 'Movimentação lenta',
      tom: 'alerta',
      justificativa: `Último movimento há ${diasSemMovimento} dias.`,
    };
  }
  return {
    id: 'tramitando',
    rotulo: 'Em tramitação',
    tom: 'ok',
    justificativa:
      diasSemMovimento === null
        ? 'Processo com movimentação registrada.'
        : `Último movimento há ${diasSemMovimento} dias.`,
  };
}

/** Pontos de atenção derivados objetivamente dos dados. */
function gerarAlertas(
  dados: ProcessoBruto,
  movs: Movimento[],
  metricas: Metricas,
): Alerta[] {
  const alertas: Alerta[] = [];

  if (!movs.length) {
    alertas.push({
      tom: 'alerta',
      texto:
        'Nenhuma movimentação retornada. Processos em segredo de justiça ou recém-distribuídos costumam vir sem movimentos.',
    });
  }
  if (Number(dados.nivelSigilo ?? 0) > 0) {
    alertas.push({
      tom: 'alerta',
      texto: `Nível de sigilo ${dados.nivelSigilo}: parte dos dados pode estar omitida na base pública.`,
    });
  }
  if (metricas.diasSemMovimento !== null && metricas.diasSemMovimento > 365) {
    alertas.push({
      tom: 'risco',
      texto: `Sem movimentação há ${metricas.diasSemMovimento} dias (${humanizarDias(metricas.diasSemMovimento)}); avaliar risco de prescrição intercorrente ou arquivamento.`,
    });
  }
  if (metricas.duracaoDias !== null && metricas.duracaoDias > 1825) {
    alertas.push({
      tom: 'alerta',
      texto: `Processo tramita há ${humanizarDias(metricas.duracaoDias)}, acima de cinco anos.`,
    });
  }
  if (metricas.recursos >= 3) {
    alertas.push({
      tom: 'alerta',
      texto: `${metricas.recursos} movimentos recursais identificados: litigiosidade recursal elevada.`,
    });
  }
  if (metricas.suspensoes > 0) {
    alertas.push({
      tom: 'neutro',
      texto: `${metricas.suspensoes} registro(s) de suspensão ou sobrestamento no histórico.`,
    });
  }
  const atualizacao = paraData(dados.dataHoraUltimaAtualizacao);
  if (atualizacao) {
    const defasagem = diasEntre(atualizacao, new Date());
    if (defasagem !== null && defasagem > 90) {
      alertas.push({
        tom: 'alerta',
        texto: `A base do DataJud para este processo foi atualizada pela última vez há ${defasagem} dias; pode haver movimentos mais recentes ainda não refletidos.`,
      });
    }
  }
  return alertas;
}

/** Analisa um registro bruto do DataJud e devolve a leitura completa. */
export function analisarProcesso(bruto: ProcessoBruto): Analise {
  const agora = new Date();
  const movs = prepararMovimentos(bruto.movimentos);
  const partes = decompor(bruto.numeroProcesso);

  const ajuizamento = paraData(bruto.dataAjuizamento);
  const primeiro = movs.length ? new Date(movs[0].data) : null;
  const ultimo = movs.length ? new Date(movs[movs.length - 1].data) : null;
  const inicio = ajuizamento ?? primeiro;

  const duracaoDias = diasEntre(inicio, agora);
  const diasSemMovimento = diasEntre(ultimo, agora);

  const porCategoria = CATEGORIAS.map((c) => ({
    id: c.id,
    rotulo: c.rotulo,
    total: movs.filter((m) => m.categoria === c.id).length,
  })).filter((c) => c.total > 0);

  const anos = new Map<number, number>();
  for (const m of movs) anos.set(m.ano, (anos.get(m.ano) ?? 0) + 1);
  const porAno = [...anos.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([ano, total]) => ({ ano, total }));

  const marcos: Record<string, Marco> = {};
  for (const id of ['distribuicao', 'sentenca', 'acordao', 'transito', 'baixa']) {
    const m = id === 'distribuicao' ? primeiroDe(movs, id) : ultimoDe(movs, id);
    if (m) marcos[id] = { nome: m.nome, data: m.data, codigo: m.codigo };
  }

  const sentenca = marcos.sentenca ? new Date(marcos.sentenca.data) : null;
  const transito = marcos.transito ? new Date(marcos.transito.data) : null;

  let maiorIntervalo: Metricas['maiorIntervalo'] = null;
  for (const m of movs) {
    if (m.diasDesdeAnterior !== null && m.diasDesdeAnterior > (maiorIntervalo?.dias ?? -1)) {
      maiorIntervalo = { dias: m.diasDesdeAnterior, ate: m.data, movimento: m.nome };
    }
  }

  const metricas: Metricas = {
    totalMovimentos: movs.length,
    duracaoDias,
    duracaoTexto: humanizarDias(duracaoDias),
    diasSemMovimento,
    diasSemMovimentoTexto: humanizarDias(diasSemMovimento),
    diasAteSentenca: diasEntre(inicio, sentenca),
    diasSentencaAteTransito: diasEntre(sentenca, transito),
    mediaDiasEntreMovimentos:
      movs.length > 1 && duracaoDias ? Math.round(duracaoDias / (movs.length - 1)) : null,
    movimentosPorAno:
      duracaoDias && duracaoDias > 30 && movs.length
        ? Number((movs.length / (duracaoDias / 365)).toFixed(1))
        : null,
    recursos: movs.filter((m) => m.categoria === 'recurso').length,
    suspensoes: movs.filter((m) => m.categoria === 'suspensao').length,
    audiencias: movs.filter((m) => m.categoria === 'audiencia').length,
    decisoes: movs.filter((m) => m.categoria === 'decisao').length,
    maiorIntervalo,
  };

  return {
    processo: {
      numero: bruto.numeroProcesso,
      numeroFormatado: formatar(bruto.numeroProcesso),
      tribunal: bruto.tribunal ?? null,
      tribunalSigla: bruto.tribunal ?? null,
      grau: bruto.grau ?? null,
      classe: bruto.classe ?? null,
      assuntos: bruto.assuntos ?? [],
      orgaoJulgador: bruto.orgaoJulgador ?? null,
      sistema: bruto.sistema ?? null,
      formato: bruto.formato ?? null,
      nivelSigilo: bruto.nivelSigilo ?? null,
      dataAjuizamento: bruto.dataAjuizamento ?? null,
      dataUltimaAtualizacao: bruto.dataHoraUltimaAtualizacao ?? null,
      segmento: partes ? nomeSegmento(partes.segmento) : null,
      id: bruto.id ?? null,
    },
    movimentos: movs,
    metricas,
    marcos,
    porCategoria,
    porAno,
    situacao: inferirSituacao(movs, diasSemMovimento),
    alertas: gerarAlertas(bruto, movs, metricas),
    geradoEm: agora.toISOString(),
  };
}

/** Resumo enxuto, para listas de resultados. */
export function resumirProcesso(bruto: ProcessoBruto): ResumoProcesso {
  const movs = bruto.movimentos ?? [];
  const datas = movs
    .map((m) => m.dataHora)
    .filter((d): d is string => Boolean(d))
    .sort();
  return {
    numero: bruto.numeroProcesso,
    numeroFormatado: formatar(bruto.numeroProcesso),
    classe: bruto.classe?.nome ?? null,
    assunto: bruto.assuntos?.[0]?.nome ?? null,
    orgao: bruto.orgaoJulgador?.nome ?? null,
    grau: bruto.grau ?? null,
    dataAjuizamento: bruto.dataAjuizamento ?? null,
    totalMovimentos: movs.length,
    ultimoMovimento: datas.length ? datas[datas.length - 1] : null,
  };
}
