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

  function renderSummary(summary = {}) {
    const { statisticsSummary } = getElements();
    if (!statisticsSummary) return;
    statisticsSummary.innerHTML = `
      <div class="stat-card stat-card-icon"><span>任务总数</span><strong>${summary.totalAssignments || 0}</strong><small>所有任务</small></div>
      <div class="stat-card stat-card-icon"><span>进行中</span><strong>${summary.ongoingAssignments || 0}</strong><small>正在收集</small></div>
      <div class="stat-card stat-card-icon"><span>已结束</span><strong>${summary.endedAssignments || 0}</strong><small>已停止</small></div>
      <div class="stat-card stat-card-icon"><span>已过期</span><strong>${summary.expiredAssignments || 0}</strong><small>需关注</small></div>
      <div class="stat-card stat-card-icon"><span>提交份数</span><strong>${summary.totalSubmittedCount || 0}</strong><small>累计提交</small></div>
      <div class="stat-card stat-card-icon"><span>提交人数</span><strong>${summary.totalSubmitterCount || 0}</strong><small>参与人数</small></div>
      <div class="stat-card stat-card-icon"><span>逾期提交</span><strong>${summary.lateCount || 0}</strong><small>需关注</small></div>`;
  }

  function renderTrendChart(trend) {
    const { submissionTrendChart } = getElements();
    if (!submissionTrendChart) return;
    if (!trend.length) {
      submissionTrendChart.innerHTML = '<div class="chart-empty-state">暂无提交数据</div>';
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
          <span class="trend-tooltip">${escapeHtml(item.day)}：${count}份</span>
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
    const total = Number(summary.totalAssignments || 0);
    if (!total) {
      statusDistributionChart.innerHTML = '<div class="chart-empty-state">暂无任务数据</div>';
      return;
    }
    const ongoing = Number(summary.ongoingAssignments || 0);
    const ended = Number(summary.endedAssignments || 0);
    const expired = Number(summary.expiredAssignments || 0);
    const archived = Number(summary.archivedAssignments || 0);
    const ongoingDeg = total ? (ongoing / total) * 360 : 0;
    const endedDeg = total ? ((ongoing + ended) / total) * 360 : 0;
    const expiredDeg = total ? ((ongoing + ended + expired) / total) * 360 : 0;
    statusDistributionChart.innerHTML = `
      <div class="donut" style="background: conic-gradient(#08a05f 0deg ${ongoingDeg}deg, #2d7ff9 ${ongoingDeg}deg ${endedDeg}deg, #ffae22 ${endedDeg}deg ${expiredDeg}deg, #8c5cf6 ${expiredDeg}deg 360deg);">
        <strong>${total}</strong><span>总任务</span>
      </div>
      <div class="donut-legend">
        <span><i style="background:#08a05f"></i>进行中 ${ongoing}</span>
        <span><i style="background:#2d7ff9"></i>已截止/已结束 ${ended}</span>
        <span><i style="background:#ffae22"></i>已过期 ${expired}</span>
        <span><i style="background:#8c5cf6"></i>已归档 ${archived}</span>
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
      <tr><td>${escapeHtml(item.assignmentTitle)}</td><td>${getStatusLabel(item.effectiveStatus)}</td><td>${item.submittedCount}</td><td>${item.submitterCount}</td><td>${escapeHtml(item.submissionStatus || (item.submittedCount > 0 ? '已有提交' : '暂无提交'))}</td><td>${item.lateCount}</td><td>${item.deadline ? formatTime(item.deadline) : '-'}</td></tr>
    `
        )
        .join('') || '<tr><td colspan="7" class="empty-cell">暂无统计</td></tr>';
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
