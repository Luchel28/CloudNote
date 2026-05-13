import type { SubmissionDto, SubmissionFileDto } from '@cloudnote/shared-types';

export interface SubmissionRow {
  id: string | number;
  assignment_id: string | number;
  assignment_title?: string | null;
  submitter_data: unknown;
  student_name: string;
  student_id: string;
  homework_title: string;
  upload_time: Date | string;
  is_late: boolean;
}

export interface SubmissionFileRow {
  id: string | number;
  submission_id: string | number;
  original_filename: string;
  stored_filename: string;
  file_size: string | number;
  mime_type: string;
  created_at?: Date | string;
}

function toIso(value: Date | string | null | undefined): string | undefined {
  if (!value) return undefined;
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

function normalizeSubmitterData(value: unknown): Record<string, string> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, String(item ?? '')]));
}

export function mapSubmissionFile(row: SubmissionFileRow): SubmissionFileDto {
  return {
    id: Number(row.id),
    originalFilename: row.original_filename,
    storedFilename: row.stored_filename,
    size: Number(row.file_size || 0),
    mimeType: row.mime_type || '',
    createdAt: toIso(row.created_at),
  };
}

export function mapSubmission(row: SubmissionRow, files: SubmissionFileDto[]): SubmissionDto {
  return {
    id: Number(row.id),
    assignmentId: Number(row.assignment_id),
    assignmentTitle: row.assignment_title || undefined,
    submitterData: normalizeSubmitterData(row.submitter_data),
    studentName: row.student_name || '',
    studentId: row.student_id || '',
    homeworkTitle: row.homework_title || '',
    uploadTime: toIso(row.upload_time) || new Date().toISOString(),
    isLate: Boolean(row.is_late),
    files,
  };
}
