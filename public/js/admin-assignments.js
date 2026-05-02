(function (window, document) {
  'use strict';

  const CloudNote = (window.CloudNote = window.CloudNote || {});
  const common = CloudNote.common || {};
  const api = CloudNote.api || {};
  const $ = common.$ || ((selector) => document.querySelector(selector));
  const escapeHtml = common.escapeHtml || ((value) => String(value ?? ''));
  const setMessage = common.setMessage || (() => {});
  const formatTime = common.formatTime || common.formatDateTime || ((value) => value || '-');
  const copyText = common.copyText || ((text) => navigator.clipboard?.writeText(text));
  const showToast = common.showToast || common.toast || (() => {});
  const showConfirmDialog = common.showConfirmDialog || common.confirmDialog || (() => Promise.resolve(window.confirm('确认操作？')));

  function debugRecord(action, details = {}) {
    try {
      window.CloudNoteDebug?.record?.(action, { page: 'admin', ...details });
    } catch {}
  }

  const STATUS_LABELS = {
    ongoing: '进行中',
    ended: '已结束',
    archived: '已归档',
    expired: '已过期',
    deleted: '已删除',
    completed: '已结束',
  };

  let initialized = false;
  let assignmentPage = 1;
  let assignmentTotalPages = 1;
  let assignmentPerPage = 10;
  let currentStatusFilter = '';
  let assignmentSearchTimer = null;
  let lastAssignments = [];

  function formModule() {
    return CloudNote.adminAssignmentForm || {};
  }

  function getConstants() {
    return (
      formModule().constants || {
        FILE_TYPE_EXTENSION_MAP: {
          document: ['doc', 'docx', 'pdf', 'txt', 'xls', 'xlsx', 'ppt', 'pptx'],
        },
      }
    );
  }

  function getRuntime() {
    return (
      CloudNote.adminRuntime || {
        publicBaseUrl: window.location.origin,
        systemMaxUploadSizeMb: 500,
        systemMaxUploadFiles: 20,
      }
    );
  }

  function getElements() {
    return {
      assignmentList: $('#assignmentList'),
      assignmentCount: $('#assignmentCount'),
      assignmentSearchInput: $('#assignmentSearchInput'),
      assignmentSortSelect: $('#assignmentSortSelect'),
      assignmentStats: $('#assignmentStats'),
      assignmentPagination: $('#assignmentPagination'),
      assignmentPerPageSelect: $('#assignmentPerPageSelect'),
      assignmentMessage: $('#assignmentMessage'),
    };
  }

  function getStatusLabel(status) {
    return STATUS_LABELS[status] || STATUS_LABELS.ongoing;
  }

  function normalizeTaskStatus(item = {}) {
    const status = item.effectiveStatus || item.status || 'ongoing';
    if (status === 'completed') return 'ended';
    if (status === 'archived') return 'ended';
    return status;
  }

  function getTaskStatus(item = {}) {
    const status = normalizeTaskStatus(item);
    if (status === 'ended' || status === 'expired') return 'completed';
    if (status === 'deleted') return 'deleted';
    return 'ongoing';
  }

  function getTaskStatusLabel(item = {}) {
    const status = getTaskStatus(item);
    return (
      {
        ongoing: '进行中',
        completed: '已完成',
        deleted: '已删除',
      }[status] || getStatusLabel(normalizeTaskStatus(item))
    );
  }

  function getAssignmentUrl(assignment) {
    if (formModule().getAssignmentUrl) return formModule().getAssignmentUrl(assignment);
    const baseUrl = String(getRuntime().publicBaseUrl || window.location.origin).replace(/\/+$/, '');
    if (common.buildAssignmentLink) return common.buildAssignmentLink(assignment, baseUrl);
    if (assignment && typeof assignment === 'object') {
      if (assignment.shareCode) return `${baseUrl}/assignment.html?code=${encodeURIComponent(assignment.shareCode)}`;
      return `${baseUrl}/assignment.html?id=${encodeURIComponent(assignment.id)}`;
    }
    return `${baseUrl}/assignment.html?id=${encodeURIComponent(assignment)}`;
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
        `<button class="pagination-page ${index === current ? 'is-active' : ''}" type="button" data-page-kind="assignments" data-page-number="${index}" ${index === current ? 'aria-current="page"' : ''}>${index}</button>`
      );
    }
    container.innerHTML = `
      <button class="secondary-button compact-button pagination-arrow" type="button" data-page-kind="assignments" data-page-action="prev" ${current <= 1 ? 'disabled' : ''}>上一页</button>
      <span class="pagination-pages">${pages.join('')}</span>
      <button class="secondary-button compact-button pagination-arrow" type="button" data-page-kind="assignments" data-page-action="next" ${current >= total ? 'disabled' : ''}>下一页</button>
    `;
  }

  async function copyTaskLink(url) {
    const { assignmentMessage } = getElements();
    try {
      await copyText(url);
      showToast('链接已复制', 'success');
      setMessage(assignmentMessage, '链接已复制', 'success');
    } catch {
      showToast('复制失败，请手动复制链接', 'error');
      setMessage(assignmentMessage, '复制失败，请手动复制链接', 'error');
    }
  }

  function renderAssignmentCard(item) {
    const { FILE_TYPE_EXTENSION_MAP } = getConstants();
    const runtime = getRuntime();
    const taskStatus = getTaskStatus(item);
    const isDeleted = taskStatus === 'deleted';
    const url = getAssignmentUrl(item);
    const extensions =
      Array.isArray(item.allowedExtensions) && item.allowedExtensions.length
        ? item.allowedExtensions
        : FILE_TYPE_EXTENSION_MAP[item.fileType || 'document'] || [];
    const fileRule = item.enableLimit
      ? `${Math.min(Number(item.maxFiles || 1), runtime.systemMaxUploadFiles || 20)} 个 / ${Math.min(Number(item.maxFileSizeMb || runtime.systemMaxUploadSizeMb || 500), runtime.systemMaxUploadSizeMb || 500)}MB`
      : `系统最大 ${runtime.systemMaxUploadFiles || 20} 个文件 / 单文件 ${runtime.systemMaxUploadSizeMb || 500}MB`;
    const createdAt = item.createdAt ? `创建于 ${formatTime(item.createdAt)}` : '创建时间未知';
    return `
      <article class="assignment-card assignment-card-${taskStatus} status-border-${normalizeTaskStatus(item)}">
        <div class="assignment-card-main">
          <div class="assignment-title-row">
            <span class="assignment-status-dot status-dot-${taskStatus}"></span>
            <h3>${escapeHtml(item.title || '未命名任务')}</h3>
            <span class="status-badge status-${taskStatus}">${getTaskStatusLabel(item)}</span>
          </div>
          <p class="assignment-description ${item.description ? '' : 'is-empty'}">${escapeHtml(item.description || '暂无说明')}</p>
          <div class="assignment-info">
            <span>提交：${Number(item.submissionCount || 0)}</span>
            <span>人数：${Number(item.submitterCount || 0)}</span>
            <span>文件：${escapeHtml(fileRule)}</span>
            <span title="${escapeHtml(extensions.join(','))}">格式：${escapeHtml(extensions.join(',') || '不限')}</span>
            <span>截止：${item.deadline ? formatTime(item.deadline) : '无设置'}</span>
          </div>
          <div class="submit-link assignment-link-box">
            <span>${escapeHtml(url)}</span>
            <button class="link-copy-icon" type="button" data-copy-url="${escapeHtml(url)}" aria-label="复制任务链接" ${isDeleted ? 'disabled' : ''}><i class="iconfont icon-fuzhi"></i></button>
          </div>
        </div>
        <div class="assignment-actions">
          <span class="assignment-created-time">${escapeHtml(createdAt)}</span>
          <div class="assignment-action-row">
            <button class="secondary-button compact-button" type="button" data-copy-url="${escapeHtml(url)}" ${isDeleted ? 'disabled' : ''}><i class="iconfont icon-fuzhilianjie"></i>复制链接</button>
            <button class="secondary-button compact-button" type="button" data-view-assignment="${item.id}" data-assignment-title="${escapeHtml(item.title || '')}" ${isDeleted ? 'disabled' : ''}><i class="iconfont icon-fuzhi"></i>查看提交记录</button>
            <button class="secondary-button compact-button" type="button" data-edit-assignment="${item.id}" data-assignment-json="${escapeHtml(JSON.stringify(item))}" ${isDeleted ? 'disabled' : ''}><i class="iconfont icon-bianji"></i>编辑</button>
          </div>
          <div class="assignment-action-row">
            <button class="compact-button download-task-button" type="button" data-download-assignment="${item.id}" data-assignment-title="${escapeHtml(item.title || 'assignment')}" ${isDeleted ? 'disabled' : ''}><i class="iconfont icon-xiazai"></i>下载任务</button>
            <button class="danger-button compact-button" type="button" data-delete-assignment="${item.id}" data-submission-count="${Number(item.submissionCount || 0)}" ${isDeleted ? 'disabled' : ''}><i class="iconfont icon-shanchu"></i>删除</button>
          </div>
        </div>
      </article>
    `;
  }

  function render(items = []) {
    const { assignmentList } = getElements();
    if (!assignmentList) return;
    lastAssignments = Array.isArray(items) ? items : [];
    assignmentList.innerHTML = lastAssignments.length
      ? lastAssignments.map(renderAssignmentCard).join('')
      : '<div class="empty-card assignment-empty-state"><strong>暂无任务，点击创建新任务开始收集作业</strong><button class="primary-button compact-button" type="button" data-admin-section-shortcut="create">创建新任务</button></div>';
  }

  async function fetchAssignmentPages(status = '', sort = 'created-desc') {
    const items = [];
    let page = 1;
    let totalPages = 1;
    do {
      const params = new URLSearchParams({ page, perPage: 50, sort });
      if (status) params.set('status', status);
      const data = await api.adminGet(`/api/assignments?${params.toString()}`);
      items.push(...(data.items || []));
      totalPages = Number(data.totalPages || 1);
      page += 1;
    } while (page <= totalPages);
    return items;
  }

  async function renderAssignmentStats() {
    const { assignmentStats } = getElements();
    if (!assignmentStats || !api.getAdminToken?.()) return;
    const [activeItems, deletedItems] = await Promise.all([fetchAssignmentPages(''), fetchAssignmentPages('deleted')]);
    const counts = { all: activeItems.length + deletedItems.length, ongoing: 0, completed: 0, deleted: deletedItems.length };
    activeItems.forEach((item) => {
      const status = getTaskStatus(item);
      if (status === 'completed') counts.completed += 1;
      else counts.ongoing += 1;
    });
    const cards = [
      { key: '', title: '全部任务', value: counts.all, desc: '所有状态的任务', icon: 'icon-zuanshi', tone: 'green' },
      { key: 'ongoing', title: '进行中', value: counts.ongoing, desc: '正在收集提交中', icon: 'icon-jinhangzhong', tone: 'blue' },
      { key: 'completed', title: '已完成', value: counts.completed, desc: '已截止的任务', icon: 'icon-yiwancheng', tone: 'purple' },
      { key: 'deleted', title: '已删除', value: counts.deleted, desc: '已删除的任务', icon: 'icon-yishanchu', tone: 'red' },
    ];
    assignmentStats.innerHTML = cards
      .map(
        (card) => `
      <button class="assignment-stat-card stat-${card.tone}" type="button" data-stat-status="${card.key}">
        <span class="stat-icon"><i class="iconfont ${card.icon}"></i></span>
        <span class="stat-copy">
          <span>${card.title}</span>
          <strong data-count="${card.value}">0</strong>
          <small>${card.desc}</small>
        </span>
      </button>
    `
      )
      .join('');
    // Animate numbers after render
    requestAnimationFrame(() => {
      assignmentStats.querySelectorAll('[data-count]').forEach((el) => {
        const target = Number(el.dataset.count);
        animateNumber(el, target);
      });
    });
  }

  function animateNumber(el, target) {
    if (!target) { el.textContent = target; return; }
    const start = 0;
    const duration = 600;
    const startTime = Date.now();
    function tick() {
      const now = Date.now();
      const elapsed = now - startTime;
      const progress = Math.min(elapsed / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      el.textContent = Math.round(start + (target - start) * eased);
      if (progress < 1) requestAnimationFrame(tick);
    }
    requestAnimationFrame(tick);
  }

  async function load() {
    const {
      assignmentList,
      assignmentCount,
      assignmentSearchInput,
      assignmentSortSelect,
      assignmentPagination,
      assignmentPerPageSelect,
      assignmentMessage,
    } = getElements();
    if (!assignmentList || !api.getAdminToken?.()) return null;
    await formModule()
      .loadPublicConfig?.()
      .catch?.(() => {});
    assignmentPerPage = Number(assignmentPerPageSelect?.value || assignmentPerPage || 10);
    assignmentList.innerHTML = '<div class="empty-card loading-card">正在加载任务...</div>';
    const params = new URLSearchParams({ page: assignmentPage, perPage: assignmentPerPage });
    if (currentStatusFilter) params.set('status', currentStatusFilter);
    if (assignmentSearchInput?.value) params.set('search', assignmentSearchInput.value);
    if (assignmentSortSelect?.value) params.set('sort', assignmentSortSelect.value);
    try {
      const data = await api.adminGet(`/api/assignments?${params.toString()}`);
      assignmentTotalPages = data.totalPages;
      if (assignmentCount) assignmentCount.textContent = `共 ${data.total} 条任务`;
      renderPagination(assignmentPagination, data.page, data.totalPages);
      debugRecord('admin:assignmentListRefresh', { message: '任务列表刷新', total: data.total, page: data.page });
      renderAssignmentStats().catch(() => {});
      if (data.items?.length) {
        render(data.items);
      } else {
        const hasFilter = Boolean(currentStatusFilter || assignmentSearchInput?.value);
        assignmentList.innerHTML = hasFilter
          ? `
          <div class="empty-card assignment-empty-state">
            <strong>未找到匹配的任务</strong>
            <p>换个关键词或清空筛选后再试。</p>
            <button class="secondary-button compact-button" type="button" data-clear-assignment-filters>清空筛选</button>
          </div>`
          : `
          <div class="empty-card assignment-empty-state">
            <strong>暂无任务，点击创建新任务开始收集作业</strong>
            <button class="primary-button compact-button" type="button" data-admin-section-shortcut="create">创建新任务</button>
          </div>`;
      }
      return data;
    } catch (error) {
      assignmentList.innerHTML = `
        <div class="empty-card assignment-empty-state">
          <strong>加载任务失败</strong>
          <p>${escapeHtml(error.message || '接口异常，请稍后重试')}</p>
          <button class="secondary-button compact-button" type="button" data-retry-assignments>重试</button>
        </div>`;
      setMessage(assignmentMessage, error.message, 'error');
      return null;
    }
  }

  function refresh() {
    return load();
  }

  function renderAssignmentSelectors(items) {
    CloudNote.adminSubmissions?.renderAssignmentOptions?.(items);
    CloudNote.adminStatistics?.renderAssignmentOptions?.(items);
  }

  async function loadAssignmentOptions() {
    const hasSubmissionFilter = CloudNote.adminSubmissions?.hasAssignmentFilter?.();
    const hasStatisticsFilter = CloudNote.adminStatistics?.hasAssignmentFilter?.();
    if ((!hasSubmissionFilter && !hasStatisticsFilter) || !api.getAdminToken?.()) return [];
    try {
      const items = await fetchAssignmentPages('', 'title-asc');
      renderAssignmentSelectors(items);
      return items;
    } catch {
      return [];
    }
  }

  function findAssignment(identifier) {
    return lastAssignments.find((item) => String(item.id) === String(identifier) || String(item.shareCode || '') === String(identifier));
  }

  async function copyLink(identifier) {
    const item = findAssignment(identifier);
    let url = '';
    if (item) url = getAssignmentUrl(item);
    else if (/^https?:\/\//i.test(String(identifier))) url = String(identifier);
    else if (/^\d+$/.test(String(identifier))) url = getAssignmentUrl(Number(identifier));
    else url = getAssignmentUrl({ shareCode: identifier });
    return copyTaskLink(url);
  }

  function openLink(identifier) {
    const item = findAssignment(identifier);
    let url = '';
    if (item) url = getAssignmentUrl(item);
    else if (/^https?:\/\//i.test(String(identifier))) url = String(identifier);
    else if (/^\d+$/.test(String(identifier))) url = getAssignmentUrl(Number(identifier));
    else url = getAssignmentUrl({ shareCode: identifier });
    window.open(url, '_blank', 'noopener');
  }

  function viewSubmissions(assignmentId, assignmentTitle = '') {
    switchAdminSection('submissions');
    CloudNote.adminSubmissions?.setAssignmentFilter?.(assignmentId, assignmentTitle);
  }

  function editAssignment(assignmentId, assignmentData) {
    const item = assignmentData || findAssignment(assignmentId);
    return formModule().editAssignment?.(assignmentId, item);
  }

  async function deleteAssignment(assignmentId, submissionCount = 0) {
    const { assignmentMessage } = getElements();
    const count = Number(submissionCount || 0);
    if (
      !(await showConfirmDialog({
        title: '删除任务',
        message: count ? `该任务有 ${count} 条提交，删除后会移入回收站并同步处理相关文件。继续？` : '确定删除这个任务吗？删除后可在回收站恢复。',
        confirmText: '删除',
        variant: 'danger',
      }))
    )
      return;
    try {
      let response = await fetch(`/api/assignments/${assignmentId}`, { method: 'DELETE', headers: api.getAdminHeaders?.() || {} });
      let result = await response.json();
      if (response.status === 409 && result.needConfirm) {
        response = await fetch(`/api/assignments/${assignmentId}?confirm=true`, { method: 'DELETE', headers: api.getAdminHeaders?.() || {} });
        result = await response.json();
      }
      if (!response.ok) throw new Error(result.message || '删除失败');
      load();
      loadAssignmentOptions();
      CloudNote.adminStatistics?.load?.();
      CloudNote.adminSubmissions?.load?.();
      CloudNote.adminRecycle?.load?.();
      CloudNote.adminStorage?.render?.();
    } catch (error) {
      setMessage(assignmentMessage, error.message, 'error');
    }
  }

  function switchAdminSection(section) {
    if (window.switchAdminSection) {
      window.switchAdminSection(section);
      return;
    }
    document.querySelectorAll('[data-admin-section]').forEach((button) => {
      button.classList.toggle('is-active', button.dataset.adminSection === section);
    });
    document.querySelectorAll('[data-section-panel]').forEach((panel) => {
      panel.classList.toggle('is-hidden', panel.dataset.sectionPanel !== section);
    });
  }

  function handlePaginationButton(button) {
    if (!button || button.dataset.pageKind !== 'assignments') return false;
    if (button.dataset.pageNumber) assignmentPage = Number(button.dataset.pageNumber);
    else assignmentPage += button.dataset.pageAction === 'next' ? 1 : -1;
    assignmentPage = Math.max(1, Math.min(assignmentPage, assignmentTotalPages));
    load();
    return true;
  }

  function bindEvents() {
    const { assignmentList, assignmentSearchInput, assignmentSortSelect, assignmentPerPageSelect, assignmentStats, assignmentMessage } =
      getElements();

    assignmentList?.addEventListener('click', async (event) => {
      const copyButton = event.target.closest('[data-copy-url]');
      const viewButton = event.target.closest('[data-view-assignment]');
      const editButton = event.target.closest('[data-edit-assignment]');
      const downloadButton = event.target.closest('[data-download-assignment]');
      const deleteButton = event.target.closest('[data-delete-assignment]');
      const clearButton = event.target.closest('[data-clear-assignment-filters]');
      const retryButton = event.target.closest('[data-retry-assignments]');
      const shortcutButton = event.target.closest('[data-admin-section-shortcut]');
      try {
        if (shortcutButton) {
          switchAdminSection(shortcutButton.dataset.adminSectionShortcut);
          return;
        }
        if (clearButton) {
          if (assignmentSearchInput) assignmentSearchInput.value = '';
          currentStatusFilter = '';
          document.querySelectorAll('#assignmentStats [data-stat-status]').forEach((c) => c.classList.remove('is-active'));
          assignmentPage = 1;
          load();
          return;
        }
        if (retryButton) {
          load();
          return;
        }
        if (copyButton) await copyTaskLink(copyButton.dataset.copyUrl);
        if (viewButton) viewSubmissions(viewButton.dataset.viewAssignment, viewButton.dataset.assignmentTitle);
        if (editButton) {
          await editAssignment(editButton.dataset.editAssignment, JSON.parse(editButton.dataset.assignmentJson));
          switchAdminSection('create');
        }
        if (downloadButton)
          await api.adminDownloadBlob?.(
            `/api/download-all?assignmentId=${downloadButton.dataset.downloadAssignment}`,
            `cloudnote-${downloadButton.dataset.assignmentTitle || 'assignment'}.zip`
          );
        if (deleteButton) await deleteAssignment(deleteButton.dataset.deleteAssignment, deleteButton.dataset.submissionCount);
      } catch (error) {
        setMessage(assignmentMessage, error.message, 'error');
      }
    });

    assignmentSearchInput?.addEventListener('input', () => {
      window.clearTimeout(assignmentSearchTimer);
      assignmentSearchTimer = window.setTimeout(() => {
        assignmentPage = 1;
        load();
      }, 300);
    });
    assignmentSortSelect?.addEventListener('change', () => {
      assignmentPage = 1;
      load();
    });
    assignmentPerPageSelect?.addEventListener('change', () => {
      assignmentPage = 1;
      load();
    });
    assignmentStats?.addEventListener('click', (event) => {
      const card = event.target.closest('[data-stat-status]');
      if (!card) return;
      const status = card.dataset.statStatus || '';
      currentStatusFilter = currentStatusFilter === status ? '' : status;
      assignmentStats.querySelectorAll('[data-stat-status]').forEach((c) => c.classList.toggle('is-active', c.dataset.statStatus === currentStatusFilter));
      assignmentPage = 1;
      load();
    });
    document.addEventListener('click', (event) => {
      const button = event.target.closest('[data-page-kind="assignments"]');
      if (button) handlePaginationButton(button);
    });
  }

  function init() {
    if (initialized || !document.getElementById('assignmentList')) return;
    initialized = true;
    bindEvents();
  }

  CloudNote.adminAssignments = {
    init,
    load,
    refresh,
    render,
    loadAssignmentOptions,
    renderAssignmentSelectors,
    copyLink,
    openLink,
    viewSubmissions,
    editAssignment,
    deleteAssignment,
    fetchAssignmentPages,
    renderAssignmentCard,
    renderAssignmentStats,
    handlePaginationButton,
    getAssignmentUrl,
  };
})(window, document);
