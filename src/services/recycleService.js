const fs = require('fs');
const path = require('path');

const { RECYCLE_RETENTION_DAYS, UPLOAD_DIR } = require('../config');
const { allDb, beginTransaction, commitTransaction, getDb, rollbackTransaction, runDb } = require('../db');
const { normalizeStatus } = require('../utils/assignmentUtils');
const { removeStoredFile } = require('../utils/fileUtils');
const { msg } = require('../utils/responseUtils');

async function getSubmissionStoredFiles(submissionIds = []) {
  const ids = submissionIds.map((id) => Number(id)).filter(Number.isInteger);
  if (!ids.length) return [];
  const placeholders = ids.map(() => '?').join(',');
  const rows = await allDb(
    `
      SELECT stored_filename FROM submission_files WHERE submission_id IN (${placeholders})
      UNION
      SELECT stored_filename FROM submissions WHERE id IN (${placeholders}) AND stored_filename IS NOT NULL AND stored_filename != ''
    `,
    [...ids, ...ids]
  );
  return rows.map((row) => row.stored_filename).filter(Boolean);
}

async function hardDeleteSubmissionWithFiles(submissionId) {
  const files = await allDb('SELECT stored_filename FROM submission_files WHERE submission_id = ?', [submissionId]);
  const fallback = await getDb('SELECT stored_filename FROM submissions WHERE id = ?', [submissionId]);
  await beginTransaction();
  let deleted = false;
  try {
    await runDb('DELETE FROM submission_files WHERE submission_id = ?', [submissionId]);
    const result = await runDb('DELETE FROM submissions WHERE id = ?', [submissionId]);
    deleted = result.changes > 0 || files.length > 0;
    await commitTransaction();
  } catch (error) {
    await rollbackTransaction();
    throw error;
  }
  for (const file of files) {
    removeStoredFile(file.stored_filename);
  }
  if (fallback?.stored_filename) removeStoredFile(fallback.stored_filename);
  return deleted;
}

async function softDeleteSubmissionWithFiles(submissionId, deletedAt = new Date().toISOString(), source = 'submission') {
  await beginTransaction();
  try {
    const result = await runDb('UPDATE submissions SET deleted_at = ?, delete_source = ? WHERE id = ? AND deleted_at IS NULL', [
      deletedAt,
      source,
      submissionId,
    ]);
    await runDb('UPDATE submission_files SET deleted_at = ?, delete_source = ? WHERE submission_id = ? AND deleted_at IS NULL', [
      deletedAt,
      source,
      submissionId,
    ]);
    await commitTransaction();
    return result;
  } catch (error) {
    await rollbackTransaction();
    throw error;
  }
}

async function hardDeleteAssignment(assignmentId) {
  const files = await allDb(
    `
    SELECT sf.stored_filename
    FROM submission_files sf
    WHERE sf.assignment_id = ?
       OR sf.submission_id IN (SELECT id FROM submissions WHERE assignment_id = ?)
    UNION
    SELECT stored_filename FROM submissions WHERE assignment_id = ? AND stored_filename IS NOT NULL AND stored_filename != ''
  `,
    [assignmentId, assignmentId, assignmentId]
  );
  await beginTransaction();
  let deleted = false;
  try {
    await runDb('DELETE FROM submission_files WHERE assignment_id = ? OR submission_id IN (SELECT id FROM submissions WHERE assignment_id = ?)', [
      assignmentId,
      assignmentId,
    ]);
    await runDb('DELETE FROM submissions WHERE assignment_id = ?', [assignmentId]);
    const result = await runDb('DELETE FROM assignments WHERE id = ?', [assignmentId]);
    deleted = result.changes > 0;
    await commitTransaction();
  } catch (error) {
    await rollbackTransaction();
    throw error;
  }
  for (const file of files) removeStoredFile(file.stored_filename);
  return deleted;
}

