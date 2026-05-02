const express = require('express');
const path = require('path');
const multer = require('multer');
require('dotenv').config();

const { DB_PATH, MAX_UPLOAD_FILES, MAX_UPLOAD_SIZE_MB, PORT, PUBLIC_BASE_URL, ROOT_DIR, UPLOAD_DIR } = require('./src/config');
const { initDatabase } = require('./src/db');
const { cleanupExpiredRecycleItems } = require('./src/services/recycleService');
const registerAuthRoutes = require('./src/routes/authRoutes');
const registerAssignmentRoutes = require('./src/routes/assignmentRoutes');
const registerTemplateRoutes = require('./src/routes/templateRoutes');
const registerUploadRoutes = require('./src/routes/uploadRoutes');
const registerSubmissionRoutes = require('./src/routes/submissionRoutes');
const registerStorageRoutes = require('./src/routes/storageRoutes');
const registerStatisticsRoutes = require('./src/routes/statisticsRoutes');
const registerRecycleRoutes = require('./src/routes/recycleRoutes');
const registerDownloadRoutes = require('./src/routes/downloadRoutes');
const { msg } = require('./src/utils/responseUtils');

const app = express();

// Security headers (CSP)
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader(
    'Content-Security-Policy',
    "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline' https://at.alicdn.com; font-src 'self' https://at.alicdn.com; img-src 'self' data: blob:; connect-src 'self'; frame-ancestors 'none'"
  );
  next();
});

app.use(express.urlencoded({ extended: true }));
app.use(express.json({ limit: '10mb' }));
app.use(
  express.static(path.join(ROOT_DIR, 'public'), {
    etag: false,
    maxAge: 0,
    setHeaders: (res) => {
      res.setHeader('Cache-Control', 'no-store');
    },
  })
);

registerAuthRoutes(app);
registerAssignmentRoutes(app);
registerTemplateRoutes(app);
registerUploadRoutes(app);
registerSubmissionRoutes(app);
registerStorageRoutes(app);
registerStatisticsRoutes(app);
registerRecycleRoutes(app);
registerDownloadRoutes(app);

app.use((error, req, res, next) => {
  if (error instanceof multer.MulterError) {
    if (error.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({ message: msg(`单个文件不能超过 ${MAX_UPLOAD_SIZE_MB} MB`) });
    }
    if (error.code === 'LIMIT_FILE_COUNT' || error.code === 'LIMIT_UNEXPECTED_FILE') {
      return res.status(400).json({ message: msg(`最多只能上传 ${MAX_UPLOAD_FILES} 个文件`) });
    }
    return res.status(400).json({ message: msg('上传请求不符合要求，请检查文件后重试') });
  }
  console.error(error);
  res.status(500).json({ message: msg('\u670d\u52a1\u5668\u5185\u90e8\u9519\u8bef') });
});

initDatabase()
  .then(async () => {
    cleanupExpiredRecycleItems().catch((error) => console.error('Failed to cleanup expired recycle items:', error));
    setInterval(
      () => {
        cleanupExpiredRecycleItems().catch((error) => console.error('Failed to cleanup expired recycle items:', error));
      },
      24 * 60 * 60 * 1000
    );
    app.listen(PORT, () => {
      console.log(`CloudNote server is running at ${PUBLIC_BASE_URL}`);
      console.log(`Uploads directory: ${UPLOAD_DIR}`);
      console.log(`Database path: ${DB_PATH}`);
    });
  })
  .catch((error) => {
    console.error('Failed to initialize database:', error);
    process.exit(1);
  });
