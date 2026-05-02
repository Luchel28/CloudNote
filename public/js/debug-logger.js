(function (window, document) {
  'use strict';

  const CloudNote = (window.CloudNote = window.CloudNote || {});
  const LOG_KEY = 'cloudnoteDebugLogs';
  const LOG_LIMIT = 1000;
  const REDACTED = '[redacted]';

  function getPageName() {
    const path = window.location.pathname || '';
    if (document.querySelector('.admin-page') || document.getElementById('adminPanel')) return 'admin';
    if (document.body?.classList.contains('upload-page') || /assignment\.html$/i.test(path)) return 'assignment';
    if (path === '/' || /index\.html$/i.test(path)) return 'index';
    return path.replace(/^\/+/, '') || 'page';
  }

  function getUrlPath() {
    try {
      const url = new URL(window.location.href);
      ['token', 'adminToken', 'password', 'Authorization', 'authorization'].forEach((key) => {
        if (url.searchParams.has(key)) url.searchParams.set(key, REDACTED);
      });
      return `${url.pathname}${url.search}`;
    } catch {
      return window.location.pathname || '';
    }
  }

  function isSensitiveKey(key = '') {
    const value = String(key).toLowerCase();
    return (
      value.includes('token') ||
      value.includes('password') ||
      value.includes('authorization') ||
      value.includes('admintoken') ||
      value.includes('filepath') ||
      value.includes('file_path') ||
      value.includes('localpath') ||
      value === 'path' ||
      value.endsWith('path') ||
      value.includes('filecontent') ||
      value.includes('file_content') ||
      value === 'content' ||
      value.endsWith('content')
    );
  }

  function looksLikeLocalPath(value = '') {
    return /(?:[A-Za-z]:\\|\\\\[^\\]+\\|file:\/\/|\/Users\/|\/home\/|\/mnt\/|\/var\/|\/tmp\/)/.test(String(value));
  }

  function cleanString(value, limit = 300) {
    const text = String(value ?? '')
      .replace(/\s+/g, ' ')
      .trim();
    if (looksLikeLocalPath(text)) return '[redacted:path]';
    return text.length > limit ? `${text.slice(0, limit)}...` : text;
  }

  function sanitize(value, key = '', seen = new WeakSet()) {
    try {
      if (isSensitiveKey(key)) return REDACTED;
      if (value === null || value === undefined) return value;
      if (typeof value === 'string') return cleanString(value);
      if (typeof value === 'number' || typeof value === 'boolean') return value;
      if (value instanceof File) {
        return {
          name: cleanString(value.name, 160),
          size: value.size,
          type: cleanString(value.type, 80),
          lastModified: value.lastModified,
        };
      }
      if (value instanceof Event) return { type: value.type };
      if (value instanceof Element) {
        return {
          tagName: value.tagName,
          id: value.id || '',
          className: cleanString(value.className || '', 160),
          dataset: sanitizeDataset(value),
        };
      }
      if (Array.isArray(value)) return value.slice(0, 80).map((item) => sanitize(item, key, seen));
      if (typeof value === 'object') {
        if (seen.has(value)) return '[circular]';
        seen.add(value);
        const result = {};
        Object.keys(value)
          .slice(0, 80)
          .forEach((name) => {
            if (name === 'target' || name === 'currentTarget' || name === 'srcElement') return;
            result[name] = sanitize(value[name], name, seen);
          });
        return result;
      }
      return cleanString(value);
    } catch {
      return '[unserializable]';
    }
  }

  function sanitizeDataset(target) {
    try {
      const dataset = target?.dataset ? { ...target.dataset } : {};
      return sanitize(dataset);
    } catch {
      return {};
    }
  }

  function getTargetText(target) {
    try {
      if (!target) return '';
      const control = target.closest?.('input, textarea, select');
      if (control) {
        if (control.type === 'password' || control.type === 'file') return '';
        return cleanString(control.getAttribute('aria-label') || control.name || control.id || control.tagName, 100);
      }
      const interactive = target.closest?.('button, a, label, [role="button"]') || target;
      return cleanString(interactive.textContent || interactive.getAttribute?.('aria-label') || '', 120);
    } catch {
      return '';
    }
  }

  function getLogs() {
    try {
      const logs = JSON.parse(localStorage.getItem(LOG_KEY) || '[]');
      return Array.isArray(logs) ? logs : [];
    } catch {
      return [];
    }
  }

  function saveLogs(logs) {
    try {
      localStorage.setItem(LOG_KEY, JSON.stringify(logs.slice(-LOG_LIMIT)));
    } catch {}
  }

  function record(action, details = {}) {
    try {
      const event = details.event || null;
      const target = details.target || event?.target || null;
      const cleanDetails = { ...details };
      delete cleanDetails.event;
      delete cleanDetails.target;
      const entry = {
        timestamp: new Date().toISOString(),
        page: cleanString(details.page || getPageName(), 80),
        action: cleanString(action || 'debug:record', 120),
        eventType: cleanString(details.eventType || event?.type || '', 60),
        targetTag: cleanString(details.targetTag || target?.tagName || '', 40),
        targetText: cleanString(details.targetText ?? getTargetText(target), 120),
        targetDataset: sanitize(details.targetDataset || sanitizeDataset(target)),
        urlPath: getUrlPath(),
        message: cleanString(details.message || '', 200),
        details: sanitize(cleanDetails),
      };
      const logs = getLogs();
      logs.push(entry);
      saveLogs(logs);
      console.info('[CloudNoteDebug]', entry.page, entry.action, entry.message || entry.targetText || '', entry.details);
      return entry;
    } catch {
      return null;
    }
  }

  function exportLogs() {
    try {
      const blob = new Blob([JSON.stringify(getLogs(), null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `cloudnote-debug-logs-${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch {}
  }

  function clearLogs() {
    try {
      localStorage.removeItem(LOG_KEY);
      console.info('[CloudNoteDebug] logs cleared');
    } catch {}
  }

  function inferClickAction(target) {
    const page = getPageName();
    if (!target?.closest) return '';
    if (target.closest('[data-cloudnote-debug-toolbar]')) return '';
    if (page === 'index') {
      if (target.closest('a[href*="admin.html"]')) return 'index:jumpAdmin';
      if (target.closest('a[href*="assignment.html"]')) return 'index:jumpUploadPage';
    }
    if (page === 'admin') {
      if (target.closest('[data-admin-section]')) return 'admin:menuSwitch';
      if (target.closest('[data-admin-section-shortcut]')) return 'admin:menuShortcut';
      if (target.closest('[data-task-tab]')) return 'admin:createStepSwitch';
      if (target.closest('[data-add-field-type], #addFieldButton')) return 'admin:addInfoField';
      if (target.closest('[data-remove-field]')) return 'admin:deleteInfoField';
      if (target.closest('#deleteSelectedFieldsButton')) return 'admin:batchDeleteInfoField';
      if (target.closest('#saveTemplateButton, [data-close-save-template-modal]')) return 'admin:saveTemplate';
      if (target.closest('#assignmentSubmitButton')) return 'admin:publishAssignment';
      if (target.closest('#renameRuleButton, [data-rename-field]')) return 'admin:renameRuleSelect';
      if (target.closest('[data-view-assignment], [data-edit-assignment], [data-delete-assignment], [data-download-assignment], [data-retry-assignments]'))
        return 'admin:assignmentListAction';
      if (target.closest('#refreshButton, #downloadAllButton, #exportSubmissionsButton, [data-download-id], [data-delete-id]')) return 'admin:submissionAction';
      if (target.closest('[data-recycle-type], [data-recycle-restore], [data-recycle-purge], #recycleBatchRestore, #recycleBatchPurge, #emptyRecycleButton'))
        return 'admin:recycleAction';
      if (target.closest('#exportStatisticsButton')) return 'admin:statisticsAction';
    }
    if (page === 'assignment') {
      if (target.closest('[data-remove-file]')) return 'assignment:removeSelectedFile';
      if (target.closest('#uploadDropzone')) return 'assignment:dropzoneClick';
      if (target.closest('#uploadForm button[type="submit"]')) return 'assignment:submitClick';
      if (target.closest('a[href*="admin.html"]')) return 'assignment:jumpAdmin';
    }
    return '';
  }

  function inferChangeAction(target) {
    const page = getPageName();
    if (!target?.closest) return '';
    if (page === 'admin') {
      if (target.closest('select[data-field-type]')) return 'admin:fieldTypeChange';
      if (target.closest('[data-field-name]')) return 'admin:fieldNameChange';
      if (target.closest('[data-field-required]')) return 'admin:fieldRequiredChange';
      if (target.closest('[data-extension-group]')) return 'admin:fileTypeToggle';
      if (
        target.closest(
          '[name="enableLimit"], [name="maxFileSizeMb"], [name="maxFiles"], [name="requiredUpload"], [name="renameEnabled"], [name="downloadStructure"]'
        )
      )
        return 'admin:fileSettingChange';
      if (target.closest('#assignmentStatusFilter, #assignmentSearchInput, #assignmentSortSelect, #assignmentPerPageSelect'))
        return 'admin:assignmentListFilter';
      if (target.closest('#statisticsAssignmentFilter, #statisticsStartDate, #statisticsEndDate, #statisticsStatusFilter')) return 'admin:statisticsFilter';
    }
    if (page === 'assignment') {
      if (target.closest('#fileInput')) return 'assignment:selectFile';
      if (target.closest('#dynamicFields')) return 'assignment:fieldInput';
    }
    return '';
  }

  function bindAutoCapture() {
    try {
      document.addEventListener('click', (event) => {
        const action = inferClickAction(event.target);
        if (action) record(action, { event, target: event.target });
      });
      document.addEventListener('change', (event) => {
        const action = inferChangeAction(event.target);
        if (action) record(action, { event, target: event.target });
      });
      document.addEventListener('submit', (event) => {
        if (event.target?.id === 'adminLoginForm') record('admin:loginAttempt', { event, target: event.target, message: '管理员登录尝试' });
        if (event.target?.id === 'saveTemplateForm') record('admin:saveTemplateSubmit', { event, target: event.target, message: '保存模板' });
        if (event.target?.id === 'uploadForm')
          record(getPageName() === 'index' ? 'index:jumpUploadPage' : 'assignment:submitAssignment', { event, target: event.target });
      });
    } catch {}
  }

  function initToolbar() {
    try {
      if (new URLSearchParams(window.location.search).get('debug') !== '1') return;
      if (document.querySelector('[data-cloudnote-debug-toolbar]')) return;
      const toolbar = document.createElement('div');
      toolbar.className = 'cloudnote-debug-toolbar';
      toolbar.dataset.cloudnoteDebugToolbar = 'true';
      toolbar.innerHTML = `
        <button type="button" data-cloudnote-debug-export>导出日志</button>
        <button type="button" data-cloudnote-debug-clear>清空日志</button>
      `;
      toolbar.addEventListener('click', (event) => {
        event.stopPropagation();
        if (event.target.closest('[data-cloudnote-debug-export]')) exportLogs();
        if (event.target.closest('[data-cloudnote-debug-clear]')) clearLogs();
      });
      document.body.appendChild(toolbar);
    } catch {}
  }

  function init() {
    initToolbar();
    bindAutoCapture();
    record('page:init', { message: '页面初始化' });
  }

  const api = {
    record,
    getLogs,
    export: exportLogs,
    clear: clearLogs,
  };

  window.CloudNoteDebug = CloudNote.debug = api;
  window.CloudNoteCreateTaskDebug = window.CloudNoteCreateTaskDebug || api;

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init, { once: true });
  } else {
    init();
  }
})(window, document);
