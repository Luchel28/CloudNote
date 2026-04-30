const fs = require('fs');
const path = require('path');
const multer = require('multer');

const {
  MAX_UPLOAD_FILES,
  MAX_UPLOAD_SIZE_BYTES,
  MAX_UPLOAD_SIZE_MB,
  UPLOAD_DIR,
} = require('../config');
const {
  beginTransaction,
  commitTransaction,
  getDb,
  rollbackTransaction,
  runDb,
  allDb,
} = require('../db');
const {
  assignmentSelectSql,
  formatAssignment,
  getEffectiveStatus,
  parseJson,
  validateSubmittedFieldValue,
} = require('../utils/assignmentUtils');
const {
  buildUploadFilename,
  cleanupUploadedFiles,
  decodeOriginalName,
  getSubmittedFieldValue,
  makeStoredFilename,
  removeStoredFile,
} = require('../utils/fileUtils');
const { msg } = require('../utils/responseUtils');
const { getSubmissionStoredFiles } = require('../services/recycleService');

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOAD_DIR),
  filename: (req, file, cb) => {
    file.decodedOriginalName = decodeOriginalName(file.originalname);
    cb(null, makeStoredFilename(file.decodedOriginalName));
  },
});

const upload = multer({
  storage,
  limits: { fileSize: MAX_UPLOAD_SIZE_BYTES, files: MAX_UPLOAD_FILES },
});

function sendUploadMiddlewareError(error, req, res) {
  cleanupUploadedFiles(req.files);
  if (error instanceof multer.MulterError) {
    const messages = {
      LIMIT_FILE_COUNT: `最多只能上传 ${MAX_UPLOAD_FILES} 个文件`,
      LIMIT_UNEXPECTED_FILE: `最多只能上传 ${MAX_UPLOAD_FILES} 个文件`,
      LIMIT_FILE_SIZE: `单个文件不能超过 ${MAX_UPLOAD_SIZE_MB} MB`,
      LIMIT_FIELD_COUNT: '提交字段过多，请减少填写内容后重试',
      LIMIT_FIELD_VALUE: '提交内容过长，请缩短后重试',
      LIMIT_PART_COUNT: '提交内容过多，请减少文件或字段后重试',
    };
    return res.status(400).json({ message: msg(messages[error.code] || '上传请求不符合要求，请检查文件后重试') });
  }
  console.error(error);
  return res.status(500).json({ message: msg('上传失败，请稍后重试') });
}

const uploadAssignmentFiles = upload.fields([{ name: 'files', maxCount: MAX_UPLOAD_FILES }, { name: 'homeworkFile', maxCount: MAX_UPLOAD_FILES }]);

function getNormalizedFieldText(field, prop) {
  return String(field?.[prop] || '').trim();
}

function isNameIdentityField(field) {
  return getNormalizedFieldText(field, 'key') === 'studentName'
    || getNormalizedFieldText(field, 'type') === 'name'
    || getNormalizedFieldText(field, 'label') === '姓名'
    || getNormalizedFieldText(field, 'name') === '姓名';
}

function isStudentIdIdentityField(field) {
  return getNormalizedFieldText(field, 'key') === 'studentId'
    || getNormalizedFieldText(field, 'label') === '学号'
    || getNormalizedFieldText(field, 'name') === '学号';
}

function isPhoneIdentityField(field) {
  return getNormalizedFieldText(field, 'key') === 'phone'
    || getNormalizedFieldText(field, 'type') === 'phone'
    || getNormalizedFieldText(field, 'label') === '手机号'
    || getNormalizedFieldText(field, 'name') === '手机号';
}

function isEmailIdentityField(field) {
  return getNormalizedFieldText(field, 'key') === 'email'
    || getNormalizedFieldText(field, 'type') === 'email'
    || getNormalizedFieldText(field, 'label') === '邮箱'
    || getNormalizedFieldText(field, 'name') === '邮箱';
}

function isSubmissionIdentityField(field) {
  return field?.enabled !== false && field?.visible !== false && (
    isNameIdentityField(field)
    || isStudentIdIdentityField(field)
    || isPhoneIdentityField(field)
    || isEmailIdentityField(field)
  );
}

function getIdentityFieldValue(fields, submitterData, matcher) {
  const field = fields.find((item) => item?.enabled !== false && item?.visible !== false && matcher(item));
  if (!field?.key) return '';
  return String(submitterData[field.key] ?? '').trim();
}

function getDuplicateIdentityEntries(assignment, submitterData) {
  return assignment.fieldConfig
    .filter(isSubmissionIdentityField)
    .map((field) => ({
      key: field.key,
      value: String(submitterData[field.key] ?? '').trim(),
    }))
    .filter((item) => item.key && item.value);
}

