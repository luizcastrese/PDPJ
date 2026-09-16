#!/usr/bin/env node
/**
 * Lançador do servidor MCP para clientes que iniciam um processo local.
 *
 * O `.mcp.json` não pode apontar direto para `dist/src/index.js`: `dist/` é
 * gerado pelo build e fica fora do git, então em toda cópia recém-clonada —
 * e o Claude Code na web clona a cada sessão — o arquivo não existe, o
 * processo morre na largada e o cliente reporta apenas "connection closed".
 *
 * Este lançador resolve isso antes de entregar o controle ao servidor:
 * instala as dependências se faltarem, compila se o build estiver ausente ou
 * atrasado em relação ao código, e só então sobe o servidor de verdade.
 *
 * Regra inegociável do transporte stdio: **nada além do protocolo MCP pode
 * sair no stdout**. Por isso toda saída de npm e de tsc é desviada para o
 * stderr, onde o cliente a trata como log.
 */
import { spawnSync, spawn } from 'node:child_process';
import { existsSync, statSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..');
const ENTRADA = join(RAIZ, 'dist', 'src', 'index.js');

const log = (mensagem) => process.stderr.write(`[pdpj-mcp] ${mensagem}\n`);

/** Roda um comando com a saída toda no stderr, para não sujar o stdout. */
function rodar(comando, argumentos) {
  const r = spawnSync(comando, argumentos, {
    cwd: RAIZ,
    stdio: ['ignore', 'pipe', 'pipe'],
    shell: process.platform === 'win32',
  });
  if (r.stdout?.length) process.stderr.write(r.stdout);
  if (r.stderr?.length) process.stderr.write(r.stderr);
  return r.status === 0;
}

/** Data de modificação do arquivo .ts mais recente sob src/ e test/. */
function codigoMaisRecente(diretorio) {
  let maior = 0;
  for (const entrada of readdirSync(diretorio, { withFileTypes: true })) {
    const caminho = join(diretorio, entrada.name);
    if (entrada.isDirectory()) maior = Math.max(maior, codigoMaisRecente(caminho));
    else if (entrada.name.endsWith('.ts')) maior = Math.max(maior, statSync(caminho).mtimeMs);
  }
  return maior;
}

function precisaCompilar() {
  if (!existsSync(ENTRADA)) return true;
  try {
    return codigoMaisRecente(join(RAIZ, 'src')) > statSync(ENTRADA).mtimeMs;
  } catch {
    return true;
  }
}

if (!existsSync(join(RAIZ, 'node_modules'))) {
  log('dependências ausentes — instalando (só acontece uma vez)…');
  if (!rodar('npm', ['install', '--no-audit', '--no-fund'])) {
    log('falha ao instalar dependências; rode `npm install` manualmente.');
    process.exit(1);
  }
}

if (precisaCompilar()) {
  log('compilando TypeScript…');
  if (!rodar('npm', ['run', 'build'])) {
    log('falha ao compilar; rode `npm run build` para ver os erros.');
    process.exit(1);
  }
}

// stdio herdado: daqui em diante o cliente MCP fala direto com o servidor.
const servidor = spawn(process.execPath, [ENTRADA], { cwd: RAIZ, stdio: 'inherit' });
servidor.on('exit', (codigo, sinal) => process.exit(sinal ? 1 : (codigo ?? 0)));
for (const s of ['SIGINT', 'SIGTERM']) process.on(s, () => servidor.kill(s));
