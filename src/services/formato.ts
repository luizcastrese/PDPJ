import { humanizarDias } from './analise.js';
import { CHARACTER_LIMIT } from '../constants.js';
import type { Analise, Movimento, ResumoProcesso, Tom } from '../types.js';

const SIMBOLO: Record<Tom, string> = {
  ok: '🟢',
  neutro: '⚪',
  alerta: '🟡',
  risco: '🔴',
};

/** "2024-03-15T00:00:00Z" -> "15/03/2024". */
export function data(iso?: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return String(iso);
  return d.toISOString().slice(0, 10).split('-').reverse().join('/');
}

function linhaOpcional(rotulo: string, valor?: string | null): string[] {
  return valor ? [`- **${rotulo}**: ${valor}`] : [];
}

/** Cabeçalho com a identificação do processo. */
function cabecalho(a: Analise): string[] {
  const p = a.processo;
  const assuntos = p.assuntos
    .map((s) => (s.codigo ? `${s.nome} (${s.codigo})` : s.nome))
    .filter(Boolean)
    .join('; ');

  return [
    `# Processo ${p.numeroFormatado}`,
    '',
    `${SIMBOLO[a.situacao.tom]} **${a.situacao.rotulo}** — ${a.situacao.justificativa}`,
    '',
    '## Identificação',
    ...linhaOpcional('Tribunal', p.tribunal),
    ...linhaOpcional('Segmento', p.segmento),
    ...linhaOpcional('Grau', p.grau),
    ...linhaOpcional(
      'Classe',
      p.classe?.nome ? `${p.classe.nome}${p.classe.codigo ? ` (${p.classe.codigo})` : ''}` : null,
    ),
    ...linhaOpcional('Assuntos', assuntos || null),
    ...linhaOpcional('Órgão julgador', p.orgaoJulgador?.nome),
    ...linhaOpcional('Sistema', p.sistema?.nome),
    ...linhaOpcional('Formato', p.formato?.nome),
    `- **Nível de sigilo**: ${p.nivelSigilo ?? 0}`,
    `- **Ajuizamento**: ${data(p.dataAjuizamento)}`,
    `- **Última atualização no DataJud**: ${data(p.dataUltimaAtualizacao)}`,
  ];
}

/** Bloco de métricas quantitativas. */
function blocoMetricas(a: Analise): string[] {
  const m = a.metricas;
  const linhas = [
    '',
    '## Métricas',
    `- **Tempo de tramitação**: ${m.duracaoTexto}${m.duracaoDias !== null ? ` (${m.duracaoDias} dias)` : ''}`,
    `- **Tempo desde o último movimento**: ${m.diasSemMovimentoTexto}${m.diasSemMovimento !== null ? ` (${m.diasSemMovimento} dias)` : ''}`,
    `- **Total de movimentos**: ${m.totalMovimentos}`,
  ];
  if (m.mediaDiasEntreMovimentos !== null) {
    linhas.push(`- **Intervalo médio entre movimentos**: ${m.mediaDiasEntreMovimentos} dias`);
  }
  if (m.movimentosPorAno !== null) {
    linhas.push(`- **Movimentos por ano**: ${m.movimentosPorAno}`);
  }
  if (m.diasAteSentenca !== null) {
    linhas.push(`- **Do ajuizamento à sentença**: ${humanizarDias(m.diasAteSentenca)} (${m.diasAteSentenca} dias)`);
  }
  if (m.diasSentencaAteTransito !== null) {
    linhas.push(`- **Da sentença ao trânsito em julgado**: ${humanizarDias(m.diasSentencaAteTransito)} (${m.diasSentencaAteTransito} dias)`);
  }
  linhas.push(
    `- **Recursos / audiências / decisões / suspensões**: ${m.recursos} / ${m.audiencias} / ${m.decisoes} / ${m.suspensoes}`,
  );
  if (m.maiorIntervalo) {
    linhas.push(
      `- **Maior intervalo sem andamento**: ${m.maiorIntervalo.dias} dias, até "${m.maiorIntervalo.movimento}" em ${data(m.maiorIntervalo.ate)}`,
    );
  }
  return linhas;
}

