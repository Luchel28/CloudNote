import { Injectable } from '@nestjs/common';
import type { AssignmentDto, AssignmentMutationInput, PageQuery, PageResult, PublicAssignmentQuery } from '@cloudnote/shared-types';

import { buildPageResult, parsePage, parsePerPage } from '../../common/pagination';
import { generateShareCode, normalizeShareCode } from '../../common/share-code';
import { DatabaseService } from '../../database/database.service';
import { CloudNoteError } from '../../common/cloudnote-error';
import { AssignmentRow, mapAssignment, normalizeAssignmentInput } from './assignment.mapper';

const ASSIGNMENT_SELECT = `
  SELECT
    a.*,
    COUNT(s.id)::int AS submission_count,
    COUNT(DISTINCT NULLIF(s.student_id, ''))::int AS submitter_count
  FROM assignments a
  LEFT JOIN submission_records s ON s.assignment_id = a.id AND s.deleted_at IS NULL
`;

function addAssignmentStatusFilter(whereParts: string[], params: unknown[], status: string | undefined): void {
  const value = String(status || '').trim();
  if (!value) {
    whereParts.push('a.deleted_at IS NULL', "a.status != 'deleted'");
    return;
  }

  if (value === 'deleted') {
    whereParts.push("(a.deleted_at IS NOT NULL OR a.status = 'deleted')");
    return;
  }

  whereParts.push('a.deleted_at IS NULL', "a.status != 'deleted'");

  if (value === 'ongoing') {
    whereParts.push("(a.status = 'ongoing' AND (a.deadline IS NULL OR a.deadline >= now()))");
    return;
  }

  if (value === 'expired') {
    whereParts.push("(a.status = 'ongoing' AND a.deadline IS NOT NULL AND a.deadline < now())");
    return;
  }

  if (value === 'completed') {
    whereParts.push("(a.status IN ('ended', 'archived') OR (a.status = 'ongoing' AND a.deadline IS NOT NULL AND a.deadline < now()))");
    return;
  }

  if (value === 'ended' || value === 'archived') {
    params.push(value);
    whereParts.push(`a.status = $${params.length}`);
  }
}

function addAssignmentSearchFilter(whereParts: string[], params: unknown[], search: unknown): void {
  const text = String(search || '').trim();
  if (!text) return;

  const idSearch = text.match(/[?&]id=(\d+)/i)?.[1] || (/^\d+$/.test(text) ? text : '');
  const codeSearch = text.match(/[?&]code=([A-Za-z0-9_-]+)/i)?.[1] || (/^[A-Za-z0-9_-]{8,64}$/.test(text) ? text : '');
  params.push(`%${text}%`);
  const likeIndex = params.length;
  const parts = [`a.title ILIKE $${likeIndex}`, `a.description ILIKE $${likeIndex}`, `a.share_code ILIKE $${likeIndex}`, `CAST(a.id AS TEXT) ILIKE $${likeIndex}`];
  if (idSearch) {
    params.push(Number(idSearch));
    parts.push(`a.id = $${params.length}`);
  }
  if (codeSearch) {
    params.push(codeSearch);
    parts.push(`a.share_code = $${params.length}`);
  }
  whereParts.push(`(${parts.join(' OR ')})`);
}

function getAssignmentOrderBy(sort: unknown): string {
  switch (String(sort || 'created-desc')) {
    case 'created-asc':
      return 'a.created_at ASC, a.id ASC';
    case 'deadline-asc':
      return "COALESCE(a.deadline, '9999-12-31'::timestamptz) ASC, a.id DESC";
    case 'deadline-desc':
      return "COALESCE(a.deadline, '0001-01-01'::timestamptz) DESC, a.id DESC";
    case 'title-asc':
      return 'a.title ASC, a.id DESC';
    case 'title-desc':
      return 'a.title DESC, a.id DESC';
    case 'submissions-desc':
      return 'submission_count DESC, a.created_at DESC, a.id DESC';
    default:
      return 'a.created_at DESC, a.id DESC';
  }
}

@Injectable()
export class AssignmentsService {
  constructor(private readonly database: DatabaseService) {}

