(function (window, document) {
  'use strict';

  const CloudNote = (window.CloudNote = window.CloudNote || {});
  const common = CloudNote.common || {};
  const api = CloudNote.api || {};
  const $ = common.$ || ((selector) => document.querySelector(selector));
  const escapeHtml = common.escapeHtml || ((value) => String(value ?? ''));
  const setMessage = common.setMessage || (() => {});
  const formatTime = common.formatTime || common.formatDateTime || ((value) => value || '-');
  const showConfirmDialog = common.showConfirmDialog || common.confirmDialog || (() => Promise.resolve(window.confirm('确认操作？')));

  function debugRecord(action, details = {}) {
    try {
      window.CloudNoteDebug?.record?.(action, { page: 'admin', ...details });
    } catch {}
  }

  const SUBMITTER_FIELD_LABELS = {
    studentName: '姓名',
    studentId: '学号',
    phone: '手机号',
    idcard: '身份证号',
    idCard: '身份证号',
    birthDate: '出生日期',
    email: '邮箱',
    homeworkTitle: '作业标题',
  };
  const GENERATED_CUSTOM_LABEL_PATTERN = /^自定义字段\s+\d+$/;

  function isGeneratedCustomLabel(label) {
    return GENERATED_CUSTOM_LABEL_PATTERN.test(String(label || '').trim());
  }

  function getFallbackSubmitterLabel(key, index = 0) {
    const normalizedKey = String(key || '').trim();
    if (SUBMITTER_FIELD_LABELS[normalizedKey]) return SUBMITTER_FIELD_LABELS[normalizedKey];
    return `自定义字段 ${Math.max(1, Number(index) + 1)}`;
  }

  function resolveSubmitterLabel(key, items = [], dynamicKeys = []) {
    const configuredLabel = items
      .map((item) => String(item.submitterLabels?.[key] || '').trim())
      .find((label) => label && label !== key && !isGeneratedCustomLabel(label));
    if (configuredLabel) return configuredLabel;
    const index = Math.max(0, dynamicKeys.indexOf(key));
    return getFallbackSubmitterLabel(key, index);
  }

  let initialized = false;
  let currentAssignmentFilter = null;
  let currentAssignmentTitle = '';
  let submissionPage = 1;
  let submissionTotalPages = 1;

  function getHooks() {
    return CloudNote.adminSubmissionsHooks || {};
  }

  function getElements() {
    return {
      submissionAssignmentFilter: $('#submissionAssignmentFilter'),
      submissionSearchInput: $('#submissionSearchInput'),
      submissionStatusFilter: $('#submissionStatusFilter'),
      submissionStartDate: $('#submissionStartDate'),
      submissionEndDate: $('#submissionEndDate'),
      submissionSortSelect: $('#submissionSortSelect'),
      exportSubmissionsButton: $('#exportSubmissionsButton'),
      submissionPagination: $('#submissionPagination'),
      submissionTable: $('#submissionTable'),
      adminMessage: $('#adminMessage'),
      refreshButton: $('#refreshButton'),
      downloadAllButton: $('#downloadAllButton'),
      viewAllButton: $('#viewAllButton'),
      recordCount: $('#recordCount'),
      currentFilter: $('#currentFilter'),
    };
  }

  function renderPagination(container, page, totalPages) {
    if (!container) return;
    const pages = [];
    const total = Math.max(1, Number(totalPages || 1));
    const current = Math.max(1, Math.min(Number(page || 1), total));
    const start = Math.max(1, current - 2);
    const end = Math.min(total, start + 4);
    for (let index = start; index <= end; index += 1) {
      pages.push(
        `<button class="pagination-page ${index === current ? 'is-active' : ''}" type="button" data-page-kind="submissions" data-page-number="${index}" ${index === current ? 'aria-current="page"' : ''}>${index}</button>`
      );
    }
    container.innerHTML = `
      <button class="secondary-button compact-button pagination-arrow" type="button" data-page-kind="submissions" data-page-action="prev" ${current <= 1 ? 'disabled' : ''}>上一页</button>
      <span class="pagination-pages">${pages.join('')}</span>
      <button class="secondary-button compact-button pagination-arrow" type="button" data-page-kind="submissions" data-page-action="next" ${current >= total ? 'disabled' : ''}>下一页</button>
    `;
  }

  function getListParams() {
    const { submissionSearchInput, submissionStatusFilter, submissionStartDate, submissionEndDate, submissionSortSelect } = getElements();
    const params = new URLSearchParams({ page: submissionPage, perPage: 20 });
    if (currentAssignmentFilter) params.set('assignmentId', currentAssignmentFilter);
    if (submissionSearchInput?.value) params.set('search', submissionSearchInput.value);
    if (submissionStatusFilter?.value) params.set('status', submissionStatusFilter.value);
    if (submissionStartDate?.value) params.set('dateFrom', submissionStartDate.value);
    if (submissionEndDate?.value) params.set('dateTo', `${submissionEndDate.value}T23:59:59`);
    if (submissionSortSelect?.value) params.set('sort', submissionSortSelect.value);
    return params;
  }

  function getExportPayload() {
    const { submissionSearchInput, submissionStatusFilter, submissionStartDate, submissionEndDate, submissionSortSelect } = getElements();
    return {
      assignmentId: currentAssignmentFilter,
      search: submissionSearchInput?.value || '',
      status: submissionStatusFilter?.value || '',
      dateFrom: submissionStartDate?.value || '',
      dateTo: submissionEndDate?.value ? `${submissionEndDate.value}T23:59:59` : '',
      sort: submissionSortSelect?.value || 'upload-desc',
    };
  }

  function renderSubmissionTable(items, page, perPage) {
    const { submissionTable } = getElements();
    if (!submissionTable) return;
    const tableHead = submissionTable.closest('table')?.querySelector('thead');
    if (!items.length) {
      if (tableHead) {
        tableHead.innerHTML = `
          <tr><th>序号</th><th>所属任务</th><th>提交人</th><th>提交文件</th><th>上传时间</th><th>是否逾期</th><th>删除</th></tr>`;
      }
      submissionTable.innerHTML = '<tr><td colspan="7" class="empty-cell">暂无提交记录</td></tr>';
      return;
    }
    const dynamicKeys = [...new Set(items.flatMap((item) => Object.keys(item.submitterData || {})))];
    const dynamicLabels = Object.fromEntries(dynamicKeys.map((key) => [key, resolveSubmitterLabel(key, items, dynamicKeys)]));
    if (tableHead) {
      tableHead.innerHTML = `
        <tr>
          <th>序号</th><th>所属任务</th>
          ${dynamicKeys.map((key) => `<th class="submission-dynamic-heading">${escapeHtml(dynamicLabels[key])}</th>`).join('')}
          <th>提交文件</th><th>上传时间</th><th>是否逾期</th><th>删除</th>
        </tr>`;
    }
    submissionTable.innerHTML = items
      .map(
        (item, index) => `
      <tr>
        <td>${(page - 1) * perPage + index + 1}</td>
        <td class="submission-assignment-cell" title="${escapeHtml(item.assignmentTitle || '')}">${escapeHtml(item.assignmentTitle || '未分配任务')}</td>
        ${dynamicKeys
          .map((key) => {
            const value = item.submitterData?.[key] ?? '';
            return `<td class="submission-dynamic-cell" title="${escapeHtml(value)}">${escapeHtml(value)}</td>`;
          })
          .join('')}
        <td class="submission-files-cell">
          <div class="file-action-list submission-file-actions">
            ${
              (item.files || []).length
                ? item.files
                    .map(
                      (file) => `
              <span class="file-action-chip">
                <span>${escapeHtml(file.originalFilename)}</span>
                <button class="icon-mini-button" type="button" data-file-download-id="${file.id}" data-file-name="${escapeHtml(file.originalFilename)}" title="下载文件">下载</button>
                <button class="icon-mini-button danger-mini" type="button" data-file-delete-id="${file.id}" title="删除文件">删除</button>
              </span>
            `
                    )
                    .join('')
                : escapeHtml(item.originalFilename || '')
            }
          </div>
        </td>
        <td>${formatTime(item.uploadTime)}</td>
        <td><span class="status-badge ${item.isLate ? 'status-deleted' : 'status-ongoing'}">${item.isLate ? '是' : '否'}</span></td>
        <td><button class="danger-button compact-button" type="button" data-delete-id="${item.id}">删除记录</button></td>
      </tr>
    `
      )
      .join('');
  }

  async function load() {
    const { submissionTable, submissionPagination, recordCount, currentFilter, adminMessage } = getElements();
    if (!submissionTable || !api.getAdminToken?.()) return;
    const params = getListParams();
    try {
      const data = await api.adminGet(`/api/submissions?${params.toString()}`);
      submissionTotalPages = data.totalPages;
      if (recordCount) recordCount.textContent = `${data.total} 条记录`;
      if (currentFilter) currentFilter.textContent = currentAssignmentFilter ? `当前查看：${currentAssignmentTitle}` : '当前查看：全部提交';
      renderPagination(submissionPagination, data.page, data.totalPages);
      renderSubmissionTable(data.items || [], data.page, data.perPage);
      debugRecord('admin:submissionAction', { message: '提交记录操作/刷新', total: data.total, page: data.page });
    } catch (error) {
      submissionTable.innerHTML = '<tr><td colspan="13" class="empty-cell">加载失败</td></tr>';
      setMessage(adminMessage, error.message, 'error');
      debugRecord('admin:submissionFailed', { message: error.message });
    }
  }

  function refreshAfterSubmissionChange() {
    const hooks = getHooks();
    load();
    hooks.loadAssignments?.();
    hooks.loadStatistics?.();
    hooks.loadRecycleBin?.();
    hooks.renderStorageSummary?.();
  }

  function setAssignmentFilter(assignmentId, assignmentTitle = '') {
    const { submissionAssignmentFilter } = getElements();
    currentAssignmentFilter = assignmentId || null;
    currentAssignmentTitle = assignmentTitle || '';
    submissionPage = 1;
    if (submissionAssignmentFilter) submissionAssignmentFilter.value = currentAssignmentFilter || '';
    load();
  }

  function clearAssignmentFilter() {
    const { submissionAssignmentFilter, submissionStatusFilter, submissionSearchInput, submissionStartDate, submissionEndDate } = getElements();
    currentAssignmentFilter = null;
    currentAssignmentTitle = '';
    submissionPage = 1;
    if (submissionAssignmentFilter) submissionAssignmentFilter.value = '';
    if (submissionStatusFilter) submissionStatusFilter.value = '';
    if (submissionSearchInput) submissionSearchInput.value = '';
    if (submissionStartDate) submissionStartDate.value = '';
    if (submissionEndDate) submissionEndDate.value = '';
    load();
  }

  function renderAssignmentOptions(items) {
    const { submissionAssignmentFilter } = getElements();
    if (!submissionAssignmentFilter) return;
    const selected = submissionAssignmentFilter.value;
    const options = items
      .filter((item) => item.effectiveStatus !== 'deleted')
      .map((item) => `<option value="${item.id}">${escapeHtml(item.title)}</option>`)
      .join('');
    submissionAssignmentFilter.innerHTML = `<option value="">全部提交</option>${options}`;
    submissionAssignmentFilter.value = selected;
  }

  function hasAssignmentFilter() {
    return Boolean(document.getElementById('submissionAssignmentFilter'));
  }

  async function downloadAll() {
    const { adminMessage } = getElements();
    const query = currentAssignmentFilter ? `?assignmentId=${currentAssignmentFilter}` : '';
    return api.adminDownloadBlob(`/api/download-all${query}`, 'cloudnote-submissions.zip').catch((error) => setMessage(adminMessage, error.message, 'error'));
  }

  async function exportCsv() {
    const { adminMessage } = getElements();
    return api
      .adminDownloadBlob('/api/export-submissions', 'cloudnote-submissions.csv', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(getExportPayload()),
      })
      .catch((error) => setMessage(adminMessage, error.message, 'error'));
  }

  function handlePaginationButton(button) {
    if (!button || button.dataset.pageKind !== 'submissions') return false;
    if (button.dataset.pageNumber) submissionPage = Number(button.dataset.pageNumber);
    else submissionPage += button.dataset.pageAction === 'next' ? 1 : -1;
    submissionPage = Math.max(1, Math.min(submissionPage, submissionTotalPages));
    load();
    return true;
  }

  function bindEvents() {
    const {
      submissionAssignmentFilter,
      submissionSearchInput,
      submissionStatusFilter,
      submissionStartDate,
      submissionEndDate,
      submissionSortSelect,
      submissionTable,
      refreshButton,
      viewAllButton,
      downloadAllButton,
      exportSubmissionsButton,
      adminMessage,
    } = getElements();

    submissionAssignmentFilter?.addEventListener('change', () => {
      currentAssignmentFilter = submissionAssignmentFilter.value || null;
      currentAssignmentTitle = submissionAssignmentFilter.selectedOptions[0]?.textContent || '';
      submissionPage = 1;
      load();
    });
    submissionSearchInput?.addEventListener('input', () => {
      submissionPage = 1;
      load();
    });
    submissionStatusFilter?.addEventListener('change', () => {
      submissionPage = 1;
      load();
    });
    submissionStartDate?.addEventListener('change', () => {
      submissionPage = 1;
      load();
    });
    submissionEndDate?.addEventListener('change', () => {
      submissionPage = 1;
      load();
    });
    submissionSortSelect?.addEventListener('change', () => {
      submissionPage = 1;
      load();
    });

    submissionTable?.addEventListener('click', async (event) => {
      const downloadButton = event.target.closest('[data-download-id]');
      const fileDownloadButton = event.target.closest('[data-file-download-id]');
      const fileDeleteButton = event.target.closest('[data-file-delete-id]');
      const deleteButton = event.target.closest('[data-delete-id]');
      try {
        if (downloadButton)
          await api.adminDownloadBlob(`/api/download/${downloadButton.dataset.downloadId}`, `submission-${downloadButton.dataset.downloadId}.zip`);
        if (fileDownloadButton)
          await api.adminDownloadBlob(
            `/api/files/${fileDownloadButton.dataset.fileDownloadId}/download`,
            fileDownloadButton.dataset.fileName || 'cloudnote-file'
          );
        if (fileDeleteButton) {
          if (!(await showConfirmDialog({ title: '删除文件', message: '确定删除这个文件？删除后可在回收站恢复。', confirmText: '删除', variant: 'danger' })))
            return;
          await api.adminDelete(`/api/files/${fileDeleteButton.dataset.fileDeleteId}`);
          setMessage(adminMessage, '文件已移入回收站', 'success');
          refreshAfterSubmissionChange();
        }
        if (deleteButton) {
          if (
            !(await showConfirmDialog({
              title: '删除提交记录',
              message: '确定删除这条提交记录和对应文件？删除后可在回收站恢复。',
              confirmText: '删除',
              variant: 'danger',
            }))
          )
            return;
          await api.adminDelete(`/api/submissions/${deleteButton.dataset.deleteId}`);
          refreshAfterSubmissionChange();
        }
      } catch (error) {
        setMessage(adminMessage, error.message, 'error');
      }
    });

    document.addEventListener('click', (event) => {
      const button = event.target.closest('[data-page-kind="submissions"]');
      if (button) handlePaginationButton(button);
    });

    refreshButton?.addEventListener('click', () => {
      getHooks().loadAssignments?.();
      getHooks().loadStatistics?.();
      load();
      getHooks().renderStorageSummary?.();
    });
    viewAllButton?.addEventListener('click', clearAssignmentFilter);
    downloadAllButton?.addEventListener('click', downloadAll);
    exportSubmissionsButton?.addEventListener('click', exportCsv);
  }

  function init() {
    if (initialized || !document.getElementById('submissionTable')) return;
    initialized = true;
    bindEvents();
  }

  CloudNote.adminSubmissions = {
    init,
    load,
    refresh: load,
    setAssignmentFilter,
    clearAssignmentFilter,
    renderAssignmentOptions,
    hasAssignmentFilter,
    exportCsv,
  };
})(window, document);
