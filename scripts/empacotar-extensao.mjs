#!/usr/bin/env node
/**
 * Empacota o servidor como extensão do app Claude para computador (.mcpb).
 *
 * Um .mcpb é um zip com o servidor MCP dentro e um manifest.json descrevendo
 * como iniciá-lo. O app instala com um clique — sem terminal, sem hospedagem,
 * sem URL pública e sem token. E como o app já embute um Node.js, quem instala
 * não precisa ter Node na máquina.
 *
 * A saída fica em out/pdpj.mcpb.
 */
import { spawnSync } from 'node:child_process';
import { cpSync, mkdirSync, rmSync, writeFileSync, readFileSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..');
const SAIDA = join(RAIZ, 'out');
const PACOTE = join(SAIDA, 'extensao');

const pkg = JSON.parse(readFileSync(join(RAIZ, 'package.json'), 'utf8'));
const log = (m) => console.log(`[empacotar] ${m}`);

function executar(comando, argumentos, cwd = RAIZ) {
  const r = spawnSync(comando, argumentos, { cwd, stdio: 'inherit' });
  if (r.status !== 0) {
    console.error(`[empacotar] falhou: ${comando} ${argumentos.join(' ')}`);
    process.exit(1);
  }
}

log('compilando…');
executar('npm', ['run', 'build']);

rmSync(SAIDA, { recursive: true, force: true });
mkdirSync(PACOTE, { recursive: true });

// dist/src vira server/: os imports relativos entre os módulos continuam
// resolvendo, porque a árvore interna é preservada inteira.
cpSync(join(RAIZ, 'dist', 'src'), join(PACOTE, 'server'), { recursive: true });

// O package.json precisa ir junto por causa de "type": "module" — é ele que
// faz o Node tratar os arquivos do servidor como ESM.
writeFileSync(
  join(PACOTE, 'package.json'),
  JSON.stringify(
    {
      name: pkg.name,
      version: pkg.version,
      type: 'module',
      dependencies: pkg.dependencies,
    },
    null,
    2,
  ) + '\n',
);

log('instalando dependências de produção dentro do pacote…');
executar('npm', ['install', '--omit=dev', '--ignore-scripts', '--no-audit', '--no-fund'], PACOTE);

const manifest = {
  manifest_version: '0.3',
  name: 'pdpj',
  display_name: 'PDPJ — processos e recuperação judicial',
  version: pkg.version,
  description:
    'Consulta processos judiciais na API Pública do DataJud (CNJ) e nas publicações do DJEN, e monta dossiês de recuperação judicial: fase e marcos da Lei 11.101/2005, relação de credores por classe e ativos separados entre livres e gravados.',
  author: { name: 'luizcastrese' },
  repository: { type: 'git', url: 'https://github.com/luizcastrese/PDPJ' },
  keywords: ['juridico', 'processo', 'datajud', 'cnj', 'recuperacao-judicial'],
  license: 'MIT',
  server: {
    type: 'node',
    entry_point: 'server/index.js',
    mcp_config: {
      command: 'node',
      args: ['${__dirname}/server/index.js'],
    },
  },
};

writeFileSync(join(PACOTE, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');

log('compactando…');
const zip = spawnSync('zip', ['-qr', join(SAIDA, 'pdpj.mcpb'), '.'], { cwd: PACOTE });
if (zip.status !== 0) {
  console.error('[empacotar] o comando `zip` não está disponível nesta máquina.');
  process.exit(1);
}

const tamanho = (statSync(join(SAIDA, 'pdpj.mcpb')).size / 1048576).toFixed(1);
log(`pronto: out/pdpj.mcpb (${tamanho} MB)`);
log('No app Claude: Configurações → Extensões → Configurações avançadas → Instalar extensão…');