  async list(query: PageQuery & { status?: string }): Promise<PageResult<AssignmentDto>> {
    const page = parsePage(query.page);
    const perPage = parsePerPage(query.perPage, 20, 100);
    const offset = (page - 1) * perPage;
    const whereParts: string[] = [];
    const params: unknown[] = [];

    addAssignmentStatusFilter(whereParts, params, query.status);
    addAssignmentSearchFilter(whereParts, params, query.search);

    const where = `WHERE ${whereParts.join(' AND ')}`;
    const count = await this.database.queryOne<{ total: string }>(`SELECT COUNT(*)::int AS total FROM assignments a ${where}`, params);
    params.push(perPage, offset);
    const rows = await this.database.query<AssignmentRow>(
      `${ASSIGNMENT_SELECT} ${where} GROUP BY a.id ORDER BY ${getAssignmentOrderBy(query.sort)} LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params
    );
    return buildPageResult(rows.map(mapAssignment), Number(count?.total || 0), page, perPage);
  }

  async findAdmin(id: number): Promise<AssignmentDto> {
    const row = await this.findRowById(id, false);
    if (!row) throw CloudNoteError.notFound('Assignment not found.');
    return mapAssignment(row);
  }

  async findPublic(query: PublicAssignmentQuery): Promise<AssignmentDto> {
    let row: AssignmentRow | null = null;
    if (query.code) {
      const code = normalizeShareCode(query.code);
      if (!code) throw CloudNoteError.notFound('Assignment link is invalid.');
      row = await this.findRowByShareCode(code);
    } else if (query.id) {
      row = await this.findRowById(Number(query.id), true);
    }
    if (!row) throw CloudNoteError.notFound('Assignment not found.');
    if (row.status === 'deleted' || row.deleted_at) throw new CloudNoteError(410, 'NOT_FOUND', 'Assignment has been deleted.');
    return mapAssignment(row);
  }

  async create(input: AssignmentMutationInput): Promise<AssignmentDto> {
    const data = normalizeAssignmentInput(input);
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const shareCode = generateShareCode();
      try {
        const row = await this.database.queryOne<AssignmentRow>(
          `
            INSERT INTO assignments (
              title, description, deadline, status, previous_status, share_code, field_config,
              allow_late, allow_repeat, repeat_mode, max_files, max_file_size_mb, allowed_extensions,
              rename_enabled, rename_fields, download_structure, required_upload, file_type, enable_limit, allow_folder
            )
            VALUES (
              $1, $2, $3, $4, $4, $5, $6::jsonb,
              $7, $8, $9, $10, $11, $12::jsonb,
              $13, $14::jsonb, $15, $16, $17, $18, $19
            )
            RETURNING *
          `,
          [
            data.title,
            data.description,
            data.deadline,
            data.status,
            shareCode,
            JSON.stringify(data.fieldConfig),
            data.allowLate,
            data.allowRepeat,
            data.repeatMode,
            data.maxFiles,
            data.maxFileSizeMb,
            JSON.stringify(data.allowedExtensions),
            data.renameEnabled,
            JSON.stringify(data.renameFields),
            data.downloadStructure,
            data.requiredUpload,
            data.fileType,
            data.enableLimit,
            data.allowFolder,
          ]
        );
        if (!row) throw new Error('INSERT_FAILED');
        return mapAssignment({ ...row, submission_count: 0, submitter_count: 0 });
      } catch (error) {
        if (String(error instanceof Error ? error.message : error).includes('idx_assignments_share_code')) continue;
        throw error;
      }
    }
    throw CloudNoteError.conflict('Unable to generate a unique assignment share code.');
  }

  async update(id: number, input: AssignmentMutationInput): Promise<AssignmentDto> {
    const data = normalizeAssignmentInput(input);
    const row = await this.database.queryOne<AssignmentRow>(
      `
        UPDATE assignments
        SET title = $1,
            description = $2,
            deadline = $3,
            status = $4,
            field_config = $5::jsonb,
            allow_late = $6,
            allow_repeat = $7,
            repeat_mode = $8,
            max_files = $9,
            max_file_size_mb = $10,
            allowed_extensions = $11::jsonb,
            rename_enabled = $12,
            rename_fields = $13::jsonb,
            download_structure = $14,
            required_upload = $15,
            file_type = $16,
            enable_limit = $17,
            allow_folder = $18,
            updated_at = now()
        WHERE id = $19 AND deleted_at IS NULL
        RETURNING *
      `,
      [
        data.title,
        data.description,
        data.deadline,
        data.status,
        JSON.stringify(data.fieldConfig),
        data.allowLate,
        data.allowRepeat,
        data.repeatMode,
        data.maxFiles,
        data.maxFileSizeMb,
        JSON.stringify(data.allowedExtensions),
        data.renameEnabled,
        JSON.stringify(data.renameFields),
        data.downloadStructure,
        data.requiredUpload,
        data.fileType,
        data.enableLimit,
        data.allowFolder,
        id,
      ]
    );
    if (!row) throw CloudNoteError.notFound('Assignment not found.');
    return mapAssignment({ ...row, submission_count: 0, submitter_count: 0 });
  }

  async softDelete(id: number): Promise<{ deleted: boolean }> {
    const row = await this.database.transaction(async (client) => {
      const existing = await client.query<AssignmentRow>('SELECT * FROM assignments WHERE id = $1 AND deleted_at IS NULL', [id]);
      if (!existing.rowCount) return null;
      await client.query("UPDATE submission_records SET deleted_at = now(), delete_source = 'task' WHERE assignment_id = $1 AND deleted_at IS NULL", [id]);
      await client.query("UPDATE submission_files SET deleted_at = now(), delete_source = 'task' WHERE assignment_id = $1 AND deleted_at IS NULL", [id]);
      const result = await client.query<AssignmentRow>(
        "UPDATE assignments SET previous_status = status, status = 'deleted', deleted_at = now(), delete_source = 'task', updated_at = now() WHERE id = $1 RETURNING *",
        [id]
      );
      return result.rows[0] || null;
    });
    if (!row) throw CloudNoteError.notFound('Assignment not found.');
    return { deleted: true };
  }

  private async findRowById(id: number, publicOnly: boolean): Promise<AssignmentRow | null> {
    const where = publicOnly ? 'WHERE a.id = $1 AND a.deleted_at IS NULL' : 'WHERE a.id = $1';
    return this.database.queryOne<AssignmentRow>(`${ASSIGNMENT_SELECT} ${where} GROUP BY a.id`, [id]);
  }

  private async findRowByShareCode(shareCode: string): Promise<AssignmentRow | null> {
    return this.database.queryOne<AssignmentRow>(`${ASSIGNMENT_SELECT} WHERE a.share_code = $1 GROUP BY a.id`, [shareCode]);
  }
}
