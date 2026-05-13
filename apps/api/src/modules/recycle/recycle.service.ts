import { Injectable } from '@nestjs/common';
import type { PageQuery, PageResult, RecycleItemDto, RecycleItemType, RecycleSelectionItem } from '@cloudnote/shared-types';

import { CloudNoteError } from '../../common/cloudnote-error';
import { buildPageResult, parsePage, parsePerPage } from '../../common/pagination';
import { DatabaseService } from '../../database/database.service';
import { StorageService } from '../storage/storage.service';

interface RecycleRow {
  type: RecycleItemType;
  id: string | number;
  title: string;
  deleted_at: Date | string;
  source: string;
}

interface StoredFileRow {
  storage_key: string | null;
  stored_filename: string | null;
}

function toIso(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

function mapRecycleItem(row: RecycleRow): RecycleItemDto {
  const deletedTime = new Date(row.deleted_at).getTime();
  const remainingDays = Number.isFinite(deletedTime)
    ? Math.max(0, Math.ceil((deletedTime + 7 * 24 * 60 * 60 * 1000 - Date.now()) / (24 * 60 * 60 * 1000)))
    : 7;
  return {
    type: row.type,
    id: Number(row.id),
    title: row.title,
    deletedAt: toIso(row.deleted_at),
    source: row.source || row.type,
    remainingDays,
    size: 0,
    fileCount: 0,
    recoverable: true,
  };
}

function normalizeItems(body: { items?: RecycleSelectionItem[] } | RecycleSelectionItem[]): RecycleSelectionItem[] {
  const source = Array.isArray(body) ? body : body.items || [];
  return source
    .map((item) => ({ type: item.type, id: Number(item.id) }))
    .filter((item): item is RecycleSelectionItem => ['task', 'submission', 'file', 'template'].includes(item.type) && Number.isInteger(item.id));
}

function getRecycleOrderBy(sort: unknown): string {
  switch (String(sort || 'recent')) {
    case 'oldest':
    case 'retention':
      return 'deleted_at ASC, id ASC';
    case 'name':
      return 'title ASC, deleted_at DESC';
    case 'size':
    case 'recent':
    default:
      return 'deleted_at DESC, id DESC';
  }
}

@Injectable()
export class RecycleService {
  constructor(
    private readonly database: DatabaseService,
    private readonly storage: StorageService
  ) {}

  async list(query: PageQuery & { type?: string }): Promise<PageResult<RecycleItemDto>> {
    const page = parsePage(query.page);
    const perPage = parsePerPage(query.perPage, 20, 100);
    const offset = (page - 1) * perPage;
    const params: unknown[] = [];
    const whereParts: string[] = [];
    const typeFilter = query.type && ['task', 'submission', 'file', 'template'].includes(String(query.type)) ? String(query.type) : '';
    if (typeFilter) {
      params.push(typeFilter);
      whereParts.push(`type = $${params.length}`);
    }
    if (query.search) {
      params.push(`%${String(query.search).trim()}%`);
      whereParts.push(`(title ILIKE $${params.length} OR source ILIKE $${params.length} OR type ILIKE $${params.length})`);
    }

    const unionSql = `
      SELECT 'task'::text AS type, id, title, deleted_at, COALESCE(delete_source, 'task') AS source FROM assignments WHERE deleted_at IS NOT NULL
      UNION ALL
      SELECT 'submission'::text AS type, id, COALESCE(NULLIF(homework_title, ''), student_name, 'Submission') AS title, deleted_at, COALESCE(delete_source, 'submission') AS source FROM submission_records WHERE deleted_at IS NOT NULL
      UNION ALL
      SELECT 'file'::text AS type, id, original_filename AS title, deleted_at, COALESCE(delete_source, 'file') AS source FROM submission_files WHERE deleted_at IS NOT NULL
      UNION ALL
      SELECT 'template'::text AS type, id, name AS title, deleted_at, COALESCE(delete_source, 'template') AS source FROM assignment_templates WHERE deleted_at IS NOT NULL
    `;
    const where = whereParts.length ? `WHERE ${whereParts.join(' AND ')}` : '';
    const count = await this.database.queryOne<{ total: string }>(`SELECT COUNT(*)::int AS total FROM (${unionSql}) recycle ${where}`, params);
    params.push(perPage, offset);
    const rows = await this.database.query<RecycleRow>(
      `SELECT * FROM (${unionSql}) recycle ${where} ORDER BY ${getRecycleOrderBy(query.sort)} LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params
    );
    return buildPageResult(rows.map(mapRecycleItem), Number(count?.total || 0), page, perPage);
  }

  async restore(body: { items?: RecycleSelectionItem[] } | RecycleSelectionItem[]): Promise<{ restored: number }> {
    const items = normalizeItems(body);
    if (!items.length) throw CloudNoteError.badRequest('VALIDATION_FAILED', 'No recycle items selected.');
    let restored = 0;
    for (const item of items) {
      const result = await this.restoreOne(item);
      if (result) restored += 1;
    }
    return { restored };
  }

  async purge(body: { items?: RecycleSelectionItem[] } | RecycleSelectionItem[]): Promise<{ purged: number }> {
    const items = normalizeItems(body);
    if (!items.length) throw CloudNoteError.badRequest('VALIDATION_FAILED', 'No recycle items selected.');
    let purged = 0;
    for (const item of items) {
      const result = await this.purgeOne(item);
      if (result) purged += 1;
    }
    return { purged };
  }

  async purgeAll(): Promise<{ purged: number }> {
    const rows = await this.database.query<{ type: RecycleItemType; id: string | number }>(
      `
        SELECT 'task'::text AS type, id FROM assignments WHERE deleted_at IS NOT NULL
        UNION ALL
        SELECT 'submission'::text AS type, id FROM submission_records WHERE deleted_at IS NOT NULL
        UNION ALL
        SELECT 'file'::text AS type, id FROM submission_files WHERE deleted_at IS NOT NULL
        UNION ALL
        SELECT 'template'::text AS type, id FROM assignment_templates WHERE deleted_at IS NOT NULL
        ORDER BY type ASC, id ASC
      `
    );
    return this.purge(rows.map((row) => ({ type: row.type, id: Number(row.id) })));
  }

  private async restoreOne(item: RecycleSelectionItem): Promise<boolean> {
    if (item.type === 'task') return this.restoreTask(item.id);
    if (item.type === 'submission') return this.restoreSubmission(item.id);
    if (item.type === 'file') return this.restoreFile(item.id);
    return this.restoreTemplate(item.id);
  }

  private async purgeOne(item: RecycleSelectionItem): Promise<boolean> {
    if (item.type === 'task') return this.purgeTask(item.id);
    if (item.type === 'submission') return this.purgeSubmission(item.id);
    if (item.type === 'file') return this.purgeFile(item.id);
    const row = await this.database.queryOne<{ id: string }>('DELETE FROM assignment_templates WHERE id = $1 AND deleted_at IS NOT NULL RETURNING id', [item.id]);
    return Boolean(row);
  }

  private async restoreTask(id: number): Promise<boolean> {
    const restored = await this.database.transaction(async (client) => {
      const task = await client.query<{ id: string }>(
        `
          UPDATE assignments
          SET deleted_at = NULL,
              delete_source = NULL,
              status = COALESCE(NULLIF(previous_status, 'deleted'), 'ongoing'),
              updated_at = now()
          WHERE id = $1 AND deleted_at IS NOT NULL
          RETURNING id
        `,
        [id]
      );
      if (!task.rowCount) return false;
      await client.query("UPDATE submission_records SET deleted_at = NULL, delete_source = NULL WHERE assignment_id = $1 AND deleted_at IS NOT NULL AND delete_source = 'task'", [id]);
      await client.query("UPDATE submission_files SET deleted_at = NULL, delete_source = NULL WHERE assignment_id = $1 AND deleted_at IS NOT NULL AND delete_source = 'task'", [id]);
      return true;
    });
    return restored;
  }

  private async restoreSubmission(id: number): Promise<boolean> {
    const submission = await this.database.queryOne<{ id: string; assignment_deleted_at: Date | string | null }>(
      `
        SELECT s.id, a.deleted_at AS assignment_deleted_at
        FROM submission_records s
        LEFT JOIN assignments a ON a.id = s.assignment_id
        WHERE s.id = $1 AND s.deleted_at IS NOT NULL
      `,
      [id]
    );
    if (!submission) return false;
    if (submission.assignment_deleted_at) throw CloudNoteError.badRequest('RESTORE_PARENT_TASK_FIRST', 'Restore the parent assignment before restoring this submission.');

    return this.database.transaction(async (client) => {
      const result = await client.query<{ id: string }>('UPDATE submission_records SET deleted_at = NULL, delete_source = NULL WHERE id = $1 AND deleted_at IS NOT NULL RETURNING id', [id]);
      if (!result.rowCount) return false;
      await client.query("UPDATE submission_files SET deleted_at = NULL, delete_source = NULL WHERE submission_id = $1 AND deleted_at IS NOT NULL AND delete_source = 'submission'", [id]);
      return true;
    });
  }

  private async restoreFile(id: number): Promise<boolean> {
    const file = await this.database.queryOne<{
      id: string;
      storage_key: string | null;
      stored_filename: string | null;
      delete_source: string | null;
      submission_id: string | number | null;
      submission_deleted_at: Date | string | null;
      submission_delete_source: string | null;
      assignment_deleted_at: Date | string | null;
    }>(
      `
        SELECT
          sf.id,
          sf.storage_key,
          sf.stored_filename,
          sf.delete_source,
          sf.submission_id,
          s.deleted_at AS submission_deleted_at,
          s.delete_source AS submission_delete_source,
          a.deleted_at AS assignment_deleted_at
        FROM submission_files sf
        LEFT JOIN submission_records s ON s.id = sf.submission_id
        LEFT JOIN assignments a ON a.id = sf.assignment_id
        WHERE sf.id = $1 AND sf.deleted_at IS NOT NULL
      `,
      [id]
    );
    if (!file) return false;
    if (file.assignment_deleted_at || file.delete_source === 'task') throw CloudNoteError.badRequest('RESTORE_PARENT_TASK_FIRST', 'Restore the parent assignment before restoring this file.');
    if (file.delete_source === 'submission' && file.submission_id) return this.restoreSubmission(Number(file.submission_id));

    return this.database.transaction(async (client) => {
      if (file.submission_deleted_at && file.submission_delete_source === 'submission' && file.submission_id) {
        await client.query('UPDATE submission_records SET deleted_at = NULL, delete_source = NULL WHERE id = $1', [file.submission_id]);
      }
      const result = await client.query<{ id: string }>('UPDATE submission_files SET deleted_at = NULL, delete_source = NULL WHERE id = $1 AND deleted_at IS NOT NULL RETURNING id', [id]);
      return Boolean(result.rowCount);
    });
  }

  private async restoreTemplate(id: number): Promise<boolean> {
    const row = await this.database.queryOne<{ id: string }>(
      'UPDATE assignment_templates SET deleted_at = NULL, delete_source = NULL, updated_at = now() WHERE id = $1 AND deleted_at IS NOT NULL RETURNING id',
      [id]
    );
    return Boolean(row);
  }

  private async purgeTask(id: number): Promise<boolean> {
    const files = await this.database.query<StoredFileRow>(
      `
        SELECT storage_key, stored_filename
        FROM submission_files
        WHERE assignment_id = $1
           OR submission_id IN (SELECT id FROM submission_records WHERE assignment_id = $1)
      `,
      [id]
    );
    const deleted = await this.database.transaction(async (client) => {
      await client.query('DELETE FROM submission_files WHERE assignment_id = $1 OR submission_id IN (SELECT id FROM submission_records WHERE assignment_id = $1)', [id]);
      await client.query('DELETE FROM submission_records WHERE assignment_id = $1', [id]);
      const result = await client.query<{ id: string }>('DELETE FROM assignments WHERE id = $1 AND deleted_at IS NOT NULL RETURNING id', [id]);
      return Boolean(result.rowCount);
    });
    if (deleted) await this.removeFiles(files);
    return deleted;
  }

  private async purgeSubmission(id: number): Promise<boolean> {
    const files = await this.database.query<StoredFileRow>('SELECT storage_key, stored_filename FROM submission_files WHERE submission_id = $1', [id]);
    const deleted = await this.database.transaction(async (client) => {
      await client.query('DELETE FROM submission_files WHERE submission_id = $1', [id]);
      const result = await client.query<{ id: string }>('DELETE FROM submission_records WHERE id = $1 AND deleted_at IS NOT NULL RETURNING id', [id]);
      return Boolean(result.rowCount);
    });
    if (deleted) await this.removeFiles(files);
    return deleted;
  }

  private async purgeFile(id: number): Promise<boolean> {
    const file = await this.database.queryOne<StoredFileRow>('SELECT storage_key, stored_filename FROM submission_files WHERE id = $1 AND deleted_at IS NOT NULL', [id]);
    if (!file) return false;
    await this.database.query('DELETE FROM submission_files WHERE id = $1', [id]);
    await this.removeFiles([file]);
    return true;
  }

  private async removeFiles(files: StoredFileRow[]): Promise<void> {
    await Promise.all(files.map((file) => this.storage.removeStoredFile(file.storage_key || file.stored_filename || '')));
  }
}
