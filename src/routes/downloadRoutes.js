const fs = require('fs');
const path = require('path');
const archiver = require('archiver');

const { UPLOAD_DIR } = require('../config');
const { allDb, getDb, runDb } = require('../db');
const { requireAdmin } = require('../middleware/requireAdmin');
const {
  assignmentSelectSql,
  formatAssignment,
  parseJson,
} = require('../utils/assignmentUtils');
const {
  safeName,
  sendStoredFile,
} = require('../utils/fileUtils');
const { msg } = require('../utils/responseUtils');

function registerDownloadRoutes(app) {
  app.get('/api/download-all', requireAdmin, async (req, res) => {
    try {
      const assignmentId = req.query.assignmentId ? Number(req.query.assignmentId) : null;
      const assignment = assignmentId ? formatAssignment(await getDb(`${assignmentSelectSql('WHERE a.id = ?')} GROUP BY a.id`, [assignmentId])) : null;
      const whereParts = ['sf.deleted_at IS NULL', 's.deleted_at IS NULL', "(a.id IS NULL OR a.status != 'deleted')"];
      const params = [];
      if (assignmentId) {
        whereParts.push('sf.assignment_id = ?');
        params.push(assignmentId);
      }
      const where = `WHERE ${whereParts.join(' AND ')}`;
      const files = await allDb(
        `
          SELECT sf.*, s.submitter_data AS submitterData, a.title AS assignmentTitle, a.download_structure AS downloadStructure
          FROM submission_files sf
          LEFT JOIN submissions s ON s.id = sf.submission_id
          LEFT JOIN assignments a ON a.id = sf.assignment_id
          ${where}
          ORDER BY sf.id ASC
        `,
        params
      );
      res.attachment(assignment?.title ? `cloudnote-${safeName(assignment.title)}.zip` : 'cloudnote-submissions.zip');
      const archive = archiver('zip', { zlib: { level: 9 } });
      archive.on('error', (error) => {
        console.error(error);
        if (!res.headersSent) res.status(500).json({ message: msg('\u6253\u5305\u6587\u4ef6\u5931\u8d25') });
        else res.end();
      });
      archive.pipe(res);
      files.forEach((file) => {
        const filePath = path.join(UPLOAD_DIR, file.stored_filename);
        if (!fs.existsSync(filePath)) return;
        const data = parseJson(file.submitterData, {});
        const folder = file.downloadStructure === 'task-file'
          ? safeName(file.assignmentTitle || 'CloudNote')
          : path.join(safeName(file.assignmentTitle || 'CloudNote'), safeName(data.studentId || data.studentName || 'unknown'));
        archive.file(filePath, { name: path.join(folder, safeName(file.original_filename)) });
      });
      archive.finalize();
    } catch (error) {
      console.error(error);
      res.status(500).json({ message: msg('\u6253\u5305\u6587\u4ef6\u5931\u8d25') });
    }
  });

  app.get('/api/download/:id', requireAdmin, async (req, res) => {
    try {
      const files = await allDb('SELECT * FROM submission_files WHERE deleted_at IS NULL AND submission_id = ? ORDER BY id ASC', [req.params.id]);
      if (!files.length) return res.status(404).json({ message: msg('\u6587\u4ef6\u4e0d\u5b58\u5728') });
      if (files.length === 1) {
        const filePath = path.join(UPLOAD_DIR, files[0].stored_filename);
        if (!fs.existsSync(filePath)) return res.status(404).json({ message: msg('\u6587\u4ef6\u4e0d\u5b58\u5728') });
        return sendStoredFile(res, filePath, files[0].original_filename);
      }
      res.attachment(`cloudnote-submission-${req.params.id}.zip`);
      const archive = archiver('zip', { zlib: { level: 9 } });
      archive.pipe(res);
      files.forEach((file) => {
        const filePath = path.join(UPLOAD_DIR, file.stored_filename);
        if (fs.existsSync(filePath)) archive.file(filePath, { name: safeName(file.original_filename) });
      });
      archive.finalize();
    } catch (error) {
      console.error(error);
      res.status(500).json({ message: msg('\u67e5\u8be2\u6587\u4ef6\u5931\u8d25') });
    }
  });

  app.get('/api/files/:id/download', requireAdmin, async (req, res) => {
    try {
      const file = await getDb(
        `
          SELECT sf.*, s.deleted_at AS submissionDeletedAt, a.status AS assignmentStatus
          FROM submission_files sf
          LEFT JOIN submissions s ON s.id = sf.submission_id
          LEFT JOIN assignments a ON a.id = sf.assignment_id
          WHERE sf.id = ?
        `,
        [req.params.id]
      );
      if (!file || file.deleted_at || file.submissionDeletedAt || file.assignmentStatus === 'deleted') {
        return res.status(404).json({ message: msg('\u6587\u4ef6\u4e0d\u5b58\u5728') });
      }
      const filePath = path.join(UPLOAD_DIR, file.stored_filename);
      if (!fs.existsSync(filePath)) return res.status(404).json({ message: msg('\u6587\u4ef6\u4e0d\u5b58\u5728') });
      sendStoredFile(res, filePath, file.original_filename);
    } catch (error) {
      console.error(error);
      res.status(500).json({ message: msg('\u4e0b\u8f7d\u6587\u4ef6\u5931\u8d25') });
    }
  });

  app.delete('/api/files/:id', requireAdmin, async (req, res) => {
    try {
      const file = await getDb('SELECT id, submission_id FROM submission_files WHERE id = ? AND deleted_at IS NULL', [req.params.id]);
      if (!file) return res.status(404).json({ message: msg('\u6587\u4ef6\u4e0d\u5b58\u5728') });
      const deletedAt = new Date().toISOString();
      await runDb('UPDATE submission_files SET deleted_at = ?, delete_source = ? WHERE id = ?', [deletedAt, 'file', req.params.id]);
      res.json({ message: msg('\u6587\u4ef6\u5df2\u79fb\u5165\u56de\u6536\u7ad9') });
    } catch (error) {
      console.error(error);
      res.status(500).json({ message: msg('\u5220\u9664\u6587\u4ef6\u5931\u8d25') });
    }
  });
}

module.exports = registerDownloadRoutes;
