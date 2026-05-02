const crypto = require('crypto');

const { MAX_UPLOAD_FILES, MAX_UPLOAD_SIZE_MB } = require('../config');

const VALID_STATUSES = new Set(['ongoing', 'ended', 'archived', 'deleted', 'completed', 'expired']);
const BASIC_FIELD_TYPES = ['name', 'phone', 'idcard', 'email', 'birth_date'];
const CUSTOM_FIELD_TYPES = ['single_line', 'numeric', 'digits', 'single_choice', 'multiple_choice', 'multi_line', 'datetime', 'positive_integer'];
const VALID_FIELD_TYPES = new Set([...BASIC_FIELD_TYPES, ...CUSTOM_FIELD_TYPES]);
const BASIC_FIELD_LABELS = {
  name: '姓名',
  phone: '手机号',
  idcard: '身份证号',
  email: '邮箱',
  birth_date: '出生日期',
};
const BASIC_FIELD_KEYS = {
  name: 'studentName',
  phone: 'phone',
  idcard: 'idcard',
  email: 'email',
  birth_date: 'birthDate',
};
const LEGACY_FIELD_TYPE_MAP = {
  tel: 'phone',
  date: 'birth_date',
  radio: 'single_choice',
  checkbox: 'multiple_choice',
  textarea: 'multi_line',
  number_digits: 'digits',
  number_value: 'numeric',
};
const DEFAULT_ALLOWED_EXTENSIONS = ['doc', 'docx', 'pdf', 'zip', 'rar', 'jpg', 'png'];
const DEFAULT_FIELD_CONFIG = [];

function generateShareCode() {
  return crypto.randomBytes(16).toString('hex');
}

function normalizeShareCode(value) {
  const code = String(value || '').trim();
  return /^[A-Za-z0-9_-]{8,64}$/.test(code) ? code : '';
}

