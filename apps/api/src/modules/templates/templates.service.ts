import { Injectable } from '@nestjs/common';
import type { PageQuery, PageResult, TemplateDto, TemplateMutationInput } from '@cloudnote/shared-types';

import { CloudNoteError } from '../../common/cloudnote-error';
import { buildPageResult, parsePage, parsePerPage } from '../../common/pagination';
import { DatabaseService } from '../../database/database.service';

interface TemplateRow {
  id: string | number;
  name: string;
  category: TemplateDto['category'];
  visibility: TemplateDto['visibility'];
  data: unknown;
  created_at: Date | string;
  updated_at: Date | string;
  deleted_at?: Date | string | null;
}

function toIso(value: Date | string | null | undefined): string | null {
  if (!value) return null;
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

function mapTemplate(row: TemplateRow): TemplateDto {
  return {
    id: Number(row.id),
    name: row.name,
    category: row.category || 'course',
    visibility: row.visibility || 'private',
    data: row.data && typeof row.data === 'object' ? (row.data as Record<string, unknown>) : {},
    createdAt: toIso(row.created_at) || new Date().toISOString(),
    updatedAt: toIso(row.updated_at) || new Date().toISOString(),
    deletedAt: toIso(row.deleted_at),
  };
}

function normalizeInput(input: TemplateMutationInput): Required<TemplateMutationInput> {
  const name = String(input.name || '').trim();
  if (!name) throw CloudNoteError.badRequest('VALIDATION_FAILED', 'Template name is required.');
  return {
    name,
    category: ['course', 'exam', 'material'].includes(String(input.category)) ? input.category || 'course' : 'course',
    visibility: input.visibility === 'class' ? 'class' : 'private',
    data: input.data || {},
  };
}

@Injectable()
export class TemplatesService {
  constructor(private readonly database: DatabaseService) {}

  async list(query: PageQuery & { category?: string }): Promise<PageResult<TemplateDto>> {
    const page = parsePage(query.page);
    const perPage = parsePerPage(query.perPage, 20, 100);
    const offset = (page - 1) * perPage;
    const params: unknown[] = [];
    const whereParts = ['deleted_at IS NULL'];
    if (query.category && ['course', 'exam', 'material'].includes(String(query.category))) {
      params.push(query.category);
      whereParts.push(`category = $${params.length}`);
    }
    if (query.search) {
      params.push(`%${String(query.search).trim()}%`);
      whereParts.push(`name ILIKE $${params.length}`);
    }
    const where = `WHERE ${whereParts.join(' AND ')}`;
    const count = await this.database.queryOne<{ total: string }>(`SELECT COUNT(*)::int AS total FROM assignment_templates ${where}`, params);
    params.push(perPage, offset);
    const rows = await this.database.query<TemplateRow>(
      `SELECT * FROM assignment_templates ${where} ORDER BY updated_at DESC, id DESC LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params
    );
    return buildPageResult(rows.map(mapTemplate), Number(count?.total || 0), page, perPage);
  }

  async create(input: TemplateMutationInput): Promise<TemplateDto> {
    const data = normalizeInput(input);
    const row = await this.database.queryOne<TemplateRow>(
      `
        INSERT INTO assignment_templates (name, category, visibility, data)
        VALUES ($1, $2, $3, $4::jsonb)
        RETURNING *
      `,
      [data.name, data.category, data.visibility, JSON.stringify(data.data)]
    );
    if (!row) throw new Error('INSERT_FAILED');
    return mapTemplate(row);
  }

  async update(id: number, input: TemplateMutationInput): Promise<TemplateDto> {
    const data = normalizeInput(input);
    const row = await this.database.queryOne<TemplateRow>(
      `
        UPDATE assignment_templates
        SET name = $1, category = $2, visibility = $3, data = $4::jsonb, updated_at = now()
        WHERE id = $5 AND deleted_at IS NULL
        RETURNING *
      `,
      [data.name, data.category, data.visibility, JSON.stringify(data.data), id]
    );
    if (!row) throw CloudNoteError.notFound('Template not found.');
    return mapTemplate(row);
  }

  async softDelete(id: number): Promise<{ deleted: boolean }> {
    const row = await this.database.queryOne<{ id: string }>(
      "UPDATE assignment_templates SET deleted_at = now(), delete_source = 'template', updated_at = now() WHERE id = $1 AND deleted_at IS NULL RETURNING id",
      [id]
    );
    if (!row) throw CloudNoteError.notFound('Template not found.');
    return { deleted: true };
  }
}