async function hardDeleteFile(fileId) {
  const file = await getDb('SELECT id, submission_id, stored_filename FROM submission_files WHERE id = ?', [fileId]);
  if (!file) return false;
  await beginTransaction();
  try {
    await runDb('DELETE FROM submission_files WHERE id = ?', [fileId]);
    await commitTransaction();
  } catch (error) {
    await rollbackTransaction();
    throw error;
  }
  removeStoredFile(file.stored_filename);
  return true;
}

function recycleRetention(deletedAt) {
  const deletedTime = new Date(deletedAt || Date.now()).getTime();
  const ageDays = Number.isFinite(deletedTime) ? Math.max(0, Math.floor((Date.now() - deletedTime) / 86400000)) : 0;
  return {
    ageDays,
    remainingDays: Math.max(0, RECYCLE_RETENTION_DAYS - ageDays),
  };
}

function getStoredFileSize(row) {
  const known = Number(row.size || row.file_size || 0);
  if (known > 0) return known;
  const filePath = path.join(UPLOAD_DIR, row.storedFilename || row.stored_filename || '');
  try {
    return fs.existsSync(filePath) ? fs.statSync(filePath).size : 0;
  } catch {
    return 0;
  }
}

async function cleanupExpiredRecycleItems() {
  const cutoff = new Date(Date.now() - RECYCLE_RETENTION_DAYS * 86400000).toISOString();
  let purged = 0;
  const tasks = await allDb("SELECT id FROM assignments WHERE status = 'deleted' AND deleted_at IS NOT NULL AND datetime(deleted_at) <= datetime(?)", [cutoff]);
  for (const task of tasks) {
    try {
      if (await hardDeleteAssignment(task.id)) purged += 1;
    } catch (error) {
      console.error(`Failed to cleanup expired assignment ${task.id}:`, error);
    }
  }

  const submissions = await allDb('SELECT id FROM submissions WHERE deleted_at IS NOT NULL AND datetime(deleted_at) <= datetime(?)', [cutoff]);
  for (const submission of submissions) {
    try {
      if (await hardDeleteSubmissionWithFiles(submission.id)) purged += 1;
    } catch (error) {
      console.error(`Failed to cleanup expired submission ${submission.id}:`, error);
    }
  }

  const files = await allDb('SELECT id FROM submission_files WHERE deleted_at IS NOT NULL AND datetime(deleted_at) <= datetime(?)', [cutoff]);
  for (const file of files) {
    try {
      if (await hardDeleteFile(file.id)) purged += 1;
    } catch (error) {
      console.error(`Failed to cleanup expired file ${file.id}:`, error);
    }
  }

  try {
    const templates = await runDb('DELETE FROM assignment_templates WHERE deleted_at IS NOT NULL AND datetime(deleted_at) <= datetime(?)', [cutoff]);
    purged += Number(templates.changes || 0);
  } catch (error) {
    console.error('Failed to cleanup expired templates:', error);
  }
  return purged;
}

