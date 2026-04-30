const { requireAdmin } = require('../middleware/requireAdmin');
const {
  buildSummary,
  getStatistics,
  getSubmissionTrend,
  getTotalSubmitterCount,
} = require('../services/statisticsService');
const { getStatusLabel } = require('../utils/assignmentUtils');
const { rowsToCsv } = require('../utils/csvUtils');
const { safeName } = require('../utils/fileUtils');
const { msg } = require('../utils/responseUtils');

function registerStatisticsRoutes(app) {
  app.get('/api/statistics', requireAdmin, async (req, res) => {
    try {
      const assignmentId = req.query.assignmentId ? Number(req.query.assignmentId) : null;
      if (req.query.assignmentId && !Number.isInteger(assignmentId)) return res.status(400).json({ message: msg('\u4efb\u52a1 ID \u65e0\u6548') });
      const filters = {
        assignmentId,
        status: req.query.status || '',
        dateFrom: req.query.dateFrom || '',
        dateTo: req.query.dateTo || '',
      };
      const items = await getStatistics(filters);
      const trend = await getSubmissionTrend(filters);
      const totalSubmitterCount = await getTotalSubmitterCount(filters);
      res.json({ summary: buildSummary(items, totalSubmitterCount), items, trend });
    } catch (error) {
      console.error(error);
      res.status(500).json({ message: msg('\u8bfb\u53d6\u7edf\u8ba1\u6570\u636e\u5931\u8d25') });
    }
  });

  app.get('/api/statistics/:assignmentId', requireAdmin, async (req, res) => {
    try {
      const id = Number(req.params.assignmentId);
      if (!Number.isInteger(id)) return res.status(400).json({ message: msg('\u4efb\u52a1 ID \u65e0\u6548') });
      const items = await getStatistics({
        assignmentId: id,
        dateFrom: req.query.dateFrom || '',
        dateTo: req.query.dateTo || '',
      });
      if (!items.length) return res.status(404).json({ message: msg('\u4efb\u52a1\u4e0d\u5b58\u5728') });
      res.json(items[0]);
    } catch (error) {
      console.error(error);
      res.status(500).json({ message: msg('\u8bfb\u53d6\u7edf\u8ba1\u6570\u636e\u5931\u8d25') });
    }
  });

  app.post('/api/export-statistics', requireAdmin, async (req, res) => {
    try {
      const assignmentId = req.body.assignmentId ? Number(req.body.assignmentId) : null;
      if (req.body.assignmentId && !Number.isInteger(assignmentId)) return res.status(400).json({ message: msg('\u4efb\u52a1 ID \u65e0\u6548') });
      const items = await getStatistics({
        assignmentId,
        status: req.body.status || '',
        dateFrom: req.body.dateFrom || '',
        dateTo: req.body.dateTo || '',
      });
      const headers = ['任务ID', '任务标题', '状态', '提交份数', '提交人数', '逾期提交', '截止时间', '提交状态'];
      const rows = items.map((item) => [
        item.assignmentId,
        item.assignmentTitle,
        getStatusLabel(item.effectiveStatus),
        item.submittedCount,
        item.submitterCount,
        item.lateCount,
        item.deadline || '',
        item.submissionStatus || (item.submittedCount > 0 ? '已有提交' : '暂无提交'),
      ]);
      const filename = `cloudnote-statistics-${assignmentId && items[0] ? safeName(items[0].assignmentTitle) : 'all'}-${new Date().toISOString().replace(/[:.]/g, '-')}.csv`;
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(filename)}"`);
      res.send(rowsToCsv(headers, rows));
    } catch (error) {
      console.error(error);
      res.status(500).json({ message: msg('\u5bfc\u51fa\u7edf\u8ba1\u62a5\u544a\u5931\u8d25') });
    }
  });
}

module.exports = registerStatisticsRoutes;
