const { ADMIN_PASSWORD, ADMIN_SESSION_TTL_MS, MAX_UPLOAD_FILES, MAX_UPLOAD_SIZE_MB, PUBLIC_BASE_URL } = require('../config');
const {
  clearLoginFailure,
  createAdminToken,
  getAdminLoginIp,
  getLoginFailureRecord,
  recordLoginFailure,
} = require('../middleware/requireAdmin');
const { msg } = require('../utils/responseUtils');

function registerAuthRoutes(app) {
  app.get('/api/health', (req, res) => {
    res.json({ message: 'CloudNote server is running', time: new Date().toISOString() });
  });

  app.get('/api/public-config', (req, res) => {
    res.json({
      publicBaseUrl: PUBLIC_BASE_URL,
      maxUploadSizeMb: MAX_UPLOAD_SIZE_MB,
      maxUploadFiles: MAX_UPLOAD_FILES,
    });
  });

  app.post('/api/admin/login', (req, res) => {
    const ip = getAdminLoginIp(req);
    const failureRecord = getLoginFailureRecord(ip);
    if (failureRecord.lockedUntil > Date.now()) {
      return res.status(429).json({ message: msg('尝试次数过多，请稍后再试') });
    }

    if (req.body.password !== ADMIN_PASSWORD) {
      const nextFailureRecord = recordLoginFailure(ip);
      if (nextFailureRecord.lockedUntil > Date.now()) {
        return res.status(429).json({ message: msg('尝试次数过多，请稍后再试') });
      }
      return res.status(401).json({ message: msg('\u7ba1\u7406\u5458\u5bc6\u7801\u9519\u8bef') });
    }

    clearLoginFailure(ip);
    res.json({ message: msg('\u767b\u5f55\u6210\u529f'), token: createAdminToken(), expiresIn: ADMIN_SESSION_TTL_MS / 1000 });
  });
}

module.exports = registerAuthRoutes;
