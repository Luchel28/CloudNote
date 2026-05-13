import path from 'path';
import type { AssignmentDto, AssignmentFieldDto } from '@cloudnote/shared-types';

import { CloudNoteError } from '../../common/cloudnote-error';

const IDENTITY_KEYS = new Set(['studentName', 'studentId', 'phone', 'email', 'idcard', 'idCard']);
const ALLOWED_MIME_TYPES = new Set([
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'text/plain',
  'text/csv',
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
  'image/bmp',
  'video/mp4',
  'video/quicktime',
  'video/x-msvideo',
  'video/x-matroska',
  'application/zip',
  'application/x-rar-compressed',
  'application/x-7z-compressed',
  'application/gzip',
  'application/vnd.android.package-archive',
  'application/x-msdownload',
  'application/x-msi',
  'application/x-apple-diskimage',
  'application/octet-stream',
  'application/x-zip-compressed',
]);

type FieldMatcher = (field: AssignmentFieldDto) => boolean;

export interface UploadRuleFile {
  originalname: string;
  mimetype: string;
  size: number;
}

export interface DuplicateIdentityEntry {
  key: string;
  value: string;
}

function splitOptions(value: unknown): string[] {
  if (Array.isArray(value)) return value.map((item) => String(item || '').trim()).filter(Boolean);
  return String(value || '')
    .split(/[,，\n]/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function normalizedFieldText(field: AssignmentFieldDto, prop: keyof AssignmentFieldDto | 'name'): string {
  return String((field as AssignmentFieldDto & { name?: string })?.[prop] || '').trim();
}

function isNameIdentityField(field: AssignmentFieldDto): boolean {
  return (
    normalizedFieldText(field, 'key') === 'studentName' ||
    normalizedFieldText(field, 'type') === 'name' ||
    normalizedFieldText(field, 'label') === '姓名' ||
    normalizedFieldText(field, 'name') === '姓名'
  );
}

function isStudentIdIdentityField(field: AssignmentFieldDto): boolean {
  return (
    normalizedFieldText(field, 'key') === 'studentId' ||
    normalizedFieldText(field, 'label') === '学号' ||
    normalizedFieldText(field, 'name') === '学号'
  );
}

function isPhoneIdentityField(field: AssignmentFieldDto): boolean {
  return (
    normalizedFieldText(field, 'key') === 'phone' ||
    normalizedFieldText(field, 'type') === 'phone' ||
    normalizedFieldText(field, 'label') === '手机号' ||
    normalizedFieldText(field, 'name') === '手机号'
  );
}

function isEmailIdentityField(field: AssignmentFieldDto): boolean {
  return (
    normalizedFieldText(field, 'key') === 'email' ||
    normalizedFieldText(field, 'type') === 'email' ||
    normalizedFieldText(field, 'label') === '邮箱' ||
    normalizedFieldText(field, 'name') === '邮箱'
  );
}

function isIdCardIdentityField(field: AssignmentFieldDto): boolean {
  const label = normalizedFieldText(field, 'label') || normalizedFieldText(field, 'name');
  return (
    normalizedFieldText(field, 'key') === 'idcard' ||
    normalizedFieldText(field, 'key') === 'idCard' ||
    normalizedFieldText(field, 'type') === 'idcard' ||
    label === '身份证' ||
    label === '身份证号'
  );
}

function isSubmissionIdentityField(field: AssignmentFieldDto): boolean {
  return (
    field.enabled !== false &&
    field.visible !== false &&
    (isNameIdentityField(field) || isStudentIdIdentityField(field) || isPhoneIdentityField(field) || isEmailIdentityField(field) || isIdCardIdentityField(field))
  );
}

function getIdentityFieldValue(assignment: AssignmentDto, submitterData: Record<string, string>, matcher: FieldMatcher): string {
  const field = assignment.collectFields.find((item) => item.enabled !== false && item.visible !== false && matcher(item));
  if (!field?.key) return '';
  return String(submitterData[field.key] ?? '').trim();
}

function isValidNumberText(value: string): boolean {
  return /^-?\d+(\.\d+)?$/.test(value);
}

function isValidIntegerText(value: string): boolean {
  return /^\d+$/.test(value);
}

function parseStrictDateParts(value: string): { date: Date } | null {
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(year, month - 1, day);
  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) return null;
  return { date };
}

function isValidBirthDate(value: string): boolean {
  const parsed = parseStrictDateParts(value);
  if (!parsed) return false;
  const min = new Date(1900, 0, 1);
  const today = new Date();
  today.setHours(23, 59, 59, 999);
  return parsed.date >= min && parsed.date <= today;
}

function isValidDateTime(value: string): boolean {
  const match = value.match(/^(\d{4}-\d{2}-\d{2})[ T](\d{2}):(\d{2})$/);
  if (!match) return false;
  if (!parseStrictDateParts(match[1])) return false;
  const hour = Number(match[2]);
  const minute = Number(match[3]);
  return hour >= 0 && hour <= 23 && minute >= 0 && minute <= 59;
}

function isValidIdCard(value: string): boolean {
  if (/^\d{15}$/.test(value)) return Boolean(parseStrictDateParts(`19${value.slice(6, 8)}-${value.slice(8, 10)}-${value.slice(10, 12)}`));
  if (!/^\d{17}[\dXx]$/.test(value)) return false;
  const birth = `${value.slice(6, 10)}-${value.slice(10, 12)}-${value.slice(12, 14)}`;
  if (!parseStrictDateParts(birth)) return false;
  const weights = [7, 9, 10, 5, 8, 4, 2, 1, 6, 3, 7, 9, 10, 5, 8, 4, 2];
  const codes = ['1', '0', 'X', '9', '8', '7', '6', '5', '4', '3', '2'];
  const sum = value
    .slice(0, 17)
    .split('')
    .reduce((total, char, index) => total + Number(char) * weights[index], 0);
  return codes[sum % 11] === value[17].toUpperCase();
}

function getBodyValue(body: Record<string, unknown>, field: AssignmentFieldDto): string {
  const raw = body[field.key];
  if (Array.isArray(raw)) {
    const values = raw.map((item) => String(item || '').trim()).filter(Boolean);
    return field.type === 'multiple_choice' ? values.join(', ') : values[0] || '';
  }
  return String(raw ?? '').trim();
}

function failValidation(message: string): never {
  throw CloudNoteError.badRequest('VALIDATION_FAILED', message);
}

export function validateSubmittedFieldValue(field: AssignmentFieldDto, value: string): void {
  const label = field.label || field.key || 'Field';
  if (field.required && !value) failValidation(`${label} is required.`);
  if (!value) return;

  if (field.type === 'name' && !(/^[\u4e00-\u9fa5]{1,5}$/.test(value) || (/^[A-Za-z\s]{1,20}$/.test(value) && /[A-Za-z]/.test(value)))) {
    failValidation(`${label} format is invalid.`);
  }
  if (field.type === 'phone' && !/^1[3-9]\d{9}$/.test(value)) failValidation(`${label} format is invalid.`);
  if (field.type === 'idcard' && !isValidIdCard(value)) failValidation(`${label} format is invalid.`);
  if (field.type === 'email' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) failValidation(`${label} format is invalid.`);
  if (field.type === 'birth_date' && !isValidBirthDate(value)) failValidation(`${label} must be a real date between 1900-01-01 and today.`);
  if (field.type === 'single_line' && (value.length < 1 || value.length > 50)) failValidation(`${label} length must be 1-50 characters.`);
  if (field.type === 'multi_line' && (value.length < 1 || value.length > 1000)) failValidation(`${label} length must be 1-1000 characters.`);
  if (field.type === 'numeric') {
    if (!isValidNumberText(value)) failValidation(`${label} must be a number.`);
    const min = field.rules?.min;
    const max = field.rules?.max;
    if (min !== undefined && min !== '' && Number(value) < Number(min)) failValidation(`${label} cannot be less than ${min}.`);
    if (max !== undefined && max !== '' && Number(value) > Number(max)) failValidation(`${label} cannot be greater than ${max}.`);
  }
  if (field.type === 'digits') {
    if (!isValidIntegerText(value)) failValidation(`${label} must contain digits only.`);
    const length = field.rules?.length;
    if (length !== undefined && length !== '' && value.length !== Number(length)) failValidation(`${label} must contain ${length} digits.`);
  }
  if (field.type === 'single_choice') {
    const options = splitOptions(field.rules?.options);
    if (options.length && !options.includes(value)) failValidation(`${label} option is invalid.`);
  }
  if (field.type === 'multiple_choice') {
    const options = splitOptions(field.rules?.options);
    const values = splitOptions(value);
    if (field.required && !values.length) failValidation(`${label} is required.`);
    if (new Set(values).size !== values.length) failValidation(`${label} cannot contain duplicate options.`);
    if (options.length && values.some((item) => !options.includes(item))) failValidation(`${label} option is invalid.`);
  }
  if (field.type === 'datetime' && !isValidDateTime(value)) failValidation(`${label} datetime format is invalid.`);
  if (field.type === 'positive_integer' && !/^[1-9]\d*$/.test(value)) failValidation(`${label} must be a positive integer.`);
}

export function collectSubmitterData(assignment: AssignmentDto, body: Record<string, unknown>): Record<string, string> {
  const data: Record<string, string> = {};
  for (const field of assignment.collectFields.filter((item) => item.enabled !== false && item.visible !== false)) {
    const value = getBodyValue(body, field);
    validateSubmittedFieldValue(field, value);
    data[field.key] = value;
  }

  Object.entries(body).forEach(([key, value]) => {
    if (key === 'assignmentId' || key in data) return;
    data[key] = Array.isArray(value) ? value.map((item) => String(item || '').trim()).filter(Boolean).join(', ') : String(value ?? '').trim();
  });

  return data;
}

export function getDuplicateIdentityEntries(assignment: AssignmentDto, submitterData: Record<string, string>): DuplicateIdentityEntry[] {
  const configured = assignment.collectFields
    .filter((field) => isSubmissionIdentityField(field) || IDENTITY_KEYS.has(field.key))
    .map((field) => ({ key: field.key, value: String(submitterData[field.key] ?? '').trim() }))
    .filter((entry) => entry.value);

  if (configured.length) return configured;
  return ['studentName', 'studentId'].map((key) => ({ key, value: String(submitterData[key] ?? '').trim() })).filter((entry) => entry.value);
}

export function resolveSubmitterSummary(assignment: AssignmentDto, submitterData: Record<string, string>): { studentName: string; studentId: string; homeworkTitle: string } {
  return {
    studentName: submitterData.studentName || getIdentityFieldValue(assignment, submitterData, isNameIdentityField),
    studentId: submitterData.studentId || getIdentityFieldValue(assignment, submitterData, isStudentIdIdentityField),
    homeworkTitle: submitterData.homeworkTitle || assignment.title,
  };
}

export function validateUploadedFiles(assignment: AssignmentDto, files: UploadRuleFile[], systemMaxFiles: number, systemMaxSizeMb: number): void {
  if (assignment.fileRules.requiredUpload && files.length === 0) throw CloudNoteError.badRequest('UPLOAD_REJECTED', 'At least one file is required.');

  const effectiveMaxFiles = assignment.fileRules.enableLimit ? Math.min(assignment.fileRules.maxFileCount, systemMaxFiles) : systemMaxFiles;
  if (files.length > effectiveMaxFiles) throw CloudNoteError.badRequest('UPLOAD_REJECTED', `At most ${effectiveMaxFiles} files can be uploaded.`);

  const allowedExtensions = new Set(assignment.fileRules.allowedExtensions.map((ext) => ext.toLowerCase().replace(/^\./, '')).filter(Boolean));
  const effectiveMaxSizeMb = assignment.fileRules.enableLimit ? Math.min(assignment.fileRules.maxFileSizeMB, systemMaxSizeMb) : systemMaxSizeMb;
  const effectiveMaxSizeBytes = effectiveMaxSizeMb * 1024 * 1024;

  for (const file of files) {
    const ext = path.extname(file.originalname || '').replace(/^\./, '').toLowerCase();
    if (allowedExtensions.size && !allowedExtensions.has(ext)) throw CloudNoteError.badRequest('UPLOAD_REJECTED', 'File extension is not allowed.');
    if (file.size > effectiveMaxSizeBytes) throw CloudNoteError.badRequest('UPLOAD_REJECTED', `Each file must be ${effectiveMaxSizeMb} MB or smaller.`);
    if (file.mimetype && !ALLOWED_MIME_TYPES.has(file.mimetype)) throw CloudNoteError.badRequest('UPLOAD_REJECTED', 'File MIME type is not supported.');
  }
}

export function buildDisplayFilename(assignment: AssignmentDto, submitterData: Record<string, string>, originalFilename: string, index: number, uploadTime: string): string {
  if (!assignment.fileRules.enableRename) return originalFilename;
  const ext = path.extname(originalFilename);
  const originalBase = path.basename(originalFilename, ext);
  const tokenMap: Record<string, string | undefined> = {
    originalFilename: originalBase,
    submitterName: submitterData.studentName,
    uploadTime: uploadTime.replace(/[-:T.Z]/g, '').slice(0, 12),
  };
  const base =
    assignment.fileRules.renameFields
      .map((fieldKey) => tokenMap[fieldKey] || submitterData[fieldKey])
      .filter(Boolean)
      .map((item) => String(item).replace(/[\\/:*?"<>|]+/g, '_').replace(/\s+/g, '_').slice(0, 90))
      .join('_') || originalBase;
  const suffix = assignment.fileRules.maxFileCount > 1 ? `_${index + 1}` : '';
  return `${base}${suffix}${ext}`;
}