function parseJson(value, fallback) {
  if (Array.isArray(value) || (value && typeof value === 'object')) return value;
  if (typeof value !== 'string' || value.trim() === '') return fallback;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

function normalizeStatus(status) {
  if (status === 'completed') return 'ended';
  if (status === 'expired') return 'ended';
  return VALID_STATUSES.has(status) ? status : 'ongoing';
}

function normalizeFieldKey(label, index) {
  const base = String(label || '')
    .trim()
    .replace(/[^\w\u4e00-\u9fa5]+/g, '_')
    .replace(/^_+|_+$/g, '');
  return base || `customField${index + 1}`;
}

function isBasicFieldType(type) {
  return BASIC_FIELD_TYPES.includes(type);
}

function getFieldCategory(type) {
  return isBasicFieldType(type) ? 'basic' : 'custom';
}

function normalizeFieldType(field = {}) {
  const rawType = String(field.type || '').trim();
  if (VALID_FIELD_TYPES.has(rawType)) return rawType;
  if (rawType === 'number') return field.numberRuleMode === 'digits' ? 'digits' : 'numeric';
  if (LEGACY_FIELD_TYPE_MAP[rawType]) return LEGACY_FIELD_TYPE_MAP[rawType];
  const label = String(field.name || field.label || '').trim();
  const key = String(field.key || field.id || '').trim();
  if (key === 'studentName' || label === '姓名') return 'name';
  if (key === 'studentId' || label === '学号') return 'digits';
  if (label === '手机号') return 'phone';
  if (label === '身份证号' || label === '身份证号码') return 'idcard';
  if (label === '邮箱') return 'email';
  if (label === '出生日期') return 'birth_date';
  if (label === '多行文本') return 'multi_line';
  return 'single_line';
}

function splitOptions(value) {
  return Array.isArray(value)
    ? value.map((option) => String(option || '').trim()).filter(Boolean)
    : String(value || '')
        .split(/[,，\n]/)
        .map((option) => option.trim())
        .filter(Boolean);
}

function normalizeNumberRuleValue(value) {
  if (value === undefined || value === null) return '';
  const text = String(value).trim();
  return text === '' ? '' : text;
}

function normalizeFieldRules(type, field = {}) {
  const sourceRules = field.rules && typeof field.rules === 'object' ? field.rules : {};
  if (type === 'numeric') {
    return {
      min: normalizeNumberRuleValue(sourceRules.min ?? field.minValue),
      max: normalizeNumberRuleValue(sourceRules.max ?? field.maxValue),
    };
  }
  if (type === 'digits') {
    const length = sourceRules.length ?? field.digitLength ?? (String(field.name || field.label || '') === '学号' ? field.maxLength : '');
    return { length: normalizeNumberRuleValue(length) };
  }
  if (type === 'single_choice' || type === 'multiple_choice') {
    return { options: splitOptions(sourceRules.options ?? field.options) };
  }
  return {};
}

function getNormalizedFieldLabel(type, field, index) {
  if (isBasicFieldType(type)) return BASIC_FIELD_LABELS[type];
  return (
    String(field.name || field.label || '').trim() ||
    {
      single_line: '单行文本',
      numeric: '纯数值',
      digits: '纯数字',
      single_choice: '单选',
      multiple_choice: '多选',
      multi_line: '多行文本',
      datetime: '日期和时间',
      positive_integer: '正整数',
    }[type] ||
    `信息${index + 1}`
  );
}

function normalizeFieldConfig(value) {
  const source = parseJson(value, DEFAULT_FIELD_CONFIG);
  if (!Array.isArray(source)) return DEFAULT_FIELD_CONFIG;

  const used = new Set();
  const fields = source.map((field, index) => {
    const type = normalizeFieldType(field);
    const category = getFieldCategory(type);
    const label = getNormalizedFieldLabel(type, field, index);
    const preferredKey = category === 'basic' ? BASIC_FIELD_KEYS[type] : field.key || field.id || normalizeFieldKey(label, index);
    let key = preferredKey;
    key = String(key).replace(/[^\w]/g, '') || `customField${index + 1}`;
    while (used.has(key)) key = `${key}${index + 1}`;
    used.add(key);
    const rules = normalizeFieldRules(type, field);

    return {
      key,
      id: field.id || key,
      name: label,
      label,
      type,
      category,
      enabled: field.enabled !== false,
      visible: field.visible !== false,
      required: Boolean(field.required),
      maxLength: undefined,
      numberRuleMode: type === 'digits' ? 'digits' : type === 'numeric' ? 'range' : '',
      minValue: rules.min ?? '',
      maxValue: rules.max ?? '',
      digitLength: rules.length ? Number(rules.length) : undefined,
      placeholder: String(field.placeholder || '').trim(),
      helpText: String(field.helpText || field.description || '').trim(),
      options: rules.options || [],
      rules,
      system: category === 'basic',
    };
  });

  return fields.filter((field) => field.enabled !== false && field.visible !== false);
}

function isValidNumberText(value) {
  return /^-?\d+(\.\d+)?$/.test(String(value || '').trim());
}

function isValidIntegerText(value) {
  return /^\d+$/.test(String(value || '').trim());
}

function parseStrictDateParts(value) {
  const match = String(value || '')
    .trim()
    .match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(year, month - 1, day);
  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) return null;
  return { year, month, day, date };
}

function isValidBirthDate(value) {
  const parsed = parseStrictDateParts(value);
  if (!parsed) return false;
  const min = new Date(1900, 0, 1);
  const today = new Date();
  today.setHours(23, 59, 59, 999);
  return parsed.date >= min && parsed.date <= today;
}

function isValidDateTime(value) {
  const match = String(value || '')
    .trim()
    .match(/^(\d{4}-\d{2}-\d{2})[ T](\d{2}):(\d{2})$/);
  if (!match) return false;
  if (!parseStrictDateParts(match[1])) return false;
  const hour = Number(match[2]);
  const minute = Number(match[3]);
  return hour >= 0 && hour <= 23 && minute >= 0 && minute <= 59;
}

function isValidIdCard(value) {
  const text = String(value || '').trim();
  if (/^\d{15}$/.test(text)) {
    const birth = `19${text.slice(6, 8)}-${text.slice(8, 10)}-${text.slice(10, 12)}`;
    return Boolean(parseStrictDateParts(birth));
  }
  if (!/^\d{17}[\dXx]$/.test(text)) return false;
  const birth = `${text.slice(6, 10)}-${text.slice(10, 12)}-${text.slice(12, 14)}`;
  if (!parseStrictDateParts(birth)) return false;
  const weights = [7, 9, 10, 5, 8, 4, 2, 1, 6, 3, 7, 9, 10, 5, 8, 4, 2];
  const codes = ['1', '0', 'X', '9', '8', '7', '6', '5', '4', '3', '2'];
  const sum = text
    .slice(0, 17)
    .split('')
    .reduce((total, char, index) => total + Number(char) * weights[index], 0);
  return codes[sum % 11] === text[17].toUpperCase();
}

