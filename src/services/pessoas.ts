import type { Advogado, Destinatario, Publicacao } from './djen.js';

/**
 * Consolidação de quem atua no processo.
 *
 * Advogados vêm estruturados do DJEN (nome e OAB em campos próprios), então
 * são dado, não inferência. Já administrador judicial, perito e demais
 * auxiliares só aparecem no corpo da publicação — para esses, o que existe é
 * extração por padrão de texto, e o resultado sempre carrega o trecho de onde
 * saiu, para conferência humana.
 */

export type PapelAuxiliar =
  | 'administrador_judicial'
  | 'perito'
  | 'curador'
  | 'inventariante'
  | 'leiloeiro';

export interface Auxiliar {
  papel: PapelAuxiliar;
  rotulo: string;
  nome: string;
  /** Trecho da publicação de onde o nome foi extraído. */
  contexto: string;
  publicacao: string | null;
  data: string | null;
}

interface PadraoAuxiliar {
  papel: PapelAuxiliar;
  rotulo: string;
  /**
   * Casado contra o texto em minúsculas e sem acentos; o nome é lido do
   * texto original, logo após o fim do casamento.
   */
  gatilhos: RegExp[];
}

const PADROES: PadraoAuxiliar[] = [
  {
    papel: 'administrador_judicial',
    rotulo: 'Administrador judicial',
    gatilhos: [/administrador[ae]?\s+judicial/g, /administrador[ae]?\s+da\s+massa/g],
  },
  {
    papel: 'perito',
    rotulo: 'Perito',
    gatilhos: [/perit[oa](?:\s+judicial)?(?:\s+nomead[oa])?/g],
  },
  {
    papel: 'curador',
    rotulo: 'Curador',
    gatilhos: [/curador[a]?(?:\s+especial)?/g],
  },
  {
    papel: 'inventariante',
    rotulo: 'Inventariante',
    gatilhos: [/inventariante/g],
  },
  {
    papel: 'leiloeiro',
    rotulo: 'Leiloeiro',
    gatilhos: [/leiloeir[oa](?:\s+(?:oficial|publico))?/g],
  },
];

/**
 * Palavras funcionais: encontrar uma delas encerra o nome. A lista é
 * comparada sem acento e em minúsculas, então vale também para publicações
 * escritas inteiramente em caixa alta — onde não há maiúscula que sirva de
 * pista para saber onde o nome termina.
 */
const PARADAS = new Set([
  'para', 'por', 'com', 'sem', 'sob', 'sobre', 'ante', 'apos', 'ate', 'desde',
  'que', 'quem', 'qual', 'quais', 'onde', 'quando', 'como', 'pois', 'porque',
  'no', 'na', 'nos', 'nas', 'num', 'numa', 'ao', 'aos', 'a', 'o', 'as', 'os',
  'em', 'ou', 'se', 'ja', 'nao', 'sim', 'este', 'esta', 'esse', 'essa',
  'aquele', 'aquela', 'seu', 'sua', 'seus', 'suas', 'meu', 'minha',
  'devera', 'deverao', 'deve', 'devem', 'fica', 'ficam', 'foi', 'foram',
  'sera', 'serao', 'esta', 'estao', 'tera', 'terao', 'havera',
  'nomeado', 'nomeada', 'nomeados', 'nomeadas', 'intimado', 'intimada',
  'intimados', 'intimadas', 'intime', 'citado', 'citada', 'apresentar',
  'prazo', 'pena', 'multa', 'lei', 'art', 'artigo', 'artigos', 'inciso',
  'autos', 'processo', 'juizo', 'vara', 'comarca', 'tribunal', 'forum',
  'fls', 'fl', 'cpf', 'cnpj', 'rg', 'oab', 'conforme', 'nos termos', 'termos',
  'relatorio', 'contas', 'providencias', 'legais', 'laudo', 'honorarios',
]);

/** Conectivos que podem aparecer no meio de um nome ou razão social. */
const CONECTIVOS = new Set(['de', 'da', 'do', 'das', 'dos', 'e', 'del', 'di', '&']);

/** Tratamentos que antecedem o nome e não fazem parte dele. */
const TRATAMENTOS = /^(?:sr\.?|sra\.?|dr\.?|dra\.?|exmo\.?|exma\.?|o|a|os|as|empresa|escritorio)\s+/i;

