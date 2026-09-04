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