function validateChoiceOptions(field, minCount) {
  const options = splitOptions(field.rules?.options ?? field.options);
  if (options.length < minCount) return `${field.label}至少配置 ${minCount} 个选项`;
  if (options.some((option) => option.length < 1 || option.length > 50)) return `${field.label}每个选项长度需为 1-50`;
  if (new Set(options).size !== options.length) return `${field.label}选项不可重复`;
  return '';
}

function validateFieldConfig(fields) {
  const source = Array.isArray(fields) ? fields : normalizeFieldConfig(fields);
  const seenBasic = new Set();
  for (const field of source) {
    if (!field.label || !String(field.label).trim()) throw new Error('FIELD_CONFIG_INVALID:信息名称不能为空');
    if (!VALID_FIELD_TYPES.has(field.type)) throw new Error(`FIELD_CONFIG_INVALID:${field.label}的信息类型不正确`);
    if (isBasicFieldType(field.type)) {
      if (field.label !== BASIC_FIELD_LABELS[field.type]) throw new Error('FIELD_CONFIG_INVALID:基础类型信息名称不可修改');
      if (seenBasic.has(field.type)) throw new Error('FIELD_CONFIG_INVALID:该基础类型已存在');
      seenBasic.add(field.type);
    }
    if (field.type === 'numeric') {
      const min = normalizeNumberRuleValue(field.rules?.min ?? field.minValue);
      const max = normalizeNumberRuleValue(field.rules?.max ?? field.maxValue);
      if (min !== '' && !isValidNumberText(min)) throw new Error(`FIELD_CONFIG_INVALID:${field.label}最小值必须是合法数值`);
      if (max !== '' && !isValidNumberText(max)) throw new Error(`FIELD_CONFIG_INVALID:${field.label}最大值必须是合法数值`);
      if (min !== '' && max !== '' && Number(min) > Number(max)) throw new Error(`FIELD_CONFIG_INVALID:${field.label}最小值不能大于最大值`);
    }
    if (field.type === 'digits') {
      const length = normalizeNumberRuleValue(field.rules?.length ?? field.digitLength);
      if (length !== '' && (!/^\d+$/.test(length) || Number(length) < 1 || Number(length) > 30)) {
        throw new Error(`FIELD_CONFIG_INVALID:${field.label}数字长度需为 1-30`);
      }
    }
    if (field.type === 'single_choice') {
      const error = validateChoiceOptions(field, 2);
      if (error) throw new Error(`FIELD_CONFIG_INVALID:${error}`);
    }
    if (field.type === 'multiple_choice') {
      const error = validateChoiceOptions(field, 3);
      if (error) throw new Error(`FIELD_CONFIG_INVALID:${error}`);
    }
  }
  return source;
}

