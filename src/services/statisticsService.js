const { allDb, getDb } = require('../db');
const {
  addEffectiveStatusFilter,
  getEffectiveStatus,
  normalizeStatus,
} = require('../utils/assignmentUtils');

async function getStatistics({ assignmentId = null, status = '', dateFrom = '', dateTo = '' } = {}) {
  const whereParts = ["a.status != 'deleted'"];
  const whereParams = [];
  const joinParts = ['s.assignment_id = a.id', 's.deleted_at IS NULL'];
  const joinParams = [];
  if (assignmentId) {
    whereParts.push('a.id = ?');
    whereParams.push(assignmentId);
  }
  addEffectiveStatusFilter(whereParts, whereParams, status);
  if (dateFrom) {
    joinParts.push('datetime(s.upload_time) >= datetime(?)');
    joinParams.push(dateFrom);
  }
  if (dateTo) {
    joinParts.push('datetime(s.upload_time) <= datetime(?)');
    joinParams.push(dateTo);
  }
  const where = whereParts.length ? `WHERE ${whereParts.join(' AND ')}` : '';
  const joinSql = joinParts.join(' AND ');
  const rows = await allDb(
    `
      SELECT
        a.id AS assignmentId,
        a.title AS assignmentTitle,
        a.deadline,
        a.status,
        COUNT(s.id) AS submittedCount,
        COUNT(DISTINCT COALESCE(NULLIF(TRIM(s.student_id), ''), NULLIF(TRIM(s.student_name), ''), s.id)) AS submitterCount,
        SUM(CASE WHEN s.is_late = 1 THEN 1 ELSE 0 END) AS lateCount
      FROM assignments a
      LEFT JOIN submissions s ON ${joinSql}
      ${where}
      GROUP BY a.id
      ORDER BY datetime(a.created_at) DESC, a.id DESC
    `,
    [...joinParams, ...whereParams]
  );
  return rows.map((row) => {
    const effectiveStatus = getEffectiveStatus(row);
    const totalCount = Number(row.submittedCount || 0);
    return {
      assignmentId: row.assignmentId,
      assignmentTitle: row.assignmentTitle,
      deadline: row.deadline,
      status: normalizeStatus(row.status),
      effectiveStatus,
      submittedCount: totalCount,
      submitterCount: Number(row.submitterCount || 0),
      totalCount,
      completionRate: null,
      submissionStatus: totalCount > 0 ? '已有提交' : '暂无提交',
      lateCount: Number(row.lateCount || 0),
      expiredSubmissionCount: effectiveStatus === 'expired' ? totalCount : 0,
    };
  });
}

async function getSubmissionTrend({ assignmentId = null, status = '', dateFrom = '', dateTo = '' } = {}) {
  const where = ['s.deleted_at IS NULL', "(a.id IS NULL OR a.status != 'deleted')"];
  const params = [];
  if (assignmentId) {
    where.push('s.assignment_id = ?');
    params.push(assignmentId);
  }
  addEffectiveStatusFilter(where, params, status);
  if (dateFrom) {
    where.push('datetime(s.upload_time) >= datetime(?)');
    params.push(dateFrom);
  }
  if (dateTo) {
    where.push('datetime(s.upload_time) <= datetime(?)');
    params.push(dateTo);
  }
  const rows = await allDb(
    `
      SELECT substr(s.upload_time, 1, 10) AS day, COUNT(*) AS count
      FROM submissions s
      LEFT JOIN assignments a ON a.id = s.assignment_id
      WHERE ${where.join(' AND ')}
      GROUP BY day
      ORDER BY day ASC
    `,
    params
  );
  return rows.map((row) => ({ day: row.day, count: Number(row.count || 0) }));
}

async function getTotalSubmitterCount({ assignmentId = null, status = '', dateFrom = '', dateTo = '' } = {}) {
  const where = ['s.deleted_at IS NULL', "a.status != 'deleted'"];
  const params = [];
  if (assignmentId) {
    where.push('a.id = ?');
    params.push(assignmentId);
  }
  addEffectiveStatusFilter(where, params, status);
  if (dateFrom) {
    where.push('datetime(s.upload_time) >= datetime(?)');
    params.push(dateFrom);
  }
  if (dateTo) {
    where.push('datetime(s.upload_time) <= datetime(?)');
    params.push(dateTo);
  }
  const row = await getDb(
    `
      SELECT COUNT(DISTINCT COALESCE(NULLIF(TRIM(s.student_id), ''), NULLIF(TRIM(s.student_name), ''), s.id)) AS total
      FROM submissions s
      JOIN assignments a ON s.assignment_id = a.id
      WHERE ${where.join(' AND ')}
    `,
    params
  );
  return Number(row?.total || 0);
}

function buildSummary(items, totalSubmitterCount = null) {
  return {
    totalAssignments: items.length,
    ongoingAssignments: items.filter((item) => item.effectiveStatus === 'ongoing').length,
    endedAssignments: items.filter((item) => item.effectiveStatus === 'ended').length,
    archivedAssignments: items.filter((item) => item.effectiveStatus === 'archived').length,
    expiredAssignments: items.filter((item) => item.effectiveStatus === 'expired').length,
    totalSubmittedCount: items.reduce((sum, item) => sum + item.submittedCount, 0),
    totalSubmitterCount: totalSubmitterCount ?? items.reduce((sum, item) => sum + item.submitterCount, 0),
    totalRecordCount: items.reduce((sum, item) => sum + item.totalCount, 0),
    lateCount: items.reduce((sum, item) => sum + item.lateCount, 0),
  };
}

module.exports = {
  getStatistics,
  getSubmissionTrend,
  getTotalSubmitterCount,
  buildSummary,
};
