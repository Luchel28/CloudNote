const { getDb, allDb, runDb } = require('../db');
const { requireAdmin } = require('../middleware/requireAdmin');
const {
  formatTemplate,
  normalizeTemplatePayload,
} = require('../utils/assignmentUtils');
const { msg } = require('../utils/responseUtils');

function registerTemplateRoutes(app) {
  app.get('/api/templates', requireAdmin, async (req, res) => {
    try {
      const search = String(req.query.search || '').trim();
      const category = String(req.query.category || '').trim();
      const where = ['deleted_at IS NULL'];
      const params = [];
      if (search) {
        where.push('name LIKE ?');
        params.push(`%${search}%`);
      }
      if (category && ['course', 'exam', 'material'].includes(category)) {
        where.push('category = ?');
        params.push(category);
      }
      const rows = await allDb(
        `SELECT id, name, category, visibility, data, created_at AS createdAt, updated_at AS updatedAt FROM assignment_templates WHERE ${where.join(' AND ')} ORDER BY datetime(updated_at) DESC, id DESC`,
        params
      );
      res.json({ items: rows.map(formatTemplate), total: rows.length });
    } catch (error) {
      console.error(error);
      res.status(500).json({ message: msg('读取模板列表失败') });
    }
  });

  app.post('/api/templates', requireAdmin, async (req, res) => {
    try {
      const data = normalizeTemplatePayload(req.body);
      const now = new Date().toISOString();
      const result = await runDb(
        'INSERT INTO assignment_templates (name, category, visibility, data, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)',
        [data.name, data.category, data.visibility, data.data, now, now]
      );
      const row = await getDb('SELECT id, name, category, visibility, data, created_at AS createdAt, updated_at AS updatedAt FROM assignment_templates WHERE id = ?', [result.lastID]);
      res.status(201).json(formatTemplate(row));
    } catch (error) {
      if (error.message === 'TEMPLATE_NAME_REQUIRED') return res.status(400).json({ message: msg('模板名称不能为空') });
      if (error.message.startsWith('FIELD_CONFIG_INVALID:')) return res.status(400).json({ message: msg(error.message.slice(21)) });
      console.error(error);
      res.status(500).json({ message: msg('保存模板失败') });
    }
  });

  app.put('/api/templates/:id', requireAdmin, async (req, res) => {
    try {
      const data = normalizeTemplatePayload(req.body);
      const now = new Date().toISOString();
      const result = await runDb(
        'UPDATE assignment_templates SET name = ?, category = ?, visibility = ?, data = ?, updated_at = ? WHERE id = ? AND deleted_at IS NULL',
        [data.name, data.category, data.visibility, data.data, now, req.params.id]
      );
      if (result.changes === 0) return res.status(404).json({ message: msg('模板不存在') });
      const row = await getDb('SELECT id, name, category, visibility, data, created_at AS createdAt, updated_at AS updatedAt FROM assignment_templates WHERE id = ?', [req.params.id]);
      res.json(formatTemplate(row));
    } catch (error) {
      if (error.message === 'TEMPLATE_NAME_REQUIRED') return res.status(400).json({ message: msg('模板名称不能为空') });
      if (error.message.startsWith('FIELD_CONFIG_INVALID:')) return res.status(400).json({ message: msg(error.message.slice(21)) });
      console.error(error);
      res.status(500).json({ message: msg('更新模板失败') });
    }
  });

  app.delete('/api/templates/:id', requireAdmin, async (req, res) => {
    try {
      const now = new Date().toISOString();
      const result = await runDb('UPDATE assignment_templates SET deleted_at = ?, delete_source = ?, updated_at = ? WHERE id = ? AND deleted_at IS NULL', [now, 'template', now, req.params.id]);
      if (result.changes === 0) return res.status(404).json({ message: msg('模板不存在') });
      res.json({ message: msg('模板已移入回收站') });
    } catch (error) {
      console.error(error);
      res.status(500).json({ message: msg('删除模板失败') });
    }
  });
}

module.exports = registerTemplateRoutes;
