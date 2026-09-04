import type { Tribunal, PartesNumero } from '../types.js';

/**
 * Catalogo dos endpoints (aliases) da API Publica do DataJud/PDPJ e o
 * mapeamento a partir do numero unico CNJ (segmento J + codigo do tribunal TR).
 *
 * Cada endpoint e consultado em:
 *   POST {baseUrl}/api_publica_{alias}/_search
 */

/** Codigos de UF conforme a tabela de tribunais do CNJ (Res. 65/2008). */
const UF_POR_CODIGO: Record<string, string> = {
  '01': 'AC', '02': 'AL', '03': 'AP', '04': 'AM', '05': 'BA', '06': 'CE',
  '07': 'DF', '08': 'ES', '09': 'GO', '10': 'MA', '11': 'MT', '12': 'MS',
  '13': 'MG', '14': 'PA', '15': 'PB', '16': 'PR', '17': 'PE', '18': 'PI',
  '19': 'RJ', '20': 'RN', '21': 'RS', '22': 'RO', '23': 'RR', '24': 'SC',
  '25': 'SE', '26': 'SP', '27': 'TO',
};

const NOME_UF: Record<string, string> = {
  AC: 'Acre', AL: 'Alagoas', AP: 'Amapá', AM: 'Amazonas', BA: 'Bahia',
  CE: 'Ceará', DF: 'Distrito Federal e Territórios', ES: 'Espírito Santo',
  GO: 'Goiás', MA: 'Maranhão', MT: 'Mato Grosso', MS: 'Mato Grosso do Sul',
  MG: 'Minas Gerais', PA: 'Pará', PB: 'Paraíba', PR: 'Paraná',
  PE: 'Pernambuco', PI: 'Piauí', RJ: 'Rio de Janeiro',
  RN: 'Rio Grande do Norte', RS: 'Rio Grande do Sul', RO: 'Rondônia',
  RR: 'Roraima', SC: 'Santa Catarina', SE: 'Sergipe', SP: 'São Paulo',
  TO: 'Tocantins',
};

/** Codigos das regioes da Justica Federal (TRF1 a TRF6). */
const REGIOES_TRF = ['01', '02', '03', '04', '05', '06'];

function catalogo(): Tribunal[] {
  const lista: Tribunal[] = [];

  // Tribunais superiores
  lista.push(
    { alias: 'stj', sigla: 'STJ', nome: 'Superior Tribunal de Justiça', segmento: 3, codigo: '00', grupo: 'Superiores' },
    { alias: 'tst', sigla: 'TST', nome: 'Tribunal Superior do Trabalho', segmento: 5, codigo: '00', grupo: 'Superiores' },
    { alias: 'tse', sigla: 'TSE', nome: 'Tribunal Superior Eleitoral', segmento: 6, codigo: '00', grupo: 'Superiores' },
    { alias: 'stm', sigla: 'STM', nome: 'Superior Tribunal Militar', segmento: 7, codigo: '00', grupo: 'Superiores' },
  );

  // Justica Federal (J=4)
  for (const codigo of REGIOES_TRF) {
    lista.push({
      alias: `trf${Number(codigo)}`,
      sigla: `TRF${Number(codigo)}`,
      nome: `Tribunal Regional Federal da ${Number(codigo)}ª Região`,
      segmento: 4,
      codigo,
      grupo: 'Justiça Federal',
    });
  }

  // Justica do Trabalho (J=5): TRT1 a TRT24
  for (let i = 1; i <= 24; i++) {
    const codigo = String(i).padStart(2, '0');
    lista.push({
      alias: `trt${i}`,
      sigla: `TRT${i}`,
      nome: `Tribunal Regional do Trabalho da ${i}ª Região`,
      segmento: 5,
      codigo,
      grupo: 'Justiça do Trabalho',
    });
  }

  // Justica Eleitoral (J=6): TREs por UF
  for (const [codigo, uf] of Object.entries(UF_POR_CODIGO)) {
    lista.push({
      alias: `tre-${uf.toLowerCase()}`,
      sigla: `TRE-${uf}`,
      nome: `Tribunal Regional Eleitoral de ${NOME_UF[uf]}`,
      segmento: 6,
      codigo,
      grupo: 'Justiça Eleitoral',
    });
  }

  // Justica Estadual (J=8): TJs por UF
  for (const [codigo, uf] of Object.entries(UF_POR_CODIGO)) {
    const alias = uf === 'DF' ? 'tjdft' : `tj${uf.toLowerCase()}`;
    const sigla = uf === 'DF' ? 'TJDFT' : `TJ${uf}`;
    lista.push({
      alias,
      sigla,
      nome:
        uf === 'DF'
          ? 'Tribunal de Justiça do Distrito Federal e Territórios'
          : `Tribunal de Justiça de ${NOME_UF[uf]}`,
      segmento: 8,
      codigo,
      grupo: 'Justiça Estadual',
    });
  }

  // Justica Militar Estadual (J=9)
  lista.push(
    { alias: 'tjmmg', sigla: 'TJMMG', nome: 'Tribunal de Justiça Militar de Minas Gerais', segmento: 9, codigo: '13', grupo: 'Justiça Militar Estadual' },
    { alias: 'tjmrs', sigla: 'TJMRS', nome: 'Tribunal de Justiça Militar do Rio Grande do Sul', segmento: 9, codigo: '21', grupo: 'Justiça Militar Estadual' },
    { alias: 'tjmsp', sigla: 'TJMSP', nome: 'Tribunal de Justiça Militar de São Paulo', segmento: 9, codigo: '26', grupo: 'Justiça Militar Estadual' },
  );

  return lista;
}

export const TRIBUNAIS = catalogo();

const POR_ALIAS = new Map(TRIBUNAIS.map((t) => [t.alias, t]));
const POR_SIGLA = new Map(TRIBUNAIS.map((t) => [t.sigla.toUpperCase(), t]));
const POR_CNJ = new Map(TRIBUNAIS.map((t) => [`${t.segmento}.${t.codigo}`, t]));

/** Busca um tribunal por alias do endpoint ou por sigla (ex.: "tjsp" ou "TJSP"). */
export function buscarTribunal(chave?: string | null): Tribunal | null {
  if (!chave) return null;
  const k = String(chave).trim().toLowerCase();
  return POR_ALIAS.get(k) || POR_SIGLA.get(k.toUpperCase()) || null;
}

/** Deduz o tribunal a partir do numero CNJ decomposto. */
export function tribunalPeloNumero(partes?: PartesNumero | null): Tribunal | null {
  if (!partes) return null;
  return POR_CNJ.get(`${Number(partes.segmento)}.${partes.tribunal}`) || null;
}

/** Endpoint completo de busca para o alias informado. */
export function endpointBusca(baseUrl: string, alias: string): string {
  return `${baseUrl.replace(/\/+$/, '')}/api_publica_${alias}/_search`;
}

/** Lista agrupada, pronta para preencher o <select> da interface. */
export function tribunaisAgrupados() {
  const grupos = new Map<string, { alias: string; sigla: string; nome: string }[]>();
  for (const t of TRIBUNAIS) {
    if (!grupos.has(t.grupo)) grupos.set(t.grupo, []);
    grupos.get(t.grupo)!.push({ alias: t.alias, sigla: t.sigla, nome: t.nome });
  }
  return [...grupos.entries()].map(([grupo, itens]) => ({ grupo, itens }));
}
