import type { ProcessoBruto } from '../types.js';

/**
 * Processo ficticio, no mesmo formato retornado pela API do DataJud.
 * Serve para conhecer a interface sem consumir a API (e sem rede).
 * Os movimentos sao gerados a partir da data atual para que as metricas
 * de duracao e paralisacao facam sentido em qualquer momento.
 */

function iso(diasAtras: number): string {
  return new Date(Date.now() - diasAtras * 86400000).toISOString();
}

const ROTEIRO: [number, number, string][] = [
  [980, 26, 'Distribuição por sorteio'],
  [978, 60, 'Expedição de Citação'],
  [951, 123, 'Juntada de Petição de contestação'],
  [930, 51, 'Audiência de conciliação designada'],
  [902, 970, 'Audiência de conciliação realizada'],
  [880, 1061, 'Conclusão para decisão'],
  [864, 11009, 'Decisão de saneamento e organização do processo'],
  [820, 12266, 'Perícia determinada'],
  [712, 581, 'Juntada de laudo pericial'],
  [690, 60, 'Expedição de Intimação às partes'],
  [640, 1061, 'Conclusão para julgamento'],
  [604, 219, 'Julgado procedente em parte o pedido - Sentença'],
  [578, 60, 'Publicação de sentença'],
  [560, 1002, 'Interposição de Recurso de Apelação'],
  [545, 123, 'Juntada de contrarrazões'],
  [530, 36, 'Remessa dos autos ao Tribunal de Justiça'],
  [402, 970, 'Sessão de julgamento realizada'],
  [400, 12333, 'Acórdão - negado provimento à apelação'],
  [362, 1002, 'Interposição de Embargos de Declaração'],
  [340, 219, 'Embargos de declaração rejeitados'],
  [280, 848, 'Trânsito em julgado'],
  [240, 12265, 'Início da fase de cumprimento de sentença'],
  [232, 60, 'Expedição de Intimação para pagamento voluntário'],
  [190, 12184, 'Penhora online (Sisbajud) determinada'],
  [140, 123, 'Juntada de Petição de impugnação ao cumprimento'],
  [96, 1061, 'Conclusão para decisão'],
];

export function processoDemo(): ProcessoBruto {
  return {
    numeroProcesso: '10001236920238260100',
    tribunal: 'TJSP',
    grau: 'G1',
    dataAjuizamento: iso(985),
    dataHoraUltimaAtualizacao: iso(12),
    nivelSigilo: 0,
    id: 'demo-tjsp-0001',
    classe: { codigo: 7, nome: 'Procedimento Comum Cível' },
    assuntos: [
      { codigo: 7681, nome: 'Indenização por Dano Moral' },
      { codigo: 7779, nome: 'Fornecimento de Energia Elétrica' },
    ],
    orgaoJulgador: {
      codigo: 4321,
      nome: '5ª Vara Cível do Foro Central Cível',
      codigoMunicipioIBGE: 3550308,
    },
    sistema: { codigo: 1, nome: 'ESAJ' },
    formato: { codigo: 1, nome: 'Eletrônico' },
    movimentos: ROTEIRO.map(([dias, codigo, nome]) => ({
      codigo,
      nome,
      dataHora: iso(dias),
      complementosTabelados: [],
    })),
  };
}

/**
 * Publicações fictícias no formato do DJEN, com os nomes de campo em
 * snake_case tal como a API costuma devolvê-los. Servem para exercitar a
 * leitura tolerante do cliente e a extração de auxiliares da justiça.
 */
