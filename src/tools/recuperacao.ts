import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

import {
  AtivosGarantiasInput,
  DossieRecuperacaoInput,
  HistoricoEmpresaInput,
  RelacaoCredoresInput,
} from '../schemas/index.js';
import { buscarPublicacoes, type Publicacao } from '../services/djen.js';
import { resolverProcesso } from '../services/resolver.js';
import { extrairAuxiliares } from '../services/pessoas.js';
import { formatar } from '../services/cnj.js';
import { data } from '../services/formato.js';
import { ErroPdpj } from '../services/datajud.js';
import {
  calcularStay,
  deduzirFase,
  escolherEdital,
  extrairAtivos,
  extrairCredores,
  extrairMarcos,
  extrairMotivos,
  fatoresLegais,
  moeda,
  type Ativos,
  type Credor,
  type MarcoRj,
  type RelacaoCredores,
} from '../services/recuperacao.js';
import { comTratamento, responder, SOMENTE_LEITURA } from './comum.js';
import { prepararNumero } from './pessoas.js';
import type { Movimento } from '../types.js';

const SIMBOLO = { ok: '🟢', neutro: '⚪', alerta: '🟡', risco: '🔴' } as const;

/** Aviso que acompanha todo resultado deste módulo, sem exceção. */
const RESSALVA =
  'Tudo abaixo vem de **metadados e publicações públicas**: o DataJud não traz peças, e o DJEN traz apenas o texto que foi ao diário. Credores, motivos e bens são **extraídos de texto**, não lidos de campo — confira cada item no trecho de origem e nos autos antes de qualquer uso profissional.';

function normalizar(texto: string): string {
  return texto
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase();
}

/** Busca as publicações do processo, tolerando indisponibilidade do DJEN. */
async function publicacoesDoProcesso(
  digitos: string,
  tribunal: string | undefined,
  quantas: number,
): Promise<{ publicacoes: Publicacao[]; total: number; falha: string | null }> {
  try {
    const r = await buscarPublicacoes({
      numeroProcesso: digitos,
      tribunal,
      pagina: 1,
      itensPorPagina: quantas,
    });
    return { publicacoes: r.publicacoes, total: r.total, falha: null };
  } catch (erro) {
    return {
      publicacoes: [],
      total: 0,
      falha: erro instanceof Error ? erro.message : String(erro),
    };
  }
}

/** Movimentos de todas as instâncias, em ordem cronológica. */
function movimentosDoProcesso(instancias: { movimentos: Movimento[] }[]): Movimento[] {
  return instancias
    .flatMap((i) => i.movimentos)
    .sort((a, b) => a.data.localeCompare(b.data));
}

const CNPJ = /\b\d{2}\.?\d{3}\.?\d{3}\/?\d{4}-?\d{2}\b/;

