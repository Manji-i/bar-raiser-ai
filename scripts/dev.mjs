// Dev runner: starts the Express backend and Vite together.
// Any CLI args passed to `npm run dev -- ...` (e.g. --host/--port from a
// preview runner) are forwarded to Vite only; the backend keeps its own port.
import { spawn } from 'node:child_process';

const viteArgs = process.argv.slice(2);
const children = [];

function start(args) {
  const child = spawn(process.execPath, args, { stdio: 'inherit' });
  children.push(child);
  return child;
}

const server = start(['--watch', 'server.js']);
const vite = start(['node_modules/vite/bin/vite.js', ...viteArgs]);

function shutdown(code = 0) {
  for (const child of children) {
    try {
      child.kill('SIGTERM');
    } catch {
      // already gone
    }
  }
  process.exit(code);
}

process.on('SIGINT', () => shutdown(0));
process.on('SIGTERM', () => shutdown(0));
vite.on('exit', (code) => shutdown(code ?? 0));
server.on('exit', (code) => shutdown(code ?? 0));
