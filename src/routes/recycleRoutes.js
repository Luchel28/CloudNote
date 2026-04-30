const { requireAdmin } = require('../middleware/requireAdmin');
const {
  getRecycleBinData,
  normalizeRecycleSelection,
  purgeAllRecycleItems,
  purgeRecycleItem,
  restoreAssignment,
  restoreFile,
  restoreSubmission,
  restoreTemplate,
} = require('../services/recycleService');
const { parsePage, parsePerPage } = require('../utils/paginationUtils');
const { msg } = require('../utils/responseUtils');

function registerRecycleRoutes(app) {
  app.get('/api/recycle-bin', requireAdmin, async (req, res) => {
    try {
      const page = parsePage(req.query.page);
      const perPage = parsePerPage(req.query.perPage, 20, 100);
      const type = ['task', 'submission', 'file', 'template'].includes(req.query.type) ? req.query.type : 'all';
      res.json(await getRecycleBinData({
        type,
        search: req.query.search || '',
        sort: req.query.sort || 'recent',
        page,
        perPage,
      }));
    } catch (error) {
      console.error(error);
      res.status(500).json({ message: msg('\u8bfb\u53d6\u56de\u6536\u7ad9\u5931\u8d25') });
    }
  });

  app.post('/api/recycle-bin/restore', requireAdmin, async (req, res) => {
    try {
      const items = normalizeRecycleSelection(req.body);
      if (!items.length) return res.status(400).json({ message: msg('\u8bf7\u9009\u62e9\u8981\u6062\u590d\u7684\u5185\u5bb9') });
      let restored = 0;
      for (const item of items) {
        const ok = item.type === 'task'
          ? await restoreAssignment(item.id)
          : item.type === 'submission'
            ? await restoreSubmission(item.id)
            : item.type === 'template'
              ? await restoreTemplate(item.id)
              : await restoreFile(item.id);
        if (ok) restored += 1;
      }
      res.json({ message: msg(`\u5df2\u6062\u590d ${restored} \u9879`), restored });
    } catch (error) {
      if (error.message === 'RESTORE_PARENT_TASK_FIRST') return res.status(400).json({ message: msg('请先恢复所属任务') });
      if (error.message === 'RESTORE_FILE_MISSING') return res.status(400).json({ message: msg('文件已不存在，不能恢复') });
      console.error(error);
      res.status(500).json({ message: msg('\u6062\u590d\u5931\u8d25') });
    }
  });

  app.post('/api/recycle-bin/purge', requireAdmin, async (req, res) => {
    try {
      const items = normalizeRecycleSelection(req.body);
      if (!items.length) return res.status(400).json({ message: msg('\u8bf7\u9009\u62e9\u8981\u5f7b\u5e95\u5220\u9664\u7684\u5185\u5bb9') });
      let purged = 0;
      for (const item of items) {
        const ok = await purgeRecycleItem(item);
        if (ok) purged += 1;
      }
      res.json({ message: msg(`\u5df2\u5f7b\u5e95\u5220\u9664 ${purged} \u9879`), purged });
    } catch (error) {
      console.error(error);
      res.status(500).json({ message: msg('\u5f7b\u5e95\u5220\u9664\u5931\u8d25') });
    }
  });

  app.delete('/api/recycle-bin', requireAdmin, async (req, res) => {
    try {
      const purged = await purgeAllRecycleItems();
      res.json({ message: msg('\u56de\u6536\u7ad9\u5df2\u6e05\u7a7a'), purged });
    } catch (error) {
      console.error(error);
      res.status(500).json({ message: msg('\u6e05\u7a7a\u56de\u6536\u7ad9\u5931\u8d25') });
    }
  });
}

module.exports = registerRecycleRoutes;