export function publicacoesDemo(): Record<string, unknown>[] {
  return [
    {
      id: 90001,
      numero_processo: '10001236920238260100',
      numeroprocessocommascara: '1000123-69.2023.8.26.0100',
      data_disponibilizacao: iso(96).slice(0, 10),
      siglaTribunal: 'TJSP',
      nomeOrgao: '5ª Vara Cível do Foro Central Cível',
      tipoComunicacao: 'Intimação',
      nomeClasse: 'Procedimento Comum Cível',
      meiocompleto: 'Diário de Justiça Eletrônico Nacional',
      link: 'https://comunica.pje.jus.br/consulta/90001',
      texto:
        '<p>Fica a parte executada intimada da decisão que nomeou administrador judicial ' +
        'Ricardo Alves Monteiro, inscrito no CPF sob sigilo, para as providências do art. 22 da Lei 11.101/2005. ' +
        'Fica igualmente intimado o perito judicial Dr. Fernando Lima Castro para apresentar o laudo no prazo de 30 dias. ' +
        'Advogados: Mariana Souza Prado OAB/SP 214.556 e Carlos Eduardo Nunes OAB/SP 98.771.</p>',
      destinatarios: [
        { nome: 'Companhia Energética do Estado', polo: 'PASSIVO' },
        { nome: 'João Batista Ferreira', polo: 'ATIVO' },
      ],
      destinatarioadvogados: [
        {
          id: 1,
          comunicacao_id: 90001,
          advogado: { id: 11, nome: 'Mariana Souza Prado', numero_oab: '214556', uf_oab: 'SP' },
        },
        {
          id: 2,
          comunicacao_id: 90001,
          advogado: { id: 12, nome: 'Carlos Eduardo Nunes', numero_oab: '98771', uf_oab: 'SP' },
        },
      ],
    },
    {
      id: 90002,
      numero_processo: '10001236920238260100',
      numeroprocessocommascara: '1000123-69.2023.8.26.0100',
      data_disponibilizacao: iso(240).slice(0, 10),
      siglaTribunal: 'TJSP',
      nomeOrgao: '5ª Vara Cível do Foro Central Cível',
      tipoComunicacao: 'Intimação',
      nomeClasse: 'Procedimento Comum Cível',
      meiocompleto: 'Diário de Justiça Eletrônico Nacional',
      texto:
        'Intimação para pagamento voluntário no prazo de 15 dias, sob pena de multa. ' +
        'A administradora judicial Consultoria Vieira e Associados prestará contas na forma da lei.',
      destinatarios: [{ nome: 'Companhia Energética do Estado', polo: 'PASSIVO' }],
      destinatarioadvogados: [
        {
          id: 3,
          comunicacao_id: 90002,
          advogado: { id: 11, nome: 'Mariana Souza Prado', numero_oab: '214556', uf_oab: 'SP' },
        },
      ],
    },
  ];
}

/* ---------------------- recuperação judicial (demo) ----------------------- */

/** Número da recuperação judicial fictícia usada no modo demonstração. */
export const NUMERO_RJ_DEMO = '10055447420228260100';

const ROTEIRO_RJ: [number, number, string][] = [
  [1210, 26, 'Distribuição por sorteio'],
  [1205, 11009, 'Determinada a constatação prévia'],
  [1190, 11009, 'Deferimento do processamento da recuperação judicial'],
  [1188, 11009, 'Nomeação de administrador judicial'],
  [1180, 60, 'Expedição de edital do art. 52, §1º, com a relação de credores'],
  [1150, 12184, 'Penhora de bem imóvel em execução fiscal comunicada ao juízo'],
  [1130, 123, 'Apresentação do plano de recuperação judicial'],
  [1100, 123, 'Juntada de habilitação de crédito'],
  [1080, 123, 'Impugnação ao crédito apresentada'],
  [1020, 11009, 'Prorrogação do prazo de suspensão das ações e execuções'],
  [960, 51, 'Assembleia geral de credores designada'],
  [900, 970, 'Assembleia geral de credores realizada'],
  [895, 219, 'Aprovação do plano de recuperação judicial'],
  [880, 219, 'Concessão da recuperação judicial'],
  [700, 123, 'Juntada de relatório mensal de atividades'],
  [600, 12265, 'Autorizada a alienação de unidade produtiva isolada'],
  [300, 60, 'Publicação do quadro geral de credores'],
  [120, 123, 'Juntada de relatório mensal de atividades'],
];

