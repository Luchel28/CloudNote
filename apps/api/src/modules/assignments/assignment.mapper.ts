import type { AssignmentDto, AssignmentFieldDto, AssignmentMutationInput, AssignmentStatus, DownloadStructure, FileRuleDto, RepeatMode } from '@cloudnote/shared-types';

import { CloudNoteError } from '../../common/cloudnote-error';

const DEFAULT_ALLOWED_EXTENSIONS = ['doc', 'docx', 'pdf', 'zip', 'rar', 'jpg', 'png'];
const DEFAULT_RENAME_FIELDS = ['studentId', 'studentName'];
const BASIC_FIELD_KEYS: Record<string, string> = {
  name: 'studentName',
  phone: 'phone',
  idcard: 'idcard',
  email: 'email',
  birth_date: 'birthDate',
};
const BASIC_FIELD_LABELS: Record<string, string> = {
  name: '姓名',
  phone: '手机号',
  idcard: '身份证号',
  email: '邮箱',
  birth_date: '出生日期',
};
const LEGACY_FIELD_TYPE_MAP: Record<string, AssignmentFieldDto['type']> = {
  tel: 'phone',
  date: 'birth_date',
  radio: 'single_choice',
  checkbox: 'multiple_choice',
  textarea: 'multi_line',
  number_digits: 'digits',
  number_value: 'numeric',
};
const VALID_FIELD_TYPES = new Set([
  'name',
  'phone',
  'idcard',
  'email',
  'birth_date',
  'single_line',
  'numeric',
  'digits',
  'single_choice',
  'multiple_choice',
  'multi_line',
  'datetime',
  'positive_integer',
]);

export interface AssignmentRow {
  id: string | number;
  title: string;
  description: string | null;
  deadline: Date | string | null;
  status: AssignmentStatus;
  previous_status?: AssignmentStatus | null;
  share_code: string;
  field_config: unknown;
  allow_late: boolean;
  allow_repeat: boolean;
  repeat_mode: RepeatMode;
  max_files: number;
  max_file_size_mb: number;
  allowed_extensions: unknown;
  rename_enabled: boolean;
  rename_fields: unknown;
  download_structure: DownloadStructure;
  required_upload: boolean;
  file_type: string;
  enable_limit: boolean;
  allow_folder: boolean;
  created_at: Date | string;
  updated_at: Date | string;
  deleted_at?: Date | string | null;
  submission_count?: string | number | null;
  submitter_count?: string | number | null;
}

export interface NormalizedAssignmentMutation {
  title: string;
  description: string;
  deadline: string | null;
  status: AssignmentStatus;
  fieldConfig: AssignmentFieldDto[];
  allowLate: boolean;
  allowRepeat: boolean;
  repeatMode: RepeatMode;
  maxFiles: number;
  maxFileSizeMb: number;
  allowedExtensions: string[];
  renameEnabled: boolean;
  renameFields: string[];
  downloadStructure: DownloadStructure;
  requiredUpload: boolean;
  fileType: string;
  enableLimit: boolean;
  allowFolder: boolean;
}