function validateSubmittedFieldValue(field, value) {
  const label = field.label || field.name || '信息';
  const text = String(value || '').trim();
  if (field.required && !text) throw new Error(`FIELD_VALIDATION:${label}不能为空`);
  if (!text) return true;

  if (field.type === 'name' && !(/^[\u4e00-\u9fa5]{1,5}$/.test(text) || (/^[A-Za-z\s]{1,20}$/.test(text) && /[A-Za-z]/.test(text)))) {
    throw new Error(`FIELD_VALIDATION:${label}格式不正确`);
  }
  if (field.type === 'phone' && !/^1[3-9]\d{9}$/.test(text)) throw new Error(`FIELD_VALIDATION:${label}格式不正确`);
  if (field.type === 'idcard' && !isValidIdCard(text)) throw new Error(`FIELD_VALIDATION:${label}格式不正确`);
  if (field.type === 'email' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(text)) throw new Error(`FIELD_VALIDATION:${label}格式不正确`);
  if (field.type === 'birth_date' && !isValidBirthDate(text)) throw new Error(`FIELD_VALIDATION:${label}必须是 1900-01-01 至今天的真实日期`);
  if (field.type === 'single_line' && (text.length < 1 || text.length > 50)) throw new Error(`FIELD_VALIDATION:${label}长度需为 1-50 字`);
  if (field.type === 'multi_line' && (text.length < 1 || text.length > 1000)) throw new Error(`FIELD_VALIDATION:${label}长度需为 1-1000 字`);
  if (field.type === 'numeric') {
    if (!isValidNumberText(text)) throw new Error(`FIELD_VALIDATION:${label}必须是合法数值`);
    const numberValue = Number(text);
    const min = normalizeNumberRuleValue(field.rules?.min ?? field.minValue);
    const max = normalizeNumberRuleValue(field.rules?.max ?? field.maxValue);
    if (min !== '' && numberValue < Number(min)) throw new Error(`FIELD_VALIDATION:${label}不能小于${min}`);
    if (max !== '' && numberValue > Number(max)) throw new Error(`FIELD_VALIDATION:${label}不能大于${max}`);
  }
  if (field.type === 'digits') {
    if (!isValidIntegerText(text)) throw new Error(`FIELD_VALIDATION:${label}只能填写阿拉伯数字`);
    const length = normalizeNumberRuleValue(field.rules?.length ?? field.digitLength);
    if (length !== '' && text.length !== Number(length)) throw new Error(`FIELD_VALIDATION:${label}需填写 ${length} 位数字`);
  }
  if (field.type === 'single_choice') {
    const options = splitOptions(field.rules?.options ?? field.options);
    if (!options.includes(text)) throw new Error(`FIELD_VALIDATION:${label}选项不正确`);
  }
  if (field.type === 'multiple_choice') {
    const options = splitOptions(field.rules?.options ?? field.options);
    const values = splitOptions(text);
    if (field.required && !values.length) throw new Error(`FIELD_VALIDATION:${label}不能为空`);
    if (new Set(values).size !== values.length) throw new Error(`FIELD_VALIDATION:${label}不能重复选择`);
    if (values.some((item) => !options.includes(item))) throw new Error(`FIELD_VALIDATION:${label}选项不正确`);
  }
  if (field.type === 'datetime' && !isValidDateTime(text)) throw new Error(`FIELD_VALIDATION:${label}日期时间格式不正确`);
  if (field.type === 'positive_integer' && !/^[1-9]\d*$/.test(text)) throw new Error(`FIELD_VALIDATION:${label}必须是大于0的整数`);
  return true;
}

function normalizeExtensions(value) {
  const extensions = parseJson(value, DEFAULT_ALLOWED_EXTENSIONS);
  if (!Array.isArray(extensions)) return DEFAULT_ALLOWED_EXTENSIONS;
  const normalized = extensions
    .map((ext) =>
      String(ext || '')
        .trim()
        .toLowerCase()
        .replace(/^\./, '')
    )
    .filter(Boolean);
  return [...new Set(normalized)];
}

function normalizeRenameFields(value) {
  const fields = parseJson(value, ['originalFilename']);
  return Array.isArray(fields) ? fields.filter(Boolean) : ['originalFilename'];
}

function getEffectiveStatus(row) {
  if (!row) return 'deleted';
  const status = normalizeStatus(row.status);
  if (status === 'deleted') return 'deleted';
  if (status === 'archived') return 'archived';
  if (status === 'ended') return 'ended';
  if (row.deadline && new Date(row.deadline).getTime() < Date.now()) return 'expired';
  return 'ongoing';
}

function addEffectiveStatusFilter(whereParts, params, status, alias = 'a') {
  if (!status || !VALID_STATUSES.has(status) || status === 'deleted') return;
  if (status === 'expired') {
    whereParts.push(`${alias}.status = 'ongoing' AND ${alias}.deadline IS NOT NULL AND datetime(${alias}.deadline) < datetime('now')`);
  } else if (normalizeStatus(status) === 'ongoing') {
    whereParts.push(`${alias}.status = 'ongoing' AND (${alias}.deadline IS NULL OR datetime(${alias}.deadline) >= datetime('now'))`);
  } else {
    whereParts.push(`${alias}.status = ?`);
    params.push(normalizeStatus(status));
  }
}

function getStatusLabel(status) {
  return (
    {
      ongoing: '进行中',
      ended: '已结束',
      completed: '已结束',
      expired: '已过期',
      archived: '已归档',
      deleted: '已删除',
    }[status] || '进行中'
  );
}