const ROTULO_MARCO: Record<string, string> = {
  distribuicao: 'Distribuição',
  sentenca: 'Sentença / julgamento',
  acordao: 'Acórdão',
  transito: 'Trânsito em julgado',
  baixa: 'Baixa / arquivamento',
};

function blocoMarcos(a: Analise): string[] {
  const chaves = Object.keys(a.marcos);
  if (!chaves.length) return [];
  return [
    '',
    '## Marcos processuais',
    ...chaves.map(
      (k) => `- **${ROTULO_MARCO[k] ?? k}**: ${data(a.marcos[k].data)} — ${a.marcos[k].nome}`,
    ),
  ];
}

function blocoDistribuicao(a: Analise): string[] {
  if (!a.porCategoria.length) return [];
  const linhas = ['', '## Movimentos por categoria'];
  for (const c of a.porCategoria) {
    linhas.push(`- ${c.rotulo}: ${c.total}`);
  }
  if (a.porAno.length) {
    linhas.push('', '## Movimentos por ano');
    linhas.push(a.porAno.map((x) => `${x.ano}: ${x.total}`).join(' · '));
  }
  return linhas;
}

function blocoAlertas(a: Analise): string[] {
  if (!a.alertas.length) return [];
  return [
    '',
    '## Pontos de atenção',
    ...a.alertas.map((al) => `- ${SIMBOLO[al.tom]} ${al.texto}`),
  ];
}

/** Lista de movimentos em markdown, do mais recente para o mais antigo. */
export function movimentosMarkdown(
  movimentos: Movimento[],
  titulo = '## Movimentações',
): string[] {
  if (!movimentos.length) return ['', titulo, '', '_Nenhum movimento no recorte selecionado._'];
  const linhas = ['', titulo, ''];
  for (const m of [...movimentos].reverse()) {
    const gap =
      m.diasDesdeAnterior !== null && m.diasDesdeAnterior > 0
        ? ` _(+${m.diasDesdeAnterior}d)_`
        : '';
    const codigo = m.codigo !== null ? ` \`${m.codigo}\`` : '';
    linhas.push(`- **${data(m.data)}**${codigo} ${m.nome} — ${m.categoriaRotulo}${gap}`);
    for (const c of m.complementos) {
      const desc = [c.nome, c.descricao, c.valor].filter(Boolean).join(': ');
      if (desc) linhas.push(`  - ${desc}`);
    }
  }
  return linhas;
}

/** Relatório completo de uma instância. */
export function analiseMarkdown(a: Analise, movimentos?: Movimento[]): string {
  const partes = [
    ...cabecalho(a),
    ...blocoMetricas(a),
    ...blocoMarcos(a),
    ...blocoDistribuicao(a),
    ...blocoAlertas(a),
  ];
  if (movimentos) partes.push(...movimentosMarkdown(movimentos));
  return partes.join('\n');
}

/** Tabela markdown para listas de resultados de busca. */
export function resumosMarkdown(itens: ResumoProcesso[]): string {
  if (!itens.length) return '_Nenhum processo encontrado com esses filtros._';
  const linhas = [
    '| Processo | Classe | Órgão julgador | Grau | Ajuizamento | Movs. | Último mov. |',
    '| --- | --- | --- | --- | --- | --- | --- |',
  ];
  for (const i of itens) {
    linhas.push(
      `| ${i.numeroFormatado} | ${i.classe ?? '—'} | ${i.orgao ?? '—'} | ${i.grau ?? '—'} | ${data(i.dataAjuizamento)} | ${i.totalMovimentos} | ${data(i.ultimoMovimento)} |`,
    );
  }
  return linhas.join('\n');
}

/** Corta o texto no limite de caracteres, avisando o agente. */
export function limitar(texto: string, limite = CHARACTER_LIMIT): string {
  if (texto.length <= limite) return texto;
  return (
    texto.slice(0, limite) +
    `\n\n---\n_Resposta truncada em ${limite} caracteres. Use filtros, \`limit\` ou \`offset\` para ver o restante._`
  );
}
