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
  cacheTtlMs: number;
  timeoutMs: number;
  /** Quando ligado, não há chamadas de rede: usa a fixture local de demonstração. */
  demo: boolean;
}

export const config: Config = {
  apiKey: process.env.PDPJ_API_KEY || CHAVE_PUBLICA_CNJ,
  usandoChavePadrao: !process.env.PDPJ_API_KEY,
  baseUrl: process.env.PDPJ_BASE_URL || 'https://api-publica.datajud.cnj.jus.br',
  cacheTtlMs: Number(process.env.PDPJ_CACHE_TTL ?? 300) * 1000,
  timeoutMs: Number(process.env.PDPJ_TIMEOUT ?? 30000),
  demo: process.env.PDPJ_DEMO === '1' || process.env.PDPJ_DEMO === 'true',
};
