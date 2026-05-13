import { Injectable } from '@nestjs/common';
import type { PageQuery, PageResult, SubmissionDto, SubmissionUploadResponse } from '@cloudnote/shared-types';

import { CloudNoteError } from '../../common/cloudnote-error';
import { rowsToCsv } from '../../common/csv';
import { parseOptionalPositiveInt, parsePositiveInt } from '../../common/ids';
import { buildPageResult, parsePage, parsePerPage } from '../../common/pagination';
import { AppConfigService } from '../../config/app-config.service';
import { DatabaseService } from '../../database/database.service';
import { AssignmentRow, mapAssignment } from '../assignments/assignment.mapper';
import { StorageService, StoredFileResult, UploadedFileLike } from '../storage/storage.service';
import {
  buildDisplayFilename,
  collectSubmitterData,
  DuplicateIdentityEntry,
  getDuplicateIdentityEntries,
  resolveSubmitterSummary,
  validateUploadedFiles,
} from './submission-rules';
import { mapSubmission, mapSubmissionFile, SubmissionFileRow, SubmissionRow } from './submission.mapper';

type SubmissionListQuery = PageQuery & {
  assignmentId?: number | string;
  status?: string;
  dateFrom?: string;
  dateTo?: string;
};

function addSubmissionDateFilters(whereParts: string[], params: unknown[], query: SubmissionListQuery): void {
  if (query.dateFrom) {
    params.push(query.dateFrom);
    whereParts.push(`s.upload_time >= $${params.length}`);
  }
  if (query.dateTo) {
    params.push(query.dateTo);
    whereParts.push(`s.upload_time <= $${params.length}`);
  }
}

function getSubmissionOrderBy(sort: unknown): string {
  switch (String(sort || 'upload-desc')) {
    case 'upload-asc':
      return 's.upload_time ASC, s.id ASC';
    case 'assignment-asc':
      return 'a.title ASC, s.upload_time DESC, s.id DESC';
    case 'assignment-desc':
      return 'a.title DESC, s.upload_time DESC, s.id DESC';
    case 'name-asc':
      return 's.student_name ASC, s.upload_time DESC, s.id DESC';
    case 'name-desc':
      return 's.student_name DESC, s.upload_time DESC, s.id DESC';
    case 'late-desc':
      return 's.is_late DESC, s.upload_time DESC, s.id DESC';
    default:
      return 's.upload_time DESC, s.id DESC';
  }
}

@Injectable()
export class SubmissionsService {
  constructor(
    private readonly database: DatabaseService,
    private readonly storage: StorageService,
    private readonly config: AppConfigService
  ) {}

  async list(query: SubmissionListQuery): Promise<PageResult<SubmissionDto>> {
    const page = parsePage(query.page);
    const perPage = parsePerPage(query.perPage, 20, 100);
    const offset = (page - 1) * perPage;
    const params: unknown[] = [];
    const whereParts = ['s.deleted_at IS NULL', 'a.deleted_at IS NULL'];

    const assignmentId = parseOptionalPositiveInt(query.assignmentId, 'Assignment ID');
    if (assignmentId) {
      params.push(assignmentId);
      whereParts.push(`s.assignment_id = $${params.length}`);
    }

    if (query.status === 'late') whereParts.push('s.is_late = true');
    if (query.status === 'ontime') whereParts.push('s.is_late = false');
    addSubmissionDateFilters(whereParts, params, query);

    if (query.search) {
      params.push(`%${String(query.search).trim()}%`);
      whereParts.push(`(
        s.student_name ILIKE $${params.length}
        OR s.student_id ILIKE $${params.length}
        OR s.homework_title ILIKE $${params.length}
        OR s.submitter_data::text ILIKE $${params.length}
        OR EXISTS (
          SELECT 1 FROM submission_files sf
          WHERE sf.submission_id = s.id
            AND sf.deleted_at IS NULL
            AND sf.original_filename ILIKE $${params.length}
        )
      )`);
    }

    const where = `WHERE ${whereParts.join(' AND ')}`;
    const count = await this.database.queryOne<{ total: string }>(`SELECT COUNT(*)::int AS total FROM submission_records s LEFT JOIN assignments a ON a.id = s.assignment_id ${where}`, params);
    params.push(perPage, offset);
    const rows = await this.database.query<SubmissionRow>(
      `
        SELECT s.*, a.title AS assignment_title
        FROM submission_records s
        LEFT JOIN assignments a ON a.id = s.assignment_id
        ${where}
        ORDER BY ${getSubmissionOrderBy(query.sort)}
        LIMIT $${params.length - 1} OFFSET $${params.length}
      `,
      params
    );
    const ids = rows.map((row) => Number(row.id));
    const fileRows = ids.length
      ? await this.database.query<SubmissionFileRow>(
          `SELECT * FROM submission_files WHERE deleted_at IS NULL AND submission_id = ANY($1::bigint[]) ORDER BY id ASC`,
          [ids]
        )
      : [];
    const filesBySubmission = new Map<number, ReturnType<typeof mapSubmissionFile>[]>();
    fileRows.forEach((file) => {
      const submissionId = Number(file.submission_id);
      const list = filesBySubmission.get(submissionId) || [];
      list.push(mapSubmissionFile(file));
      filesBySubmission.set(submissionId, list);
    });
    return buildPageResult(
      rows.map((row) => mapSubmission(row, filesBySubmission.get(Number(row.id)) || [])),
      Number(count?.total || 0),
      page,
      perPage
    );
  }