async function getRecycleBinData({ type = 'all', search = '', sort = 'recent', page = 1, perPage = 20 } = {}) {
  const includeTasks = type === 'all' || type === 'task';
  const includeSubmissions = type === 'all' || type === 'submission';
  const includeFiles = type === 'all' || type === 'file';
  const includeTemplates = type === 'all' || type === 'template';
  const items = [];

  if (includeTasks) {
    const taskRows = await allDb(`
      SELECT
        a.id,
        a.title,
        a.description,
        a.deleted_at AS deletedAt,
        a.updated_at AS updatedAt,
        a.previous_status AS previousStatus,
        COUNT(DISTINCT s.id) AS submissionCount,
        COUNT(sf.id) AS fileCount,
        COALESCE(SUM(sf.file_size), 0) AS totalSize
      FROM assignments a
      LEFT JOIN submissions s ON s.assignment_id = a.id
      LEFT JOIN submission_files sf ON sf.assignment_id = a.id
      WHERE a.status = 'deleted'
      GROUP BY a.id
    `);
    taskRows.forEach((row) => {
      const deletedAt = row.deletedAt || row.updatedAt || new Date().toISOString();
      const retention = recycleRetention(deletedAt);
      items.push({
        type: 'task',
        id: row.id,
        key: `task:${row.id}`,
        name: row.title,
        origin: msg('\u4efb\u52a1\u5217\u8868'),
        deletedAt,
        previousStatus: normalizeStatus(row.previousStatus || 'ongoing'),
        remainingDays: retention.remainingDays,
        size: Number(row.totalSize || 0),
        fileCount: Number(row.fileCount || 0),
        submissionCount: Number(row.submissionCount || 0),
        recoverable: true,
      });
    });
  }

  if (includeSubmissions) {
    const submissionRows = await allDb(`
      SELECT
        s.id,
        s.student_name AS studentName,
        s.student_id AS studentId,
        s.homework_title AS homeworkTitle,
        s.assignment_id AS assignmentId,
        s.deleted_at AS deletedAt,
        s.delete_source AS deleteSource,
        a.title AS assignmentTitle,
        a.status AS assignmentStatus,
        COUNT(sf.id) AS fileCount,
        COALESCE(SUM(sf.file_size), 0) AS totalSize
      FROM submissions s
      LEFT JOIN assignments a ON a.id = s.assignment_id
      LEFT JOIN submission_files sf ON sf.submission_id = s.id
      WHERE s.deleted_at IS NOT NULL
      GROUP BY s.id
    `);
    submissionRows.forEach((row) => {
      const deletedAt = row.deletedAt || new Date().toISOString();
      const retention = recycleRetention(deletedAt);
      const submitter = [row.studentName, row.studentId].filter(Boolean).join(' / ');
      const assignmentDeleted = row.assignmentStatus === 'deleted';
      items.push({
        type: 'submission',
        id: row.id,
        key: `submission:${row.id}`,
        name: submitter ? `提交记录：${submitter}` : `提交记录：${row.homeworkTitle || row.id}`,
        origin: row.assignmentTitle || msg('所属任务不存在'),
        assignmentId: row.assignmentId,
        homeworkTitle: row.homeworkTitle,
        submitter,
        deletedAt,
        remainingDays: retention.remainingDays,
        size: Number(row.totalSize || 0),
        fileCount: Number(row.fileCount || 0),
        deleteSource: row.deleteSource || 'submission',
        recoverable: !assignmentDeleted,
        restoreDisabledReason: assignmentDeleted ? '请先恢复所属任务' : '',
      });
    });
  }

  let deletedFilesForSummary = [];
  if (includeFiles || type === 'all') {
    deletedFilesForSummary = await allDb(`
      SELECT
        sf.id,
        sf.submission_id AS submissionId,
        sf.assignment_id AS assignmentId,
        sf.original_filename AS name,
        sf.stored_filename AS storedFilename,
        sf.file_size AS size,
        sf.deleted_at AS deletedAt,
        sf.delete_source AS deleteSource,
        s.student_name AS studentName,
        s.student_id AS studentId,
        s.deleted_at AS submissionDeletedAt,
        s.delete_source AS submissionDeleteSource,
        a.title AS assignmentTitle,
        a.status AS assignmentStatus,
        a.previous_status AS assignmentPreviousStatus
      FROM submission_files sf
      LEFT JOIN submissions s ON s.id = sf.submission_id
      LEFT JOIN assignments a ON a.id = sf.assignment_id
      WHERE sf.deleted_at IS NOT NULL
        AND COALESCE(sf.delete_source, 'file') != 'submission'
    `);
  }

  if (includeFiles) {
    deletedFilesForSummary.forEach((row) => {
      const deletedAt = row.deletedAt || row.submissionDeletedAt || new Date().toISOString();
      const retention = recycleRetention(deletedAt);
      const filePath = path.join(UPLOAD_DIR, row.storedFilename || '');
      const deleteSource = row.deleteSource || 'file';
      const assignmentDeleted = row.assignmentStatus === 'deleted';
      const taskScoped = deleteSource === 'task' || assignmentDeleted;
      const restoreDisabledReason = taskScoped ? '请先恢复所属任务' : !fs.existsSync(filePath) ? '文件已不存在，不能恢复' : '';
      items.push({
        type: 'file',
        id: row.id,
        key: `file:${row.id}`,
        name: row.name,
        origin: row.assignmentTitle || msg('\u63d0\u4ea4\u8bb0\u5f55'),
        assignmentId: row.assignmentId,
        submissionId: row.submissionId,
        submitter: [row.studentName, row.studentId].filter(Boolean).join(' / '),
        deletedAt,
        remainingDays: retention.remainingDays,
        size: getStoredFileSize(row),
        deleteSource,
        recoverable: !restoreDisabledReason,
        restoreDisabledReason,
      });
    });
  }

  if (includeTemplates) {
    const templateRows = await allDb(`
      SELECT id, name, category, visibility, data, deleted_at AS deletedAt, updated_at AS updatedAt
      FROM assignment_templates
      WHERE deleted_at IS NOT NULL
    `);
    templateRows.forEach((row) => {
      const deletedAt = row.deletedAt || row.updatedAt || new Date().toISOString();
      const retention = recycleRetention(deletedAt);
      items.push({
        type: 'template',
        id: row.id,
        key: `template:${row.id}`,
        name: row.name,
        origin: msg('模板中心'),
        category: row.category || 'course',
        visibility: row.visibility || 'private',
        deletedAt,
        remainingDays: retention.remainingDays,
        size: String(row.data || '').length,
        recoverable: true,
      });
    });
  }

  const keyword = String(search || '')
    .trim()
    .toLowerCase();
  let filtered = keyword
    ? items.filter((item) =>
        [item.name, item.origin, item.submitter, item.homeworkTitle].some((value) =>
          String(value || '')
            .toLowerCase()
            .includes(keyword)
        )
      )
    : items;

  const sorters = {
    recent: (a, b) => new Date(b.deletedAt) - new Date(a.deletedAt),
    oldest: (a, b) => new Date(a.deletedAt) - new Date(b.deletedAt),
    size: (a, b) => b.size - a.size,
    retention: (a, b) => a.remainingDays - b.remainingDays,
    name: (a, b) => String(a.name).localeCompare(String(b.name), 'zh-CN'),
  };
  filtered = [...filtered].sort(sorters[sort] || sorters.recent);

  const deletedTaskCount = await getDb("SELECT COUNT(*) AS total FROM assignments WHERE status = 'deleted'").then((row) => Number(row.total || 0));
  const deletedSubmissionCount = await getDb('SELECT COUNT(*) AS total FROM submissions WHERE deleted_at IS NOT NULL').then((row) => Number(row.total || 0));
  const deletedTemplateCount = await getDb('SELECT COUNT(*) AS total FROM assignment_templates WHERE deleted_at IS NOT NULL').then((row) =>
    Number(row.total || 0)
  );
  const allDeletedFiles = deletedFilesForSummary.length
    ? deletedFilesForSummary
    : await allDb(
        "SELECT file_size AS size, stored_filename AS storedFilename FROM submission_files WHERE deleted_at IS NOT NULL AND COALESCE(delete_source, 'file') != 'submission'"
      );
  const summary = {
    deletedTasks: deletedTaskCount,
    deletedSubmissions: deletedSubmissionCount,
    deletedFiles: allDeletedFiles.length,
    deletedTemplates: deletedTemplateCount,
    pendingCleanup: deletedTaskCount + deletedSubmissionCount + deletedTemplateCount + allDeletedFiles.length,
    releasableBytes: allDeletedFiles.reduce((sum, row) => sum + getStoredFileSize(row), 0),
    retentionDays: RECYCLE_RETENTION_DAYS,
  };

  const total = filtered.length;
  const start = (page - 1) * perPage;
  return {
    summary,
    items: filtered.slice(start, start + perPage),
    total,
    page,
    perPage,
    totalPages: Math.max(1, Math.ceil(total / perPage)),
  };
}

