(function (window, document) {
  'use strict';

  const CloudNote = window.CloudNote = window.CloudNote || {};

  const STATUS_LABELS = {
    ongoing: '进行中',
    ended: '已结束',
    archived: '已归档',
    expired: '已过期',
    deleted: '已删除',
    completed: '已结束',
  };

  function $(selector, root = document) {
    return root.querySelector(selector);
  }

  function $all(selector, root = document) {
    return Array.from(root.querySelectorAll(selector));
  }

  function escapeHtml(value) {
    return String(value ?? '')
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#039;');
  }

  function parseJson(value, fallback) {
    if (!value) return fallback;
    try {
      return JSON.parse(value);
    } catch {
      return fallback;
    }
  }

  function setMessage(element, text, type) {
    if (!element) return;
    element.textContent = text;
    element.classList.remove('is-success', 'is-error');
    if (type) element.classList.add(`is-${type}`);
  }

  function formatDateTime(value) {
    if (!value) return '-';
    return new Intl.DateTimeFormat('zh-CN', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    }).format(new Date(value));
  }

  function formatDate(value) {
    if (!value) return '-';
    return new Intl.DateTimeFormat('zh-CN', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(new Date(value));
  }

  function formatSize(size) {
    const bytes = Math.max(0, Number(size || 0));
    if (bytes === 0) return '0 B';
    if (bytes >= 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024 / 1024).toFixed(1)} GB`;
    if (bytes >= 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
    if (bytes >= 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${bytes} B`;
  }

  function getStatusLabel(status) {
    return STATUS_LABELS[status] || STATUS_LABELS.ongoing;
  }

  function debounce(callback, wait = 300) {
    let timer = null;
    return function debounced(...args) {
      window.clearTimeout(timer);
      timer = window.setTimeout(() => callback.apply(this, args), wait);
    };
  }

  async function copyText(text) {
    if (navigator.clipboard?.writeText) return navigator.clipboard.writeText(text);
    const input = document.createElement('input');
    input.value = text;
    document.body.appendChild(input);
    input.select();
    document.execCommand('copy');
    input.remove();
  }

  function showToast(message, type = 'success') {
    const toast = document.createElement('div');
    toast.className = `cloudnote-toast is-${type}`;
    toast.textContent = message;
    document.body.appendChild(toast);
    requestAnimationFrame(() => toast.classList.add('is-visible'));
    window.setTimeout(() => {
      toast.classList.remove('is-visible');
      window.setTimeout(() => toast.remove(), 180);
    }, 2200);
  }

  function showConfirmDialog({
    title = '确认操作',
    message = '',
    confirmText = '确认',
    cancelText = '取消',
    variant = 'primary',
  } = {}) {
    return new Promise((resolve) => {
      const dialog = document.createElement('div');
      dialog.className = 'confirm-dialog';
      dialog.innerHTML = `
        <div class="confirm-dialog-backdrop" data-confirm-cancel></div>
        <section class="confirm-dialog-panel" role="dialog" aria-modal="true" aria-labelledby="confirmDialogTitle">
          <h2 id="confirmDialogTitle">${escapeHtml(title)}</h2>
          <p>${escapeHtml(message)}</p>
          <div class="confirm-dialog-actions">
            <button class="secondary-button compact-button" type="button" data-confirm-cancel>${escapeHtml(cancelText)}</button>
            <button class="compact-button ${variant === 'danger' ? 'danger-button' : variant === 'success' ? 'success-button' : ''}" type="button" data-confirm-ok>${escapeHtml(confirmText)}</button>
          </div>
        </section>
      `;
      const close = (value) => {
        dialog.remove();
        document.removeEventListener('keydown', handleKeydown);
        resolve(value);
      };
      const handleKeydown = (event) => {
        if (event.key === 'Escape') close(false);
      };
      dialog.addEventListener('click', (event) => {
        if (event.target.closest('[data-confirm-ok]')) close(true);
        if (event.target.closest('[data-confirm-cancel]')) close(false);
      });
      document.addEventListener('keydown', handleKeydown);
      document.body.appendChild(dialog);
      dialog.querySelector('[data-confirm-ok]')?.focus();
    });
  }

  function buildAssignmentLink(assignment, baseUrl = window.location.origin) {
    const normalizedBaseUrl = String(baseUrl || window.location.origin).replace(/\/+$/, '');
    if (assignment && typeof assignment === 'object') {
      if (assignment.shareCode) return `${normalizedBaseUrl}/assignment.html?code=${encodeURIComponent(assignment.shareCode)}`;
      return `${normalizedBaseUrl}/assignment.html?id=${encodeURIComponent(assignment.id)}`;
    }
    return `${normalizedBaseUrl}/assignment.html?id=${encodeURIComponent(assignment)}`;
  }

  function ready(callback) {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', callback, { once: true });
    } else {
      callback();
    }
  }

  function debugRecord(action, details = {}) {
    try {
      return window.CloudNoteDebug?.record?.(action, details) || null;
    } catch {
      return null;
    }
  }

  CloudNote.common = {
    $,
    $all,
    escapeHtml,
    parseJson,
    setMessage,
    showMessage: setMessage,
    formatDate,
    formatDateTime,
    formatTime: formatDateTime,
    formatSize,
    formatFileSize: formatSize,
    getStatusLabel,
    debounce,
    copyText,
    showToast,
    toast: showToast,
    showConfirmDialog,
    confirmDialog: showConfirmDialog,
    confirm: showConfirmDialog,
    buildAssignmentLink,
    ready,
    debugRecord,
  };
})(window, document);