  async upload(body: Record<string, unknown>, uploadedFiles: UploadedFileLike[]): Promise<SubmissionUploadResponse> {
    let storedFiles: StoredFileResult[] = [];
    try {
      const assignmentId = parsePositiveInt(body.assignmentId, 'assignmentId');

      const assignmentRow = await this.database.queryOne<AssignmentRow>('SELECT * FROM assignments WHERE id = $1 AND deleted_at IS NULL', [assignmentId]);
      if (!assignmentRow) throw CloudNoteError.notFound('Assignment not found.');
      const assignment = mapAssignment({ ...assignmentRow, submission_count: 0, submitter_count: 0 });
      if (assignment.effectiveStatus !== 'ongoing' && !(assignment.effectiveStatus === 'expired' && assignment.allowLate)) {
        throw CloudNoteError.badRequest('UPLOAD_REJECTED', 'Assignment is closed.');
      }
      validateUploadedFiles(assignment, uploadedFiles, this.config.maxUploadFiles, this.config.maxUploadSizeMb);

      const submitterData = collectSubmitterData(assignment, body);
      const submitterSummary = resolveSubmitterSummary(assignment, submitterData);
      const duplicateIds = await this.findDuplicateSubmissionIds(assignment.id, getDuplicateIdentityEntries(assignment, submitterData));
      if (duplicateIds.length > 0 && !assignment.allowRepeat) throw CloudNoteError.badRequest('UPLOAD_REJECTED', 'Duplicate submissions are not allowed for this assignment.');
      const shouldOverwriteDuplicates = duplicateIds.length > 0 && assignment.allowRepeat && assignment.repeatMode === 'overwrite';
      const now = new Date();
      const uploadTime = now.toISOString();
      const isLate = Boolean(assignment.deadline && new Date(assignment.deadline).getTime() < now.getTime());

      storedFiles = await Promise.all(uploadedFiles.map((file) => this.storage.saveUploadedFile(file)));
      let oldFilesToRemove: string[] = [];
      const result = await this.database.transaction(async (client) => {
        if (shouldOverwriteDuplicates) {
          const oldFiles = await client.query<{ storage_key: string; stored_filename: string }>(
            'SELECT storage_key, stored_filename FROM submission_files WHERE submission_id = ANY($1::bigint[])',
            [duplicateIds]
          );
          oldFilesToRemove = oldFiles.rows.map((file) => file.storage_key || file.stored_filename).filter(Boolean);
          await client.query('DELETE FROM submission_files WHERE submission_id = ANY($1::bigint[])', [duplicateIds]);
          await client.query('DELETE FROM submission_records WHERE id = ANY($1::bigint[])', [duplicateIds]);
        }

        const submission = await client.query<{ id: string }>(
          `
            INSERT INTO submission_records (
              assignment_id, submitter_data, student_name, student_id, homework_title, is_late, upload_time
            )
            VALUES ($1, $2::jsonb, $3, $4, $5, $6, $7)
            RETURNING id
          `,
          [
            assignment.id,
            JSON.stringify(submitterData),
            submitterSummary.studentName,
            submitterSummary.studentId,
            submitterSummary.homeworkTitle,
            isLate,
            uploadTime,
          ]
        );
        const submissionId = Number(submission.rows[0]?.id);
        const savedFiles = [];
        for (let index = 0; index < storedFiles.length; index += 1) {
          const file = storedFiles[index];
          const displayName = buildDisplayFilename(assignment, submitterData, file.originalFilename, index, uploadTime);
          const fileRow = await client.query<{ id: string }>(
            `
              INSERT INTO submission_files (
                submission_id, assignment_id, original_filename, stored_filename, file_size, mime_type, storage_provider, storage_key
              )
              VALUES ($1, $2, $3, $4, $5, $6, 'local', $7)
              RETURNING id
            `,
            [submissionId, assignment.id, displayName, file.storedFilename, file.size, file.mimeType, file.storageKey]
          );
          savedFiles.push({
            id: Number(fileRow.rows[0]?.id),
            originalFilename: displayName,
            size: file.size,
            mimeType: file.mimeType,
          });
        }
        return {
          id: submissionId,
          assignmentId: assignment.id,
          assignmentTitle: assignment.title,
          submittedAt: uploadTime,
          submitterData,
          files: savedFiles,
        };
      });
      await Promise.all(oldFilesToRemove.map((file) => this.storage.removeStoredFile(file)));
      return result;
    } catch (error) {
      await Promise.all(storedFiles.map((file) => this.storage.removeStoredFile(file.storageKey)));
      await Promise.all(uploadedFiles.map((file) => this.storage.cleanupUploadedFile(file)));
      throw error;
    }
  }

