(function (window, document) {
  'use strict';

  const CloudNote = (window.CloudNote = window.CloudNote || {});
  const common = CloudNote.common || {};
  const api = CloudNote.api || {};
  const $ = common.$ || ((selector) => document.querySelector(selector));
  const formatSize = common.formatSize || common.formatFileSize || ((size) => `${size} B`);

  function debugRecord(action, details = {}) {
    try {
      window.CloudNoteDebug?.record?.(action, { page: 'admin', ...details });
    } catch {}
  }

  let pendingRequest = null;

  function getElements() {
    return {
      storageProgressBar: $('#storageProgressBar'),
      storageUsageText: $('#storageUsageText'),
    };
  }

  function renderUnavailable() {
    const { storageProgressBar, storageUsageText } = getElements();
    if (storageProgressBar) {
      storageProgressBar.style.width = '0%';
      storageProgressBar.closest('.storage-progress')?.classList.add('is-unconfigured');
    }
    if (storageUsageText) storageUsageText.textContent = '存储统计暂不可用';
  }

  function renderSummary(summary) {
    const { storageProgressBar, storageUsageText } = getElements();
    if (!storageUsageText) return;
    if (storageProgressBar) {
      const uploadsTotal = Number(summary.uploadsTotalSize || 0);
      const cleanable = Number(summary.cleanableSize || 0);
      storageProgressBar.style.width = uploadsTotal > 0 ? `${Math.min(100, Math.round((cleanable / uploadsTotal) * 100))}%` : '0%';
      storageProgressBar.closest('.storage-progress')?.classList.toggle('is-unconfigured', uploadsTotal <= 0);
    }
    storageUsageText.innerHTML = `
      <span>已用容量：${formatSize(summary.uploadsTotalSize || 0)}</span>
      <span>回收站：${formatSize(summary.cleanableSize || 0)} 可清理</span>
      <span>文件数：${Number(summary.totalFilesCount || 0)}</span>
      <span>数据库：${formatSize(summary.databaseSize || 0)}</span>
    `;
  }

  async function render() {
    const { storageUsageText } = getElements();
    if (!storageUsageText || !api.getAdminToken?.()) return null;
    if (pendingRequest) return pendingRequest;
    pendingRequest = (async () => {
      try {
        const summary = await api.adminGet('/api/storage-summary', { fallbackMessage: '存储统计暂不可用' });
        renderSummary(summary || {});
        debugRecord('admin:storageRefresh', { message: '存储空间刷新' });
        return summary;
      } catch {
        renderUnavailable();
        debugRecord('admin:storageRefreshFailed', { message: '存储空间刷新失败' });
        return null;
      } finally {
        pendingRequest = null;
      }
    })();
    return pendingRequest;
  }

  function init() {
    if (!document.getElementById('storageUsageText')) return null;
    return render();
  }

  CloudNote.adminStorage = {
    init,
    render,
    refresh: render,
    renderSummary,
    renderUnavailable,
  };
})(window, document);
