const apiBaseUrl = (process.env.CLOUDNOTE_API_BASE_URL || 'http://localhost:3001/api/v1').replace(/\/+$/, '');
const adminUsername = process.env.ADMIN_USERNAME || 'admin';
const adminPassword = process.env.ADMIN_PASSWORD || 'admin123456';

function log(step, detail = '') {
  console.log(`[platform-smoke] ${step}${detail ? `: ${detail}` : ''}`);
}

async function request(path, options = {}) {
  const response = await fetch(`${apiBaseUrl}${path}`, {
    ...options,
    headers: {
      ...(options.body instanceof FormData ? {} : { 'Content-Type': 'application/json' }),
      ...(options.headers || {}),
    },
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok || !payload?.success) {
    const message = payload?.error ? `${payload.error.code}: ${payload.error.message}` : `${response.status} ${response.statusText}`;
    throw new Error(`${options.method || 'GET'} ${path} failed - ${message}`);
  }
  return payload.data;
}

async function rawRequest(path, options = {}) {
  const response = await fetch(`${apiBaseUrl}${path}`, {
    ...options,
    headers: {
      ...(options.body instanceof FormData ? {} : { 'Content-Type': 'application/json' }),
      ...(options.headers || {}),
    },
  });
  if (!response.ok) throw new Error(`${options.method || 'GET'} ${path} failed - ${response.status} ${response.statusText}`);
  return response;
}

async function expectRequestFailure(path, options = {}, expectedCode) {
  const response = await fetch(`${apiBaseUrl}${path}`, {
    ...options,
    headers: {
      ...(options.body instanceof FormData ? {} : { 'Content-Type': 'application/json' }),
      ...(options.headers || {}),
    },
  });
  const payload = await response.json().catch(() => null);
  if (response.ok || payload?.success !== false) throw new Error(`${options.method || 'GET'} ${path} unexpectedly succeeded.`);
  if (expectedCode && payload.error?.code !== expectedCode) throw new Error(`Expected ${expectedCode}, got ${payload.error?.code || 'unknown error code'}.`);
  return payload.error;
}

async function main() {
  log('health');
  const health = await request('/health');
  if (!health.database.configured || !health.database.reachable) {
    throw new Error('PostgreSQL is not ready. Set DATABASE_URL and run migrations before smoke testing.');
  }

  log('login');
  const login = await request('/admin/auth/login', {
    method: 'POST',
    body: JSON.stringify({ username: adminUsername, password: adminPassword }),
  });
  const auth = { Authorization: `Bearer ${login.token}` };
  const me = await request('/admin/auth/me', { headers: auth });
  if (me.role !== 'admin' || me.status !== 'active') throw new Error('Authenticated user is not an active admin.');
  await expectRequestFailure(
    '/admin/auth/login',
    {
      method: 'POST',
      body: JSON.stringify({ username: adminUsername, password: `${adminPassword}-wrong` }),
    },
    'AUTH_INVALID_CREDENTIALS'
  );

  log('login lockout');
  const lockoutSource = `platform-smoke-lock-${Date.now()}`;
  for (let attempt = 1; attempt <= 5; attempt += 1) {
    await expectRequestFailure(
      '/admin/auth/login',
      {
        method: 'POST',
        headers: { 'x-forwarded-for': lockoutSource },
        body: JSON.stringify({ username: adminUsername, password: `${adminPassword}-wrong-${attempt}` }),
      },
      attempt < 5 ? 'AUTH_INVALID_CREDENTIALS' : 'AUTH_TOO_MANY_ATTEMPTS'
    );
  }

  log('invalid id handling');
  await expectRequestFailure('/admin/assignments/not-a-number', { headers: auth }, 'VALIDATION_FAILED');
  await expectRequestFailure('/admin/submissions?assignmentId=not-a-number', { headers: auth }, 'VALIDATION_FAILED');
  const invalidUploadForm = new FormData();
  invalidUploadForm.set('assignmentId', '0');
  await expectRequestFailure('/open/submissions', { method: 'POST', body: invalidUploadForm }, 'VALIDATION_FAILED');

  log('field config compatibility');
  const compatibleFieldAssignment = await request('/admin/assignments', {
    method: 'POST',
    headers: auth,
    body: JSON.stringify({
      title: `Compatible field config ${new Date().toISOString()}`,
      status: 'ongoing',
      collectFields: [{ id: 'compatibleChoice', name: 'Compatible Choice', type: 'radio', required: true, options: ['A', 'B'] }],
      fileRules: { requiredUpload: false },
    }),
  });
  const compatibleField = compatibleFieldAssignment.collectFields[0];
  if (compatibleField.key !== 'compatibleChoice' || compatibleField.label !== 'Compatible Choice' || compatibleField.type !== 'single_choice') {
    throw new Error('Compatible field config was not normalized into the platform field contract.');
  }
  const compatibleFieldForm = new FormData();
  compatibleFieldForm.set('assignmentId', String(compatibleFieldAssignment.id));
  compatibleFieldForm.set('compatibleChoice', 'A');
  await request('/open/submissions', { method: 'POST', body: compatibleFieldForm });

  log('create assignment');
  const title = `CloudNote smoke ${new Date().toISOString()}`;
  const assignment = await request('/admin/assignments', {
    method: 'POST',
    headers: auth,
    body: JSON.stringify({
      title,
      description: 'Created by scripts/platform-smoke.mjs',
      status: 'ongoing',
      collectFields: [
        { key: 'studentName', label: '姓名', type: 'name', category: 'basic', required: true, enabled: true, visible: true, system: true },
        { key: 'studentId', label: '学号', type: 'digits', category: 'custom', required: true, enabled: true, visible: true },
      ],
      fileRules: {
        requiredUpload: true,
        enableLimit: true,
        maxFileCount: 1,
        maxFileSizeMB: 10,
        allowedExtensions: ['txt'],
        enableRename: true,
        renameFields: ['studentId', 'studentName'],
        allowFolder: true,
      },
    }),
  });

  log('public assignment', `id=${assignment.id}, code=${assignment.shareCode}`);
  await request(`/open/assignments?id=${assignment.id}&code=${assignment.shareCode}`);

  log('student upload');
  const form = new FormData();
  form.set('assignmentId', String(assignment.id));
  form.set('studentName', 'Smoke Tester');
  form.set('studentId', '2026050401');
  form.set('homeworkTitle', 'Smoke Upload');
  form.set('files', new Blob(['CloudNote platform smoke file\n'], { type: 'text/plain' }), 'smoke.txt');
  const submission = await request('/open/submissions', {
    method: 'POST',
    body: form,
  });

  log('list submissions');
  const submissions = await request(`/admin/submissions?assignmentId=${assignment.id}`, { headers: auth });
  if (!submissions.items.some((item) => item.id === submission.id)) {
    throw new Error(`Created submission #${submission.id} was not returned by the admin submissions list.`);
  }

  log('statistics');
  const stats = await request(`/admin/statistics?assignmentId=${assignment.id}`, { headers: auth });
  if (!stats.items.length || stats.summary.submittedCount < 1) {
    throw new Error('Statistics did not include the smoke submission.');
  }

  log('export statistics');
  const statsExportResponse = await rawRequest('/admin/statistics/export', {
    method: 'POST',
    headers: auth,
    body: JSON.stringify({ assignmentId: assignment.id }),
  });
  const statsCsv = await statsExportResponse.text();
  if (!statsCsv.includes(title) || !statsCsv.includes(String(assignment.id))) throw new Error('Statistics export did not include the smoke assignment.');

  log('export submissions');
  const exportResponse = await rawRequest('/admin/submissions/export', {
    method: 'POST',
    headers: auth,
    body: JSON.stringify({ assignmentId: assignment.id }),
  });
  const csv = await exportResponse.text();
  if (!csv.includes('Smoke Tester') || !csv.includes('Smoke Upload')) throw new Error('Submission export did not include the smoke submission.');

  log('download submission');
  const downloadResponse = await rawRequest(`/admin/submissions/${submission.id}/download`, { headers: auth });
  const downloadText = await downloadResponse.text();
  if (!downloadText.includes('CloudNote platform smoke file')) throw new Error('Submission download did not return the uploaded file content.');

  log('download assignment archive');
  const archiveResponse = await rawRequest(`/admin/files/download-all?assignmentId=${assignment.id}`, { headers: auth });
  const archiveBytes = await archiveResponse.arrayBuffer();
  if (archiveBytes.byteLength < 100) throw new Error('Assignment archive was unexpectedly small.');

  log('duplicate rejection');
  const duplicateAssignment = await request('/admin/assignments', {
    method: 'POST',
    headers: auth,
    body: JSON.stringify({
      title: `${title} duplicate-guard`,
      description: 'Created by scripts/platform-smoke.mjs',
      status: 'ongoing',
      allowRepeat: false,
      collectFields: [
        { key: 'studentName', label: '姓名', type: 'name', category: 'basic', required: true, enabled: true, visible: true, system: true },
        { key: 'studentId', label: '学号', type: 'digits', category: 'custom', required: true, enabled: true, visible: true },
      ],
      fileRules: {
        requiredUpload: false,
        enableLimit: false,
        maxFileCount: 1,
        maxFileSizeMB: 10,
        allowedExtensions: ['txt'],
      },
    }),
  });
  const duplicateForm = new FormData();
  duplicateForm.set('assignmentId', String(duplicateAssignment.id));
  duplicateForm.set('studentName', 'Duplicate Tester');
  duplicateForm.set('studentId', '2026050402');
  await request('/open/submissions', {
    method: 'POST',
    body: duplicateForm,
  });
  await expectRequestFailure(
    '/open/submissions',
    {
      method: 'POST',
      body: duplicateForm,
    },
    'UPLOAD_REJECTED'
  );

  log('identity duplicate rejection');
  const identityAssignment = await request('/admin/assignments', {
    method: 'POST',
    headers: auth,
    body: JSON.stringify({
      title: `${title} identity`,
      description: 'Created by scripts/platform-smoke.mjs',
      status: 'ongoing',
      allowRepeat: false,
      collectFields: [
        { key: 'customName', label: '姓名', type: 'name', category: 'custom', required: true, enabled: true, visible: true },
        { key: 'customNo', label: '学号', type: 'digits', category: 'custom', required: true, enabled: true, visible: true },
      ],
      fileRules: {
        requiredUpload: false,
        enableLimit: false,
        maxFileCount: 1,
        maxFileSizeMB: 10,
        allowedExtensions: ['txt'],
      },
    }),
  });
  const identityForm = new FormData();
  identityForm.set('assignmentId', String(identityAssignment.id));
  identityForm.set('customName', 'Identity Tester');
  identityForm.set('customNo', '2026050403');
  await request('/open/submissions', { method: 'POST', body: identityForm });
  const identitySubmissions = await request(`/admin/submissions?assignmentId=${identityAssignment.id}`, { headers: auth });
  if (!identitySubmissions.items.some((item) => item.studentName === 'Identity Tester' && item.studentId === '2026050403')) {
    throw new Error('Identity fields were not mapped to submission summary columns.');
  }
  await expectRequestFailure('/open/submissions', { method: 'POST', body: identityForm }, 'UPLOAD_REJECTED');

  log('unicode filename upload');
  const unicodeAssignment = await request('/admin/assignments', {
    method: 'POST',
    headers: auth,
    body: JSON.stringify({
      title: `${title} unicode-filename`,
      description: 'Created by scripts/platform-smoke.mjs',
      status: 'ongoing',
      collectFields: [{ key: 'studentName', label: '姓名', type: 'name', category: 'basic', required: true, enabled: true, visible: true, system: true }],
      fileRules: {
        requiredUpload: true,
        enableLimit: true,
        maxFileCount: 1,
        maxFileSizeMB: 10,
        allowedExtensions: ['txt'],
        enableRename: false,
      },
    }),
  });
  const unicodeForm = new FormData();
  unicodeForm.set('assignmentId', String(unicodeAssignment.id));
  unicodeForm.set('studentName', 'Unicode Tester');
  unicodeForm.set('files', new Blob(['unicode filename smoke\n'], { type: 'text/plain' }), '中文文件.txt');
  const unicodeSubmission = await request('/open/submissions', { method: 'POST', body: unicodeForm });
  const unicodeSubmissions = await request(`/admin/submissions?assignmentId=${unicodeAssignment.id}`, { headers: auth });
  const unicodeItem = unicodeSubmissions.items.find((item) => item.id === unicodeSubmission.id);
  if (!unicodeItem?.files?.some((file) => file.originalFilename === '中文文件.txt')) {
    throw new Error('Unicode upload filename was not preserved.');
  }

  log('recycle parent guard');
  const recycleAssignment = await request('/admin/assignments', {
    method: 'POST',
    headers: auth,
    body: JSON.stringify({
      title: `${title} recycle-guard`,
      description: 'Created by scripts/platform-smoke.mjs',
      status: 'ongoing',
      collectFields: [{ key: 'studentName', label: '姓名', type: 'name', category: 'basic', required: true, enabled: true, visible: true, system: true }],
      fileRules: {
        requiredUpload: true,
        enableLimit: true,
        maxFileCount: 1,
        maxFileSizeMB: 10,
        allowedExtensions: ['txt'],
      },
    }),
  });
  const recycleForm = new FormData();
  recycleForm.set('assignmentId', String(recycleAssignment.id));
  recycleForm.set('studentName', 'Recycle Tester');
  recycleForm.set('files', new Blob(['recycle parent guard\n'], { type: 'text/plain' }), 'recycle.txt');
  const recycleSubmission = await request('/open/submissions', {
    method: 'POST',
    body: recycleForm,
  });
  await request(`/admin/assignments/${recycleAssignment.id}`, {
    method: 'DELETE',
    headers: auth,
  });
  const recycleFiles = await request('/admin/recycle?type=file', { headers: auth });
  const taskDeletedFile = recycleFiles.items.find((item) => item.id === recycleSubmission.files[0].id);
  if (!taskDeletedFile) throw new Error('Task-deleted file was not listed in recycle bin.');
  await expectRequestFailure(
    '/admin/recycle/restore',
    {
      method: 'POST',
      headers: auth,
      body: JSON.stringify({ items: [{ type: 'file', id: taskDeletedFile.id }] }),
    },
    'RESTORE_PARENT_TASK_FIRST'
  );
  await request('/admin/recycle/restore', {
    method: 'POST',
    headers: auth,
    body: JSON.stringify({ items: [{ type: 'task', id: recycleAssignment.id }] }),
  });
  const restoredDownload = await rawRequest(`/admin/submissions/${recycleSubmission.id}/download`, { headers: auth });
  if (!(await restoredDownload.text()).includes('recycle parent guard')) throw new Error('Restored assignment did not restore child submission files.');

  log('recycle file purge');
  await request(`/admin/files/${recycleSubmission.files[0].id}`, {
    method: 'DELETE',
    headers: auth,
  });
  await request('/admin/recycle/purge', {
    method: 'POST',
    headers: auth,
    body: JSON.stringify({ items: [{ type: 'file', id: recycleSubmission.files[0].id }] }),
  });
  await expectRequestFailure(`/admin/files/${recycleSubmission.files[0].id}/download`, { headers: auth }, 'NOT_FOUND');

  log('done', `assignment #${assignment.id}, submission #${submission.id}`);
}

main().catch((error) => {
  console.error(`[platform-smoke] failed: ${error instanceof Error ? error.message : error}`);
  process.exit(1);
});
