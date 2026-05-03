const { allDb, beginTransaction, commitTransaction, generateUniqueShareCode, getDb, rollbackTransaction, runDb } = require('../db');
const { requireAdmin } = require('../middleware/requireAdmin');
const {
  VALID_STATUSES,
  assignmentSelectSql,
  formatAssignment,
  normalizeAssignmentPayload,
  normalizeShareCode,
  normalizeStatus,
} = require('../utils/assignmentUtils');
const { parsePage, parsePerPage } = require('../utils/paginationUtils');
const { msg } = require('../utils/responseUtils');

function registerAssignmentRoutes(app) {
  app.post('/api/assignments', requireAdmin, async (req, res) => {
    try {
      const data = normalizeAssignmentPayload(req.body);
      const now = new Date().toISOString();
      let result = null;
      for (let attempt = 0; attempt < 5; attempt += 1) {
        const shareCode = await generateUniqueShareCode();
        try {
          result = await runDb(
            `
              INSERT INTO assignments (
                title, description, deadline, status, share_code, created_at, updated_at, field_config,
                allow_late, allow_repeat, repeat_mode, max_files, max_file_size_mb,
                allowed_extensions, rename_enabled, rename_fields, download_structure,
                required_upload, file_type, enable_limit, allow_folder
              )
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `,
            [
              data.title,
              data.description,
              data.deadline,
              data.status,
              shareCode,
              now,
              now,
              data.fieldConfig,
              data.allowLate,
              data.allowRepeat,
              data.repeatMode,
              data.maxFiles,
              data.maxFileSizeMb,
              data.allowedExtensions,
              data.renameEnabled,
              data.renameFields,
              data.downloadStructure,
              data.requiredUpload,
              data.fileType,
              data.enableLimit,
              data.allowFolder,
            ]
          );
          break;
        } catch (error) {
          if (error.code === 'SQLITE_CONSTRAINT' && String(error.message || '').includes('share_code')) continue;
          throw error;
        }
      }
      if (!result) throw new Error('SHARE_CODE_GENERATION_FAILED');
      const row = await getDb(`${assignmentSelectSql('WHERE a.id = ?')} GROUP BY a.id`, [result.lastID]);
      res.status(201).json(formatAssignment(row));
    } catch (error) {
      if (error.message === 'TITLE_REQUIRED') return res.status(400).json({ message: msg('\u4efb\u52a1\u6807\u9898\u4e0d\u80fd\u4e3a\u7a7a') });
      if (error.message.startsWith('FIELD_CONFIG_INVALID:')) return res.status(400).json({ message: msg(error.message.slice(21)) });
      console.error(error);
      res.status(500).json({ message: msg('\u521b\u5efa\u4efb\u52a1\u5931\u8d25') });
    }
  });

  app.get('/api/assignments', requireAdmin, async (req, res) => {
    try {
      const status = String(req.query.status || '').trim();
      const hasStatus = status && VALID_STATUSES.has(status);
      const search = String(req.query.search || '').trim();
      const sort = String(req.query.sort || 'created-desc');
      const page = parsePage(req.query.page);
      const perPage = parsePerPage(req.query.perPage, 8, 50);
      const offset = (page - 1) * perPage;
      const whereParts = [];
      const params = [];
      if (hasStatus) {
        if (status === 'expired') {
          whereParts.push("a.status = 'ongoing' AND a.deadline IS NOT NULL AND datetime(a.deadline) < datetime('now')");
        } else if (status === 'completed') {
          whereParts.push(
            "(a.status IN ('ended', 'archived', 'completed') OR (a.status = 'ongoing' AND a.deadline IS NOT NULL AND a.deadline != '' AND datetime(a.deadline) < datetime('now')))"
          );
        } else if (status === 'ongoing') {
          whereParts.push("(a.status = 'ongoing' AND (a.deadline IS NULL OR a.deadline = '' OR datetime(a.deadline) >= datetime('now')))");
        } else {
          whereParts.push('a.status = ?');
          params.push(normalizeStatus(status));
        }
      } else {
        whereParts.push("a.status != 'deleted'");
      }
      if (search) {
        const idSearch = search.match(/[?&]id=(\d+)/i)?.[1] || (/^\d+$/.test(search) ? search : '');
        const codeSearch = normalizeShareCode(search.match(/[?&]code=([A-Za-z0-9_-]+)/i)?.[1] || search);
        if (idSearch) {
          whereParts.push('(a.title LIKE ? OR a.description LIKE ? OR a.share_code LIKE ? OR CAST(a.id AS TEXT) LIKE ? OR a.id = ?)');
          params.push(`%${search}%`, `%${search}%`, `%${search}%`, `%${idSearch}%`, Number(idSearch));
        } else if (codeSearch) {
          whereParts.push('(a.title LIKE ? OR a.description LIKE ? OR a.share_code LIKE ? OR a.share_code = ?)');
          params.push(`%${search}%`, `%${search}%`, `%${search}%`, codeSearch);
        } else {
          whereParts.push('(a.title LIKE ? OR a.description LIKE ? OR a.share_code LIKE ? OR CAST(a.id AS TEXT) LIKE ?)');
          params.push(`%${search}%`, `%${search}%`, `%${search}%`, `%${search}%`);
        }
      }
      const where = whereParts.length ? `WHERE ${whereParts.join(' AND ')}` : '';
      const orderBy =
        {
          'created-asc': 'datetime(a.created_at) ASC, a.id ASC',
          'deadline-asc': 'datetime(COALESCE(a.deadline, "9999-12-31")) ASC, a.id DESC',
          'deadline-desc': 'datetime(COALESCE(a.deadline, "0001-01-01")) DESC, a.id DESC',
          'title-asc': 'a.title COLLATE NOCASE ASC, a.id DESC',
          'title-desc': 'a.title COLLATE NOCASE DESC, a.id DESC',
          'submissions-desc': 'submissionCount DESC, datetime(a.created_at) DESC',
        }[sort] || 'datetime(a.created_at) DESC, a.id DESC';
      const totalRow = await getDb(`SELECT COUNT(*) AS total FROM assignments a ${where}`, params);
      const rows = await allDb(`${assignmentSelectSql(where)} GROUP BY a.id ORDER BY ${orderBy} LIMIT ? OFFSET ?`, [...params, perPage, offset]);
      res.json({
        items: rows.map(formatAssignment),
        total: totalRow.total,
        page,
        perPage,
        totalPages: Math.max(1, Math.ceil(totalRow.total / perPage)),
      });
    } catch (error) {
      console.error(error);
      res.status(500).json({ message: msg('\u8bfb\u53d6\u4efb\u52a1\u5217\u8868\u5931\u8d25') });
    }
  });

  app.get('/api/public-assignment', async (req, res) => {
    try {
      const code = normalizeShareCode(req.query.code);
      const id = req.query.id || req.query.assignmentId;
      let row = null;
      if (code) {
        row = await getDb(`${assignmentSelectSql('WHERE a.share_code = ?')} GROUP BY a.id`, [code]);
        if (!row) return res.status(404).json({ message: msg('任务不存在或链接无效') });
      } else if (id) {
        const assignmentId = Number(id);
        if (!Number.isInteger(assignmentId)) return res.status(404).json({ message: msg('任务不存在或链接无效') });
        row = await getDb(`${assignmentSelectSql('WHERE a.id = ?')} GROUP BY a.id`, [assignmentId]);
        if (!row) return res.status(404).json({ message: msg('任务不存在或链接无效') });
      } else {
        return res.status(404).json({ message: msg('任务不存在或链接无效') });
      }
      if (row.status === 'deleted') return res.status(410).json({ message: msg('任务不存在或已删除') });
      res.json(formatAssignment(row));
    } catch (error) {
      console.error(error);
      res.status(500).json({ message: msg('读取任务失败，请稍后重试') });
    }
  });

  app.get('/api/assignments/:id', async (req, res) => {
    try {
      const row = await getDb(`${assignmentSelectSql('WHERE a.id = ?')} GROUP BY a.id`, [req.params.id]);
      if (!row) return res.status(404).json({ message: msg('任务不存在或链接无效') });
      if (row.status === 'deleted') return res.status(410).json({ message: msg('任务不存在或已删除') });
      res.json(formatAssignment(row));
    } catch (error) {
      console.error(error);
      res.status(500).json({ message: msg('\u8bfb\u53d6\u4efb\u52a1\u5931\u8d25') });
    }
  });

  app.put('/api/assignments/:id', requireAdmin, async (req, res) => {
    try {
      const data = normalizeAssignmentPayload(req.body);
      const result = await runDb(
        `
          UPDATE assignments
          SET title = ?, description = ?, deadline = ?, status = ?, updated_at = ?, field_config = ?,
              allow_late = ?, allow_repeat = ?, repeat_mode = ?, max_files = ?, max_file_size_mb = ?,
              allowed_extensions = ?, rename_enabled = ?, rename_fields = ?, download_structure = ?,
              required_upload = ?, file_type = ?, enable_limit = ?, allow_folder = ?
          WHERE id = ?
        `,
        [
          data.title,
          data.description,
          data.deadline,
          data.status,
          new Date().toISOString(),
          data.fieldConfig,
          data.allowLate,
          data.allowRepeat,
          data.repeatMode,
          data.maxFiles,
          data.maxFileSizeMb,
          data.allowedExtensions,
          data.renameEnabled,
          data.renameFields,
          data.downloadStructure,
          data.requiredUpload,
          data.fileType,
          data.enableLimit,
          data.allowFolder,
          req.params.id,
        ]
      );
      if (result.changes === 0) return res.status(404).json({ message: msg('\u4efb\u52a1\u4e0d\u5b58\u5728') });
      const row = await getDb(`${assignmentSelectSql('WHERE a.id = ?')} GROUP BY a.id`, [req.params.id]);
      res.json(formatAssignment(row));
    } catch (error) {
      if (error.message === 'TITLE_REQUIRED') return res.status(400).json({ message: msg('\u4efb\u52a1\u6807\u9898\u4e0d\u80fd\u4e3a\u7a7a') });
      if (error.message.startsWith('FIELD_CONFIG_INVALID:')) return res.status(400).json({ message: msg(error.message.slice(21)) });
      console.error(error);
      res.status(500).json({ message: msg('\u66f4\u65b0\u4efb\u52a1\u5931\u8d25') });
    }
  });

  app.delete('/api/assignments/:id', requireAdmin, async (req, res) => {
    try {
      const assignment = await getDb('SELECT id, status FROM assignments WHERE id = ?', [req.params.id]);
      if (!assignment) return res.status(404).json({ message: msg('\u4efb\u52a1\u4e0d\u5b58\u5728') });
      if (assignment.status === 'deleted') return res.json({ message: msg('\u4efb\u52a1\u5df2\u5728\u56de\u6536\u7ad9') });
      const submissions = await allDb('SELECT id FROM submissions WHERE assignment_id = ? AND deleted_at IS NULL', [req.params.id]);
      if (submissions.length > 0 && req.query.confirm !== 'true') {
        return res
          .status(409)
          .json({
            message: msg('\u8be5\u4efb\u52a1\u5df2\u6709\u63d0\u4ea4\u8bb0\u5f55\uff0c\u9700\u8981\u786e\u8ba4\u5220\u9664'),
            needConfirm: true,
            submissionCount: submissions.length,
          });
      }
      const deletedAt = new Date().toISOString();
      await beginTransaction();
      let result;
      try {
        await runDb('UPDATE submissions SET deleted_at = ?, delete_source = ? WHERE assignment_id = ? AND deleted_at IS NULL', [
          deletedAt,
          'task',
          req.params.id,
        ]);
        await runDb(
          'UPDATE submission_files SET deleted_at = ?, delete_source = ? WHERE deleted_at IS NULL AND (assignment_id = ? OR submission_id IN (SELECT id FROM submissions WHERE assignment_id = ?))',
          [deletedAt, 'task', req.params.id, req.params.id]
        );
        result = await runDb("UPDATE assignments SET previous_status = ?, status = 'deleted', deleted_at = ?, delete_source = ?, updated_at = ? WHERE id = ?", [
          normalizeStatus(assignment.status),
          deletedAt,
          'task',
          deletedAt,
          req.params.id,
        ]);
        await commitTransaction();
      } catch (error) {
        await rollbackTransaction();
        throw error;
      }
      if (result.changes === 0) return res.status(404).json({ message: msg('\u4efb\u52a1\u4e0d\u5b58\u5728') });
      res.json({ message: msg('\u4efb\u52a1\u548c\u76f8\u5173\u6587\u4ef6\u5df2\u79fb\u5165\u56de\u6536\u7ad9') });
    } catch (error) {
      console.error(error);
      res.status(500).json({ message: msg('\u5220\u9664\u4efb\u52a1\u5931\u8d25') });
    }
  });
}

module.exports = registerAssignmentRoutes;