async function findDuplicateSubmissionIds(assignment, identityEntries) {
  if (!identityEntries.length) return [];
  const candidates = await allDb(
    'SELECT id, student_name AS studentName, student_id AS studentId, submitter_data AS submitterData FROM submissions WHERE assignment_id = ? AND deleted_at IS NULL',
    [assignment.id]
  );
  return candidates
    .filter((candidate) => {
      const data = parseJson(candidate.submitterData, {});
      const mergedData = {
        ...data,
        studentName: data.studentName || candidate.studentName || '',
        studentId: data.studentId || candidate.studentId || '',
      };
      return identityEntries.every((entry) => String(mergedData[entry.key] ?? '').trim() === entry.value);
    })
    .map((candidate) => Number(candidate.id))
    .filter(Number.isInteger);
}

function registerUploadRoutes(app) {
  app.post('/api/upload', (req, res, next) => {
    uploadAssignmentFiles(req, res, (error) => {
      if (error) return sendUploadMiddlewareError(error, req, res);
      return next();
    });
  }, async (req, res) => {
    const uploadedFiles = [...(req.files?.files || []), ...(req.files?.homeworkFile || [])];
    let activeAssignment = null;
    let transactionStarted = false;
    try {
      const assignmentId = Number(req.body.assignmentId);
      if (!Number.isInteger(assignmentId)) throw new Error('INVALID_ASSIGNMENT');
      const row = await getDb(`${assignmentSelectSql('WHERE a.id = ?')} GROUP BY a.id`, [assignmentId]);
      const assignment = formatAssignment(row);
      activeAssignment = assignment;
      if (!assignment || assignment.status === 'deleted') throw new Error('ASSIGNMENT_NOT_FOUND');

      const now = new Date();
      const isLate = Boolean(assignment.deadline && new Date(assignment.deadline).getTime() < now.getTime());
      if (getEffectiveStatus(assignment) !== 'ongoing' && !(isLate && assignment.allowLate)) throw new Error('TASK_CLOSED');
      if (isLate && !assignment.allowLate) throw new Error('LATE_NOT_ALLOWED');
      if (uploadedFiles.length === 0 && assignment.requiredUpload) throw new Error('NO_FILE');
      const effectiveMaxFiles = assignment.enableLimit ? Math.min(Number(assignment.maxFiles || 1), MAX_UPLOAD_FILES) : MAX_UPLOAD_FILES;
      if (uploadedFiles.length > effectiveMaxFiles) throw new Error('TOO_MANY_FILES');

      const allowed = new Set(assignment.allowedExtensions.map((ext) => ext.toLowerCase()));
      for (const file of uploadedFiles) {
        const ext = path.extname(file.decodedOriginalName || file.originalname).replace(/^\./, '').toLowerCase();
        if (allowed.size && !allowed.has(ext)) throw new Error('BAD_EXT');
        if (assignment.enableLimit && file.size > Math.min(Number(assignment.maxFileSizeMb || MAX_UPLOAD_SIZE_MB), MAX_UPLOAD_SIZE_MB) * 1024 * 1024) throw new Error('FILE_TOO_LARGE');
      }

      const submitterData = {};
      for (const field of assignment.fieldConfig.filter((item) => item.enabled !== false && item.visible !== false)) {
        const value = getSubmittedFieldValue(req.body, field.key, field.type);
        validateSubmittedFieldValue(field, value);
        submitterData[field.key] = value;
      }

      const studentName = submitterData.studentName || getIdentityFieldValue(assignment.fieldConfig, submitterData, isNameIdentityField) || '';
      const studentId = submitterData.studentId || getIdentityFieldValue(assignment.fieldConfig, submitterData, isStudentIdIdentityField) || '';
      const homeworkTitle = submitterData.homeworkTitle || assignment.title;
      let duplicateIds = [];
      const identityEntries = getDuplicateIdentityEntries(assignment, submitterData);
      if (identityEntries.length > 0) {
        duplicateIds = await findDuplicateSubmissionIds(assignment, identityEntries);
        if (duplicateIds.length > 0 && !assignment.allowRepeat) throw new Error('DUPLICATE_NOT_ALLOWED');
      }
      const shouldOverwriteDuplicates = duplicateIds.length > 0 && assignment.allowRepeat && assignment.repeatMode === 'overwrite';
      const oldFilesToRemove = shouldOverwriteDuplicates ? await getSubmissionStoredFiles(duplicateIds) : [];

      const uploadTime = now.toISOString();
      const firstFile = uploadedFiles[0];
      const firstOriginal = firstFile ? (firstFile.decodedOriginalName || firstFile.originalname) : '';
      const firstStored = firstFile ? firstFile.filename : '';
      await beginTransaction();
      transactionStarted = true;
      if (shouldOverwriteDuplicates) {
        const placeholders = duplicateIds.map(() => '?').join(',');
        await runDb(`DELETE FROM submission_files WHERE submission_id IN (${placeholders})`, duplicateIds);
        await runDb(`DELETE FROM submissions WHERE id IN (${placeholders})`, duplicateIds);
      }
      const result = await runDb(
        `
          INSERT INTO submissions (
            student_name, student_id, homework_title, original_filename, stored_filename,
            upload_time, assignment_id, submitter_data, is_late
          )
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `,
        [studentName, studentId, homeworkTitle, firstOriginal, firstStored, uploadTime, assignment.id, JSON.stringify(submitterData), isLate ? 1 : 0]
      );

      const savedFiles = [];
      for (let index = 0; index < uploadedFiles.length; index += 1) {
        const file = uploadedFiles[index];
        const original = file.decodedOriginalName || file.originalname;
        const displayName = buildUploadFilename(assignment, submitterData, original, index, uploadTime);
        await runDb(
          `
            INSERT INTO submission_files (
              submission_id, assignment_id, original_filename, stored_filename, file_size, mime_type, created_at
            )
            VALUES (?, ?, ?, ?, ?, ?, ?)
          `,
          [result.lastID, assignment.id, displayName, file.filename, file.size, file.mimetype, uploadTime]
        );
        savedFiles.push({ originalFilename: displayName, size: file.size });
      }

      await commitTransaction();
      transactionStarted = false;
      oldFilesToRemove.forEach(removeStoredFile);

      res.status(201).json({
        message: msg('\u63d0\u4ea4\u6210\u529f'),
        id: result.lastID,
        assignmentTitle: assignment.title,
        submittedAt: uploadTime,
        submitterData,
        files: savedFiles,
      });
    } catch (error) {
      if (transactionStarted) await rollbackTransaction();
      uploadedFiles.forEach((file) => fs.unlink(file.path, () => {}));
      const map = {
        INVALID_ASSIGNMENT: '\u4efb\u52a1 ID \u65e0\u6548',
        ASSIGNMENT_NOT_FOUND: '\u4efb\u52a1\u4e0d\u5b58\u5728',
        TASK_CLOSED: '\u8be5\u4efb\u52a1\u5df2\u7ed3\u675f\uff0c\u4e0d\u80fd\u7ee7\u7eed\u63d0\u4ea4',
        LATE_NOT_ALLOWED: '\u5df2\u8d85\u8fc7\u622a\u6b62\u65f6\u95f4\uff0c\u4e0d\u5141\u8bb8\u903e\u671f\u63d0\u4ea4',
        NO_FILE: '\u8bf7\u9009\u62e9\u6587\u4ef6',
        TOO_MANY_FILES: `最多只能上传 ${activeAssignment?.enableLimit ? Math.min(Number(activeAssignment.maxFiles || 1), MAX_UPLOAD_FILES) : MAX_UPLOAD_FILES} 个文件`,
        BAD_EXT: '\u6587\u4ef6\u683c\u5f0f\u4e0d\u7b26\u5408\u8981\u6c42',
        FILE_TOO_LARGE: `单个文件不能超过 ${activeAssignment?.enableLimit ? Math.min(Number(activeAssignment.maxFileSizeMb || MAX_UPLOAD_SIZE_MB), MAX_UPLOAD_SIZE_MB) : MAX_UPLOAD_SIZE_MB} MB`,
        DUPLICATE_NOT_ALLOWED: '\u4e0d\u5141\u8bb8\u91cd\u590d\u63d0\u4ea4',
      };
      if (error.message.startsWith('FIELD_VALIDATION:')) return res.status(400).json({ message: error.message.slice(17) });
      if (error.message.startsWith('REQUIRED:')) return res.status(400).json({ message: `${error.message.slice(9)}\u4e0d\u80fd\u4e3a\u7a7a` });
      if (error.message.startsWith('DIGIT_NUMBER:')) return res.status(400).json({ message: `${error.message.slice(13)}只能填写阿拉伯数字` });
      if (error.message.startsWith('NUMBER:')) return res.status(400).json({ message: `${error.message.slice(7)}\u5fc5\u987b\u662f\u6570\u5b57` });
      if (error.message.startsWith('DIGITS:')) {
        const [, label, length] = error.message.split(':');
        return res.status(400).json({ message: `${label}需填写 ${length} 位数字` });
      }
      if (error.message.startsWith('RANGE:')) return res.status(400).json({ message: `${error.message.slice(6)}超出允许的数值范围` });
      if (error.message.startsWith('FORMAT:')) return res.status(400).json({ message: `${error.message.slice(7)}格式不正确` });
      if (error.message.startsWith('MAXLEN:')) {
        const [, label, max] = error.message.split(':');
        return res.status(400).json({ message: `${label}不能超过 ${max} 位` });
      }
      if (map[error.message]) return res.status(400).json({ message: map[error.message] });
      console.error(error);
      res.status(500).json({ message: msg('\u4fdd\u5b58\u63d0\u4ea4\u8bb0\u5f55\u5931\u8d25') });
    }
  });
}

module.exports = registerUploadRoutes;