function formatAssignment(row) {
  if (!row) return null;
  const fieldConfig = normalizeFieldConfig(row.fieldConfig);
  return {
    id: row.id,
    title: row.title,
    description: row.description || '',
    deadline: row.deadline,
    status: normalizeStatus(row.status),
    effectiveStatus: getEffectiveStatus(row),
    shareCode: row.shareCode || '',
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    deletedAt: row.deletedAt,
    previousStatus: normalizeStatus(row.previousStatus || 'ongoing'),
    submissionCount: Number(row.submissionCount || 0),
    submitterCount: Number(row.submitterCount || 0),
    fieldConfig,
    allowLate: Boolean(row.allowLate),
    allowRepeat: Boolean(row.allowRepeat),
    repeatMode: row.repeatMode === 'overwrite' ? 'overwrite' : 'new',
    maxFiles: Number(row.maxFiles || 1),
    maxFileSizeMb: Number(row.maxFileSizeMb || 100),
    allowedExtensions: normalizeExtensions(row.allowedExtensions),
    renameEnabled: row.renameEnabled !== 0,
    renameFields: normalizeRenameFields(row.renameFields),
    downloadStructure: row.downloadStructure || 'task-field-file',
    requiredUpload: row.requiredUpload !== 0,
    fileType: row.fileType || 'document',
    enableLimit: Boolean(row.enableLimit),
    allowFolder: row.allowFolder !== 0,
    collectFields: fieldConfig,
    fileRules: {
      requiredUpload: row.requiredUpload !== 0,
      fileType: row.fileType || 'document',
      allowedExtensions: normalizeExtensions(row.allowedExtensions),
      enableLimit: Boolean(row.enableLimit),
      maxFileSizeMB: Number(row.maxFileSizeMb || 100),
      maxFileCount: Number(row.maxFiles || 1),
      enableRename: row.renameEnabled !== 0,
      renameFields: normalizeRenameFields(row.renameFields),
      allowFolder: row.allowFolder !== 0,
    },
  };
}

function assignmentSelectSql(extra = '') {
  return `
    SELECT
      a.id,
      a.title,
      a.description,
      a.deadline,
      a.status,
      a.share_code AS shareCode,
      a.created_at AS createdAt,
      a.updated_at AS updatedAt,
      a.deleted_at AS deletedAt,
      a.previous_status AS previousStatus,
      a.field_config AS fieldConfig,
      a.allow_late AS allowLate,
      a.allow_repeat AS allowRepeat,
      a.repeat_mode AS repeatMode,
      a.max_files AS maxFiles,
      a.max_file_size_mb AS maxFileSizeMb,
      a.allowed_extensions AS allowedExtensions,
      a.rename_enabled AS renameEnabled,
      a.rename_fields AS renameFields,
      a.download_structure AS downloadStructure,
      a.required_upload AS requiredUpload,
      a.file_type AS fileType,
      a.enable_limit AS enableLimit,
      a.allow_folder AS allowFolder,
      COUNT(s.id) AS submissionCount,
      COUNT(DISTINCT s.student_id) AS submitterCount
    FROM assignments a
    LEFT JOIN submissions s ON s.assignment_id = a.id AND s.deleted_at IS NULL
    ${extra}
  `;
}

