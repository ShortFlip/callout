// `npm run dev:mock`: start the fake Supabase, then `next dev -p 3123` pointed at it.
//
// Safety: .env.mock's values go into process.env BEFORE next starts. Next's
// env loader never overrides a variable that is already set, so the LIVE
// project's URL and key in .env.local are never used. As a second guard this
// refuses to start unless the Supabase URL is a loopback address.

import { spawn, spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const NEXT_PORT = process.env.MOCK_NEXT_PORT ?? '3123';

for (const line of readFileSync(path.join(root, '.env.mock'), 'utf8').split(/\r?\n/)) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
  if (m) process.env[m[1]] = m[2]; // overwrite: a shell that exported the live URL must not win either
}

const supabaseUrl = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL);
if (!['127.0.0.1', 'localhost', '[::1]'].includes(supabaseUrl.hostname)) {
  console.error(`[dev:mock] refusing to start: NEXT_PUBLIC_SUPABASE_URL is ${supabaseUrl.host}, not loopback`);
  process.exit(1);
}
process.env.MOCK_SUPABASE_PORT = supabaseUrl.port;

const children = [];
function run(name, args) {
  const child = spawn(process.execPath, args, { cwd: root, env: process.env, stdio: 'inherit' });
  child.on('exit', (code) => {
    console.log(`[dev:mock] ${name} exited (${code}); stopping the rest`);
    shutdown(code ?? 0);
  });
  children.push(child);
  return child;
}

let stopping = false;
function shutdown(code) {
  if (stopping) return;
  stopping = true;
  for (const child of children) {
    if (child.exitCode !== null) continue;
    // next dev spawns its own worker; on Windows only a tree kill takes it down.
    if (process.platform === 'win32') spawnSync('taskkill', ['/pid', String(child.pid), '/T', '/F'], { stdio: 'ignore' });
    else child.kill('SIGTERM');
  }
  process.exit(code);
}
process.on('SIGINT', () => shutdown(0));
process.on('SIGTERM', () => shutdown(0));

run('mock-supabase', [path.join(root, 'scripts', 'mock-supabase', 'server.mjs')]);
// --webpack: a worktree's node_modules is a junction to the main checkout, and
// Turbopack panics on a symlink that points outside the project root.
run('next dev', [path.join(root, 'node_modules', 'next', 'dist', 'bin', 'next'), 'dev', '--webpack', '-p', NEXT_PORT]);
console.log(`[dev:mock] app http://localhost:${NEXT_PORT}  ->  Supabase ${supabaseUrl.origin} (mock)`);
