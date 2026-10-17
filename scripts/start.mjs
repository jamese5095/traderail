import { spawn } from 'node:child_process';
import { cpSync, existsSync, readFileSync } from 'node:fs';
import { parseEnv } from 'node:util';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import {buildDirectory} from './lib/web-build.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const frontend = resolve(root, 'frontend');
const dist=buildDirectory();
const standalone = resolve(frontend,dist,'standalone/frontend');
if (!existsSync(resolve(standalone, 'server.js'))) {
  console.error('Production build is missing. Run npm run build first.');
  process.exit(1);
}
const path = resolve(frontend, '.env.local');
const rootEnv = resolve(root, '.env');
const env = { ...(existsSync(rootEnv) ? parseEnv(readFileSync(rootEnv, 'utf8')) : {}), ...(existsSync(path) ? parseEnv(readFileSync(path, 'utf8')) : {}), ...process.env };
cpSync(resolve(frontend,dist,'static'), resolve(standalone,dist,'static'), { recursive: true });
if (existsSync(resolve(frontend, 'public'))) cpSync(resolve(frontend, 'public'), resolve(standalone, 'public'), { recursive: true });
const child = spawn(process.execPath, [resolve(standalone, 'server.js')], {
  cwd: frontend, stdio: 'inherit', env: { ...env, NODE_ENV: 'production', HOSTNAME: env.HOSTNAME || '127.0.0.1', PORT: env.PORT || '3003',
    DEMO_SESSION_DIR: env.TRADERAIL_PROFILE && env.TRADERAIL_PROFILE !== 'showcase' ? resolve(env.TRADERAIL_PROFILE_DIR || resolve(root,'.traderail',env.TRADERAIL_PROFILE), 'sessions') : env.DEMO_SESSION_DIR || resolve(frontend, '.demo-sessions'), NEXT_TELEMETRY_DISABLED: '1' },
});
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => child.kill(signal));
child.on('error', () => { console.error('Production server failed to start.'); process.exitCode = 1; });
child.on('exit', code => { process.exitCode = code ?? 0; });
