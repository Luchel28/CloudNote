const fs = require('fs');
const path = require('path');
const sqlite3 = require('sqlite3').verbose();

const { DB_PATH } = require('./config');
const { DEFAULT_ALLOWED_EXTENSIONS, DEFAULT_FIELD_CONFIG, generateShareCode, normalizeShareCode } = require('./utils/assignmentUtils');

fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });

const db = new sqlite3.Database(DB_PATH);

function runDb(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function onRun(error) {
      if (error) return reject(error);
      resolve(this);
    });
  });
}

function getDb(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.get(sql, params, (error, row) => {
      if (error) return reject(error);
      resolve(row);
    });
  });
}

function allDb(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (error, rows) => {
      if (error) return reject(error);
      resolve(rows);
    });
  });
}

async function beginTransaction() {
  await runDb('BEGIN IMMEDIATE TRANSACTION');
}

async function commitTransaction() {
  await runDb('COMMIT');
}

async function rollbackTransaction() {
  try {
    await runDb('ROLLBACK');
  } catch (error) {
    console.error('Failed to rollback transaction:', error);
  }
}

async function addColumnIfMissing(tableName, columnName, alterSql) {
  const columns = await allDb(`PRAGMA table_info(${tableName})`);
  if (!columns.some((column) => column.name === columnName)) {
    await runDb(alterSql);
  }
}

async function generateUniqueShareCode(excludeId = null) {
  for (let attempt = 0; attempt < 10; attempt += 1) {
    const code = generateShareCode();
    const row = excludeId
      ? await getDb('SELECT id FROM assignments WHERE share_code = ? AND id != ?', [code, excludeId])
      : await getDb('SELECT id FROM assignments WHERE share_code = ?', [code]);
    if (!row) return code;
  }
  throw new Error('SHARE_CODE_GENERATION_FAILED');
}

async function backfillAssignmentShareCodes() {
  const rows = await allDb('SELECT id, share_code AS shareCode FROM assignments ORDER BY id ASC');
  const seen = new Set();
  for (const row of rows) {
    const currentCode = normalizeShareCode(row.shareCode);
    if (currentCode && row.shareCode === currentCode && !seen.has(currentCode)) {
      seen.add(currentCode);
      continue;
    }
    const shareCode = await generateUniqueShareCode(row.id);
    await runDb('UPDATE assignments SET share_code = ? WHERE id = ?', [shareCode, row.id]);
    seen.add(shareCode);
  }
}

