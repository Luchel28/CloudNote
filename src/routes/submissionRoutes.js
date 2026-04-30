const { allDb, getDb } = require('../db');
const { requireAdmin } = require('../middleware/requireAdmin');
const { softDeleteSubmissionWithFiles } = require('../services/recycleService');
const {
  normalizeFieldConfig,
  parseJson,
} = require('../utils/assignmentUtils');
const { rowsToCsv } = require('../utils/csvUtils');
const { parsePage, parsePerPage } = require('../utils/paginationUtils');
const { msg } = require('../utils/responseUtils');

const SUBMITTER_FIELD_LABELS = {
  studentName: '姓名',
  studentId: '学号',
  phone: '手机号',
  idcard: '身份证号',
  idCard: '身份证号',
  birthDate: '出生日期',
  email: '邮箱',
  homeworkTitle: '作业标题',
};
const GENERATED_CUSTOM_LABEL_PATTERN = /^自定义字段\s+\d+$/;

function isGeneratedCustomLabel(label) {
  return GENERATED_CUSTOM_LABEL_PATTERN.test(String(label || '').trim());
}

function getFallbackSubmitterLabel(key, index = 0) {
  const normalizedKey = String(key || '').trim();
  if (SUBMITTER_FIELD_LABELS[normalizedKey]) return SUBMITTER_FIELD_LABELS[normalizedKey];
  return `自定义字段 ${Math.max(1, Number(index) + 1)}`;
}

function buildConfigLabelMap(fieldConfig) {
  return normalizeFieldConfig(fieldConfig).reduce((acc, field) => {
    const key = String(field.key || '').trim();
    const label = String(field.label || field.name || '').trim();
    if (key && label && label !== key) acc[key] = label;
    return acc;
  }, {});
}

function buildSubmitterLabels(assignmentFieldConfig, submitterData = {}) {
  const configLabels = buildConfigLabelMap(assignmentFieldConfig);
  return Object.keys(submitterData || {}).reduce((acc, key, index) => {
    acc[key] = configLabels[key] || getFallbackSubmitterLabel(key, index);
    return acc;
  }, { ...configLabels });
}

function resolveSubmitterHeaderLabel(key, items = [], dynamicKeys = []) {
  const configuredLabel = items
    .map((item) => String(item.submitterLabels?.[key] || '').trim())
    .find((label) => label && label !== key && !isGeneratedCustomLabel(label));
  if (configuredLabel) return configuredLabel;
  const index = Math.max(0, dynamicKeys.indexOf(key));
  return getFallbackSubmitterLabel(key, index);
}

async function querySubmissions({
  assignmentId = null,
  search = '',
  status = '',
  dateFrom = '',
  dateTo = '',
  sort = 'upload-desc',
  page = 1,
  perPage = 20,
}) {
  const where = ['s.deleted_at IS NULL', "(a.id IS NULL OR a.status != 'deleted')"];
  const params = [];
  if (assignmentId) {
    where.push('s.assignment_id = ?');
    params.push(assignmentId);
  }
  if (status === 'late') {
    where.push('s.is_late = 1');
  } else if (status === 'ontime') {
    where.push('s.is_late = 0');
  }
  if (dateFrom) {
    where.push('datetime(s.upload_time) >= datetime(?)');
    params.push(dateFrom);
  }
  if (dateTo) {
    where.push('datetime(s.upload_time) <= datetime(?)');
    params.push(dateTo);
  }
  if (search) {
    where.push(`(
      s.student_name LIKE ? OR s.student_id LIKE ? OR s.homework_title LIKE ?
      OR s.submitter_data LIKE ? OR s.original_filename LIKE ?
      OR EXISTS (
        SELECT 1 FROM submission_files sf
        WHERE sf.submission_id = s.id AND sf.deleted_at IS NULL AND sf.original_filename LIKE ?
      )
    )`);
    params.push(`%${search}%`, `%${search}%`, `%${search}%`, `%${search}%`, `%${search}%`, `%${search}%`);
  }
  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const offset = (page - 1) * perPage;
  const totalRow = await getDb(`
    SELECT COUNT(*) AS total
    FROM submissions s
    LEFT JOIN assignments a ON a.id = s.assignment_id
    ${whereSql}
  `, params);
  const orderBy = {
    'upload-asc': 'datetime(s.upload_time) ASC, s.id ASC',
    'assignment-asc': 'a.title COLLATE NOCASE ASC, datetime(s.upload_time) DESC',
    'assignment-desc': 'a.title COLLATE NOCASE DESC, datetime(s.upload_time) DESC',
    'name-asc': 's.student_name COLLATE NOCASE ASC, datetime(s.upload_time) DESC',
    'name-desc': 's.student_name COLLATE NOCASE DESC, datetime(s.upload_time) DESC',
    'late-desc': 's.is_late DESC, datetime(s.upload_time) DESC',
  }[sort] || 'datetime(s.upload_time) DESC, s.id DESC';
  const rows = await allDb(
    `
      SELECT
        s.id,
        s.student_name AS studentName,
        s.student_id AS studentId,
        s.homework_title AS homeworkTitle,
        s.original_filename AS originalFilename,
        s.upload_time AS uploadTime,
        s.assignment_id AS assignmentId,
        s.submitter_data AS submitterData,
        s.is_late AS isLate,
        a.field_config AS assignmentFieldConfig,
        CASE WHEN a.status = 'deleted' THEN NULL ELSE a.title END AS assignmentTitle
      FROM submissions s
      LEFT JOIN assignments a ON a.id = s.assignment_id
      ${whereSql}
      ORDER BY ${orderBy}
      LIMIT ? OFFSET ?
    `,
    [...params, perPage, offset]
  );
  const ids = rows.map((row) => row.id);
  const files = ids.length
    ? await allDb(`SELECT * FROM submission_files WHERE deleted_at IS NULL AND submission_id IN (${ids.map(() => '?').join(',')}) ORDER BY id ASC`, ids)
    : [];
  const fileMap = new Map();
  files.forEach((file) => {
    if (!fileMap.has(file.submission_id)) fileMap.set(file.submission_id, []);
    fileMap.get(file.submission_id).push({
      id: file.id,
      originalFilename: file.original_filename,
      storedFilename: file.stored_filename,
      size: file.file_size,
      mimeType: file.mime_type,
    });
  });
  return {
    items: rows.map((row) => {
      const submitterData = parseJson(row.submitterData, {});
      return {
        ...row,
        submitterData,
        submitterLabels: buildSubmitterLabels(row.assignmentFieldConfig, submitterData),
        assignmentFieldConfig: undefined,
        isLate: Boolean(row.isLate),
        files: fileMap.get(row.id) || [],
      };
    }),
    total: totalRow.total,
    page,
    perPage,
    totalPages: Math.max(1, Math.ceil(totalRow.total / perPage)),
  };
}

