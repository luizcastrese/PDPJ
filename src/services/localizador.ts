import type { Publicacao } from './djen.js';

/**
 * Localização de processos pelo nome da empresa ou do grupo econômico.
 *
 * O problema que isto resolve: nenhuma das duas bases públicas indexa CNPJ. O
 * DataJud não tem partes, e o DJEN tem o nome como o tribunal o escreveu — que
 * raramente é o nome pelo qual o grupo é conhecido. "Grupo Andrade" não existe
 * em lugar nenhum; nos autos está "Metalúrgica Andrade Indústria e Comércio
 * Ltda", e a coligada está como "Andrade Participações S.A.".
 *
 * Daí a estratégia: reduzir o nome ao seu núcleo distintivo, procurar por ele,
 * e depois **reagrupar** o que voltou por processo — porque é no agrupamento
 * que o grupo aparece. Várias razões sociais com o mesmo núcleo no mesmo
 * processo é a assinatura da consolidação processual; o mesmo núcleo espalhado
 * por processos diferentes pode ser grupo com pedidos separados, ou homônimo.
 * A ferramenta não decide isso: ela mostra a evidência e diz qual é qual.
 */

/** Termos que compõem a forma jurídica e não distinguem uma empresa de outra. */
const SUFIXOS = [
  'ltda', 'limitada', 's a', 's/a', 'sa', 'sociedade anonima', 'eireli', 'mei',
  'me', 'epp', 'participacoes', 'participacao', 'holding', 'holdings',
  'empreendimentos', 'empreendimento', 'industria', 'industrias', 'comercio',
  'ind', 'com', 'cia', 'companhia', 'importacao', 'exportacao', 'servicos',
  'group', 'do brasil', 'brasil', 'e', 'de', 'da', 'do', 'das', 'dos',
];

/** Palavras que anunciam o grupo sem fazer parte da razão social. */
const PREFIXOS = /^(?:grupo|holding|conglomerado|rede)\s+/i;

function chave(texto: string): string {
  return texto
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^\w\s/]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Reduz a razão social ao núcleo distintivo, retirando forma jurídica e
 * descrição de atividade. "Metalúrgica Andrade Indústria e Comércio Ltda"
 * vira "Metalúrgica Andrade".
 */
export function nucleo(nome: string): string {
  const semPrefixo = nome.replace(PREFIXOS, '').trim();
  const palavras = semPrefixo.split(/\s+/);

  // Corta do fim para o começo: o ruído está sempre no fim da razão social.
  while (palavras.length > 1) {
    const ultima = chave(palavras[palavras.length - 1]);
    if (!ultima || SUFIXOS.includes(ultima)) palavras.pop();
    else break;
  }
  return palavras.join(' ').trim() || semPrefixo;
}

export interface Variante {
  texto: string;
  motivo: string;
}

/**
 * Monta as buscas a fazer. Deliberadamente poucas: cada variante é uma ida ao
 * DJEN, e uma explosão combinatória de sufixos não acha nada que o núcleo já
 * não ache — o campo de busca do DJEN casa por conteúdo, não por igualdade.
 */
/** Encurtar demais transforma a busca em peneira de homônimos. */
const MINIMO_DISTINTIVO = 4;

export function gerarVariantes(nome: string): Variante[] {
  const limpo = nome.trim().replace(/\s+/g, ' ');
  const variantes: Variante[] = [{ texto: limpo, motivo: 'nome como informado' }];
  const vistos = new Set([chave(limpo)]);

  // O nome informado entra sempre; toda forma encurtada precisa se sustentar
  // sozinha. "Grupo Oi" é uma busca; "Oi" traria meio diário.
  const considerar = (texto: string, motivo: string) => {
    const k = chave(texto);
    if (!texto || vistos.has(k) || k.length < MINIMO_DISTINTIVO) return;
    vistos.add(k);
    variantes.push({ texto, motivo });
  };

  considerar(limpo.replace(PREFIXOS, '').trim(), 'sem o prefixo "grupo"');
  considerar(nucleo(limpo), 'núcleo, sem forma jurídica');

  return variantes;
}

export interface Candidato {
  numero: string;
  tribunal: string | null;
  orgao: string | null;
  classe: string | null;
  /** Razões sociais distintas vistas no polo deste processo. */
  nomes: string[];
  /** Quais variantes da busca trouxeram este processo. */
  variantes: string[];
  publicacoes: number;
  primeira: string | null;
  ultima: string | null;
  pontuacao: number;
  sinais: string[];
}

