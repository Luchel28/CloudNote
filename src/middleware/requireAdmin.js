const crypto = require('crypto');

const {
  ADMIN_SESSION_TTL_MS,
} = require('../config');
const { msg } = require('../utils/responseUtils');

const tokenStore = new Map();
const loginFailureStore = new Map();
const ADMIN_LOGIN_MAX_FAILURES = 5;
const ADMIN_LOGIN_LOCK_MS = 10 * 60 * 1000;

function pruneExpiredAdminSessions(now = Date.now()) {
  for (const [token, session] of tokenStore.entries()) {
    if (!session || session.expiresAt <= now) tokenStore.delete(token);
  }
}

function createAdminToken() {
  pruneExpiredAdminSessions();
  const token = crypto.randomBytes(32).toString('hex');
  const createdAt = Date.now();
  tokenStore.set(token, {
    token,
    createdAt,
    expiresAt: createdAt + ADMIN_SESSION_TTL_MS,
  });
  return token;
}

function requireAdmin(req, res, next) {
  const token = String(req.headers['x-admin-token'] || '');
  if (!token) {
    return res.status(401).json({ message: msg('\u8bf7\u5148\u767b\u5f55\u540e\u53f0') });
  }
  const session = tokenStore.get(token);
  if (!session || session.expiresAt <= Date.now()) {
    tokenStore.delete(token);
    return res.status(401).json({ message: msg('\u767b\u5f55\u5df2\u8fc7\u671f\uff0c\u8bf7\u91cd\u65b0\u767b\u5f55') });
  }
  session.expiresAt = Date.now() + ADMIN_SESSION_TTL_MS;
  next();
}

function getAdminLoginIp(req) {
  const forwarded = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim();
  return forwarded || req.ip || req.socket?.remoteAddress || 'unknown';
}

function getLoginFailureRecord(ip, now = Date.now()) {
  const record = loginFailureStore.get(ip);
  if (!record) return { count: 0, lockedUntil: 0 };
  if (record.lockedUntil && record.lockedUntil <= now) {
    loginFailureStore.delete(ip);
    return { count: 0, lockedUntil: 0 };
  }
  return record;
}

function recordLoginFailure(ip, now = Date.now()) {
  const record = getLoginFailureRecord(ip, now);
  const nextRecord = {
    count: Number(record.count || 0) + 1,
    lockedUntil: Number(record.lockedUntil || 0),
  };
  if (nextRecord.count >= ADMIN_LOGIN_MAX_FAILURES) {
    nextRecord.lockedUntil = now + ADMIN_LOGIN_LOCK_MS;
  }
  loginFailureStore.set(ip, nextRecord);
  return nextRecord;
}

function clearLoginFailure(ip) {
  loginFailureStore.delete(ip);
}

module.exports = {
  requireAdmin,
  createAdminToken,
  getAdminLoginIp,
  getLoginFailureRecord,
  recordLoginFailure,
  clearLoginFailure,
};
