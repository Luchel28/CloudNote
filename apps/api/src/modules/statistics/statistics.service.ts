import { Injectable } from '@nestjs/common';
import type { AssignmentStatisticsDto, EffectiveAssignmentStatus, StatisticsDto } from '@cloudnote/shared-types';

import { rowsToCsv } from '../../common/csv';
import { parseOptionalPositiveInt } from '../../common/ids';
import { DatabaseService } from '../../database/database.service';

interface StatisticsQuery {
  assignmentId?: number | string;
  status?: string;
  dateFrom?: string;
  dateTo?: string;
}

interface StatisticsSummaryView {
  assignmentCount: number;
  submittedCount: number;
  submitterCount: number;
  lateCount: number;
  totalAssignments: number;
  ongoingAssignments: number;
  expiredAssignments: number;
  endedAssignments: number;
  archivedAssignments: number;
  deletedAssignments: number;
  totalSubmittedCount: number;
  totalSubmitterCount: number;
}

interface StatisticsRow {
  assignment_id: string | number;
  assignment_title: string;
  status: string;
  deadline: Date | string | null;
  submitted_count: string | number;
  submitter_count: string | number;
  late_count: string | number;
}

interface TrendRow {
  day: string;
  count: string | number;
}

function effectiveStatus(status: string, deadline: Date | string | null): EffectiveAssignmentStatus {
  if (status === 'ended' || status === 'archived' || status === 'deleted') return status;
  if (deadline && new Date(deadline).getTime() < Date.now()) return 'expired';
  return 'ongoing';
}