function normalizeRecycleSelection(body) {
  if (Array.isArray(body.items)) {
    return body.items
      .map((item) => ({ type: item.type, id: Number(item.id) }))
      .filter((item) => ['task', 'submission', 'file', 'template'].includes(item.type) && Number.isInteger(item.id));
  }
  if (body.type && Array.isArray(body.ids)) {
    return body.ids
      .map((id) => ({ type: body.type, id: Number(id) }))
      .filter((item) => ['task', 'submission', 'file', 'template'].includes(item.type) && Number.isInteger(item.id));
  }
  return [];
}

async function restoreAssignment(assignmentId) {
  const assignment = await getDb('SELECT id, previous_status, deleted_at AS deletedAt FROM assignments WHERE id = ? AND status = ?', [assignmentId, 'deleted']);
  if (!assignment) return false;
  const now = new Date().toISOString();
  const status = normalizeStatus(assignment.previous_status || 'ongoing');
  await beginTransaction();
  try {
    await runDb('UPDATE assignments SET status = ?, deleted_at = NULL, delete_source = NULL, updated_at = ? WHERE id = ?', [
      status === 'deleted' ? 'ongoing' : status,
      now,
      assignmentId,
    ]);
    await runDb(
      "UPDATE submissions SET deleted_at = NULL, delete_source = NULL WHERE assignment_id = ? AND deleted_at IS NOT NULL AND delete_source = 'task'",
      [assignmentId]
    );
    await runDb(
      "UPDATE submission_files SET deleted_at = NULL, delete_source = NULL WHERE assignment_id = ? AND deleted_at IS NOT NULL AND delete_source = 'task'",
      [assignmentId]
    );
    await commitTransaction();
    return true;
  } catch (error) {
    await rollbackTransaction();
    throw error;
  }
}

