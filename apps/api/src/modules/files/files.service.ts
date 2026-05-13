import { Injectable } from '@nestjs/common';
import fs from 'fs';
import path from 'path';

import { CloudNoteError } from '../../common/cloudnote-error';
import { DatabaseService } from '../../database/database.service';
import { StorageService } from '../storage/storage.service';

interface FileRow {
  id: string | number;
  original_filename: string;
  stored_filename: string;
  storage_key: string;
  deleted_at?: Date | string | null;
  submission_deleted_at?: Date | string | null;
  assignment_deleted_at?: Date | string | null;
}

interface ArchiveFileRow extends FileRow {
  assignment_id: string | number;
  assignment_title: string | null;
  download_structure: string | null;
  submitter_data: unknown;
  student_name: string | null;
  student_id: string | null;
}

export interface DownloadableFile {
  path: string;
  filename: string;
}

export interface ArchiveDownload {
  filename: string;
  files: Array<DownloadableFile & { archiveName: string }>;
}

function safeName(value: unknown, fallback = 'CloudNote'): string {
  const name = String(value || fallback)
    .trim()
    .replace(/[\\/:*?"<>|]+/g, '_')
    .replace(/\s+/g, '_')
    .slice(0, 120);
  return name || fallback;
}

function normalizeSubmitterData(value: unknown): Record<string, string> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, String(item ?? '').trim()]));
}

@Injectable()
export class FilesService {
  constructor(
    private readonly database: DatabaseService,
    private readonly storage: StorageService
  ) {}

  async resolveDownload(id: number): Promise<{ path: string; filename: string }> {
    const file = await this.database.queryOne<FileRow>(
      `
        SELECT
          sf.*,
          s.deleted_at AS submission_deleted_at,
          a.deleted_at AS assignment_deleted_at
        FROM submission_files sf
        LEFT JOIN submission_records s ON s.id = sf.submission_id
        LEFT JOIN assignments a ON a.id = sf.assignment_id
        WHERE sf.id = $1
      `,
      [id]
    );
    if (!file || file.deleted_at || file.submission_deleted_at || file.assignment_deleted_at) throw CloudNoteError.notFound('File not found.');
    return {
      path: this.storage.resolveStoredFilePath(file.storage_key || file.stored_filename),
      filename: file.original_filename,
    };
  }

  async resolveSubmissionDownload(submissionId: number): Promise<DownloadableFile[]> {
    const rows = await this.database.query<FileRow>(
      `
        SELECT
          sf.*,
          s.deleted_at AS submission_deleted_at,
          a.deleted_at AS assignment_deleted_at
        FROM submission_files sf
        LEFT JOIN submission_records s ON s.id = sf.submission_id
        LEFT JOIN assignments a ON a.id = sf.assignment_id
        WHERE sf.submission_id = $1
          AND sf.deleted_at IS NULL
          AND s.deleted_at IS NULL
          AND a.deleted_at IS NULL
        ORDER BY sf.id ASC
      `,
      [submissionId]
    );
    const files = rows
      .map((file) => ({
        path: this.storage.resolveStoredFilePath(file.storage_key || file.stored_filename),
        filename: file.original_filename,
      }))
      .filter((file) => fs.existsSync(file.path));
    if (!files.length) throw CloudNoteError.notFound('Submission files not found.');
    return files;
  }

  async resolveArchiveDownload(query: { assignmentId?: number }): Promise<ArchiveDownload> {
    const params: unknown[] = [];
    const whereParts = ['sf.deleted_at IS NULL', 's.deleted_at IS NULL', 'a.deleted_at IS NULL'];
    if (query.assignmentId) {
      params.push(query.assignmentId);
      whereParts.push(`sf.assignment_id = $${params.length}`);
    }

    const rows = await this.database.query<ArchiveFileRow>(
      `
        SELECT
          sf.*,
          a.id AS assignment_id,
          a.title AS assignment_title,
          a.download_structure,
          s.submitter_data,
          s.student_name,
          s.student_id
        FROM submission_files sf
        LEFT JOIN submission_records s ON s.id = sf.submission_id
        LEFT JOIN assignments a ON a.id = sf.assignment_id
        WHERE ${whereParts.join(' AND ')}
        ORDER BY a.id ASC, s.id ASC, sf.id ASC
      `,
      params
    );

    const files = rows
      .map((file) => {
        const filePath = this.storage.resolveStoredFilePath(file.storage_key || file.stored_filename);
        if (!fs.existsSync(filePath)) return null;
        const submitterData = normalizeSubmitterData(file.submitter_data);
        const assignmentFolder = safeName(file.assignment_title, `assignment-${file.assignment_id}`);
        const submitterFolder = safeName(submitterData.studentId || file.student_id || submitterData.studentName || file.student_name || 'unknown', 'unknown');
        const archiveName =
          file.download_structure === 'task-file'
            ? path.posix.join(assignmentFolder, safeName(file.original_filename, 'file'))
            : path.posix.join(assignmentFolder, submitterFolder, safeName(file.original_filename, 'file'));
        return {
          path: filePath,
          filename: file.original_filename,
          archiveName,
        };
      })
      .filter((file): file is DownloadableFile & { archiveName: string } => Boolean(file));

    if (!files.length) throw CloudNoteError.notFound('No downloadable files found.');
    const filename = query.assignmentId && rows[0]?.assignment_title ? `cloudnote-${safeName(rows[0].assignment_title)}.zip` : 'cloudnote-submissions.zip';
    return { filename, files };
  }

  async softDelete(id: number): Promise<{ deleted: boolean }> {
    const row = await this.database.queryOne<{ id: string }>(
      "UPDATE submission_files SET deleted_at = now(), delete_source = 'file' WHERE id = $1 AND deleted_at IS NULL RETURNING id",
      [id]
    );
    if (!row) throw CloudNoteError.notFound('File not found.');
    return { deleted: true };
  }
}