function registerSubmissionRoutes(app) {
  app.get('/api/submissions', requireAdmin, async (req, res) => {
    try {
      const assignmentId = req.query.assignmentId ? Number(req.query.assignmentId) : null;
      const page = parsePage(req.query.page);
      const perPage = parsePerPage(req.query.perPage, 20, 100);
      if (req.query.assignmentId && !Number.isInteger(assignmentId)) return res.status(400).json({ message: msg('\u4efb\u52a1 ID \u65e0\u6548') });
      res.json(await querySubmissions({
        assignmentId,
        search: req.query.search || '',
        status: req.query.status || '',
        dateFrom: req.query.dateFrom || '',
        dateTo: req.query.dateTo || '',
        sort: req.query.sort || 'upload-desc',
        page,
        perPage,
      }));
    } catch (error) {
      console.error(error);
      res.status(500).json({ message: msg('\u8bfb\u53d6\u63d0\u4ea4\u8bb0\u5f55\u5931\u8d25') });
    }
  });

  app.post('/api/export-submissions', requireAdmin, async (req, res) => {
    try {
      const assignmentId = req.body.assignmentId ? Number(req.body.assignmentId) : null;
      const result = await querySubmissions({
        assignmentId,
        search: req.body.search || '',
        status: req.body.status || '',
        dateFrom: req.body.dateFrom || '',
        dateTo: req.body.dateTo || '',
        sort: req.body.sort || 'upload-desc',
        page: 1,
        perPage: 10000,
      });
      const dynamicKeys = [...new Set(result.items.flatMap((item) => Object.keys(item.submitterData || {})))];
      const headerLabels = dynamicKeys.map((key) => resolveSubmitterHeaderLabel(key, result.items, dynamicKeys));
      const headers = ['记录ID', '所属任务', ...headerLabels, '作业标题', '文件', '上传时间', '是否逾期'];
      const rows = result.items.map((item) => [
        item.id,
        item.assignmentTitle || '',
        ...dynamicKeys.map((key) => item.submitterData?.[key] || ''),
        item.homeworkTitle,
        item.files.map((file) => file.originalFilename).join('; '),
        item.uploadTime,
        item.isLate ? '是' : '否',
      ]);
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="cloudnote-submissions-${Date.now()}.csv"`);
      res.send(rowsToCsv(headers, rows));
    } catch (error) {
      console.error(error);
      res.status(500).json({ message: msg('\u5bfc\u51fa\u63d0\u4ea4\u8bb0\u5f55\u5931\u8d25') });
    }
  });

  app.delete('/api/submissions/:id', requireAdmin, async (req, res) => {
    try {
      const result = await softDeleteSubmissionWithFiles(req.params.id);
      if (result.changes === 0) return res.status(404).json({ message: msg('\u63d0\u4ea4\u8bb0\u5f55\u4e0d\u5b58\u5728') });
      res.json({ message: msg('\u5df2\u79fb\u5165\u56de\u6536\u7ad9') });
    } catch (error) {
      console.error(error);
      res.status(500).json({ message: msg('\u5220\u9664\u63d0\u4ea4\u8bb0\u5f55\u5931\u8d25') });
    }
  });
}

module.exports = registerSubmissionRoutes;