/** Identifica a devedora pelas publicações: polo ativo do pedido e CNPJ citado. */
function identificarDevedora(publicacoes: Publicacao[]): { nome: string | null; cnpj: string | null } {
  const ativos = publicacoes
    .flatMap((p) => p.destinatarios)
    .filter((d) => /ativ|requerent|recuperand|autor/i.test(d.polo ?? ''));

  const contagem = new Map<string, number>();
  for (const d of ativos) contagem.set(d.nome, (contagem.get(d.nome) ?? 0) + 1);
  const nome = [...contagem.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;

  let cnpj: string | null = null;
  for (const p of publicacoes) {
    const m = CNPJ.exec(p.texto ?? '');
    if (m) {
      cnpj = m[0];
      break;
    }
  }
  return { nome, cnpj };
}

/** Resolve processo + publicações, o par de chamadas comum a estas ferramentas. */
async function levantar(
  numero: string,
  tribunal: string | undefined,
  ignorarDigito: boolean,
  maxPublicacoes: number,
) {
  const { digitos, tribunal: sigla } = prepararNumero(numero, tribunal, ignorarDigito);
  const [resolvido, djen] = await Promise.all([
    resolverProcesso(numero, tribunal, ignorarDigito).catch((erro: unknown) => {
      // Uma recuperação pode estar no DJEN e ainda não ter carga no DataJud.
      if (erro instanceof ErroPdpj) return null;
      throw erro;
    }),
    publicacoesDoProcesso(digitos, sigla, maxPublicacoes),
  ]);

  if (!resolvido && !djen.publicacoes.length) {
    throw new ErroPdpj(
      `Nada encontrado para ${formatar(digitos)} — nem no DataJud, nem no DJEN.`,
      [
        'Confira o número: recuperações costumam ter classe própria e vara especializada.',
        'Processos em segredo de justiça não aparecem na base pública.',
        djen.falha ? `O DJEN respondeu com falha: ${djen.falha}` : 'O DJEN não retornou publicações.',
      ],
    );
  }

  const movimentos = resolvido ? movimentosDoProcesso(resolvido.instancias) : [];
  return { digitos, sigla, resolvido, djen, movimentos };
}

/** Bloco markdown com a relação de credores, já paginada. */
function credoresMarkdown(relacao: RelacaoCredores, maxPorClasse: number): string[] {
  const linhas = [
    '',
    '## Relação de credores',
    '',
    `Fonte: ${relacao.fonte.fundamento}${relacao.fonte.data ? `, publicada em ${data(relacao.fonte.data)}` : ''}.`,
  ];

  if (!relacao.totalCredores) {
    linhas.push('', '_Nenhum credor pôde ser lido do edital localizado._');
    linhas.push(...relacao.avisos.map((a) => `- ⚠️ ${a}`));
    return linhas;
  }

  linhas.push(
    '',
    `**${relacao.totalCredores} credor(es)** lidos, somando ${moeda(relacao.somaGeral)}.`,
    '',
    '| Classe | Credores | Soma |',
    '| --- | --- | --- |',
  );
  for (const c of relacao.classes) {
    linhas.push(`| ${c.rotulo} | ${c.total} | ${moeda(c.soma)} |`);
  }

  for (const classe of relacao.classes) {
    linhas.push('', `### ${classe.rotulo}`, `_${classe.base}_`, '');
    const mostrados = [...classe.credores]
      .sort((a, b) => (b.valor ?? 0) - (a.valor ?? 0))
      .slice(0, maxPorClasse);
    linhas.push('| Credor | Documento | Valor |', '| --- | --- | --- |');
    for (const c of mostrados) {
      linhas.push(`| ${c.nome} | ${c.documento ?? '—'} | ${moeda(c.valor)} |`);
    }
    if (classe.total > mostrados.length) {
      linhas.push(
        '',
        `_Mais ${classe.total - mostrados.length} credor(es) nesta classe. Use \`pdpj_relacao_credores\` com \`classe="${classe.id}"\` para a lista completa._`,
      );
    }
  }

  if (relacao.avisos.length) {
    linhas.push('', '**Ressalvas da leitura:**');
    linhas.push(...relacao.avisos.map((a) => `- ⚠️ ${a}`));
  }
  return linhas;
}

/** Bloco markdown dos ativos, separando gravados de livres. */
function ativosMarkdown(ativos: Ativos, limite: number): string[] {
  const linhas = ['', '## Ativos'];

  const foraDoConcurso = ativos.gravados.filter((g) => !g.submeteASeRj);
  const reais = ativos.gravados.filter((g) => g.submeteASeRj && g.natureza === 'garantia_real');
  const constricoes = ativos.gravados.filter((g) => g.natureza === 'constricao');

  const secao = (titulo: string, itens: typeof ativos.gravados, nota: string) => {
    linhas.push('', `### ${titulo}`, '', nota, '');
    if (!itens.length) {
      linhas.push('_Nenhuma menção localizada nas publicações e movimentos analisados._');
      return;
    }
    for (const g of itens.slice(0, limite)) {
      linhas.push(
        `- **${g.rotulo}**${g.bem ? ` — ${g.bem}` : ''}${g.data ? ` _(${data(g.data)})_` : ''}`,
      );
      if (g.credor) linhas.push(`  - Titular: ${g.credor}`);
      linhas.push(`  - Base: ${g.base}`);
      linhas.push(
        `  - Origem: ${g.origem === 'movimento' ? 'nome do movimento' : 'texto da publicação'} — _"…${g.trecho}…"_`,
      );
    }
    if (itens.length > limite) {
      linhas.push('', `_Mais ${itens.length - limite} menção(ões) omitida(s); aumente \`limit\`._`);
    }
  };

  secao(
    'Gravados — fora do concurso (art. 49, §3º)',
    foraDoConcurso,
    'Propriedade fiduciária, arrendamento mercantil e reserva de domínio: o titular **não** se submete ao plano e o bem não entra no rateio, ressalvada a vedação de retirar bens de capital essenciais durante a suspensão.',
  );

  secao(
    'Gravados — garantia real sujeita ao plano (Classe II)',
    reais,
    'Hipoteca, penhor, anticrese e caução: o crédito é sujeito à recuperação, na Classe II, e a supressão da garantia depende de aprovação do próprio credor titular (art. 50, §1º).',
  );

  if (constricoes.length) {
    secao(
      'Constrições judiciais',
      constricoes,
      'Penhoras, bloqueios e indisponibilidades não são direito real de garantia: são atos de constrição. Sobre bens de capital essenciais, a substituição compete ao juízo da recuperação (art. 6º, §7º-B).',
    );
  }

  linhas.push('', '### Declarados livres e desembaraçados', '');
  if (ativos.livres.length) {
    for (const l of ativos.livres.slice(0, limite)) {
      linhas.push(`- ${l.bem ?? 'Bem não identificado no trecho'}${l.data ? ` _(${data(l.data)})_` : ''}`);
      linhas.push(`  - _"…${l.trecho}…"_`);
    }
  } else {
    linhas.push(
      '_Nenhuma declaração de bem livre localizada._ Ausência de gravame nesta lista **não** torna um bem livre: a relação patrimonial está na petição inicial (art. 51, III e IV), que não é publicada em diário.',
    );
  }

  if (ativos.garantiasPorCredor.length) {
    linhas.push(
      '',
      '### Garantias deduzidas da Classe II',
      '',
      'Cada credor com garantia real implica, por definição legal, um bem gravado — mesmo quando o edital não descreve qual:',
      '',
    );
    for (const g of ativos.garantiasPorCredor.slice(0, limite)) {
      linhas.push(`- ${g.credor} — ${moeda(g.valor)}`);
    }
  }

  linhas.push('', '**Ressalvas da leitura:**');
  linhas.push(...ativos.avisos.map((a) => `- ⚠️ ${a}`));
  return linhas;
}

export function registrarFerramentasRecuperacao(server: McpServer): void {
  /* ------------------------ pdpj_dossie_recuperacao ----------------------- */

  server.registerTool(
    'pdpj_dossie_recuperacao',
    {
      title: 'Dossiê de recuperação judicial',
      description: `Monta o dossiê de um processo de recuperação judicial em uma única chamada, reunindo o que o DataJud e o DJEN têm sobre ele e organizando na ordem em que um analista lê o caso: identificação da devedora, motivo do pedido, fase e fatores legais, relação de credores e ativos separados entre gravados e livres.

O que cada seção traz e de onde vem:
  - **Identificação**: classe, vara especializada, ajuizamento, devedora e CNPJ (do polo ativo das publicações), administrador judicial.
  - **Motivo do pedido**: trechos do edital do art. 52, §1º, I, que por lei contém o resumo do pedido do devedor, classificados por causa (pandemia, queda de faturamento, endividamento, inadimplência, custos, câmbio, clima…).
  - **Fase e marcos**: deferimento do processamento (art. 52), stay period e sua prorrogação (art. 6º, §4º), apresentação do plano (art. 53), assembleia (arts. 35 a 46), concessão (art. 58), biênio de fiscalização (art. 61), encerramento (art. 63), convolação em falência (art. 73).
  - **Fatores legais**: prazos em curso, desfechos e riscos, cada um com o dispositivo da Lei 11.101/2005.
  - **Credores**: lidos do edital publicado, separados pelas classes do art. 41.
  - **Ativos**: menções a bens gravados (com a distinção decisiva do art. 49, §3º, entre o que se submete e o que não se submete ao plano), constrições e bens declarados livres.

Args:
  - numero (string): número CNJ da recuperação.
  - tribunal (string, opcional): sigla, quando a dedução pelo número não servir.
  - max_publicacoes (number): quantas publicações varrer (padrão: 60).
  - incluir_credores / incluir_ativos (boolean): ligam as seções pesadas (padrão: true).
  - max_credores_por_classe (number): quantos credores exibir por classe (padrão: 15).
  - response_format ('markdown' | 'json').

Use quando: o pedido é "monta o dossiê dessa recuperação", "por que essa empresa pediu RJ", "em que pé está a recuperação", "quem são os credores e quais os ativos".
Não use quando: o processo não é de recuperação nem de falência — para processos comuns, pdpj_analisar_processo responde melhor. Para a lista completa de credores, use pdpj_relacao_credores; para o detalhe de bens, pdpj_ativos_garantias.

Limite estrutural: relação de bens, plano de recuperação, laudos e balanços são peças dos autos e **não** são publicados em diário. O dossiê termina com a lista do que não dá para obter por aqui e onde obter.`,
      inputSchema: DossieRecuperacaoInput,
      outputSchema: z.looseObject({
        numero: z.string(),
        fase: z.string(),
        marcos: z.array(z.unknown()),
        fatores_legais: z.array(z.unknown()),
      }),
      annotations: SOMENTE_LEITURA,
    },
    comTratamento(async (args) => {
      const { digitos, sigla, resolvido, djen, movimentos } = await levantar(
        args.numero,
        args.tribunal,
        args.ignorar_digito,
        args.max_publicacoes,
      );

      const principal = resolvido?.instancias[0] ?? null;
      const marcos: MarcoRj[] = extrairMarcos(movimentos);
      const fase = deduzirFase(marcos);
      const stay = calcularStay(marcos);
      const motivos = extrairMotivos(djen.publicacoes);
      const auxiliares = extrairAuxiliares(djen.publicacoes);
      const devedora = identificarDevedora(djen.publicacoes);

      const edital = args.incluir_credores ? escolherEdital(djen.publicacoes) : null;
      const relacao = edital ? extrairCredores(edital) : null;
      const classeII =
        relacao?.classes.find((c) => c.id === 'ii_garantia_real')?.credores.map((c) => ({
          nome: c.nome,
          valor: c.valor,
        })) ?? [];

      const ativos = args.incluir_ativos
        ? extrairAtivos(djen.publicacoes, movimentos, classeII)
        : null;

      const fatores = fatoresLegais(
        fase,
        marcos,
        stay,
        ativos,
        principal?.processo.dataAjuizamento ?? null,
      );

      const classeRj = principal?.processo.classe?.nome ?? null;
      const pareceRj =
        /recupera|falenc/i.test(classeRj ?? '') ||
        marcos.some((m) => ['deferimento', 'concessao', 'encerramento', 'falencia'].includes(m.id));

      const dados = {
        numero: formatar(digitos),
        tribunal: sigla ?? null,
        devedora: devedora.nome,
        cnpj: devedora.cnpj,
        classe: classeRj,
        orgao_julgador: principal?.processo.orgaoJulgador?.nome ?? null,
        data_ajuizamento: principal?.processo.dataAjuizamento ?? null,
        ultima_atualizacao_datajud: principal?.processo.dataUltimaAtualizacao ?? null,
        parece_recuperacao: pareceRj,
        fase: fase.rotulo,
        fase_id: fase.id,
        fase_base: fase.base,
        stay_period: stay,
        marcos,
        motivo_indicios: motivos,
        administradores:
          auxiliares
            .filter((a) => a.papel === 'administrador_judicial')
            .map((a) => ({ nome: a.nome, data: a.data, contexto: a.contexto })),
        fatores_legais: fatores,
        credores: relacao,
        ativos,
        publicacoes_analisadas: djen.publicacoes.length,
        total_publicacoes: djen.total,
        ...(djen.falha ? { falha_djen: djen.falha } : {}),
        ...(resolvido ? {} : { aviso_datajud: 'Processo não localizado na base do DataJud.' }),
      };

      /* ------------------------------ markdown ----------------------------- */

      const l: string[] = [
        `# Dossiê de recuperação judicial — ${formatar(digitos)}`,
        '',
        RESSALVA,
      ];

      if (djen.falha) {
        // Sem este aviso, as seções alimentadas pelo DJEN sairiam vazias como
        // se a fonte tivesse sido lida e nada houvesse — que é o oposto do que
        // aconteceu. Vazio por indisponibilidade não é vazio por ausência.
        l.push(
          '',
          '> 🔴 **O DJEN não foi consultado.** As seções de motivo do pedido, credores e ativos dependem dele e estão vazias por indisponibilidade da fonte, **não por ausência de credores, de motivo ou de bens**.',
          `>`,
          `> Falha: ${djen.falha}`,
        );
      }

      if (!pareceRj) {
        l.push(
          '',
          '> ⚠️ Nem a classe processual nem os movimentos indicam recuperação judicial ou falência. O dossiê segue, mas as seções abaixo podem vir vazias por simplesmente não haver o que ler.',
        );
      }

      l.push(
        '',
        '## Identificação',
        `- **Devedora**: ${devedora.nome ?? '_não identificada nas publicações_'}`,
        `- **CNPJ citado**: ${devedora.cnpj ?? '—'}`,
        `- **Classe**: ${classeRj ?? '—'}`,
        `- **Juízo**: ${principal?.processo.orgaoJulgador?.nome ?? '—'}${sigla ? ` (${sigla})` : ''}`,
        `- **Ajuizamento**: ${data(principal?.processo.dataAjuizamento)}${
          principal?.processo.dataAjuizamento
            ? ` — em tramitação há ${principal.metricas.duracaoTexto}`
            : ''
        }`,
        `- **Última carga no DataJud**: ${data(principal?.processo.dataUltimaAtualizacao)}`,
        `- **Publicações lidas**: ${djen.publicacoes.length}${djen.total > djen.publicacoes.length ? ` de ${djen.total}` : ''}`,
      );

      if (dados.administradores.length) {
        l.push(
          `- **Administrador judicial**: ${dados.administradores.map((a) => a.nome).join('; ')} _(extraído do texto — confira)_`,
        );
      }

      l.push('', '## Motivo do pedido');
      if (motivos.length) {
        const porCausa = new Map<string, typeof motivos>();
        for (const m of motivos) {
          porCausa.set(m.rotulo, [...(porCausa.get(m.rotulo) ?? []), m]);
        }
        l.push(
          '',
          'Causas mencionadas no texto publicado — o edital do art. 52, §1º, I, é obrigado a conter o resumo do pedido do devedor:',
          '',
        );
        for (const [rotulo, itens] of porCausa) {
          l.push(`- **${rotulo}** (${itens.length} menção(ões))`);
          l.push(`  - _"…${itens[0].trecho}…"_`);
        }
      } else if (djen.falha) {
        l.push('', '_Não avaliado: o DJEN não respondeu, e o motivo do pedido só existe no texto que ele publica._');
      } else {
        l.push(
          '',
          '_Nenhuma causa identificada no texto das publicações analisadas._',
          '',
          'O resumo do pedido pode não ter ido ao diário, ou o edital estar publicado apenas como remissão a anexo. A exposição completa das razões da crise está na petição inicial (art. 51, I) e no laudo econômico-financeiro (art. 51, II), que não são publicados.',
        );
      }

      l.push('', '## Fase e marcos', '', `**${fase.rotulo}** — ${fase.justificativa}`, `_Base: ${fase.base}_`);

      if (stay) {
        l.push(
          '',
          `**Período de suspensão (stay period)**: de ${data(stay.inicio)} a ${data(stay.fimPrevisto)} — ${stay.diasTotais} dias${stay.prorrogado ? ', com prorrogação registrada' : ''}.`,
          stay.vigente
            ? `Em curso: ${stay.diasRestantes} dia(s) restantes.`
            : `Encerrado há ${Math.abs(stay.diasRestantes)} dia(s).`,
          '',
          '_Cálculo de calendário sobre a data do movimento de deferimento (art. 6º, §4º). O juízo pode ter fixado termo diverso._',
        );
      }

      if (marcos.length) {
        l.push('', '| Data | Marco | Fundamento |', '| --- | --- | --- |');
        for (const m of marcos) {
          l.push(`| ${data(m.data)} | ${m.rotulo}${m.ocorrencias > 1 ? ` (${m.ocorrencias}×)` : ''} | ${m.base} |`);
        }
      } else {
        l.push('', '_Nenhum marco da Lei 11.101/2005 reconhecido nos movimentos._');
      }

      l.push('', '## Fatores legais mais relevantes', '');
      for (const f of fatores) {
        l.push(`### ${SIMBOLO[f.tom]} ${f.titulo}`, '', f.texto, '', `_${f.base}_`, '');
      }

      if (args.incluir_credores) {
        if (relacao) {
          l.push(...credoresMarkdown(relacao, args.max_credores_por_classe));
        } else if (djen.falha) {
          l.push(
            '',
            '## Relação de credores',
            '',
            '_Não levantada: o DJEN não respondeu._ A relação de credores só existe no texto do edital publicado — sem essa fonte não há de onde lê-la, e o vazio acima não diz nada sobre o passivo da devedora.',
          );
        } else {
          l.push(
            '',
            '## Relação de credores',
            '',
            '_Nenhum edital com relação de credores foi localizado nas publicações analisadas._',
            '',
            'Amplie `max_publicacoes`: o edital do art. 52, §1º, sai logo após o deferimento e costuma estar entre as publicações mais antigas. Muitos tribunais publicam apenas a remissão a um anexo — nesse caso a lista só existe nos autos.',
          );
        }
      }

      if (args.incluir_ativos && ativos) {
        l.push(...ativosMarkdown(ativos, 10));
      }

      l.push(
        '',
        '## O que não dá para obter por aqui',
        '',
        '| Peça | Onde está |',
        '| --- | --- |',
        '| Relação de bens e do patrimônio (art. 51, III e IV) | Autos — petição inicial |',
        '| Plano de recuperação e laudo econômico-financeiro (arts. 51, II, e 53) | Autos |',
        '| Balanços e demonstrações contábeis | Autos e Junta Comercial |',
        '| Histórico societário, capital, sócios, filiais | Junta Comercial e Receita Federal (CNPJ) |',
        '| Ata da assembleia com quóruns por classe | Autos |',
        '| Matrículas e ônus reais averbados | Cartórios de Registro de Imóveis |',
        '',
        `_Gerado em ${new Date().toISOString().slice(0, 10).split('-').reverse().join('/')} a partir de metadados do DataJud e publicações do DJEN._`,
      );

      return responder(args.response_format, l.join('\n'), dados);
    }),
  );

  /* -------------------------- pdpj_relacao_credores ----------------------- */

  server.registerTool(
    'pdpj_relacao_credores',
    {
      title: 'Relação de credores da recuperação',
      description: `Lê a relação de credores de uma recuperação judicial a partir do edital publicado no DJEN, separando os credores pelas classes do art. 41 da Lei 11.101/2005 e somando cada classe.

Há três relações possíveis, e a diferença entre elas importa:
  - **art. 52, §1º** — a relação apresentada pelo próprio devedor, publicada com o deferimento do processamento.
  - **art. 7º, §2º** — a relação do administrador judicial, já com habilitações e divergências processadas. Mais confiável.
  - **art. 18** — o quadro geral de credores, consolidado depois de julgadas as impugnações. É o definitivo.

A leitura se apoia no par nome → valor em reais dentro do segmento de cada classe, porque o layout do edital não é padronizado entre tribunais, sistemas e administradores. Valores sem nome legível antes deles são contados à parte, em vez de virarem credor inventado.

Args:
  - numero (string): número CNJ da recuperação.
  - fonte ('auto' | 'edital_52' | 'edital_7' | 'quadro_geral'): qual relação usar (padrão: 'auto', o edital mais completo encontrado).
  - classe: restringe a uma classe ('i_trabalhista', 'ii_garantia_real', 'iii_quirografario', 'iv_me_epp', 'extraconcursal').
  - contem (string): filtra por nome. valor_minimo (number): filtra por valor.
  - ordenar_por ('valor' | 'nome' | 'ordem_do_edital'), limit, offset.
  - incluir_trecho (boolean): anexa o trecho do edital de onde cada credor foi lido (padrão: false).
  - max_publicacoes (number): quantas publicações varrer procurando o edital (padrão: 60).

Use quando: o pedido é "lista os credores", "quanto a empresa deve para bancos", "quem são os credores trabalhistas", "qual o passivo por classe".
Não use quando: o interesse é o quadro geral do caso — aí use pdpj_dossie_recuperacao.

Se o edital tiver sido publicado só como remissão a anexo, a lista não existe no DJEN e o resultado virá vazio — isso não significa ausência de credores.`,
      inputSchema: RelacaoCredoresInput,
      outputSchema: z.looseObject({
        numero: z.string(),
        total_credores: z.number(),
        classes: z.array(z.unknown()),
      }),
      annotations: SOMENTE_LEITURA,
    },
    comTratamento(async (args) => {
      const { digitos, tribunal } = prepararNumero(args.numero, args.tribunal, args.ignorar_digito);
      const djen = await publicacoesDoProcesso(digitos, tribunal, args.max_publicacoes);

      if (djen.falha) {
        throw new ErroPdpj(`Não foi possível consultar o DJEN: ${djen.falha}`, [
          'A relação de credores só existe no texto do edital publicado; sem o DJEN não há de onde lê-la.',
        ]);
      }

      const preferencia = args.fonte === 'auto' ? undefined : args.fonte;
      const edital = escolherEdital(djen.publicacoes, preferencia);

      if (!edital) {
        throw new ErroPdpj(
          `Nenhum edital com relação de credores foi localizado nas ${djen.publicacoes.length} publicação(ões) analisadas de ${formatar(digitos)}.`,
          [
            'Aumente max_publicacoes: o edital do art. 52, §1º, sai logo após o deferimento, entre as publicações mais antigas.',
            args.fonte !== 'auto'
              ? `Nenhuma publicação correspondeu à fonte "${args.fonte}"; tente fonte="auto".`
              : 'Muitos tribunais publicam apenas a remissão a um anexo — nesse caso a lista só existe nos autos.',
            'Confirme com pdpj_buscar_publicacoes usando incluir_texto=true.',
          ],
        );
      }

      const relacao = extrairCredores(edital);

      // Filtros aplicados sobre a leitura, preservando os totais originais.
      const alvo = args.contem ? normalizar(args.contem) : null;
      const filtrar = (c: Credor): boolean => {
        if (alvo && !normalizar(c.nome).includes(alvo)) return false;
        if (args.valor_minimo !== undefined && (c.valor ?? 0) < args.valor_minimo) return false;
        return true;
      };

      const classes = relacao.classes
        .filter((c) => !args.classe || c.id === args.classe)
        .map((c) => {
          const filtrados = c.credores.filter(filtrar);
          const ordenados =
            args.ordenar_por === 'nome'
              ? [...filtrados].sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'))
              : args.ordenar_por === 'valor'
                ? [...filtrados].sort((a, b) => (b.valor ?? 0) - (a.valor ?? 0))
                : filtrados;
          return { ...c, credores: ordenados, totalFiltrado: ordenados.length };
        });

      const todos = classes.flatMap((c) =>
        c.credores.map((cr) => ({ ...cr, classeId: c.id, classeRotulo: c.rotulo })),
      );
      const pagina = todos.slice(args.offset, args.offset + args.limit);
      const hasMore = todos.length > args.offset + pagina.length;

      const dados = {
        numero: formatar(digitos),
        fonte: relacao.fonte,
        total_credores: relacao.totalCredores,
        credores_apos_filtros: todos.length,
        soma_geral: relacao.somaGeral,
        offset: args.offset,
        has_more: hasMore,
        ...(hasMore ? { next_offset: args.offset + pagina.length } : {}),
        classes: classes.map((c) => ({
          id: c.id,
          rotulo: c.rotulo,
          base: c.base,
          total: c.total,
          total_apos_filtros: c.totalFiltrado,
          soma: c.soma,
        })),
        credores: pagina.map((c) => ({
          nome: c.nome,
          documento: c.documento,
          valor: c.valor,
          valor_formatado: moeda(c.valor),
          classe: c.classeId,
          classe_rotulo: c.classeRotulo,
          ...(args.incluir_trecho ? { trecho: c.trecho } : {}),
        })),
        valores_nao_atribuidos: relacao.valoresNaoAtribuidos,
        avisos: relacao.avisos,
      };

      const l = [
        `# Relação de credores — ${formatar(digitos)}`,
        '',
        RESSALVA,
        '',
        `**Fonte**: ${relacao.fonte.fundamento}`,
        `**Publicada em**: ${data(relacao.fonte.data)}${relacao.fonte.orgao ? ` — ${relacao.fonte.orgao}` : ''}`,
        '',
        `${relacao.totalCredores} credor(es) lidos, somando ${moeda(relacao.somaGeral)}.`,
      ];

      if (todos.length !== relacao.totalCredores) {
        l.push(`Após os filtros informados: ${todos.length} credor(es).`);
      }

      l.push('', '| Classe | Credores | Soma | Fundamento |', '| --- | --- | --- | --- |');
      for (const c of classes) {
        l.push(`| ${c.rotulo} | ${c.totalFiltrado}${c.totalFiltrado !== c.total ? ` de ${c.total}` : ''} | ${moeda(c.soma)} | ${c.base} |`);
      }

      l.push('', `## Credores (${args.offset + 1}–${args.offset + pagina.length} de ${todos.length})`, '');
      if (pagina.length) {
        l.push('| # | Credor | Documento | Classe | Valor |', '| --- | --- | --- | --- | --- |');
        pagina.forEach((c, i) => {
          l.push(
            `| ${args.offset + i + 1} | ${c.nome} | ${c.documento ?? '—'} | ${c.classeRotulo.replace(/ —.*/, '')} | ${moeda(c.valor)} |`,
          );
        });
        if (args.incluir_trecho) {
          l.push('', '### Trechos de origem', '');
          pagina.forEach((c, i) => l.push(`${args.offset + i + 1}. ${c.nome} — _"…${c.trecho}…"_`));
        }
      } else {
        l.push('_Nenhum credor no recorte selecionado._');
      }

      if (hasMore) l.push('', `_Mais credores: repita com offset=${args.offset + pagina.length}._`);

      if (relacao.avisos.length) {
        l.push('', '## Ressalvas da leitura', '');
        l.push(...relacao.avisos.map((a) => `- ⚠️ ${a}`));
      }

      l.push(
        '',
        '_A relação definitiva é o quadro geral de credores do art. 18, e ele só se fecha depois de julgadas as impugnações do art. 8º. Confira sempre no edital original._',
      );

      return responder(args.response_format, l.join('\n'), dados);
    }),
  );

  /* -------------------------- pdpj_ativos_garantias ----------------------- */

  server.registerTool(
    'pdpj_ativos_garantias',
    {
      title: 'Ativos, gravames e constrições',
      description: `Levanta as menções a bens da devedora nas publicações e movimentos, separando o que está **gravado** do que foi **declarado livre**, e classificando cada gravame pelo efeito que tem na recuperação judicial.

A classificação é o que faz o levantamento valer:
  - **Fora do concurso (art. 49, §3º)**: alienação fiduciária, cessão fiduciária de recebíveis (trava bancária), arrendamento mercantil e reserva de domínio. O titular não se submete ao plano e o bem não entra no rateio — mas os bens de capital essenciais não podem ser retirados durante o período de suspensão.
  - **Garantia real sujeita ao plano (Classe II)**: hipoteca, penhor, anticrese, caução. O crédito é sujeito, e suprimir a garantia exige a aprovação do próprio credor titular (art. 50, §1º).
  - **Constrição**: penhora, bloqueio, indisponibilidade. Não é direito real de garantia; sobre bens de capital essenciais, a substituição compete ao juízo da recuperação (art. 6º, §7º-B).
  - **Livres**: apenas os bens que o texto publicado declara desembaraçados.

Args:
  - numero (string): número CNJ da recuperação.
  - situacao ('todos' | 'gravados' | 'livres' | 'fora_do_concurso'): recorte da resposta (padrão: 'todos').
  - incluir_constricoes (boolean): inclui penhoras e bloqueios (padrão: true).
  - max_publicacoes (number), limit (number), response_format.

Use quando: o pedido é "quais bens estão gravados", "o que sobra de ativo livre", "tem alienação fiduciária nesse caso", "há penhora sobre os bens da recuperanda".
Não use quando: o pedido é o passivo — para credores, use pdpj_relacao_credores.

**Limite estrutural, e ele é grande**: a relação de bens do devedor é peça dos autos (art. 51, III e IV) e não é publicada em diário. Isto **não é um inventário patrimonial** — é o conjunto de menções encontradas em texto público, cada uma com o trecho de origem. A ausência de gravame aqui nunca faz um bem ser livre.`,
      inputSchema: AtivosGarantiasInput,
      outputSchema: z.looseObject({
        numero: z.string(),
        gravados: z.array(z.unknown()),
        livres: z.array(z.unknown()),
      }),
      annotations: SOMENTE_LEITURA,
    },
    comTratamento(async (args) => {
      const { digitos, sigla, djen, movimentos } = await levantar(
        args.numero,
        args.tribunal,
        args.ignorar_digito,
        args.max_publicacoes,
      );

      const edital = escolherEdital(djen.publicacoes);
      const classeII = edital
        ? (extrairCredores(edital).classes.find((c) => c.id === 'ii_garantia_real')?.credores ?? []).map(
            (c) => ({ nome: c.nome, valor: c.valor }),
          )
        : [];

      const ativos = extrairAtivos(djen.publicacoes, movimentos, classeII);

      let gravados = ativos.gravados;
      if (!args.incluir_constricoes) gravados = gravados.filter((g) => g.natureza !== 'constricao');
      if (args.situacao === 'fora_do_concurso') gravados = gravados.filter((g) => !g.submeteASeRj);
      if (args.situacao === 'livres') gravados = [];

      const livres = args.situacao === 'gravados' || args.situacao === 'fora_do_concurso' ? [] : ativos.livres;

      const recorte: Ativos = {
        gravados: gravados.slice(0, args.limit),
        livres: livres.slice(0, args.limit),
        garantiasPorCredor: ativos.garantiasPorCredor,
        avisos: ativos.avisos,
      };

      const dados = {
        numero: formatar(digitos),
        tribunal: sigla ?? null,
        situacao: args.situacao,
        total_gravados: gravados.length,
        total_livres: livres.length,
        gravados: recorte.gravados,
        livres: recorte.livres,
        garantias_classe_ii: ativos.garantiasPorCredor,
        publicacoes_analisadas: djen.publicacoes.length,
        movimentos_analisados: movimentos.length,
        avisos: ativos.avisos,
      };

      const l = [
        `# Ativos e gravames — ${formatar(digitos)}`,
        '',
        RESSALVA,
        ...(djen.falha
          ? [
              '',
              `> 🔴 **O DJEN não foi consultado** (${djen.falha}). A descrição dos bens vem do texto das publicações; sem ela, sobram apenas as constrições que aparecem no nome dos movimentos. O que falta abaixo falta por indisponibilidade da fonte, não por ausência de gravame.`,
            ]
          : []),
        '',
        `Base: ${djen.publicacoes.length} publicação(ões) e ${movimentos.length} movimento(s).`,
        ...ativosMarkdown(recorte, args.limit),
      ];

      return responder(args.response_format, l.join('\n'), dados);
    }),
  );

  /* ------------------------- pdpj_historico_empresa ----------------------- */

  server.registerTool(
    'pdpj_historico_empresa',
    {
      title: 'Histórico judicial da empresa',
      description: `Levanta o histórico judicial de uma empresa pelo nome, varrendo as publicações do DJEN e agrupando por processo, tribunal, classe e ano. Serve para dois usos: **achar** a recuperação judicial de uma empresa quando só se tem o nome, e **situar** a crise no tempo — quando começaram as execuções, de que natureza são, em quantos tribunais.

Args:
  - nome_empresa (string): razão social ou nome de fantasia como aparece nas publicações.
  - tribunal (string, opcional): sigla para restringir; sem ela a busca é nacional.
  - de / ate (string, opcional): período de disponibilização (AAAA-MM-DD).
  - max_publicacoes (number): quantas publicações varrer (padrão: 100).
  - response_format ('markdown' | 'json').

Retorna: processos distintos encontrados com classe, tribunal e datas; destaque para recuperação judicial, falência, execuções fiscais e reclamações trabalhistas; distribuição por ano e por tribunal; os advogados que mais aparecem.

Use quando: o pedido é "acha a recuperação da empresa X", "que processos essa empresa tem", "desde quando ela é executada".
Não use quando: já se tem o número do processo — vá direto a pdpj_dossie_recuperacao.

**A história societária da empresa — fundação, sócios, capital, filiais — não está em base judicial nenhuma.** O que sai daqui é história *judicial*: o que foi a juízo e virou publicação. Fundação, quadro societário e situação cadastral vêm da Junta Comercial e do CNPJ da Receita Federal.`,
      inputSchema: HistoricoEmpresaInput,
      outputSchema: z.looseObject({
        empresa: z.string(),
        total_publicacoes: z.number(),
        processos: z.array(z.unknown()),
      }),
      annotations: SOMENTE_LEITURA,
    },
    comTratamento(async (args) => {
      const r = await buscarPublicacoes({
        nomeParte: args.nome_empresa,
        tribunal: args.tribunal,
        de: args.de,
        ate: args.ate,
        pagina: 1,
        itensPorPagina: args.max_publicacoes,
      });

      interface Agrupado {
        numero: string;
        tribunal: string | null;
        classe: string | null;
        orgao: string | null;
        primeira: string | null;
        ultima: string | null;
        publicacoes: number;
      }

      const processos = new Map<string, Agrupado>();
      const porAno = new Map<number, number>();
      const porTribunal = new Map<string, number>();

      for (const p of r.publicacoes) {
        if (p.dataDisponibilizacao) {
          const ano = Number(p.dataDisponibilizacao.slice(0, 4));
          if (Number.isFinite(ano)) porAno.set(ano, (porAno.get(ano) ?? 0) + 1);
        }
        if (p.tribunal) porTribunal.set(p.tribunal, (porTribunal.get(p.tribunal) ?? 0) + 1);

        const numero = p.numeroProcesso;
        if (!numero) continue;
        const atual = processos.get(numero);
        if (!atual) {
          processos.set(numero, {
            numero: formatar(numero),
            tribunal: p.tribunal,
            classe: p.classe,
            orgao: p.orgao,
            primeira: p.dataDisponibilizacao,
            ultima: p.dataDisponibilizacao,
            publicacoes: 1,
          });
          continue;
        }
        atual.publicacoes += 1;
        if (!atual.classe && p.classe) atual.classe = p.classe;
        const d = p.dataDisponibilizacao;
        if (d) {
          if (!atual.primeira || d < atual.primeira) atual.primeira = d;
          if (!atual.ultima || d > atual.ultima) atual.ultima = d;
        }
      }

      const lista = [...processos.values()].sort((a, b) =>
        (a.primeira ?? '').localeCompare(b.primeira ?? ''),
      );

      const destaque = (padrao: RegExp) =>
        lista.filter((p) => padrao.test(normalizar(p.classe ?? '')));

      const recuperacoes = destaque(/recuperacao (judicial|extrajudicial)/);
      const falencias = destaque(/falencia/);
      const fiscais = destaque(/execucao fiscal/);
      const trabalhistas = destaque(/trabalh|reclamacao/);

      const dados = {
        empresa: args.nome_empresa,
        total_publicacoes: r.total,
        publicacoes_analisadas: r.publicacoes.length,
        processos: lista,
        recuperacoes: recuperacoes.map((p) => p.numero),
        falencias: falencias.map((p) => p.numero),
        execucoes_fiscais: fiscais.length,
        trabalhistas: trabalhistas.length,
        por_ano: [...porAno.entries()].sort((a, b) => a[0] - b[0]).map(([ano, total]) => ({ ano, total })),
        por_tribunal: [...porTribunal.entries()]
          .sort((a, b) => b[1] - a[1])
          .map(([tribunal, total]) => ({ tribunal, total })),
      };

      const l = [
        `# Histórico judicial — ${args.nome_empresa}`,
        '',
        `${r.total} publicação(ões) no DJEN; ${r.publicacoes.length} analisada(s), em ${lista.length} processo(s) distinto(s).`,
        '',
        '> A busca é por **nome de parte** no texto das comunicações: homônimos e grafias diferentes da razão social podem entrar ou ficar de fora. Confira os números antes de tratar a lista como completa.',
      ];

      if (recuperacoes.length || falencias.length) {
        l.push('', '## Insolvência');
        for (const p of [...recuperacoes, ...falencias]) {
          l.push(`- **${p.numero}** — ${p.classe ?? 'classe não informada'} (${p.tribunal ?? '—'}), ${p.orgao ?? '—'}, desde ${data(p.primeira)}`);
        }
        l.push('', '_Use `pdpj_dossie_recuperacao` com um desses números para o dossiê completo._');
      }

      l.push(
        '',
        '## Panorama',
        `- **Execuções fiscais**: ${fiscais.length}`,
        `- **Trabalhistas**: ${trabalhistas.length}`,
        `- **Tribunais**: ${dados.por_tribunal.map((t) => `${t.tribunal} (${t.total})`).join(', ') || '—'}`,
      );

      if (dados.por_ano.length) {
        l.push('', '## Publicações por ano', '', dados.por_ano.map((a) => `${a.ano}: ${a.total}`).join(' · '));
      }

      l.push('', '## Processos', '');
      if (lista.length) {
        l.push('| Processo | Classe | Tribunal | Primeira | Última | Publs. |', '| --- | --- | --- | --- | --- | --- |');
        for (const p of lista) {
          l.push(
            `| ${p.numero} | ${p.classe ?? '—'} | ${p.tribunal ?? '—'} | ${data(p.primeira)} | ${data(p.ultima)} | ${p.publicacoes} |`,
          );
        }
      } else {
        l.push('_Nenhum processo identificado. Tente outra grafia da razão social, ou remova o filtro de tribunal._');
      }

      l.push(
        '',
        '---',
        '',
        '**História societária não está aqui.** Fundação, sócios, capital social, filiais e situação cadastral vêm da Junta Comercial do estado e do CNPJ na Receita Federal. O que este levantamento mostra é a história *judicial* da empresa — o que foi a juízo e virou publicação eletrônica.',
      );

      return responder(args.response_format, l.join('\n'), dados);
    }),
  );
}
