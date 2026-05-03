(function (window, document) {
  'use strict';

  const CloudNote = (window.CloudNote = window.CloudNote || {});
  const common = CloudNote.common || {};
  const api = CloudNote.api || {};
  const $ = common.$ || ((selector) => document.querySelector(selector));
  const escapeHtml = common.escapeHtml || ((value) => String(value ?? ''));
  const setMessage = common.setMessage || (() => {});
  const formatTime = common.formatTime || common.formatDateTime || ((value) => value || '-');
  const getStatusLabel = common.getStatusLabel || ((status) => status || '进行中');

  function debugRecord(action, details = {}) {
    try {
      window.CloudNoteDebug?.record?.(action, { page: 'admin', ...details });
    } catch {}
  }

  let initialized = false;

  function getElements() {
    return {
      statisticsAssignmentFilter: $('#statisticsAssignmentFilter'),
      statisticsStartDate: $('#statisticsStartDate'),
      statisticsEndDate: $('#statisticsEndDate'),
      statisticsStatusFilter: $('#statisticsStatusFilter'),
      statisticsSummary: $('#statisticsSummary'),
      statisticsTable: $('#statisticsTable'),
      statisticsMessage: $('#statisticsMessage'),
      exportStatisticsButton: $('#exportStatisticsButton'),
      submissionTrendChart: $('#submissionTrendChart'),
      statusDistributionChart: $('#statusDistributionChart'),
    };
  }

  function getFilterParams() {
    const { statisticsAssignmentFilter, statisticsStartDate, statisticsEndDate, statisticsStatusFilter } = getElements();
    const params = new URLSearchParams();
    if (statisticsAssignmentFilter?.value) params.set('assignmentId', statisticsAssignmentFilter.value);
    if (statisticsStartDate?.value) params.set('dateFrom', statisticsStartDate.value);
    if (statisticsEndDate?.value) params.set('dateTo', `${statisticsEndDate.value}T23:59:59`);
    if (statisticsStatusFilter?.value) params.set('status', statisticsStatusFilter.value);
    return params;
  }

  function getExportPayload() {
    const { statisticsAssignmentFilter, statisticsStartDate, statisticsEndDate, statisticsStatusFilter } = getElements();
    return {
      assignmentId: statisticsAssignmentFilter?.value || null,
      status: statisticsStatusFilter?.value || '',
      dateFrom: statisticsStartDate?.value || '',
      dateTo: statisticsEndDate?.value ? `${statisticsEndDate.value}T23:59:59` : '',
    };
  }

  function normalizeStatisticsStatus(status) {
    if (status === 'deleted') return '\u5df2\u5220\u9664';
    if (status === 'ongoing') return '\u8fdb\u884c\u4e2d';
    return '\u5df2\u5b8c\u6210';
  }

  function renderSummary(summary = {}) {
    const { statisticsSummary } = getElements();
    if (!statisticsSummary) return;
    const completedAssignments = Number(summary.endedAssignments || 0) + Number(summary.expiredAssignments || 0) + Number(summary.archivedAssignments || 0);
    statisticsSummary.innerHTML = `
      <div class="stat-card stat-card-icon"><span>\u4efb\u52a1\u603b\u6570</span><strong>${summary.totalAssignments || 0}</strong><small>\u6240\u6709\u4efb\u52a1</small></div>
      <div class="stat-card stat-card-icon"><span>\u8fdb\u884c\u4e2d</span><strong>${summary.ongoingAssignments || 0}</strong><small>\u6b63\u5728\u6536\u96c6</small></div>
      <div class="stat-card stat-card-icon"><span>\u5df2\u5b8c\u6210</span><strong>${completedAssignments}</strong><small>\u5df2\u622a\u6b62\u4efb\u52a1</small></div>
      <div class="stat-card stat-card-icon"><span>\u63d0\u4ea4\u4efd\u6570</span><strong>${summary.totalSubmittedCount || 0}</strong><small>\u7d2f\u8ba1\u63d0\u4ea4</small></div>
      <div class="stat-card stat-card-icon"><span>\u63d0\u4ea4\u4eba\u6570</span><strong>${summary.totalSubmitterCount || 0}</strong><small>\u53c2\u4e0e\u4eba\u6570</small></div>
      <div class="stat-card stat-card-icon"><span>\u903e\u671f\u63d0\u4ea4</span><strong>${summary.lateCount || 0}</strong><small>\u9700\u5173\u6ce8</small></div>`;
  }

  function renderTrendChart(trend) {
    const { submissionTrendChart } = getElements();
    if (!submissionTrendChart) return;
    if (!trend.length) {
      submissionTrendChart.innerHTML = '<div class="chart-empty-state">\u6682\u65e0\u63d0\u4ea4\u6570\u636e</div>';
      return;
    }
    const max = Math.max(...trend.map((item) => Number(item.count || 0)), 1);
    submissionTrendChart.innerHTML = trend
      .map((item) => {
        const count = Number(item.count || 0);
        const height = Math.max(8, Math.round((count / max) * 100));
        const label = String(item.day || '').slice(5);
        return `
        <div class="trend-bar-item">
          <span class="trend-tooltip">${escapeHtml(item.day)}\uff1a${count}\u4efd</span>
          <strong class="trend-bar-value">${count}</strong>
          <div class="trend-bar-track"><span style="height:${height}%"></span></div>
          <small>${escapeHtml(label)}</small>
        </div>
      `;
      })
      .join('');
  }

  function renderStatusDistribution(summary = {}) {
    const { statusDistributionChart } = getElements();
    if (!statusDistributionChart) return;
    const ongoing = Number(summary.ongoingAssignments || 0);
    const completed = Number(summary.endedAssignments || 0) + Number(summary.expiredAssignments || 0) + Number(summary.archivedAssignments || 0);
    const total = ongoing + completed;
    if (!total) {
      statusDistributionChart.innerHTML = '<div class="chart-empty-state">\u6682\u65e0\u4efb\u52a1\u6570\u636e</div>';
      return;
    }
    const ongoingDeg = total ? (ongoing / total) * 360 : 0;
    statusDistributionChart.innerHTML = `
      <div class="donut" style="background: conic-gradient(#08a05f 0deg ${ongoingDeg}deg, #2d7ff9 ${ongoingDeg}deg 360deg);">
        <strong>${total}</strong><span>\u603b\u4efb\u52a1</span>
      </div>
      <div class="donut-legend">
        <span><i style="background:#08a05f"></i>\u8fdb\u884c\u4e2d ${ongoing}</span>
        <span><i style="background:#2d7ff9"></i>\u5df2\u5b8c\u6210 ${completed}</span>
      </div>
    `;
  }

  function renderStatisticsTable(items) {
    const { statisticsTable } = getElements();
    if (!statisticsTable) return;
    statisticsTable.innerHTML =
      items
        .map(
          (item) => `
      <tr><td>${escapeHtml(item.assignmentTitle)}</td><td>${normalizeStatisticsStatus(item.effectiveStatus)}</td><td>${item.submittedCount}</td><td>${item.submitterCount}</td><td>${item.lateCount}</td><td>${item.deadline ? formatTime(item.deadline) : '-'}</td></tr>
    `
        )
        .join('') || '<tr><td colspan="6" class="empty-cell">\u6682\u65e0\u7edf\u8ba1</td></tr>';
  }

  async function load() {
    const { statisticsSummary, statisticsMessage } = getElements();
    if (!statisticsSummary || !api.getAdminToken?.()) return;
    const params = getFilterParams();
    try {
      const data = await api.adminGet(`/api/statistics${params.toString() ? `?${params.toString()}` : ''}`);
      const items = data.items || [];
      const summary = data.summary || {};
      renderSummary(summary);
      renderTrendChart(data.trend || []);
      renderStatusDistribution(summary);
      renderStatisticsTable(items);
      setMessage(statisticsMessage, '');
      debugRecord('admin:statisticsFilter', { message: '统计报告筛选', total: items.length });
    } catch (error) {
      setMessage(statisticsMessage, error.message, 'error');
      debugRecord('admin:statisticsFailed', { message: error.message });
    }
  }

  async function exportCsv() {
    const { statisticsMessage } = getElements();
    setMessage(statisticsMessage, '');
    return api
      .adminDownloadBlob('/api/export-statistics', 'cloudnote-statistics.csv', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(getExportPayload()),
      })
      .catch((error) => setMessage(statisticsMessage, error.message, 'error'));
  }

  function renderAssignmentOptions(items) {
    const { statisticsAssignmentFilter } = getElements();
    if (!statisticsAssignmentFilter) return;
    const selected = statisticsAssignmentFilter.value;
    const options = items
      .filter((item) => item.effectiveStatus !== 'deleted')
      .map((item) => `<option value="${item.id}">${escapeHtml(item.title)}</option>`)
      .join('');
    statisticsAssignmentFilter.innerHTML = `<option value="">全部任务</option>${options}`;
    statisticsAssignmentFilter.value = selected;
  }

  function hasAssignmentFilter() {
    return Boolean(document.getElementById('statisticsAssignmentFilter'));
  }

  function bindEvents() {
    const { statisticsAssignmentFilter, statisticsStartDate, statisticsEndDate, statisticsStatusFilter, exportStatisticsButton } = getElements();
    statisticsAssignmentFilter?.addEventListener('change', load);
    statisticsStartDate?.addEventListener('change', load);
    statisticsEndDate?.addEventListener('change', load);
    statisticsStatusFilter?.addEventListener('change', load);
    exportStatisticsButton?.addEventListener('click', exportCsv);
  }

  function init() {
    if (initialized || !document.getElementById('statisticsSummary')) return;
    initialized = true;
    bindEvents();
  }

  CloudNote.adminStatistics = {
    init,
    load,
    refresh: load,
    exportCsv,
    renderAssignmentOptions,
    hasAssignmentFilter,
  };
})(window, document);