const CLASSE_INSOLVENCIA = /recuperacao (judicial|extrajudicial)|falencia/;
const VARA_ESPECIALIZADA = /falenc|recuperac/;

/**
 * Agrupa por processo o que veio de todas as variantes e pontua cada
 * candidato. A pontuação não é uma probabilidade — é uma ordenação, para que o
 * mais provável apareça primeiro e a evidência fique visível ao lado.
 */
export function agrupar(
  resultados: { variante: string; publicacoes: Publicacao[] }[],
  nomeBuscado: string,
  apenasInsolvencia: boolean,
): Candidato[] {
  const porProcesso = new Map<string, Candidato>();
  const nucleoBuscado = chave(nucleo(nomeBuscado));

  for (const { variante, publicacoes } of resultados) {
    for (const p of publicacoes) {
      const numero = p.numeroProcesso;
      if (!numero) continue;

      let c = porProcesso.get(numero);
      if (!c) {
        c = {
          numero,
          tribunal: p.tribunal,
          orgao: p.orgao,
          classe: p.classe,
          nomes: [],
          variantes: [],
          publicacoes: 0,
          primeira: p.dataDisponibilizacao,
          ultima: p.dataDisponibilizacao,
          pontuacao: 0,
          sinais: [],
        };
        porProcesso.set(numero, c);
      }

      c.publicacoes += 1;
      if (!c.classe && p.classe) c.classe = p.classe;
      if (!c.orgao && p.orgao) c.orgao = p.orgao;
      if (!c.variantes.includes(variante)) c.variantes.push(variante);

      const d = p.dataDisponibilizacao;
      if (d) {
        if (!c.primeira || d < c.primeira) c.primeira = d;
        if (!c.ultima || d > c.ultima) c.ultima = d;
      }

      // Só entram no rol as partes que de fato carregam o núcleo buscado: o
      // DJEN devolve a publicação inteira, com o polo contrário junto.
      for (const dest of p.destinatarios) {
        if (!chave(dest.nome).includes(nucleoBuscado)) continue;
        if (!c.nomes.includes(dest.nome)) c.nomes.push(dest.nome);
      }
    }
  }

  const candidatos = [...porProcesso.values()];

  for (const c of candidatos) {
    const classe = chave(c.classe ?? '');
    const orgao = chave(c.orgao ?? '');

    if (CLASSE_INSOLVENCIA.test(classe)) {
      c.pontuacao += 60;
      c.sinais.push(`classe de insolvência: ${c.classe}`);
    }
    if (VARA_ESPECIALIZADA.test(orgao)) {
      c.pontuacao += 25;
      c.sinais.push('vara especializada em falências e recuperações');
    }
    if (c.nomes.length > 1) {
      c.pontuacao += 30;
      c.sinais.push(
        `${c.nomes.length} razões sociais do mesmo núcleo no processo — indício de consolidação (arts. 69-G a 69-J)`,
      );
    }
    if (c.variantes.length > 1) {
      c.pontuacao += 10;
      c.sinais.push('encontrado por mais de uma variante do nome');
    }
    // O volume de publicações separa o processo principal do incidente.
    c.pontuacao += Math.min(c.publicacoes, 25);
    if (!c.nomes.length) {
      c.sinais.push('⚠️ nenhuma parte com o núcleo buscado no polo — possível homônimo ou menção de passagem');
      c.pontuacao -= 20;
    }
  }

  const filtrados = apenasInsolvencia
    ? candidatos.filter((c) => CLASSE_INSOLVENCIA.test(chave(c.classe ?? '')))
    : candidatos;

  return filtrados.sort((a, b) => b.pontuacao - a.pontuacao || (b.publicacoes - a.publicacoes));
}

/**
 * Conta quantas razões sociais distintas do mesmo núcleo apareceram em todo o
 * levantamento. É o que diz se você está diante de um grupo ou de uma empresa
 * só — independentemente de os processos serem um ou vários.
 */
export function empresasDoGrupo(candidatos: Candidato[]): string[] {
  const nomes = new Set<string>();
  for (const c of candidatos) for (const n of c.nomes) nomes.add(n);
  return [...nomes].sort();
}