/** Processo de recuperação judicial fictício, no formato do DataJud. */
export function processoRecuperacaoDemo(): ProcessoBruto {
  return {
    numeroProcesso: NUMERO_RJ_DEMO,
    tribunal: 'TJSP',
    grau: 'G1',
    dataAjuizamento: iso(1212),
    dataHoraUltimaAtualizacao: iso(9),
    nivelSigilo: 0,
    id: 'demo-tjsp-rj-0001',
    classe: { codigo: 129, nome: 'Recuperação Judicial' },
    assuntos: [
      { codigo: 10655, nome: 'Recuperação judicial e Falência' },
      { codigo: 10658, nome: 'Concurso de Credores' },
    ],
    orgaoJulgador: {
      codigo: 9911,
      nome: '2ª Vara de Falências e Recuperações Judiciais',
      codigoMunicipioIBGE: 3550308,
    },
    sistema: { codigo: 1, nome: 'ESAJ' },
    formato: { codigo: 1, nome: 'Eletrônico' },
    movimentos: ROTEIRO_RJ.map(([dias, codigo, nome]) => ({
      codigo,
      nome,
      dataHora: iso(dias),
      complementosTabelados: [],
    })),
  };
}

/**
 * Publicações fictícias da recuperação: um edital do art. 52, §1º, com o
 * resumo do pedido e a relação de credores por classe, e uma decisão que
 * menciona gravames, constrição e bens declarados livres. Servem para
 * exercitar a leitura de credores e de ativos sem depender do DJEN.
 */