async function restoreSubmission(submissionId) {
  const submission = await getDb(
    `
      SELECT s.id, s.assignment_id AS assignmentId, a.status AS assignmentStatus
      FROM submissions s
      LEFT JOIN assignments a ON a.id = s.assignment_id
      WHERE s.id = ? AND s.deleted_at IS NOT NULL
    `,
    [submissionId]
  );
  if (!submission) return false;
  if (submission.assignmentId && submission.assignmentStatus === 'deleted') throw new Error('RESTORE_PARENT_TASK_FIRST');
  await beginTransaction();
  try {
    await runDb('UPDATE submissions SET deleted_at = NULL, delete_source = NULL WHERE id = ?', [submissionId]);
    await runDb(
      "UPDATE submission_files SET deleted_at = NULL, delete_source = NULL WHERE submission_id = ? AND deleted_at IS NOT NULL AND delete_source = 'submission'",
      [submissionId]
    );
    await commitTransaction();
    return true;
  } catch (error) {
    await rollbackTransaction();
    throw error;
  }
}

async function restoreFile(fileId) {
  const file = await getDb(
    `
      SELECT
        sf.id,
        sf.submission_id AS submissionId,
        sf.assignment_id AS assignmentId,
        sf.stored_filename AS storedFilename,
        sf.delete_source AS deleteSource,
        a.status AS assignmentStatus,
        s.deleted_at AS submissionDeletedAt,
        s.delete_source AS submissionDeleteSource
      FROM submission_files sf
      LEFT JOIN submissions s ON s.id = sf.submission_id
      LEFT JOIN assignments a ON a.id = sf.assignment_id
      WHERE sf.id = ? AND sf.deleted_at IS NOT NULL
    `,
    [fileId]
  );
  if (!file) return false;
  if (file.assignmentId && file.assignmentStatus === 'deleted') throw new Error('RESTORE_PARENT_TASK_FIRST');
  if (file.deleteSource === 'task') throw new Error('RESTORE_PARENT_TASK_FIRST');
  if (file.storedFilename && !fs.existsSync(path.join(UPLOAD_DIR, file.storedFilename))) throw new Error('RESTORE_FILE_MISSING');
  if (file.deleteSource === 'submission' && file.submissionId) return restoreSubmission(file.submissionId);
  await beginTransaction();
  try {
    if (file.submissionId && file.submissionDeletedAt && file.submissionDeleteSource === 'submission') {
      await runDb('UPDATE submissions SET deleted_at = NULL, delete_source = NULL WHERE id = ?', [file.submissionId]);
    }
    await runDb('UPDATE submission_files SET deleted_at = NULL, delete_source = NULL WHERE id = ?', [fileId]);
    await commitTransaction();
  } catch (error) {
    await rollbackTransaction();
    throw error;
  }
  return true;
}

