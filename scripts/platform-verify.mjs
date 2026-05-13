import { spawn, spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import pg from 'pg';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const port = Number(process.env.CLOUDNOTE_VERIFY_PORT || 3105);
const platformBaseUrl = `http://localhost:${port}`;
const apiBaseUrl = `${platformBaseUrl}/api/v1`;
const startupTimeoutMs = Number(process.env.CLOUDNOTE_VERIFY_TIMEOUT_MS || 60000);
const useExistingDatabase = ['1', 'true', 'yes', 'on'].includes(String(process.env.CLOUDNOTE_VERIFY_USE_EXISTING_DATABASE || '').toLowerCase());
const baseDatabaseUrl = process.env.CLOUDNOTE_VERIFY_BASE_DATABASE_URL || process.env.DATABASE_URL || process.env.POSTGRES_URL || 'postgres://cloudnote:cloudnote_dev_password@localhost:5432/cloudnote';
const tempDatabaseName = `cloudnote_verify_${Date.now()}_${Math.random().toString(16).slice(2, 10)}`;

function log(step, detail = '') {
  console.log(`[platform-verify] ${step}${detail ? `: ${detail}` : ''}`);
}

function run(command, env = {}) {
  log('run', command);
  const result = spawnSync(command, {
    cwd: repoRoot,
    env: { ...process.env, ...env },
    shell: true,
    stdio: 'inherit',
  });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${command} exited with ${result.status}`);
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function quoteIdent(value) {
  return `"${String(value).replace(/"/g, '""')}"`;
}

function verifyDatabaseUrl() {
  if (useExistingDatabase) return baseDatabaseUrl;
  const url = new URL(baseDatabaseUrl);
  url.pathname = `/${tempDatabaseName}`;
  return url.toString();
}

async function createTempDatabase() {
  if (useExistingDatabase) {
    log('database', 'using existing DATABASE_URL because CLOUDNOTE_VERIFY_USE_EXISTING_DATABASE=true');
    return;
  }
  const client = new pg.Client({ connectionString: baseDatabaseUrl });
  await client.connect();
  try {
    await client.query(`CREATE DATABASE ${quoteIdent(tempDatabaseName)}`);
    log('create database', tempDatabaseName);
  } finally {
    await client.end();
  }
}

async function dropTempDatabase() {
  if (useExistingDatabase) return;
  const client = new pg.Client({ connectionString: baseDatabaseUrl });
  await client.connect();
  try {
    await client.query('SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = $1', [tempDatabaseName]);
    await client.query(`DROP DATABASE IF EXISTS ${quoteIdent(tempDatabaseName)}`);
    log('drop database', tempDatabaseName);
  } finally {
    await client.end();
  }
}

async function waitForHealth(server, getExitInfo, getLogs) {
  const deadline = Date.now() + startupTimeoutMs;
  while (Date.now() < deadline) {
    const exitInfo = getExitInfo();
    if (exitInfo) throw new Error(`API process exited early (${exitInfo}).\n${getLogs()}`);
    try {
      const response = await fetch(`${apiBaseUrl}/health`);
      if (response.ok) return;
    } catch {
      // The API process may still be opening its port.
    }
    await delay(1000);
  }
  server.kill('SIGTERM');
  throw new Error(`API did not become healthy within ${startupTimeoutMs}ms.\n${getLogs()}`);
}

async function stopServer(server) {
  if (!server.pid || server.exitCode !== null || server.signalCode !== null) return;
  if (process.platform === 'win32') {
    spawnSync('taskkill', ['/pid', String(server.pid), '/T', '/F'], { stdio: 'ignore' });
    return;
  }
  server.kill('SIGTERM');
  for (let i = 0; i < 20; i += 1) {
    if (server.exitCode !== null || server.signalCode !== null) return;
    await delay(100);
  }
  server.kill('SIGKILL');
}

async function main() {
  const databaseUrl = verifyDatabaseUrl();
  run('npm run typecheck');
  run('npm run build:platform');
  await createTempDatabase();

  let logs = '';
  let exitInfo = '';
  let server;
  try {
    const platformEnv = {
      DATABASE_URL: databaseUrl,
      CLOUDNOTE_REQUIRE_DATABASE: 'true',
    };
    run('npm run db:migrate', platformEnv);

    const serverEnv = {
      ...process.env,
      ...platformEnv,
      NODE_ENV: 'test',
      API_PORT: String(port),
      PORT: String(port),
      PUBLIC_BASE_URL: platformBaseUrl,
      CLOUDNOTE_RUN_MIGRATIONS: 'false',
    };

    server = spawn(process.execPath, ['dist/apps/api/src/main.js'], {
      cwd: repoRoot,
      env: serverEnv,
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    server.stdout.on('data', (chunk) => {
      logs += chunk.toString();
    });
    server.stderr.on('data', (chunk) => {
      logs += chunk.toString();
    });
    server.on('exit', (code, signal) => {
      exitInfo = `code=${code ?? 'null'} signal=${signal ?? 'null'}`;
    });

    log('start api', platformBaseUrl);
    await waitForHealth(server, () => exitInfo, () => logs);
    const smokeEnv = {
      ...platformEnv,
      CLOUDNOTE_API_BASE_URL: apiBaseUrl,
      CLOUDNOTE_PLATFORM_BASE_URL: platformBaseUrl,
    };
    run('npm run smoke:platform', smokeEnv);
    run('npm run smoke:platform:web', smokeEnv);
    await stopServer(server);
    server = undefined;
    run('npm run smoke:platform:web-apps', platformEnv);
  } finally {
    if (server) await stopServer(server);
    await dropTempDatabase();
  }

  run('npm run smoke:platform:backup');
  log('done');
}

main().catch((error) => {
  console.error(`[platform-verify] failed: ${error instanceof Error ? error.message : error}`);
  process.exit(1);
});
