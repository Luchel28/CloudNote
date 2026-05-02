const fs = require('fs');
const path = require('path');

const { UPLOAD_DIR } = require('../config');
const { msg } = require('./responseUtils');

fs.mkdirSync(UPLOAD_DIR, { recursive: true });

function decodeOriginalName(originalName) {
  const maybeMojibake = /[ÃÂÄÅÆÇÈÉÊËÌÍÎÏÐÑÒÓÔÕÖÙÚÛÜÝÞßàáâãäåæçèéêëìíîïðñòóôõöùúûüýþÿ]/.test(originalName);
  if (!maybeMojibake) return originalName;
  const decoded = Buffer.from(originalName, 'latin1').toString('utf8');
  return decoded.includes('\uFFFD') ? originalName : decoded;
}

function safeName(value) {
  return String(value || '')
    .trim()
    .replace(/[\\/:*?"<>|]+/g, '_')
    .replace(/\s+/g, '_')
    .slice(0, 90);
}

function makeStoredFilename(originalName) {
  const ext = path.extname(originalName);
  const base = safeName(path.basename(originalName, ext)) || 'homework';
  return `${Date.now()}-${Math.random().toString(16).slice(2)}-${base}${ext}`;
}

function sendStoredFile(res, filePath, filename) {
  const downloadName = String(filename || 'cloudnote-file');
  const fallbackName = safeName(downloadName) || 'cloudnote-file';
  res.setHeader('Content-Type', 'application/octet-stream');
  res.setHeader('Content-Disposition', `attachment; filename="${fallbackName}"; filename*=UTF-8''${encodeURIComponent(downloadName)}`);
  const stream = fs.createReadStream(filePath);
  stream.on('error', (error) => {
    console.error(error);
    if (!res.headersSent) {
      res.status(500).json({ message: msg('\u4e0b\u8f7d\u6587\u4ef6\u5931\u8d25') });
    } else {
      res.destroy(error);
    }
  });
  stream.pipe(res);
}

function buildUploadFilename(assignment, submitterData, originalFilename, index, uploadTime = new Date().toISOString()) {
  if (!assignment.renameEnabled) return originalFilename;
  const ext = path.extname(originalFilename);
  const originalBase = path.basename(originalFilename, ext);
  const tokenMap = {
    originalFilename: originalBase,
    submitterName: submitterData.studentName,
    uploadTime: uploadTime.replace(/[-:T.Z]/g, '').slice(0, 12),
  };
  const base =
    assignment.renameFields
      .map((fieldKey) => tokenMap[fieldKey] || submitterData[fieldKey])
      .filter(Boolean)
      .map(safeName)
      .join('_') || originalBase;
  const suffix = assignment.maxFiles > 1 ? `_${index + 1}` : '';
  return `${base}${suffix}${ext}`;
}

function getSubmittedFieldValue(body, key, type) {
  const raw = body[key];
  if (Array.isArray(raw)) {
    const values = raw.map((item) => String(item || '').trim()).filter(Boolean);
    return type === 'checkbox' || type === 'multiple_choice' ? values.join(', ') : values[0] || '';
  }
  return String(raw || '').trim();
}

function removeStoredFile(storedFilename) {
  if (!storedFilename) return;
  const filePath = path.join(UPLOAD_DIR, storedFilename);
  if (fs.existsSync(filePath)) fs.unlink(filePath, () => {});
}

function normalizeStoredFileKey(storedFilename) {
  const raw = String(storedFilename || '').trim();
  if (!raw) return '';
  if (path.isAbsolute(raw)) {
    const root = path.resolve(UPLOAD_DIR);
    const filePath = path.resolve(raw);
    if (filePath === root || !filePath.startsWith(`${root}${path.sep}`)) return '';
    return path.relative(root, filePath).replace(/\\/g, '/');
  }
  return raw.replace(/\\/g, '/').replace(/^\/+/, '');
}

function resolveStoredFilePath(storedFilename) {
  const key = normalizeStoredFileKey(storedFilename);
  if (!key) return null;
  const root = path.resolve(UPLOAD_DIR);
  const filePath = path.resolve(root, key);
  return filePath === root || !filePath.startsWith(`${root}${path.sep}`) ? null : filePath;
}

async function getFileSizeSafe(filePath) {
  try {
    const stat = await fs.promises.stat(filePath);
    return stat.isFile() ? stat.size : 0;
  } catch {
    return 0;
  }
}

async function scanDirectorySize(dirPath, rootPath = dirPath) {
  const result = { totalSize: 0, totalCount: 0, files: new Map() };
  let entries = [];
  try {
    entries = await fs.promises.readdir(dirPath, { withFileTypes: true });
  } catch {
    return result;
  }
  for (const entry of entries) {
    const entryPath = path.join(dirPath, entry.name);
    try {
      if (entry.isDirectory()) {
        const child = await scanDirectorySize(entryPath, rootPath);
        result.totalSize += child.totalSize;
        result.totalCount += child.totalCount;
        child.files.forEach((size, key) => result.files.set(key, size));
      } else if (entry.isFile()) {
        const stat = await fs.promises.stat(entryPath);
        const key = normalizeStoredFileKey(path.relative(rootPath, entryPath));
        result.totalSize += stat.size;
        result.totalCount += 1;
        result.files.set(key, stat.size);
      }
    } catch {
      // Skip files that cannot be read while keeping the rest of the summary usable.
    }
  }
  return result;
}

function cleanupUploadedFiles(files = {}) {
  Object.values(files)
    .flat()
    .forEach((file) => {
      if (file?.path) fs.unlink(file.path, () => {});
    });
}

module.exports = {
  decodeOriginalName,
  safeName,
  makeStoredFilename,
  sendStoredFile,
  buildUploadFilename,
  getSubmittedFieldValue,
  removeStoredFile,
  normalizeStoredFileKey,
  resolveStoredFilePath,
  getFileSizeSafe,
  scanDirectorySize,
  cleanupUploadedFiles,
};
