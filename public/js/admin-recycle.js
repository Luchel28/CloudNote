(function (window, document) {
  'use strict';

  const CloudNote = (window.CloudNote = window.CloudNote || {});
  const common = CloudNote.common || {};
  const api = CloudNote.api || {};
  const $ = common.$ || ((selector) => document.querySelector(selector));
  const escapeHtml = common.escapeHtml || ((value) => String(value ?? ''));
  const parseJson =
    common.parseJson ||
    ((value, fallback) => {
      try {
        return value ? JSON.parse(value) : fallback;
      } catch {
        return fallback;
      }
    });
  const setMessage = common.setMessage || (() => {});
  const formatTime = common.formatTime || common.formatDateTime || ((value) => value || '-');
  const formatSize = common.formatSize || common.formatFileSize || ((size) => `${size || 0} B`);
  const showConfirmDialog = common.showConfirmDialog || common.confirmDialog || (() => Promise.resolve(window.confirm('确认操作？')));

  function debugRecord(action, details = {}) {
    try {
      window.CloudNoteDebug?.record?.(action, { page: 'admin', ...details });
    } catch {}
  }

  const RECYCLE_BIN_KEY = 'cloudnote_recycle_bin';
  const selectedItems = new Map();

  let recyclePage = 1;
  let recycleTotalPages = 1;
  let recycleType = 'all';
  let initialized = false;
  let recycleSearchTimer = null;

  function getHooks() {
    return CloudNote.adminRecycleHooks || {};
  }

  function getElements() {
    return {
      recycleSummary: $('#recycleSummary'),
      recycleTable: $('#recycleTable'),
      recycleSearchInput: $('#recycleSearchInput'),
      recycleSortSelect: $('#recycleSortSelect'),
      recyclePagination: $('#recyclePagination'),
      recycleMessage: $('#recycleMessage'),
      recycleSelectAll: $('#recycleSelectAll'),
      recycleSelectedCount: $('#recycleSelectedCount'),
      recycleBatchRestore: $('#recycleBatchRestore'),
      recycleBatchPurge: $('#recycleBatchPurge'),
      emptyRecycleButton: $('#emptyRecycleButton'),
    };
  }

  function recycleItemKey(type, id) {
    return `${type}:${id}`;
  }

  function getSelectedRecycleItems() {
    return [...selectedItems.values()];
  }

  function getLocalRecycleItems() {
    return parseJson(localStorage.getItem(RECYCLE_BIN_KEY), []).filter((item) => item && item.type === 'template');
  }

  function persistLocalRecycleItems(items) {
    localStorage.setItem(RECYCLE_BIN_KEY, JSON.stringify(items));
  }

  function getCategoryLabel(category) {
    return (
      getHooks().getCategoryLabel?.(category) ||
      {
        course: '课程作业',
        exam: '测试收集',
        material: '材料归集',
      }[category] ||
      '课程作业'
    );
  }

  function getVisibilityLabel(visibility) {
    return (
      getHooks().getVisibilityLabel?.(visibility) ||
      {
        private: '仅自己可见',
        class: '班级共享',
      }[visibility] ||
      '仅自己可见'
    );
  }

  function updateRecycleSelectionUi() {
    const { recycleSelectedCount, recycleSelectAll, recycleTable, recycleBatchRestore, recycleBatchPurge } = getElements();
    if (recycleSelectedCount) recycleSelectedCount.textContent = `已选择 ${selectedItems.size} 项`;
    if (recycleBatchRestore) recycleBatchRestore.disabled = selectedItems.size === 0;
    if (recycleBatchPurge) recycleBatchPurge.disabled = selectedItems.size === 0;
    if (recycleSelectAll && recycleTable) {
      const boxes = [...recycleTable.querySelectorAll('[data-recycle-select]')];
      recycleSelectAll.checked = boxes.length > 0 && boxes.every((box) => box.checked);
      recycleSelectAll.indeterminate = boxes.some((box) => box.checked) && !recycleSelectAll.checked;
    }
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
        `<button class="pagination-page ${index === current ? 'is-active' : ''}" type="button" data-page-kind="recycle" data-page-number="${index}" ${index === current ? 'aria-current="page"' : ''}>${index}</button>`
      );
    }
    container.innerHTML = `
      <button class="secondary-button compact-button pagination-arrow" type="button" data-page-kind="recycle" data-page-action="prev" ${current <= 1 ? 'disabled' : ''}>上一页</button>
      <span class="pagination-pages">${pages.join('')}</span>
      <button class="secondary-button compact-button pagination-arrow" type="button" data-page-kind="recycle" data-page-action="next" ${current >= total ? 'disabled' : ''}>下一页</button>
    `;
  }

  function renderRecycleSummary(summary = {}) {
    const { recycleSummary } = getElements();
    if (!recycleSummary) return;
    recycleSummary.innerHTML = `
      <div class="stat-card"><span>已删除任务</span><strong>${summary.deletedTasks || 0}</strong><small>可恢复到任务列表</small></div>
      <div class="stat-card"><span>已删除提交</span><strong>${summary.deletedSubmissions || 0}</strong><small>可恢复提交记录及文件</small></div>
      <div class="stat-card"><span>已删除文件</span><strong>${summary.deletedFiles || 0}</strong><small>可按单文件处理</small></div>
      <div class="stat-card"><span>已删除模板</span><strong>${summary.deletedTemplates || 0}</strong><small>可恢复到模板中心</small></div>
      <div class="stat-card"><span>待自动清理</span><strong>${summary.pendingCleanup || 0}</strong><small>${summary.retentionDays || 7} 天保留期</small></div>
      <div class="stat-card"><span>可释放空间</span><strong>${formatSize(summary.releasableBytes || 0)}</strong><small>彻底删除后释放</small></div>
    `;
  }

  function renderRecycleTable(items) {
    const { recycleTable } = getElements();
    if (!recycleTable) return;
    if (!items.length) {
      recycleTable.innerHTML = '<tr><td colspan="8" class="empty-cell">回收站是空的</td></tr>';
      updateRecycleSelectionUi();
      return;
    }
    recycleTable.innerHTML = items
      .map((item) => {
        const key = recycleItemKey(item.type, item.id);
        const checked = selectedItems.has(key) ? 'checked' : '';
        const typeLabel = item.type === 'task' ? '任务' : item.type === 'submission' ? '提交' : item.type === 'template' ? '模板' : '文件';
        const typeClass =
          item.type === 'task' ? 'type-task' : item.type === 'submission' ? 'type-submission' : item.type === 'template' ? 'type-template' : 'type-file';
        const restoreDisabled = item.recoverable === false;
        const restoreReason = item.restoreDisabledReason || (restoreDisabled ? '该内容暂不能恢复' : '');
        return `
        <tr>
          <td><input type="checkbox" data-recycle-select="${key}" data-recycle-type="${item.type}" data-recycle-id="${item.id}" data-recycle-recoverable="${restoreDisabled ? 'false' : 'true'}" data-recycle-restore-reason="${escapeHtml(restoreReason)}" ${checked}></td>
          <td><span class="type-pill ${typeClass}">${typeLabel}</span></td>
          <td>
            <strong>${escapeHtml(item.name)}</strong>
            ${item.submitter ? `<small>${escapeHtml(item.submitter)}</small>` : ''}
            ${item.type === 'submission' ? `<small>共 ${Number(item.fileCount || 0)} 个文件</small>` : ''}
            ${restoreReason ? `<small class="recycle-warning">${escapeHtml(restoreReason)}</small>` : ''}
            ${item.type === 'template' ? `<small>${escapeHtml(getCategoryLabel(item.category))} · ${escapeHtml(getVisibilityLabel(item.visibility))}</small>` : ''}
          </td>
          <td>${escapeHtml(item.origin || '-')}</td>
          <td>${formatTime(item.deletedAt)}</td>
          <td>${item.remainingDays} 天</td>
          <td>${item.size ? formatSize(item.size) : '-'}</td>
          <td>
            <div class="table-actions">
              <button class="secondary-button compact-button" type="button" data-recycle-restore="${key}" data-recycle-type="${item.type}" data-recycle-id="${item.id}" ${restoreDisabled ? 'disabled' : ''} title="${escapeHtml(restoreReason)}">恢复</button>
              <button class="danger-outline-button compact-button" type="button" data-recycle-purge="${key}" data-recycle-type="${item.type}" data-recycle-id="${item.id}">彻底删除</button>
            </div>
          </td>
        </tr>
      `;
      })
      .join('');
    updateRecycleSelectionUi();
  }

  async function load() {
    const { recycleTable, recycleSearchInput, recycleSortSelect, recyclePagination, recycleMessage } = getElements();
    if (!recycleTable || !api.getAdminToken?.()) return;
    const requestType = recycleType;
    const params = new URLSearchParams({ page: recyclePage, perPage: 20, type: requestType });
    if (recycleSearchInput?.value) params.set('search', recycleSearchInput.value);
    if (recycleSortSelect?.value) params.set('sort', recycleSortSelect.value);
    try {
      const data = await api.adminGet(`/api/recycle-bin?${params.toString()}`);
      recycleTotalPages = data.totalPages;
      renderRecycleSummary(data.summary);
      renderRecycleTable(data.items || []);
      renderPagination(recyclePagination, recyclePage, recycleTotalPages);
      debugRecord('admin:recycleAction', { message: '回收站操作/刷新', total: data.total || data.items?.length || 0, type: requestType });
    } catch (error) {
      recycleTable.innerHTML = '<tr><td colspan="8" class="empty-cell">加载回收站失败</td></tr>';
      setMessage(recycleMessage, error.message, 'error');
      debugRecord('admin:recycleFailed', { message: error.message });
    }
  }

  function refreshAfterRecycleChange({ templates = false } = {}) {
    const hooks = getHooks();
    if (templates) hooks.renderTemplateList?.();
    hooks.loadAssignments?.();
    hooks.loadAssignmentOptions?.();
    hooks.loadSubmissions?.();
    hooks.loadStatistics?.();
    hooks.renderStorageSummary?.();
  }

  async function restoreRecycleItems(items) {
    const { recycleMessage } = getElements();
    if (!items.length) return;
    const blocked = items.find((item) => item.recoverable === false);
    if (blocked) throw new Error(blocked.restoreDisabledReason || '该内容暂不能恢复');

    const hooks = getHooks();
    const localRecycleMap = new Map(getLocalRecycleItems().map((item) => [String(item.id), item]));
    const normalizedItems = items.map((item) =>
      item.type === 'template' && localRecycleMap.has(String(item.id)) ? { ...item, ...localRecycleMap.get(String(item.id)) } : item
    );
    const templateItems = normalizedItems.filter((item) => item.type === 'template' && item.template);
    const serverItems = normalizedItems.filter((item) => item.type !== 'template' || !item.template);
    let message = '';
    if (templateItems.length) {
      const recycleItems = getLocalRecycleItems();
      const restoreIds = new Set(templateItems.map((item) => String(item.id)));
      const restoredTemplates = recycleItems
        .filter((item) => restoreIds.has(String(item.id)))
        .map((item) => item.template)
        .filter(Boolean);
      const normalizeTemplateRecord = hooks.normalizeTemplateRecord || ((template) => template);
      const getStoredTemplates = hooks.getStoredTemplates || (() => []);
      hooks.persistTemplates?.([...restoredTemplates.map(normalizeTemplateRecord), ...getStoredTemplates()]);
      persistLocalRecycleItems(recycleItems.filter((item) => !restoreIds.has(String(item.id))));
      message = `已恢复 ${restoredTemplates.length} 个模板`;
    }
    if (serverItems.length) {
      const result = await api.adminPost('/api/recycle-bin/restore', { items: serverItems });
      message = result.message || message;
    }
    normalizedItems.forEach((item) => selectedItems.delete(recycleItemKey(item.type, item.id)));
    setMessage(recycleMessage, message || '已恢复', 'success');
    load();
    refreshAfterRecycleChange({ templates: true });
  }

  async function purgeRecycleItems(items) {
    const { recycleMessage } = getElements();
    if (!items.length) return;
    const localRecycleMap = new Map(getLocalRecycleItems().map((item) => [String(item.id), item]));
    const normalizedItems = items.map((item) =>
      item.type === 'template' && localRecycleMap.has(String(item.id)) ? { ...item, ...localRecycleMap.get(String(item.id)) } : item
    );
    const templateItems = normalizedItems.filter((item) => item.type === 'template' && item.template);
    const serverItems = normalizedItems.filter((item) => item.type !== 'template' || !item.template);
    let message = '';
    if (templateItems.length) {
      const purgeIds = new Set(templateItems.map((item) => String(item.id)));
      persistLocalRecycleItems(getLocalRecycleItems().filter((item) => !purgeIds.has(String(item.id))));
      message = `已彻底删除 ${templateItems.length} 个模板`;
    }
    if (serverItems.length) {
      const result = await api.adminPost('/api/recycle-bin/purge', { items: serverItems });
      message = result.message || message;
    }
    normalizedItems.forEach((item) => selectedItems.delete(recycleItemKey(item.type, item.id)));
    setMessage(recycleMessage, message || '已彻底删除', 'success');
    load();
    refreshAfterRecycleChange();
  }

  function readRecycleItemFromDataset(dataset) {
    return {
      type: dataset.recycleType,
      id: dataset.recycleType === 'template' ? dataset.recycleId : Number(dataset.recycleId),
      recoverable: dataset.recycleRecoverable !== 'false',
      restoreDisabledReason: dataset.recycleRestoreReason || '',
    };
  }

  function handlePaginationButton(button) {
    if (!button || button.dataset.pageKind !== 'recycle') return false;
    if (button.dataset.pageNumber) recyclePage = Number(button.dataset.pageNumber);
    else recyclePage += button.dataset.pageAction === 'next' ? 1 : -1;
    recyclePage = Math.max(1, Math.min(recyclePage, recycleTotalPages));
    load();
    return true;
  }

  function bindEvents() {
    const {
      recycleSearchInput,
      recycleSortSelect,
      recycleTable,
      recycleSelectAll,
      recycleBatchRestore,
      recycleBatchPurge,
      emptyRecycleButton,
      recycleMessage,
    } = getElements();

    document.querySelectorAll('[data-recycle-type]').forEach((button) => {
      button.addEventListener('click', () => {
        document.querySelectorAll('[data-recycle-type]').forEach((item) => item.classList.toggle('is-active', item === button));
        recycleType = button.dataset.recycleType || 'all';
        recyclePage = 1;
        selectedItems.clear();
        updateRecycleSelectionUi();
        load();
      });
    });

    recycleSearchInput?.addEventListener('input', () => {
      recyclePage = 1;
      selectedItems.clear();
      updateRecycleSelectionUi();
      window.clearTimeout(recycleSearchTimer);
      recycleSearchTimer = window.setTimeout(load, 300);
    });
    recycleSortSelect?.addEventListener('change', () => {
      recyclePage = 1;
      load();
    });
    recycleTable?.addEventListener('change', (event) => {
      const checkbox = event.target.closest('[data-recycle-select]');
      if (!checkbox) return;
      const item = readRecycleItemFromDataset(checkbox.dataset);
      const key = recycleItemKey(item.type, item.id);
      if (checkbox.checked) selectedItems.set(key, item);
      else selectedItems.delete(key);
      updateRecycleSelectionUi();
    });
    recycleSelectAll?.addEventListener('change', () => {
      recycleTable?.querySelectorAll('[data-recycle-select]').forEach((checkbox) => {
        checkbox.checked = recycleSelectAll.checked;
        const item = readRecycleItemFromDataset(checkbox.dataset);
        const key = recycleItemKey(item.type, item.id);
        if (checkbox.checked) selectedItems.set(key, item);
        else selectedItems.delete(key);
      });
      updateRecycleSelectionUi();
    });
    recycleTable?.addEventListener('click', async (event) => {
      const restoreButton = event.target.closest('[data-recycle-restore]');
      const purgeButton = event.target.closest('[data-recycle-purge]');
      try {
        if (restoreButton) {
          const ok = await showConfirmDialog({
            title: '恢复内容',
            message: '确定恢复所选内容吗？恢复后会回到对应页面。',
            confirmText: '恢复',
            variant: 'success',
          });
          if (!ok) return;
          await restoreRecycleItems([readRecycleItemFromDataset(restoreButton.dataset)]);
        }
        if (purgeButton) {
          if (!(await showConfirmDialog({ title: '彻底删除', message: '彻底删除后无法恢复，确定继续？', confirmText: '彻底删除', variant: 'danger' }))) return;
          await purgeRecycleItems([readRecycleItemFromDataset(purgeButton.dataset)]);
        }
      } catch (error) {
        setMessage(recycleMessage, error.message, 'error');
      }
    });
    recycleBatchRestore?.addEventListener('click', async () => {
      const items = getSelectedRecycleItems();
      if (!items.length) {
        setMessage(recycleMessage, '请先选择内容', 'error');
        return;
      }
      if (!(await showConfirmDialog({ title: '批量恢复', message: `确定恢复所选 ${items.length} 项内容吗？`, confirmText: '恢复', variant: 'success' })))
        return;
      restoreRecycleItems(items).catch((error) => setMessage(recycleMessage, error.message, 'error'));
    });
    recycleBatchPurge?.addEventListener('click', async () => {
      const items = getSelectedRecycleItems();
      if (!items.length) {
        setMessage(recycleMessage, '请先选择内容', 'error');
        return;
      }
      if (!(await showConfirmDialog({ title: '批量彻底删除', message: '彻底删除所选内容后无法恢复，确定继续？', confirmText: '彻底删除', variant: 'danger' })))
        return;
      purgeRecycleItems(items).catch((error) => setMessage(recycleMessage, error.message, 'error'));
    });
    emptyRecycleButton?.addEventListener('click', async () => {
      if (!(await showConfirmDialog({ title: '清空回收站', message: '确定清空回收站？这一步无法撤销。', confirmText: '清空', variant: 'danger' }))) return;
      try {
        const result = await api.adminDelete('/api/recycle-bin');
        persistLocalRecycleItems([]);
        selectedItems.clear();
        updateRecycleSelectionUi();
        setMessage(recycleMessage, result.message || '回收站已清空', 'success');
        load();
        refreshAfterRecycleChange();
      } catch (error) {
        setMessage(recycleMessage, error.message, 'error');
      }
    });
    document.addEventListener('click', (event) => {
      const button = event.target.closest('[data-page-kind="recycle"]');
      if (button) handlePaginationButton(button);
    });
  }

  function init() {
    if (initialized || !document.getElementById('recycleTable')) return;
    initialized = true;
    bindEvents();
    updateRecycleSelectionUi();
  }

  CloudNote.adminRecycle = {
    init,
    load,
    refresh: load,
    handlePaginationButton,
  };
})(window, document);
