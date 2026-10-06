// RUN-LOCAL-TEST.bat: the whole API on this computer, on a fresh in-memory TEST database with demo data.
// The live Supabase data is never touched (the Worker refuses AUTH_MODE=off for any database but this one).
// API: http://localhost:8787 (the frontend dev server on :3000 forwards /api/v1 there). Close the window to stop.
import { spawn } from 'node:child_process';
import { mkdirSync, existsSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { startLocalDb } from './local-db.mjs';

const root = new URL('../../', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
if (!existsSync(join(root, 'dist'))) {
  mkdirSync(join(root, 'dist'));
  writeFileSync(join(root, 'dist', 'index.html'), '<!doctype html><title>SM HBD CRM API</title><p>Open http://localhost:3000');
}
const { url } = await startLocalDb({ root, demoData: true });
console.log('Test database ready (in memory, demo data).');
const worker = spawn('npx', ['wrangler', 'dev', '--ip', '127.0.0.1', '--port', '8787',
  '--var', 'AUTH_MODE:off', '--var', 'BUILD_SHA:local', '--var', `DATABASE_URL:${url}`, '--show-interactive-dev-session=false'], {
  cwd: join(root, 'cloudflare'), shell: process.platform === 'win32', stdio: 'inherit',
  env: { ...process.env, WRANGLER_SEND_METRICS: 'false', CLOUDFLARE_HYPERDRIVE_LOCAL_CONNECTION_STRING_HYPERDRIVE: url },
});
worker.on('exit', (c) => process.exit(c ?? 0));
console.log('API starting on http://localhost:8787 (login is off: you are ADMIN) ...');
