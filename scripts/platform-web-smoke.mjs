const platformBaseUrl = (process.env.CLOUDNOTE_PLATFORM_BASE_URL || derivePlatformBaseUrl()).replace(/\/+$/, '');

function derivePlatformBaseUrl() {
  const apiBaseUrl = process.env.CLOUDNOTE_API_BASE_URL || 'http://localhost:3001/api/v1';
  const url = new URL(apiBaseUrl);
  return `${url.protocol}//${url.host}`;
}

function log(step, detail = '') {
  console.log(`[platform-web-smoke] ${step}${detail ? `: ${detail}` : ''}`);
}

async function fetchText(path, options = {}) {
  const response = await fetch(`${platformBaseUrl}${path}`, options);
  if (!response.ok) throw new Error(`${path} failed - ${response.status} ${response.statusText}`);
  return {
    response,
    text: await response.text(),
  };
}

function assertModuleShell(path, text, expectedTitle) {
  if (!text.includes(expectedTitle)) throw new Error(`${path} did not include ${expectedTitle}.`);
  if (!text.includes('<script type="module"')) throw new Error(`${path} did not include a module entry script.`);
}

function assertStudentShell(text) {
  if (!text.includes('/student/assets/')) throw new Error('Student shell did not reference built student assets.');
  if (text.includes('assignment-page.js')) throw new Error('Student shell still referenced assignment-page.js.');
}

async function assertFirstAssetLoads(path, text) {
  const match = text.match(/<script[^>]+src="([^"]+)"/);
  if (!match) throw new Error(`${path} did not include a script asset.`);
  const assetUrl = new URL(match[1], `${platformBaseUrl}${path}`);
  const response = await fetch(assetUrl);
  if (!response.ok) throw new Error(`${assetUrl.pathname} failed - ${response.status} ${response.statusText}`);
  const body = await response.text();
  if (!body.trim()) throw new Error(`${assetUrl.pathname} returned an empty asset.`);
}

async function assertRedirect(path, expectedLocation) {
  const response = await fetch(`${platformBaseUrl}${path}`, { redirect: 'manual' });
  if (response.status !== 302) throw new Error(`${path} returned ${response.status}, expected 302.`);
  const location = response.headers.get('location') || '';
  if (location !== expectedLocation) throw new Error(`${path} redirect location was ${location || 'empty'}, expected ${expectedLocation}.`);
}

async function main() {
  log('base', platformBaseUrl);

  log('root redirect');
  await assertRedirect('/', '/student/');

  log('friendly redirects');
  await assertRedirect('/admin', '/admin/');
  await assertRedirect('/student?code=abc123', '/student/?code=abc123');

  log('student entry');
  const student = await fetchText('/student/?code=smoke-code');
  assertModuleShell('/student/', student.text, 'CloudNote');
  assertStudentShell(student.text);
  await assertFirstAssetLoads('/student/', student.text);

  log('admin entry');
  const admin = await fetchText('/admin/');
  assertModuleShell('/admin/', admin.text, 'CloudNote');
  await assertFirstAssetLoads('/admin/', admin.text);

  log('done');
}

main().catch((error) => {
  console.error(`[platform-web-smoke] failed: ${error instanceof Error ? error.message : error}`);
  process.exit(1);
});
