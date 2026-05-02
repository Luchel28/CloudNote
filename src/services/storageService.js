const fs = require('fs');

const { DB_PATH, UPLOAD_DIR } = require('../config');
const { allDb } = require('../db');
const { getFileSizeSafe, normalizeStoredFileKey, resolveStoredFilePath, scanDirectorySize } = require('../utils/fileUtils');

async function getStorageSummary() {
  const uploadsScan = await scanDirectorySize(UPLOAD_DIR);
  const rows = await allDb(`
    SELECT
      sf.id,
      sf.stored_filename AS storedFilename,
      sf.deleted_at AS fileDeletedAt,
      s.deleted_at AS submissionDeletedAt,
      a.status AS assignmentStatus
    FROM submission_files sf
    LEFT JOIN submissions s ON s.id = sf.submission_id
    LEFT JOIN assignments a ON a.id = sf.assignment_id
  `);
  const dbFileKeys = new Set();
  const activeFileKeys = new Set();
  const trashFileKeys = new Set();
  let activeFilesSize = 0;
  let trashFilesSize = 0;
  let missingFilesCount = 0;

  for (const row of rows) {
    const key = normalizeStoredFileKey(row.storedFilename);
    if (!key) {
      missingFilesCount += 1;
      continue;
    }
    dbFileKeys.add(key);
    const filePath = resolveStoredFilePath(key);
    const hasScannedFile = uploadsScan.files.has(key);
    const scannedSize = uploadsScan.files.get(key);
    const fileExists = hasScannedFile || Boolean(filePath && fs.existsSync(filePath));
    if (!fileExists) {
      missingFilesCount += 1;
      continue;
    }
    const actualSize = hasScannedFile ? scannedSize : await getFileSizeSafe(filePath);
    const isTrash = Boolean(row.fileDeletedAt || row.submissionDeletedAt || row.assignmentStatus === 'deleted');
    if (isTrash) {
      if (!trashFileKeys.has(key)) {
        trashFileKeys.add(key);
        trashFilesSize += actualSize;
      }
    } else if (!activeFileKeys.has(key)) {
      activeFileKeys.add(key);
      activeFilesSize += actualSize;
    }
  }

  let orphanFilesCount = 0;
  uploadsScan.files.forEach((size, key) => {
    if (!dbFileKeys.has(key)) orphanFilesCount += 1;
  });

  return {
    uploadsTotalSize: uploadsScan.totalSize,
    activeFilesSize,
    trashFilesSize,
    databaseSize: await getFileSizeSafe(DB_PATH),
    totalFilesCount: uploadsScan.totalCount,
    activeFilesCount: activeFileKeys.size,
    trashFilesCount: trashFileKeys.size,
    cleanableSize: trashFilesSize,
    missingFilesCount,
    orphanFilesCount,
  };
}

module.exports = {
  getStorageSummary,
};
