import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

/** Raiz do projeto (dist/src/config.js -> ../../..). */
export const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

/**
 * Carrega variáveis de um arquivo .env sem dependências externas.
 * Valores já presentes em process.env têm precedência.
 */
function carregarEnv(caminho: string): void {
  if (!existsSync(caminho)) return;
  for (const linha of readFileSync(caminho, 'utf8').split('\n')) {
    const limpa = linha.trim();
    if (!limpa || limpa.startsWith('#')) continue;
    const igual = limpa.indexOf('=');
    if (igual < 1) continue;
    const chave = limpa.slice(0, igual).trim();
    let valor = limpa.slice(igual + 1).trim();
    if (
      (valor.startsWith('"') && valor.endsWith('"')) ||
      (valor.startsWith("'") && valor.endsWith("'"))
    ) {
      valor = valor.slice(1, -1);
    }
    if (process.env[chave] === undefined) process.env[chave] = valor;
  }
}

carregarEnv(join(ROOT, '.env'));

/**
 * Chave pública da API do DataJud divulgada pelo próprio CNJ.
 * Não é um segredo: consta na documentação oficial em
 * https://datajud-wiki.cnj.jus.br/api-publica/acesso
 * Serve apenas como padrão para quem não configurou PDPJ_API_KEY.
 */
const CHAVE_PUBLICA_CNJ =
  'cDZHYzlZa0JadVREZDJCendQbXY6SkJlTzNjLV9TRENyQk1RdnFKZGRQdw==';

export interface Config {
  apiKey: string;
  usandoChavePadrao: boolean;
  baseUrl: string;
  /** Base da API de comunicações do DJEN (aberta, sem chave). */
  djenUrl: string;
  cacheTtlMs: number;
  timeoutMs: number;
  /** Quando ligado, não há chamadas de rede: usa a fixture local de demonstração. */
  demo: boolean;
}

/**
 * Lê um número de variável de ambiente, caindo no padrão quando o valor não
 * serve. O caso que importa é a variável **definida como texto vazio** — comum
 * quando um lançador repassa `VAR=` sem valor: `Number('')` é 0, e um tempo
 * limite de 0 aborta toda chamada antes de ela sair. `??` não protege disso,
 * porque string vazia não é nulo.
 */
function numeroDoAmbiente(valor: string | undefined, padrao: number, minimo = 0): number {
  if (valor === undefined || valor.trim() === '') return padrao;
  const n = Number(valor);
  return Number.isFinite(n) && n >= minimo ? n : padrao;
}

export const config: Config = {
  apiKey: process.env.PDPJ_API_KEY || CHAVE_PUBLICA_CNJ,
  usandoChavePadrao: !process.env.PDPJ_API_KEY,
  baseUrl: process.env.PDPJ_BASE_URL || 'https://api-publica.datajud.cnj.jus.br',
  djenUrl: process.env.PDPJ_DJEN_URL || 'https://comunicaapi.pje.jus.br',
  // O cache aceita 0, que desliga; o tempo limite não, porque 0 anula tudo.
  cacheTtlMs: numeroDoAmbiente(process.env.PDPJ_CACHE_TTL, 300) * 1000,
  timeoutMs: numeroDoAmbiente(process.env.PDPJ_TIMEOUT, 90000, 1),
  demo: process.env.PDPJ_DEMO === '1' || process.env.PDPJ_DEMO === 'true',
};