function toIso(value: Date | string | null | undefined): string | null {
  if (!value) return null;
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

function asStringArray(value: unknown, fallback: string[]): string[] {
  if (!Array.isArray(value)) return fallback;
  const items = value.map((item) => String(item || '').trim()).filter(Boolean);
  return items.length ? [...new Set(items)] : fallback;
}

function asExtensionArray(value: unknown, fallback: string[]): string[] {
  return asStringArray(value, fallback).map((item) => item.replace(/^\./, '').toLowerCase());
}

function normalizeStatus(value: unknown): AssignmentStatus {
  return value === 'ended' || value === 'archived' || value === 'deleted' ? value : 'ongoing';
}

function normalizeRepeatMode(value: unknown): RepeatMode {
  return value === 'overwrite' ? 'overwrite' : 'new';
}

function normalizeDownloadStructure(value: unknown): DownloadStructure {
  return value === 'task-file' ? 'task-file' : 'task-field-file';
}

function normalizeFieldType(field: Partial<AssignmentFieldDto> & { numberRuleMode?: unknown; id?: unknown; name?: unknown }): AssignmentFieldDto['type'] {
  const rawType = String(field.type || '').trim();
  if (VALID_FIELD_TYPES.has(rawType)) return rawType as AssignmentFieldDto['type'];
  if (rawType === 'number') return field.numberRuleMode === 'digits' ? 'digits' : 'numeric';
  if (LEGACY_FIELD_TYPE_MAP[rawType]) return LEGACY_FIELD_TYPE_MAP[rawType];
  const label = String(field.name || field.label || '').trim();
  const key = String(field.key || field.id || '').trim();
  if (key === 'studentName' || label === '姓名') return 'name';
  if (key === 'studentId' || label === '学号') return 'digits';
  if (label === '手机号') return 'phone';
  if (label === '身份证' || label === '身份证号') return 'idcard';
  if (label === '邮箱') return 'email';
  if (label === '出生日期') return 'birth_date';
  return 'single_line';
}

function normalizeFields(value: unknown): AssignmentFieldDto[] {
  if (!Array.isArray(value)) return [];
  const used = new Set<string>();
  const fields: AssignmentFieldDto[] = [];
  value.forEach((field, index) => {
    if (!field || typeof field !== 'object') return;
    const item = field as Partial<AssignmentFieldDto> & {
      id?: unknown;
      name?: unknown;
      maxLength?: unknown;
      minValue?: unknown;
      maxValue?: unknown;
      digitLength?: unknown;
      options?: unknown;
      numberRuleMode?: unknown;
    };
    const type = normalizeFieldType(item);
    const category = item.category || (Object.prototype.hasOwnProperty.call(BASIC_FIELD_KEYS, type) ? 'basic' : 'custom');
    const preferredKey =
      category === 'basic' && BASIC_FIELD_KEYS[type]
        ? BASIC_FIELD_KEYS[type]
        : String(item.key || item.id || `field${index + 1}`).replace(/[^\w]/g, '');
    let key = String(preferredKey || `field${index + 1}`).replace(/[^\w]/g, '');
    while (used.has(key)) key = `${key}${index + 1}`;
    used.add(key);
    const label = String(item.label || item.name || BASIC_FIELD_LABELS[type] || key).trim();
    if (!key || !label) return;
    fields.push({
      key,
      label,
      type,
      category,
      required: Boolean(item.required),
      enabled: item.enabled !== false,
      visible: item.visible !== false,
      placeholder: item.placeholder || '',
      helpText: item.helpText || '',
      rules: {
        ...(item.rules || {}),
        min: item.rules?.min ?? (item.minValue === undefined ? undefined : String(item.minValue)),
        max: item.rules?.max ?? (item.maxValue === undefined ? undefined : String(item.maxValue)),
        length: item.rules?.length ?? (item.digitLength === undefined ? undefined : String(item.digitLength || item.maxLength || '')),
        options: item.rules?.options ?? (Array.isArray(item.options) ? item.options.map(String) : undefined),
      },
      system: item.system === undefined ? category === 'basic' : Boolean(item.system),
    });
  });
  return fields;
}

function assertNumberText(value: unknown, message: string): void {
  if (value === undefined || value === null || value === '') return;
  if (!/^-?\d+(\.\d+)?$/.test(String(value))) throw CloudNoteError.badRequest('VALIDATION_FAILED', message);
}

function validateChoiceOptions(field: AssignmentFieldDto, minCount: number): void {
  const options = Array.isArray(field.rules?.options) ? field.rules.options.map((item) => String(item || '').trim()).filter(Boolean) : [];
  if (options.length < minCount) throw CloudNoteError.badRequest('VALIDATION_FAILED', `${field.label} requires at least ${minCount} options.`);
  if (new Set(options).size !== options.length) throw CloudNoteError.badRequest('VALIDATION_FAILED', `${field.label} options cannot be duplicated.`);
}

function validateFieldConfig(fields: AssignmentFieldDto[]): AssignmentFieldDto[] {
  const seenKeys = new Set<string>();
  const seenBasic = new Set<string>();
  fields.forEach((field) => {
    if (!field.label.trim()) throw CloudNoteError.badRequest('VALIDATION_FAILED', 'Field label is required.');
    if (!VALID_FIELD_TYPES.has(field.type)) throw CloudNoteError.badRequest('VALIDATION_FAILED', `${field.label} field type is invalid.`);
    if (seenKeys.has(field.key)) throw CloudNoteError.badRequest('VALIDATION_FAILED', `${field.label} field key is duplicated.`);
    seenKeys.add(field.key);
    if (field.category === 'basic') {
      if (seenBasic.has(field.type)) throw CloudNoteError.badRequest('VALIDATION_FAILED', `${field.label} basic field is duplicated.`);
      seenBasic.add(field.type);
    }
    if (field.type === 'numeric') {
      assertNumberText(field.rules?.min, `${field.label} min must be a number.`);
      assertNumberText(field.rules?.max, `${field.label} max must be a number.`);
      if (field.rules?.min !== undefined && field.rules?.max !== undefined && Number(field.rules.min) > Number(field.rules.max)) {
        throw CloudNoteError.badRequest('VALIDATION_FAILED', `${field.label} min cannot be greater than max.`);
      }
    }
    if (field.type === 'digits') {
      const length = field.rules?.length;
      if (length !== undefined && length !== '' && (!/^\d+$/.test(String(length)) || Number(length) < 1 || Number(length) > 30)) {
        throw CloudNoteError.badRequest('VALIDATION_FAILED', `${field.label} digit length must be 1-30.`);
      }
    }
    if (field.type === 'single_choice') validateChoiceOptions(field, 2);
    if (field.type === 'multiple_choice') validateChoiceOptions(field, 3);
  });
  return fields;
}

export function getEffectiveAssignmentStatus(row: Pick<AssignmentRow, 'status' | 'deadline'>): AssignmentDto['effectiveStatus'] {
  const status = normalizeStatus(row.status);
  if (status === 'deleted' || status === 'archived' || status === 'ended') return status;
  if (row.deadline && new Date(row.deadline).getTime() < Date.now()) return 'expired';
  return 'ongoing';
}

export function mapAssignment(row: AssignmentRow): AssignmentDto {
  const collectFields = normalizeFields(row.field_config);
  const fileRules: FileRuleDto = {
    requiredUpload: Boolean(row.required_upload),
    fileType: row.file_type || 'document',
    allowedExtensions: asExtensionArray(row.allowed_extensions, DEFAULT_ALLOWED_EXTENSIONS),
    enableLimit: Boolean(row.enable_limit),
    maxFileSizeMB: Number(row.max_file_size_mb || 100),
    maxFileCount: Number(row.max_files || 1),
    enableRename: Boolean(row.rename_enabled),
    renameFields: asStringArray(row.rename_fields, DEFAULT_RENAME_FIELDS),
    allowFolder: Boolean(row.allow_folder),
  };
  return {
    id: Number(row.id),
    title: row.title,
    description: row.description || '',
    deadline: toIso(row.deadline),
    status: normalizeStatus(row.status),
    effectiveStatus: getEffectiveAssignmentStatus(row),
    shareCode: row.share_code,
    createdAt: toIso(row.created_at) || new Date().toISOString(),
    updatedAt: toIso(row.updated_at) || new Date().toISOString(),
    deletedAt: toIso(row.deleted_at),
    previousStatus: normalizeStatus(row.previous_status || 'ongoing'),
    submissionCount: Number(row.submission_count || 0),
    submitterCount: Number(row.submitter_count || 0),
    collectFields,
    fileRules,
    allowLate: Boolean(row.allow_late),
    allowRepeat: Boolean(row.allow_repeat),
    repeatMode: normalizeRepeatMode(row.repeat_mode),
    downloadStructure: normalizeDownloadStructure(row.download_structure),
  };
}

export function normalizeAssignmentInput(input: AssignmentMutationInput): NormalizedAssignmentMutation {
  const title = String(input.title || '').trim();
  if (!title) throw CloudNoteError.badRequest('VALIDATION_FAILED', 'Assignment title is required.');
  const fileRules = input.fileRules || {};
  return {
    title,
    description: String(input.description || '').trim(),
    deadline: input.deadline ? new Date(input.deadline).toISOString() : null,
    status: normalizeStatus(input.status),
    fieldConfig: validateFieldConfig(normalizeFields(input.collectFields || [])),
    allowLate: Boolean(input.allowLate),
    allowRepeat: input.allowRepeat !== false,
    repeatMode: normalizeRepeatMode(input.repeatMode),
    maxFiles: Math.max(1, Number(fileRules.maxFileCount || 1)),
    maxFileSizeMb: Math.max(1, Number(fileRules.maxFileSizeMB || 100)),
    allowedExtensions: asExtensionArray(fileRules.allowedExtensions, DEFAULT_ALLOWED_EXTENSIONS),
    renameEnabled: fileRules.enableRename !== false,
    renameFields: asStringArray(fileRules.renameFields, DEFAULT_RENAME_FIELDS),
    downloadStructure: normalizeDownloadStructure(input.downloadStructure),
    requiredUpload: fileRules.requiredUpload !== false,
    fileType: String(fileRules.fileType || 'document'),
    enableLimit: Boolean(fileRules.enableLimit),
    allowFolder: fileRules.allowFolder !== false,
  };
}
