#!/usr/bin/env node
/**
 * Registra o pdpj no app Claude para computador (Claude Desktop).
 *
 *   npm run instalar:desktop
 *
 * O servidor roda localmente, por stdio: sem rede, sem túnel, sem token. O
 * arquivo de configuração pode já conter outros servidores, então a escrita é
 * um merge — nada existente é perdido — e uma cópia de segurança é gravada
 * antes de qualquer alteração.
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync, copyFileSync } from 'node:fs';
import { homedir, platform } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const ENTRADA = join(RAIZ, 'dist', 'src', 'index.js');

/** Caminho do arquivo de configuração do Claude Desktop em cada sistema. */
function caminhoConfig() {
  if (process.env.CLAUDE_DESKTOP_CONFIG) return process.env.CLAUDE_DESKTOP_CONFIG;
  const casa = homedir();
  switch (platform()) {
    case 'darwin':
      return join(casa, 'Library', 'Application Support', 'Claude', 'claude_desktop_config.json');
    case 'win32':
      return join(process.env.APPDATA ?? join(casa, 'AppData', 'Roaming'), 'Claude', 'claude_desktop_config.json');
    default:
      return join(casa, '.config', 'Claude', 'claude_desktop_config.json');
  }
}

function principal() {
  if (!existsSync(ENTRADA)) {
    console.error(`Não encontrei ${ENTRADA}.`);
    console.error('Rode "npm install" (ou "npm run build") antes deste comando.');
    process.exit(1);
  }

  const caminho = caminhoConfig();
  mkdirSync(dirname(caminho), { recursive: true });

  let config = {};
  if (existsSync(caminho)) {
    const bruto = readFileSync(caminho, 'utf8').trim();
    if (bruto) {
      try {
        config = JSON.parse(bruto);
      } catch {
        console.error(`O arquivo ${caminho} existe mas não é JSON válido.`);
        console.error('Corrija ou renomeie o arquivo antes de continuar; nada foi alterado.');
        process.exit(1);
      }
    }
    // Só faz sentido guardar cópia do que já tinha conteúdo.
    const backup = `${caminho}.backup`;
    copyFileSync(caminho, backup);
    console.log(`Cópia de segurança: ${backup}`);
  }

  const servidores = { ...(config.mcpServers ?? {}) };
  const jaExistia = Boolean(servidores.pdpj);
  servidores.pdpj = { command: process.execPath, args: [ENTRADA] };

  writeFileSync(caminho, JSON.stringify({ ...config, mcpServers: servidores }, null, 2) + '\n');

  const outros = Object.keys(servidores).filter((n) => n !== 'pdpj');
  console.log(`\n${jaExistia ? 'Atualizado' : 'Adicionado'} o servidor "pdpj" em:`);
  console.log(`  ${caminho}`);
  console.log(`\nComando registrado:\n  ${process.execPath} ${ENTRADA}`);
  if (outros.length) {
    console.log(`\nOutros servidores preservados: ${outros.join(', ')}`);
  }
  console.log('\nFeche e abra o app Claude para ele carregar o servidor.\n');
}

principal();