async function initDatabase() {
  await runDb(`
    CREATE TABLE IF NOT EXISTS assignments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      description TEXT DEFAULT '',
      deadline TEXT,
      created_at TEXT NOT NULL
    )
  `);

  await runDb(`
    CREATE TABLE IF NOT EXISTS submissions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      student_name TEXT NOT NULL,
      student_id TEXT NOT NULL,
      homework_title TEXT NOT NULL,
      original_filename TEXT NOT NULL,
      stored_filename TEXT NOT NULL,
      upload_time TEXT NOT NULL
    )
  `);

  await runDb(`
    CREATE TABLE IF NOT EXISTS submission_files (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      submission_id INTEGER NOT NULL,
      assignment_id INTEGER,
      original_filename TEXT NOT NULL,
      stored_filename TEXT NOT NULL,
      file_size INTEGER DEFAULT 0,
      mime_type TEXT DEFAULT '',
      created_at TEXT NOT NULL
    )
  `);

  await runDb(`
    CREATE TABLE IF NOT EXISTS assignment_templates (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      category TEXT DEFAULT 'course',
      visibility TEXT DEFAULT 'private',
      data TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      deleted_at TEXT
    )
  `);

  await addColumnIfMissing('assignments', 'status', "ALTER TABLE assignments ADD COLUMN status TEXT NOT NULL DEFAULT 'ongoing'");
  await addColumnIfMissing('assignments', 'updated_at', 'ALTER TABLE assignments ADD COLUMN updated_at TEXT');
  await addColumnIfMissing('assignments', 'field_config', 'ALTER TABLE assignments ADD COLUMN field_config TEXT');
  await addColumnIfMissing(
    'assignments',
    'required_fields',
    'ALTER TABLE assignments ADD COLUMN required_fields TEXT DEFAULT \'["studentName","studentId","homeworkTitle"]\''
  );
  await addColumnIfMissing('assignments', 'allow_late', 'ALTER TABLE assignments ADD COLUMN allow_late INTEGER NOT NULL DEFAULT 0');
  await addColumnIfMissing('assignments', 'allow_repeat', 'ALTER TABLE assignments ADD COLUMN allow_repeat INTEGER NOT NULL DEFAULT 1');
  await addColumnIfMissing('assignments', 'repeat_mode', "ALTER TABLE assignments ADD COLUMN repeat_mode TEXT NOT NULL DEFAULT 'new'");
  await addColumnIfMissing('assignments', 'max_files', 'ALTER TABLE assignments ADD COLUMN max_files INTEGER NOT NULL DEFAULT 1');
  await addColumnIfMissing('assignments', 'max_file_size_mb', 'ALTER TABLE assignments ADD COLUMN max_file_size_mb INTEGER NOT NULL DEFAULT 100');
  await addColumnIfMissing('assignments', 'allowed_extensions', 'ALTER TABLE assignments ADD COLUMN allowed_extensions TEXT');
  await addColumnIfMissing('assignments', 'rename_enabled', 'ALTER TABLE assignments ADD COLUMN rename_enabled INTEGER NOT NULL DEFAULT 1');
  await addColumnIfMissing('assignments', 'rename_fields', 'ALTER TABLE assignments ADD COLUMN rename_fields TEXT');
  await addColumnIfMissing(
    'assignments',
    'download_structure',
    "ALTER TABLE assignments ADD COLUMN download_structure TEXT NOT NULL DEFAULT 'task-field-file'"
  );
  await addColumnIfMissing('assignments', 'required_upload', 'ALTER TABLE assignments ADD COLUMN required_upload INTEGER NOT NULL DEFAULT 1');
  await addColumnIfMissing('assignments', 'file_type', "ALTER TABLE assignments ADD COLUMN file_type TEXT NOT NULL DEFAULT 'document'");
  await addColumnIfMissing('assignments', 'enable_limit', 'ALTER TABLE assignments ADD COLUMN enable_limit INTEGER NOT NULL DEFAULT 0');
  await addColumnIfMissing('assignments', 'allow_folder', 'ALTER TABLE assignments ADD COLUMN allow_folder INTEGER NOT NULL DEFAULT 1');
  await addColumnIfMissing('assignments', 'previous_status', "ALTER TABLE assignments ADD COLUMN previous_status TEXT DEFAULT 'ongoing'");
  await addColumnIfMissing('assignments', 'deleted_at', 'ALTER TABLE assignments ADD COLUMN deleted_at TEXT');
  await addColumnIfMissing('assignments', 'delete_source', 'ALTER TABLE assignments ADD COLUMN delete_source TEXT');
  await addColumnIfMissing('assignments', 'share_code', 'ALTER TABLE assignments ADD COLUMN share_code TEXT');
  await addColumnIfMissing('submissions', 'assignment_id', 'ALTER TABLE submissions ADD COLUMN assignment_id INTEGER');
  await addColumnIfMissing('submissions', 'submitter_data', 'ALTER TABLE submissions ADD COLUMN submitter_data TEXT');
  await addColumnIfMissing('submissions', 'is_late', 'ALTER TABLE submissions ADD COLUMN is_late INTEGER NOT NULL DEFAULT 0');
  await addColumnIfMissing('submissions', 'deleted_at', 'ALTER TABLE submissions ADD COLUMN deleted_at TEXT');
  await addColumnIfMissing('submissions', 'delete_source', 'ALTER TABLE submissions ADD COLUMN delete_source TEXT');
  await addColumnIfMissing('submission_files', 'deleted_at', 'ALTER TABLE submission_files ADD COLUMN deleted_at TEXT');
  await addColumnIfMissing('submission_files', 'delete_source', 'ALTER TABLE submission_files ADD COLUMN delete_source TEXT');
  await addColumnIfMissing('assignment_templates', 'delete_source', 'ALTER TABLE assignment_templates ADD COLUMN delete_source TEXT');

  await runDb('UPDATE assignments SET updated_at = created_at WHERE updated_at IS NULL');
  await runDb('UPDATE assignments SET field_config = ? WHERE field_config IS NULL OR field_config = ?', [JSON.stringify(DEFAULT_FIELD_CONFIG), '']);
  await runDb('UPDATE assignments SET allowed_extensions = ? WHERE allowed_extensions IS NULL OR allowed_extensions = ?', [
    JSON.stringify(DEFAULT_ALLOWED_EXTENSIONS),
    '',
  ]);
  await runDb('UPDATE assignments SET rename_fields = ? WHERE rename_fields IS NULL OR rename_fields = ?', [JSON.stringify(['studentId', 'studentName']), '']);
  await runDb("UPDATE assignments SET previous_status = 'ongoing' WHERE previous_status IS NULL OR previous_status = ''");
  await runDb("UPDATE assignments SET deleted_at = COALESCE(updated_at, created_at, ?) WHERE status = 'deleted' AND deleted_at IS NULL", [
    new Date().toISOString(),
  ]);
  await runDb("UPDATE assignments SET delete_source = 'task' WHERE status = 'deleted' AND (delete_source IS NULL OR delete_source = '')");
  await runDb("UPDATE submissions SET delete_source = 'submission' WHERE deleted_at IS NOT NULL AND (delete_source IS NULL OR delete_source = '')");
  await runDb("UPDATE submission_files SET delete_source = 'file' WHERE deleted_at IS NOT NULL AND (delete_source IS NULL OR delete_source = '')");
  await runDb("UPDATE assignment_templates SET delete_source = 'template' WHERE deleted_at IS NOT NULL AND (delete_source IS NULL OR delete_source = '')");
  await backfillAssignmentShareCodes();
  await runDb("CREATE UNIQUE INDEX IF NOT EXISTS idx_assignments_share_code ON assignments(share_code) WHERE share_code IS NOT NULL AND share_code != ''");
  await runDb(`
    UPDATE submissions
    SET delete_source = 'task'
    WHERE deleted_at IS NOT NULL
      AND assignment_id IN (SELECT id FROM assignments WHERE status = 'deleted')
      AND deleted_at = (SELECT deleted_at FROM assignments WHERE assignments.id = submissions.assignment_id)
  `);
  await runDb(`
    UPDATE submission_files
    SET delete_source = 'task'
    WHERE deleted_at IS NOT NULL
      AND assignment_id IN (SELECT id FROM assignments WHERE status = 'deleted')
      AND deleted_at = (SELECT deleted_at FROM assignments WHERE assignments.id = submission_files.assignment_id)
  `);
  await runDb(`
    UPDATE submission_files
    SET delete_source = 'submission'
    WHERE deleted_at IS NOT NULL
      AND delete_source != 'task'
      AND submission_id IN (SELECT id FROM submissions WHERE deleted_at IS NOT NULL)
      AND deleted_at = (SELECT deleted_at FROM submissions WHERE submissions.id = submission_files.submission_id)
  `);

  const oldRows = await allDb(`
    SELECT id, assignment_id, original_filename, stored_filename, upload_time
    FROM submissions
    WHERE stored_filename IS NOT NULL AND stored_filename != ''
      AND id NOT IN (SELECT submission_id FROM submission_files)
  `);
  for (const row of oldRows) {
    await runDb(
      `
        INSERT INTO submission_files (submission_id, assignment_id, original_filename, stored_filename, file_size, mime_type, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `,
      [row.id, row.assignment_id, row.original_filename, row.stored_filename, 0, '', row.upload_time || new Date().toISOString()]
    );
  }
}

module.exports = {
  db,
  runDb,
  getDb,
  allDb,
  beginTransaction,
  commitTransaction,
  rollbackTransaction,
  addColumnIfMissing,
  generateUniqueShareCode,
  backfillAssignmentShareCodes,
  initDatabase,
};
