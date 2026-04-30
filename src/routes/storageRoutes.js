const { requireAdmin } = require('../middleware/requireAdmin');
const { getStorageSummary } = require('../services/storageService');
const { msg } = require('../utils/responseUtils');

function registerStorageRoutes(app) {
  app.get('/api/storage-summary', requireAdmin, async (req, res) => {
    try {
      res.json(await getStorageSummary());
    } catch (error) {
      console.error(error);
      res.status(500).json({ message: msg('存储统计暂不可用') });
    }
  });
}

module.exports = registerStorageRoutes;
