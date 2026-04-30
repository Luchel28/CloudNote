const path = require('path');

const ROOT_DIR = path.resolve(__dirname, '..');
const RECYCLE_RETENTION_DAYS = 7;

function parsePositiveInteger(value, fallback) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function resolveAppPath(value, fallback) {
  const target = String(value || fallback);
  return path.isAbsolute(target) ? target : path.resolve(ROOT_DIR, target);
}

function normalizeBaseUrl(value) {
  return String(value || '').trim().replace(/\/+$/, '');
}

function resolveAdminPassword() {
  const configured = process.env.ADMIN_PASSWORD;
  const password = configured === undefined ? 'admin123456' : String(configured).trim();
  if (process.env.NODE_ENV === 'production') {
    if (!password) {
      throw new Error('生产环境必须配置 ADMIN_PASSWORD，且不能为空。请检查 .env 后重新启动服务。');
    }
    if (password === 'admin123456') {
      throw new Error('生产环境不能使用默认管理员密码 admin123456。请在 .env 中设置强密码后重新启动服务。');
    }
  }
  return password || 'admin123456';
}

const PORT = parsePositiveInteger(process.env.PORT, 3000);
const ADMIN_PASSWORD = resolveAdminPassword();
const ADMIN_TOKEN_EXPIRE_HOURS = parsePositiveInteger(process.env.ADMIN_TOKEN_EXPIRE_HOURS, 12);
const ADMIN_SESSION_TTL_MS = ADMIN_TOKEN_EXPIRE_HOURS * 60 * 60 * 1000;
const PUBLIC_BASE_URL = normalizeBaseUrl(process.env.PUBLIC_BASE_URL || `http://localhost:${PORT}`);
const MAX_UPLOAD_SIZE_MB = parsePositiveInteger(process.env.MAX_UPLOAD_SIZE_MB, 500);
const MAX_UPLOAD_SIZE_BYTES = MAX_UPLOAD_SIZE_MB * 1024 * 1024;
const MAX_UPLOAD_FILES = parsePositiveInteger(process.env.MAX_UPLOAD_FILES, 20);
const UPLOAD_DIR = resolveAppPath(process.env.UPLOAD_DIR, './uploads');
const DB_PATH = resolveAppPath(process.env.CLOUDNOTE_DB_PATH, './cloudnote.db');

module.exports = {
  ROOT_DIR,
  PORT,
  ADMIN_PASSWORD,
  ADMIN_TOKEN_EXPIRE_HOURS,
  ADMIN_SESSION_TTL_MS,
  PUBLIC_BASE_URL,
  MAX_UPLOAD_SIZE_MB,
  MAX_UPLOAD_SIZE_BYTES,
  MAX_UPLOAD_FILES,
  UPLOAD_DIR,
  DB_PATH,
  RECYCLE_RETENTION_DAYS,
  parsePositiveInteger,
  resolveAppPath,
  normalizeBaseUrl,
};