  async softDelete(id: number): Promise<{ deleted: boolean }> {
    const row = await this.database.transaction(async (client) => {
      const result = await client.query<{ id: string }>(
        "UPDATE submission_records SET deleted_at = now(), delete_source = 'submission' WHERE id = $1 AND deleted_at IS NULL RETURNING id",
        [id]
      );
      if (!result.rowCount) return null;
      await client.query("UPDATE submission_files SET deleted_at = now(), delete_source = 'submission' WHERE submission_id = $1 AND deleted_at IS NULL", [id]);
      return result.rows[0];
    });
    if (!row) throw CloudNoteError.notFound('Submission not found.');
    return { deleted: true };
  }

  async bulkSoftDelete(ids: number[]): Promise<{ deleted: number }> {
    const uniqueIds = [...new Set(ids.filter(Number.isInteger))];
    if (!uniqueIds.length) throw CloudNoteError.badRequest('VALIDATION_FAILED', 'Please select submissions to delete.');
    const result = await this.database.transaction(async (client) => {
      const updated = await client.query<{ id: string }>(
        "UPDATE submission_records SET deleted_at = now(), delete_source = 'submission' WHERE id = ANY($1::bigint[]) AND deleted_at IS NULL RETURNING id",
        [uniqueIds]
      );
      const deletedIds = updated.rows.map((row) => Number(row.id)).filter(Number.isInteger);
      if (deletedIds.length) {
        await client.query(
          "UPDATE submission_files SET deleted_at = now(), delete_source = 'submission' WHERE submission_id = ANY($1::bigint[]) AND deleted_at IS NULL",
          [deletedIds]
        );
      }
      return deletedIds.length;
    });
    return { deleted: result };
  }

  async exportCsv(query: SubmissionListQuery): Promise<{ filename: string; content: string }> {
    const items: SubmissionDto[] = [];
    let page = 1;
    let totalPages = 1;
    do {
      const result = await this.list({ ...query, page, perPage: 100 });
      items.push(...result.items);
      totalPages = result.totalPages;
      page += 1;
    } while (page <= totalPages);

    const dynamicKeys = [...new Set(items.flatMap((item) => Object.keys(item.submitterData || {})))];
    const headers = ['Record ID', 'Assignment', ...dynamicKeys, 'Homework Title', 'Files', 'Upload Time', 'Late'];
    const rows = items.map((item) => [
      item.id,
      item.assignmentTitle || '',
      ...dynamicKeys.map((key) => item.submitterData[key] || ''),
      item.homeworkTitle,
      item.files.map((file) => file.originalFilename).join('; '),
      item.uploadTime,
      item.isLate ? 'yes' : 'no',
    ]);
    return {
      filename: `cloudnote-submissions-${Date.now()}.csv`,
      content: rowsToCsv(headers, rows),
    };
  }

  private async findDuplicateSubmissionIds(assignmentId: number, identityEntries: DuplicateIdentityEntry[]): Promise<number[]> {
    if (!identityEntries.length) return [];
    const rows = await this.database.query<{ id: string | number; student_name: string; student_id: string; submitter_data: unknown }>(
      'SELECT id, student_name, student_id, submitter_data FROM submission_records WHERE assignment_id = $1 AND deleted_at IS NULL',
      [assignmentId]
    );
    return rows
      .filter((row) => {
        const data = row.submitter_data && typeof row.submitter_data === 'object' && !Array.isArray(row.submitter_data) ? (row.submitter_data as Record<string, unknown>) : {};
        const mergedData: Record<string, string> = {
          ...Object.fromEntries(Object.entries(data).map(([key, value]) => [key, String(value ?? '').trim()])),
          studentName: String(data.studentName || row.student_name || '').trim(),
          studentId: String(data.studentId || row.student_id || '').trim(),
        };
        return identityEntries.every((entry) => String(mergedData[entry.key] ?? '').trim() === entry.value);
      })
      .map((row) => Number(row.id))
      .filter(Number.isInteger);
  }
}