function semAcento(texto: string): string {
  return texto
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

/**
 * Lê um nome próprio ou razão social a partir do início do trecho.
 *
 * Não depende de maiúsculas: acumula palavras até esbarrar em pontuação forte
 * ou em uma palavra funcional da lista de paradas. Conectivos ("de", "e") só
 * entram se houver outra palavra de nome depois deles.
 */
export function lerNome(trecho: string): string | null {
  // Descarta separadores e artigos iniciais deixados pelo gatilho.
  let resto = trecho.replace(/^[\s:,;.–—-]+/, '');
  let anterior: string;
  do {
    anterior = resto;
    resto = resto.replace(TRATAMENTOS, '');
  } while (resto !== anterior);

  // Corta em pontuação que encerra a ideia.
  const corte = resto.search(/[.;:,()[\]/|\n]|\s-\s/);
  const bruto = (corte >= 0 ? resto.slice(0, corte) : resto).trim();
  if (!bruto) return null;

  const palavras = bruto.split(/\s+/);
  const aceitas: string[] = [];

  // Publicações escritas inteiramente em caixa alta não oferecem a maiúscula
  // inicial como pista, então nelas o nome só termina na lista de paradas.
  const caixaAlta = !/[a-zà-ÿ]/.test(bruto);

  for (const palavra of palavras) {
    const limpa = palavra.replace(/^[^\wÀ-ÿ&]+|[^\wÀ-ÿ&.]+$/g, '');
    if (!limpa) break;
    const chave = semAcento(limpa);

    if (PARADAS.has(chave)) break;
    if (CONECTIVOS.has(chave)) {
      // Só entra se ainda houver nome antes e vier mais nome depois.
      if (!aceitas.length) break;
      aceitas.push(limpa);
      continue;
    }
    if (/^\d+$/.test(limpa)) break;
    // Fora da caixa alta, uma palavra em minúscula que não seja conectivo já
    // é o texto voltando a correr ("prestará contas", "deverá apresentar"):
    // o nome acabou. Isso dispensa prever cada verbo numa lista.
    if (!caixaAlta && !/^[A-ZÁÀÂÃÉÊÍÓÔÕÚÜÇ]/.test(limpa)) break;
    aceitas.push(limpa);
    if (aceitas.length >= 8) break;
  }

  // Um conectivo não pode terminar o nome ("Vieira e" vira "Vieira").
  while (aceitas.length && CONECTIVOS.has(semAcento(aceitas[aceitas.length - 1]))) {
    aceitas.pop();
  }

  const nome = aceitas.join(' ').trim();
  if (nome.length < 6 || aceitas.length < 2) return null;
  return nome;
}

function contextoDe(texto: string, indice: number, tamanho = 170): string {
  const inicio = Math.max(0, indice - 45);
  return texto
    .slice(inicio, inicio + tamanho)
    .replace(/\s+/g, ' ')
    .trim();
}

/** Percorre o texto das publicações procurando os auxiliares da justiça. */
export function extrairAuxiliares(publicacoes: Publicacao[]): Auxiliar[] {
  const encontrados: Auxiliar[] = [];
  const vistos = new Set<string>();

  for (const pub of publicacoes) {
    if (!pub.texto) continue;
    // O gatilho é procurado na versão normalizada, que preserva os índices
    // porque a remoção de acentos ocorre após a decomposição NFD.
    const alvo = pub.texto
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase();

    for (const { papel, rotulo, gatilhos } of PADROES) {
      for (const gatilho of gatilhos) {
        gatilho.lastIndex = 0;
        let m: RegExpExecArray | null;
        while ((m = gatilho.exec(alvo)) !== null) {
          const nome = lerNome(pub.texto.slice(m.index + m[0].length));
          if (!nome) continue;
          const chave = `${papel}|${semAcento(nome)}`;
          if (vistos.has(chave)) continue;
          vistos.add(chave);
          encontrados.push({
            papel,
            rotulo,
            nome,
            contexto: contextoDe(pub.texto, m.index),
            publicacao: pub.id,
            data: pub.dataDisponibilizacao,
          });
        }
      }
    }
  }
  return encontrados;
}

export interface AdvogadoConsolidado extends Advogado {
  /** Em quantas publicações este advogado foi intimado. */
  intimacoes: number;
  primeiraIntimacao: string | null;
  ultimaIntimacao: string | null;
}

/** Agrupa os advogados de todas as publicações e conta as intimações. */
export function consolidarAdvogados(publicacoes: Publicacao[]): AdvogadoConsolidado[] {
  const mapa = new Map<string, AdvogadoConsolidado>();

  for (const pub of publicacoes) {
    for (const adv of pub.advogados) {
      const chave = `${adv.nome.toLowerCase()}|${adv.oab ?? ''}|${adv.uf ?? ''}`;
      const atual = mapa.get(chave);
      const data = pub.dataDisponibilizacao;
      if (!atual) {
        mapa.set(chave, {
          ...adv,
          intimacoes: 1,
          primeiraIntimacao: data,
          ultimaIntimacao: data,
        });
        continue;
      }
      atual.intimacoes += 1;
      if (data) {
        if (!atual.primeiraIntimacao || data < atual.primeiraIntimacao) {
          atual.primeiraIntimacao = data;
        }
        if (!atual.ultimaIntimacao || data > atual.ultimaIntimacao) {
          atual.ultimaIntimacao = data;
        }
      }
    }
  }

  return [...mapa.values()].sort((a, b) => b.intimacoes - a.intimacoes);
}

/** Agrupa as partes destinatárias, preservando o polo quando informado. */
export function consolidarPartes(publicacoes: Publicacao[]): Destinatario[] {
  const mapa = new Map<string, Destinatario>();
  for (const pub of publicacoes) {
    for (const d of pub.destinatarios) {
      const chave = d.nome.toLowerCase();
      const atual = mapa.get(chave);
      if (!atual) mapa.set(chave, { ...d });
      else if (!atual.polo && d.polo) atual.polo = d.polo;
    }
  }
  return [...mapa.values()];
}

/** Números de OAB citados no corpo do texto, como reforço ao dado estruturado. */
export function oabsNoTexto(publicacoes: Publicacao[]): string[] {
  const encontrados = new Set<string>();
  const padrao = /OAB[\s/:-]*([A-Z]{2})?[\s/:-]*(\d{2,3}\.?\d{3})(?:[\s/-]*([A-Z]{2}))?/gi;
  for (const pub of publicacoes) {
    let m: RegExpExecArray | null;
    padrao.lastIndex = 0;
    while ((m = padrao.exec(pub.texto)) !== null) {
      const uf = (m[1] ?? m[3] ?? '').toUpperCase();
      const numero = m[2].replace(/\./g, '');
      encontrados.add(uf ? `${uf} ${numero}` : numero);
    }
  }
  return [...encontrados];
}