function toIso(value: Date | string | null): string | null {
  if (!value) return null;
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

function addEffectiveStatusFilter(whereParts: string[], params: unknown[], status: string | undefined, alias = 'a'): void {
  if (!status) {
    whereParts.push(`${alias}.deleted_at IS NULL`, `${alias}.status != 'deleted'`);
    return;
  }

  if (status === 'deleted') {
    whereParts.push(`(${alias}.deleted_at IS NOT NULL OR ${alias}.status = 'deleted')`);
    return;
  }

  whereParts.push(`${alias}.deleted_at IS NULL`, `${alias}.status != 'deleted'`);

  if (status === 'ongoing') {
    whereParts.push(`(${alias}.status = 'ongoing' AND (${alias}.deadline IS NULL OR ${alias}.deadline >= now()))`);
    return;
  }

  if (status === 'expired') {
    whereParts.push(`(${alias}.status = 'ongoing' AND ${alias}.deadline IS NOT NULL AND ${alias}.deadline < now())`);
    return;
  }

  if (status === 'completed') {
    whereParts.push(`(${alias}.status IN ('ended', 'archived') OR (${alias}.status = 'ongoing' AND ${alias}.deadline IS NOT NULL AND ${alias}.deadline < now()))`);
    return;
  }

  if (status === 'ended' || status === 'archived') {
    params.push(status);
    whereParts.push(`${alias}.status = $${params.length}`);
  }
}

function addSubmissionDateFilter(parts: string[], params: unknown[], query: StatisticsQuery, alias = 's'): void {
  if (query.dateFrom) {
    params.push(query.dateFrom);
    parts.push(`${alias}.upload_time >= $${params.length}`);
  }
  if (query.dateTo) {
    params.push(query.dateTo);
    parts.push(`${alias}.upload_time <= $${params.length}`);
  }
}

@Injectable()
export class StatisticsService {
  constructor(private readonly database: DatabaseService) {}

  async getStatistics(query: StatisticsQuery): Promise<StatisticsDto> {
    const params: unknown[] = [];
    const whereParts: string[] = [];
    const joinParts = ['s.assignment_id = a.id', 's.deleted_at IS NULL'];
    addSubmissionDateFilter(joinParts, params, query);
    addEffectiveStatusFilter(whereParts, params, query.status);

    const assignmentId = parseOptionalPositiveInt(query.assignmentId, 'Assignment ID');
    if (assignmentId) {
      params.push(assignmentId);
      whereParts.push(`a.id = $${params.length}`);
    }

    const rows = await this.database.query<StatisticsRow>(
      `
        SELECT
          a.id AS assignment_id,
          a.title AS assignment_title,
          a.status,
          a.deadline,
          COUNT(s.id)::int AS submitted_count,
          COUNT(DISTINCT NULLIF(s.student_id, ''))::int AS submitter_count,
          COUNT(s.id) FILTER (WHERE s.is_late = true)::int AS late_count
        FROM assignments a
        LEFT JOIN submission_records s ON ${joinParts.join(' AND ')}
        WHERE ${whereParts.join(' AND ')}
        GROUP BY a.id
        ORDER BY a.created_at DESC, a.id DESC
      `,
      params
    );
    const items: AssignmentStatisticsDto[] = rows.map((row) => ({
      assignmentId: Number(row.assignment_id),
      assignmentTitle: row.assignment_title,
      effectiveStatus: effectiveStatus(row.status, row.deadline),
      submittedCount: Number(row.submitted_count || 0),
      submitterCount: Number(row.submitter_count || 0),
      lateCount: Number(row.late_count || 0),
      deadline: toIso(row.deadline),
    }));
    const totalSubmitterCount = await this.getTotalSubmitterCount(query);
    const summary = this.buildSummary(items, totalSubmitterCount);
    return {
      summary,
      items,
    };
  }

  async getSubmissionTrend(query: StatisticsQuery): Promise<Array<{ day: string; count: number }>> {
    const params: unknown[] = [];
    const whereParts = ['s.deleted_at IS NULL'];
    if (query.status !== 'deleted') whereParts.push("a.status != 'deleted'", 'a.deleted_at IS NULL');
    addEffectiveStatusFilter(whereParts, params, query.status);

    const assignmentId = parseOptionalPositiveInt(query.assignmentId, 'Assignment ID');
    if (assignmentId) {
      params.push(assignmentId);
      whereParts.push(`s.assignment_id = $${params.length}`);
    }
    addSubmissionDateFilter(whereParts, params, query);

    const rows = await this.database.query<TrendRow>(
      `
        SELECT to_char(s.upload_time AT TIME ZONE 'UTC', 'YYYY-MM-DD') AS day, COUNT(*)::int AS count
        FROM submission_records s
        LEFT JOIN assignments a ON a.id = s.assignment_id
        WHERE ${whereParts.join(' AND ')}
        GROUP BY day
        ORDER BY day ASC
      `,
      params
    );
    return rows.map((row) => ({ day: row.day, count: Number(row.count || 0) }));
  }

  async exportCsv(query: StatisticsQuery): Promise<{ filename: string; content: string }> {
    const stats = await this.getStatistics(query);
    const headers = ['Assignment ID', 'Assignment Title', 'Status', 'Submitted Count', 'Submitter Count', 'Late Count', 'Deadline'];
    const rows = stats.items.map((item) => [
      item.assignmentId,
      item.assignmentTitle,
      item.effectiveStatus,
      item.submittedCount,
      item.submitterCount,
      item.lateCount,
      item.deadline || '',
    ]);
    const suffix = query.assignmentId && stats.items[0] ? `assignment-${stats.items[0].assignmentId}` : 'all';
    return {
      filename: `cloudnote-statistics-${suffix}-${Date.now()}.csv`,
      content: rowsToCsv(headers, rows),
    };
  }

  private async getTotalSubmitterCount(query: StatisticsQuery): Promise<number> {
    const params: unknown[] = [];
    const whereParts = ['s.deleted_at IS NULL'];
    addEffectiveStatusFilter(whereParts, params, query.status);

    const assignmentId = parseOptionalPositiveInt(query.assignmentId, 'Assignment ID');
    if (assignmentId) {
      params.push(assignmentId);
      whereParts.push(`a.id = $${params.length}`);
    }
    addSubmissionDateFilter(whereParts, params, query);

    const row = await this.database.queryOne<{ total: string | number }>(
      `
        SELECT COUNT(DISTINCT COALESCE(NULLIF(BTRIM(s.student_id), ''), NULLIF(BTRIM(s.student_name), ''), s.id::text))::int AS total
        FROM submission_records s
        JOIN assignments a ON s.assignment_id = a.id
        WHERE ${whereParts.join(' AND ')}
      `,
      params
    );
    return Number(row?.total || 0);
  }

  private buildSummary(items: AssignmentStatisticsDto[], totalSubmitterCount: number): StatisticsSummaryView {
    const ongoingAssignments = items.filter((item) => item.effectiveStatus === 'ongoing').length;
    const expiredAssignments = items.filter((item) => item.effectiveStatus === 'expired').length;
    const endedAssignments = items.filter((item) => item.effectiveStatus === 'ended').length;
    const archivedAssignments = items.filter((item) => item.effectiveStatus === 'archived').length;
    const deletedAssignments = items.filter((item) => item.effectiveStatus === 'deleted').length;
    const submittedCount = items.reduce((total, item) => total + item.submittedCount, 0);
    const lateCount = items.reduce((total, item) => total + item.lateCount, 0);
    return {
      assignmentCount: items.length,
      submittedCount,
      submitterCount: totalSubmitterCount,
      lateCount,
      totalAssignments: items.length,
      ongoingAssignments,
      expiredAssignments,
      endedAssignments,
      archivedAssignments,
      deletedAssignments,
      totalSubmittedCount: submittedCount,
      totalSubmitterCount: totalSubmitterCount,
    };
  }
}