export function publicacoesRecuperacaoDemo(): Record<string, unknown>[] {
  return [
    {
      id: 95001,
      numero_processo: NUMERO_RJ_DEMO,
      numeroprocessocommascara: '1005544-74.2022.8.26.0100',
      data_disponibilizacao: iso(1180).slice(0, 10),
      siglaTribunal: 'TJSP',
      nomeOrgao: '2ª Vara de Falências e Recuperações Judiciais',
      tipoComunicacao: 'Edital',
      nomeClasse: 'Recuperação Judicial',
      meiocompleto: 'Diário de Justiça Eletrônico Nacional',
      link: 'https://comunica.pje.jus.br/consulta/95001',
      texto:
        'EDITAL DE CONVOCAÇÃO DE CREDORES — art. 52, §1º, da Lei 11.101/2005. ' +
        'O MM. Juízo da 2ª Vara de Falências e Recuperações Judiciais faz saber que foi deferido o processamento da recuperação judicial de ' +
        'METALÚRGICA ANDRADE INDÚSTRIA E COMÉRCIO LTDA, CNPJ 12.345.678/0001-90, e nomeado administrador judicial Ribeiro Consultoria Empresarial. ' +
        'RESUMO DO PEDIDO: a devedora, fundada em 1987 e dedicada à usinagem de peças para o setor automotivo, ' +
        'atribui sua crise econômico-financeira à queda do faturamento a partir de 2019, agravada pela pandemia de covid-19, ' +
        'ao aumento dos custos de matéria-prima e à inadimplência de clientes do setor, ' +
        'somados ao endividamento bancário contratado a juros elevados e a bloqueios judiciais de conta que comprometeram o capital de giro. ' +
        'RELAÇÃO NOMINAL DE CREDORES. ' +
        'CLASSE I — CREDORES TRABALHISTAS: 1) ANTONIO PEREIRA DA SILVA, CPF 123.456.789-00 — R$ 48.320,15; ' +
        '2) MARIA JOSÉ DOS SANTOS, CPF 987.654.321-00 — R$ 31.117,40; ' +
        '3) SINDICATO DOS METALÚRGICOS DO ABC — R$ 12.000,00. ' +
        'CLASSE II — CREDORES COM GARANTIA REAL: 1) BANCO INDUSTRIAL DO SUDESTE S.A., CNPJ 60.111.222/0001-33 — R$ 4.820.000,00; ' +
        '2) COOPERATIVA DE CRÉDITO SICOOB VALE — R$ 1.250.500,00. ' +
        'CLASSE III — CREDORES QUIROGRAFÁRIOS: 1) ACIARIA PAULISTA INSUMOS LTDA, CNPJ 22.333.444/0001-55 — R$ 2.115.780,32; ' +
        '2) TRANSPORTADORA ROTA NORTE LTDA — R$ 640.210,00; ' +
        '3) ENERGIA E UTILIDADES S.A. — R$ 388.905,70. ' +
        'CLASSE IV — MICROEMPRESAS E EMPRESAS DE PEQUENO PORTE: 1) FERRAMENTARIA BOA VISTA ME — R$ 87.400,00; ' +
        '2) USINAGEM PRECISA EPP — R$ 54.900,25. ' +
        'Os credores dispõem do prazo do art. 7º, §1º, para apresentar habilitações ou divergências ao administrador judicial.',
      destinatarios: [
        { nome: 'Metalúrgica Andrade Indústria e Comércio Ltda', polo: 'ATIVO' },
      ],
      destinatarioadvogados: [
        {
          id: 21,
          comunicacao_id: 95001,
          advogado: { id: 31, nome: 'Helena Braga Villas Boas', numero_oab: '178432', uf_oab: 'SP' },
        },
      ],
    },
    {
      id: 95002,
      numero_processo: NUMERO_RJ_DEMO,
      numeroprocessocommascara: '1005544-74.2022.8.26.0100',
      data_disponibilizacao: iso(880).slice(0, 10),
      siglaTribunal: 'TJSP',
      nomeOrgao: '2ª Vara de Falências e Recuperações Judiciais',
      tipoComunicacao: 'Intimação',
      nomeClasse: 'Recuperação Judicial',
      meiocompleto: 'Diário de Justiça Eletrônico Nacional',
      texto:
        'Vistos. Concedo a recuperação judicial de Metalúrgica Andrade Indústria e Comércio Ltda, nos termos do art. 58 da Lei 11.101/2005, ' +
        'homologado o plano aprovado em assembleia. Anoto que o galpão industrial da matriz, objeto da matrícula nº 145.332 do 8º CRI da Capital, ' +
        'encontra-se gravado por hipoteca em favor do Banco Industrial do Sudeste S.A. ' +
        'O maquinário de usinagem descrito no laudo é objeto de alienação fiduciária contratada com a mesma instituição, ' +
        'e os recebíveis de cartão estão submetidos a cessão fiduciária, razão pela qual esses créditos não se submetem aos efeitos da recuperação, ' +
        'na forma do art. 49, §3º, vedada a retirada dos bens de capital essenciais à atividade durante o período de suspensão. ' +
        'Os dois veículos de entrega são objeto de arrendamento mercantil junto à Financeira Volpe. ' +
        'Permanecem livres e desembaraçados o imóvel do escritório administrativo situado na Rua Aurora, nº 512, ' +
        'e o terreno registrado sob a matrícula nº 98.771, ambos sem qualquer ônus real averbado. ' +
        'Comunique-se ao juízo da execução fiscal sobre a penhora do imóvel da filial, para as providências do art. 6º, §7º-B.',
      destinatarios: [
        { nome: 'Metalúrgica Andrade Indústria e Comércio Ltda', polo: 'ATIVO' },
        { nome: 'Banco Industrial do Sudeste S.A.', polo: 'PASSIVO' },
      ],
      destinatarioadvogados: [
        {
          id: 22,
          comunicacao_id: 95002,
          advogado: { id: 31, nome: 'Helena Braga Villas Boas', numero_oab: '178432', uf_oab: 'SP' },
        },
      ],
    },
  ];
}
