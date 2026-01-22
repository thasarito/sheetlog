import { spawn } from 'node:child_process';
import crypto from 'node:crypto';
import path from 'node:path';

function parseNumber(value, fallback) {
  const parsed = Number.parseInt(String(value ?? ''), 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function hasArg(args, name) {
  return args.includes(name) || args.some((arg) => arg.startsWith(`${name}=`));
}

function stablePort(seed, base, range) {
  const hash = crypto.createHash('sha256').update(seed).digest();
  const value = hash.readUInt32BE(0);
  return base + (value % range);
}

const [, , command, ...args] = process.argv;

if (!command || (command !== 'dev' && command !== 'preview')) {
  console.error('Usage: node scripts/vite.js <dev|preview> [vite args]');
  process.exit(1);
}

const isDev = command === 'dev';
const cwd = process.cwd();

const envPortOverride = isDev ? process.env.SHEETLOG_DEV_PORT : process.env.SHEETLOG_PREVIEW_PORT;
const basePort = parseNumber(
  isDev ? process.env.SHEETLOG_DEV_PORT_BASE : process.env.SHEETLOG_PREVIEW_PORT_BASE,
  isDev ? 5173 : 4173,
);
const portRange = parseNumber(
  isDev ? process.env.SHEETLOG_DEV_PORT_RANGE : process.env.SHEETLOG_PREVIEW_PORT_RANGE,
  2000,
);

const port = parseNumber(envPortOverride, stablePort(cwd, basePort, portRange));

const viteBin = path.resolve(cwd, 'node_modules', 'vite', 'bin', 'vite.js');
const viteArgs = [command, ...args];

if (!hasArg(viteArgs, '--port')) {
  viteArgs.push('--port', String(port));
}
if (isDev && !hasArg(viteArgs, '--strictPort')) {
  viteArgs.push('--strictPort');
}

const child = spawn(process.execPath, [viteBin, ...viteArgs], {
  stdio: 'inherit',
  env: process.env,
});

child.on('exit', (code) => process.exit(code ?? 0));