function normalizeAssignmentPayload(body) {
  const title = body.title?.trim();
  if (!title) throw new Error('TITLE_REQUIRED');
  const fileRules = body.fileRules || {};
  const fieldConfig = body.collectFields || body.fieldConfig;
  const normalizedFieldConfig = validateFieldConfig(normalizeFieldConfig(fieldConfig));
  const maxFiles = fileRules.maxFileCount ?? body.maxFiles ?? 1;
  const maxFileSizeMb = fileRules.maxFileSizeMB ?? body.maxFileSizeMb ?? 100;
  const renameEnabled = fileRules.enableRename ?? body.renameEnabled;
  return {
    title,
    description: body.description?.trim() || '',
    deadline: body.deadline || null,
    status: normalizeStatus(body.status),
    fieldConfig: JSON.stringify(normalizedFieldConfig),
    allowLate: body.allowLate ? 1 : 0,
    allowRepeat: body.allowRepeat === false ? 0 : 1,
    repeatMode: body.repeatMode === 'overwrite' ? 'overwrite' : 'new',
    maxFiles: Math.max(1, Math.min(Number(maxFiles || 1), MAX_UPLOAD_FILES)),
    maxFileSizeMb: Math.max(1, Math.min(Number(maxFileSizeMb || 100), MAX_UPLOAD_SIZE_MB)),
    allowedExtensions: JSON.stringify(normalizeExtensions(fileRules.allowedExtensions ?? body.allowedExtensions)),
    renameEnabled: renameEnabled === false ? 0 : 1,
    renameFields: JSON.stringify(normalizeRenameFields(fileRules.renameFields ?? body.renameFields)),
    downloadStructure: body.downloadStructure === 'task-file' ? 'task-file' : 'task-field-file',
    requiredUpload: (fileRules.requiredUpload ?? body.requiredUpload) === false ? 0 : 1,
    fileType: String(fileRules.fileType || body.fileType || 'document'),
    enableLimit: (fileRules.enableLimit ?? body.enableLimit) ? 1 : 0,
    allowFolder: (fileRules.allowFolder ?? body.allowFolder) === false ? 0 : 1,
  };
}

function normalizeTemplatePayload(body) {
  const name = String(body.name || '').trim();
  if (!name) throw new Error('TEMPLATE_NAME_REQUIRED');
  const category = ['course', 'exam', 'material'].includes(body.category) ? body.category : 'course';
  const visibility = ['private', 'class'].includes(body.visibility) ? body.visibility : 'private';
  const source = body.data || {};
  const data = {
    title: String(source.title || ''),
    description: String(source.description || ''),
    deadline: source.deadline || '',
    status: normalizeStatus(source.status || 'ongoing'),
    allowLate: Boolean(source.allowLate),
    allowRepeat: source.allowRepeat !== false,
    repeatMode: source.repeatMode === 'overwrite' ? 'overwrite' : 'new',
    downloadStructure: source.downloadStructure === 'task-field-file' ? 'task-field-file' : 'task-file',
    requiredUpload: source.requiredUpload !== false,
    fileType: String(source.fileType || 'document'),
    enableLimit: Boolean(source.enableLimit),
    maxFileSizeMb: Math.max(1, Math.min(Number(source.maxFileSizeMb || 100), MAX_UPLOAD_SIZE_MB)),
    maxFiles: Math.max(1, Math.min(Number(source.maxFiles || 1), MAX_UPLOAD_FILES)),
    allowFolder: source.allowFolder !== false,
    renameEnabled: source.renameEnabled !== false,
    renameFields: normalizeRenameFields(source.renameFields),
    allowedExtensions: normalizeExtensions(source.allowedExtensions),
    fieldConfig: validateFieldConfig(normalizeFieldConfig(source.fieldConfig)),
    template: { enabled: true, name, category, visibility },
  };
  return { name, category, visibility, data: JSON.stringify(data) };
}

function formatTemplate(row) {
  if (!row) return null;
  const data = parseJson(row.data, {});
  return {
    id: String(row.id),
    name: row.name,
    category: row.category || 'course',
    visibility: row.visibility || 'private',
    createdAt: row.createdAt || row.created_at,
    updatedAt: row.updatedAt || row.updated_at,
    deletedAt: row.deletedAt || row.deleted_at || null,
    data,
  };
}

module.exports = {
  VALID_STATUSES,
  BASIC_FIELD_TYPES,
  CUSTOM_FIELD_TYPES,
  VALID_FIELD_TYPES,
  DEFAULT_ALLOWED_EXTENSIONS,
  DEFAULT_FIELD_CONFIG,
  generateShareCode,
  normalizeShareCode,
  parseJson,
  normalizeStatus,
  normalizeFieldKey,
  normalizeFieldConfig,
  normalizeFieldType,
  validateFieldConfig,
  validateSubmittedFieldValue,
  isValidIdCard,
  isValidBirthDate,
  isValidDateTime,
  normalizeExtensions,
  normalizeRenameFields,
  getEffectiveStatus,
  addEffectiveStatusFilter,
  getStatusLabel,
  formatAssignment,
  assignmentSelectSql,
  normalizeAssignmentPayload,
  normalizeTemplatePayload,
  formatTemplate,
};
