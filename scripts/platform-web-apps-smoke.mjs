import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const apiEntry = path.join(repoRoot, 'dist/apps/api/src/main.js');
const adminIndex = path.join(repoRoot, 'apps/web-admin/dist/index.html');
const studentIndex = path.join(repoRoot, 'apps/web-student/dist/index.html');
const port = Number(process.env.CLOUDNOTE_WEB_APPS_SMOKE_PORT || 3101);
const platformBaseUrl = `http://localhost:${port}`;
const startupTimeoutMs = Number(process.env.CLOUDNOTE_WEB_APPS_SMOKE_TIMEOUT_MS || 60000);

function log(step, detail = '') {
  console.log(`[platform-web-apps-smoke] ${step}${detail ? `: ${detail}` : ''}`);
}

function assertBuiltArtifact(filePath, hint) {
  if (!fs.existsSync(filePath)) {
    throw new Error(`${hint} is missing at ${filePath}. Run npm run build:platform first.`);
  }
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchText(pathname, options = {}) {
  const response = await fetch(`${platformBaseUrl}${pathname}`, options);
  if (!response.ok) throw new Error(`${pathname} failed - ${response.status} ${response.statusText}`);
  return {
    response,
    text: await response.text(),
  };
}

async function assertRedirect(pathname, expectedPath) {
  const response = await fetch(`${platformBaseUrl}${pathname}`, { redirect: 'manual' });
  if (response.status !== 302) throw new Error(`${pathname} returned ${response.status}, expected 302.`);
  const location = response.headers.get('location') || '';
  const resolved = new URL(location, platformBaseUrl);
  if (`${resolved.pathname}${resolved.search}` !== expectedPath) {
    throw new Error(`${pathname} redirect location was ${location || 'empty'}, expected ${expectedPath}.`);
  }
}

function assertViteShell(pathname, text, expectedTitle) {
  if (!text.includes(expectedTitle)) throw new Error(`${pathname} did not include ${expectedTitle}.`);
  if (!text.includes('<script type="module"')) throw new Error(`${pathname} did not include a module entry script.`);
}

function assertStudentShell(text) {
  if (!text.includes('/student/assets/')) throw new Error('Student shell did not reference built student assets.');
  if (text.includes('assignment-page.js')) throw new Error('Student shell still referenced assignment-page.js.');
}

async function assertAssetLoads(pagePath, text) {
  const match = text.match(/<script[^>]+src="([^"]+)"/);
  if (!match) throw new Error(`${pagePath} did not include a script src.`);
  const assetUrl = new URL(match[1], `${platformBaseUrl}${pagePath}`);
  const response = await fetch(assetUrl);
  if (!response.ok) throw new Error(`${assetUrl.pathname} failed - ${response.status} ${response.statusText}`);
  const body = await response.text();
  if (!body.trim()) throw new Error(`${assetUrl.pathname} returned an empty asset.`);
}

async function waitForHealth(server, getExitInfo, getLogs) {
  const deadline = Date.now() + startupTimeoutMs;
  while (Date.now() < deadline) {
    const exitInfo = getExitInfo();
    if (exitInfo) throw new Error(`API process exited early (${exitInfo}).\n${getLogs()}`);
    try {
      const response = await fetch(`${platformBaseUrl}/api/v1/health`);
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
  assertBuiltArtifact(apiEntry, 'Built API entry');
  assertBuiltArtifact(adminIndex, 'Built admin web app');
  assertBuiltArtifact(studentIndex, 'Built student web app');

  let logs = '';
  let exitInfo = '';
  const server = spawn(process.execPath, [apiEntry], {
    cwd: repoRoot,
    env: {
      ...process.env,
      NODE_ENV: 'test',
      API_PORT: String(port),
      PORT: String(port),
      PUBLIC_BASE_URL: platformBaseUrl,
      CLOUDNOTE_RUN_MIGRATIONS: 'false',
    },
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

  try {
    log('start', platformBaseUrl);
    await waitForHealth(server, () => exitInfo, () => logs);

    log('root redirect');
    await assertRedirect('/', '/student/');
    await assertRedirect('/admin?tab=tasks', '/admin/?tab=tasks');
    await assertRedirect('/student?code=abc123', '/student/?code=abc123');

    log('admin shell');
    const admin = await fetchText('/admin/');
    assertViteShell('/admin/', admin.text, 'CloudNote');
    await assertAssetLoads('/admin/', admin.text);

    log('student shell');
    const student = await fetchText('/student/');
    assertViteShell('/student/', student.text, 'CloudNote');
    assertStudentShell(student.text);
    await assertAssetLoads('/student/', student.text);

    log('spa fallback');
    const nestedAdmin = await fetchText('/admin/tasks/active');
    assertViteShell('/admin/tasks/active', nestedAdmin.text, 'CloudNote');
    const nestedStudent = await fetchText('/student/assignment/abc123');
    assertViteShell('/student/assignment/abc123', nestedStudent.text, 'CloudNote');

    log('done');
  } finally {
    await stopServer(server);
  }
}

main().catch((error) => {
  console.error(`[platform-web-apps-smoke] failed: ${error instanceof Error ? error.message : error}`);
  process.exit(1);
});