async function restoreTemplate(templateId) {
  const result = await runDb(
    'UPDATE assignment_templates SET deleted_at = NULL, delete_source = NULL, updated_at = ? WHERE id = ? AND deleted_at IS NOT NULL',
    [new Date().toISOString(), templateId]
  );
  return result.changes > 0;
}

async function purgeRecycleItem(item) {
  if (item.type === 'task') {
    const assignment = await getDb("SELECT id FROM assignments WHERE id = ? AND status = 'deleted'", [item.id]);
    if (!assignment) return false;
    await hardDeleteAssignment(item.id);
    return true;
  }
  if (item.type === 'submission') {
    const submission = await getDb('SELECT id FROM submissions WHERE id = ? AND deleted_at IS NOT NULL', [item.id]);
    if (!submission) return false;
    await hardDeleteSubmissionWithFiles(item.id);
    return true;
  }
  if (item.type === 'file') {
    const file = await getDb('SELECT id FROM submission_files WHERE id = ? AND deleted_at IS NOT NULL', [item.id]);
    if (!file) return false;
    return hardDeleteFile(item.id);
  }
  if (item.type === 'template') {
    const result = await runDb('DELETE FROM assignment_templates WHERE id = ? AND deleted_at IS NOT NULL', [item.id]);
    return result.changes > 0;
  }
  return false;
}

async function purgeAllRecycleItems() {
  const tasks = await allDb("SELECT id FROM assignments WHERE status = 'deleted'");
  let purged = 0;
  for (const task of tasks) {
    try {
      if (await hardDeleteAssignment(task.id)) purged += 1;
    } catch (error) {
      console.error(`Failed to purge assignment ${task.id}:`, error);
    }
  }
  const submissions = await allDb('SELECT id FROM submissions WHERE deleted_at IS NOT NULL');
  for (const submission of submissions) {
    try {
      if (await hardDeleteSubmissionWithFiles(submission.id)) purged += 1;
    } catch (error) {
      console.error(`Failed to purge submission ${submission.id}:`, error);
    }
  }
  const files = await allDb('SELECT id FROM submission_files WHERE deleted_at IS NOT NULL');
  for (const file of files) {
    try {
      if (await hardDeleteFile(file.id)) purged += 1;
    } catch (error) {
      console.error(`Failed to purge file ${file.id}:`, error);
    }
  }
  const templates = await allDb('SELECT id FROM assignment_templates WHERE deleted_at IS NOT NULL');
  for (const template of templates) {
    try {
      if (await purgeRecycleItem({ type: 'template', id: template.id })) purged += 1;
    } catch (error) {
      console.error(`Failed to purge template ${template.id}:`, error);
    }
  }
  return purged;
}

module.exports = {
  getSubmissionStoredFiles,
  hardDeleteSubmissionWithFiles,
  softDeleteSubmissionWithFiles,
  hardDeleteAssignment,
  hardDeleteFile,
  recycleRetention,
  getStoredFileSize,
  cleanupExpiredRecycleItems,
  getRecycleBinData,
  normalizeRecycleSelection,
  restoreAssignment,
  restoreSubmission,
  restoreFile,
  restoreTemplate,
  purgeRecycleItem,
  purgeAllRecycleItems,
};
