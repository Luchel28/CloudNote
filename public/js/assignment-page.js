(function (window, document) {
  'use strict';

  const CloudNote = window.CloudNote = window.CloudNote || {};
  const common = CloudNote.common || {};
  const api = CloudNote.api || {};
  const $ = common.$ || ((selector) => document.querySelector(selector));
  const escapeHtml = common.escapeHtml || ((value) => String(value ?? ''));
  const setMessage = common.setMessage || (() => {});
  const formatTime = common.formatTime || common.formatDateTime || ((value) => value || '-');
  const formatSize = common.formatSize || common.formatFileSize || ((size) => `${size} B`);
  const getStatusLabel = common.getStatusLabel || ((status) => status || '进行中');

  let currentAssignment = null;
  let selectedFiles = [];
  let publicBaseUrl = window.location.origin;
  let systemMaxUploadSizeMb = 500;
  let systemMaxUploadFiles = 20;
  let uploadSubmitting = false;
  let uploadSubmittedOnce = false;
  let publicConfigReady = null;

  function getElements() {
    const uploadForm = $('#uploadForm');
    return {
      uploadForm,
      uploadMessage: $('#uploadMessage'),
      uploadTaskName: $('#uploadTaskName'),
      uploadPageIntro: $('#uploadPageIntro'),
      assignmentMeta: $('#assignmentMeta'),
      uploadStatusBadge: $('#uploadStatusBadge'),
      uploadStatusHint: $('#uploadStatusHint'),
      assignmentIdField: $('#assignmentIdField'),
      dynamicFields: $('#dynamicFields'),
      fileInput: $('#fileInput'),
      uploadDropzone: $('#uploadDropzone'),
      fileRules: $('#fileRules'),
      selectedFileList: $('#selectedFileList'),
      uploadProgressBar: $('#uploadProgressBar'),
      submitResult: $('#submitResult'),
      uploadSubmitButton: uploadForm?.querySelector('button[type="submit"]'),
    };
  }

  let elements = {};

  function debugRecord(action, details = {}) {
    try {
      window.CloudNoteDebug?.record?.(action, { page: 'assignment', ...details });
    } catch {}
  }

  async function loadPublicConfig() {
    try {
      const config = api.get ? await api.get('/api/public-config') : await fetch('/api/public-config').then((response) => response.ok ? response.json() : null);
      if (!config) return;
      if (config.publicBaseUrl) publicBaseUrl = String(config.publicBaseUrl).replace(/\/+$/, '');
      if (Number(config.maxUploadSizeMb) > 0) systemMaxUploadSizeMb = Number(config.maxUploadSizeMb);
      if (Number(config.maxUploadFiles) > 0) systemMaxUploadFiles = Number(config.maxUploadFiles);
    } catch {
      publicBaseUrl = window.location.origin;
    }
  }

  function splitOptions(value) {
    return Array.isArray(value)
      ? value.map((item) => String(item || '').trim()).filter(Boolean)
      : String(value || '').split(/[,，\n]/).map((item) => item.trim()).filter(Boolean);
  }

  function parseStrictDateParts(value) {
    const match = String(value || '').trim().match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!match) return null;
    const year = Number(match[1]);
    const month = Number(match[2]);
    const day = Number(match[3]);
    const date = new Date(year, month - 1, day);
    if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) return null;
    return { date };
  }

  function isValidBirthDate(value) {
    const parsed = parseStrictDateParts(value);
    if (!parsed) return false;
    const min = new Date(1900, 0, 1);
    const today = new Date();
    today.setHours(23, 59, 59, 999);
    return parsed.date >= min && parsed.date <= today;
  }

  function isValidDateTime(value) {
    const match = String(value || '').trim().match(/^(\d{4}-\d{2}-\d{2})[ T](\d{2}):(\d{2})$/);
    if (!match || !parseStrictDateParts(match[1])) return false;
    const hour = Number(match[2]);
    const minute = Number(match[3]);
    return hour >= 0 && hour <= 23 && minute >= 0 && minute <= 59;
  }

  function isValidIdCard(value) {
    const text = String(value || '').trim();
    if (/^\d{15}$/.test(text)) {
      return Boolean(parseStrictDateParts(`19${text.slice(6, 8)}-${text.slice(8, 10)}-${text.slice(10, 12)}`));
    }
    if (!/^\d{17}[\dXx]$/.test(text)) return false;
    if (!parseStrictDateParts(`${text.slice(6, 10)}-${text.slice(10, 12)}-${text.slice(12, 14)}`)) return false;
    const weights = [7, 9, 10, 5, 8, 4, 2, 1, 6, 3, 7, 9, 10, 5, 8, 4, 2];
    const codes = ['1', '0', 'X', '9', '8', '7', '6', '5', '4', '3', '2'];
    const sum = text.slice(0, 17).split('').reduce((total, char, index) => total + Number(char) * weights[index], 0);
    return codes[sum % 11] === text[17].toUpperCase();
  }

  function fieldInputHtml(field) {
    const required = field.required ? 'required' : '';
    const name = escapeHtml(field.key);
    const placeholder = escapeHtml(field.placeholder || `请输入${field.label}`);
    const options = splitOptions(field.rules?.options || field.options);
    if (field.type === 'single_choice') {
      const choices = options.length ? options : ['选项一', '选项二'];
      return `<div class="choice-field">${choices.map((option) => `
        <label><input type="radio" name="${name}" value="${escapeHtml(option)}" ${required}> <span>${escapeHtml(option)}</span></label>
      `).join('')}</div>`;
    }
    if (field.type === 'multiple_choice') {
      const choices = options.length ? options : ['选项一', '选项二', '选项三'];
      return `<div class="choice-field">${choices.map((option) => `
        <label><input type="checkbox" name="${name}" value="${escapeHtml(option)}"> <span>${escapeHtml(option)}</span></label>
      `).join('')}</div>`;
    }
    if (field.type === 'multi_line') return `<textarea name="${name}" ${required} maxlength="1000" placeholder="${placeholder}"></textarea>`;
    if (field.type === 'birth_date') {
      const today = new Date();
      const max = new Date(today.getTime() - today.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
      return `<input type="date" name="${name}" ${required} min="1900-01-01" max="${max}">`;
    }
    if (field.type === 'datetime') return `<input type="datetime-local" name="${name}" ${required}>`;
    if (field.type === 'numeric') return `<input type="text" name="${name}" ${required} inputmode="decimal" placeholder="${placeholder}">`;
    if (field.type === 'digits') {
      const length = field.rules?.length || field.digitLength || '';
      const maxLength = length ? `maxlength="${Number(length)}"` : '';
      return `<input type="text" name="${name}" ${required} ${maxLength} inputmode="numeric" pattern="\\d*" placeholder="${placeholder}">`;
    }
    if (field.type === 'positive_integer') return `<input type="text" name="${name}" ${required} inputmode="numeric" placeholder="${placeholder}">`;
    if (field.type === 'phone') return `<input type="tel" name="${name}" ${required} maxlength="11" placeholder="请输入手机号">`;
    if (field.type === 'email') return `<input type="email" name="${name}" ${required} placeholder="请输入邮箱">`;
    if (field.type === 'idcard') return `<input type="text" name="${name}" ${required} maxlength="18" placeholder="请输入身份证号">`;
    if (field.type === 'single_line') return `<input type="text" name="${name}" ${required} maxlength="50" placeholder="${placeholder}">`;
    return `<input type="text" name="${name}" ${required} placeholder="${placeholder}">`;
  }

  function renderDynamicFields(assignment) {
    if (!elements.dynamicFields) return;
    const fields = (assignment.fieldConfig || []).filter((field) => field.enabled !== false && field.visible !== false);
    elements.dynamicFields.innerHTML = fields.length ? fields.map((field) => `
      <label class="upload-field" data-dynamic-field="${escapeHtml(field.key)}" data-required="${field.required ? 'true' : 'false'}">
        <span>${escapeHtml(field.label)}${field.required ? '<em>*</em>' : ''}</span>
        ${fieldInputHtml(field)}
        ${field.helpText ? `<small class="input-hint">${escapeHtml(field.helpText)}</small>` : ''}
        <small class="field-error is-hidden">${escapeHtml(field.label)}不能为空</small>
      </label>
    `).join('') : '<div class="upload-empty-note">本任务无需填写额外信息。</div>';
  }

  function getUploadFieldValue(key, type) {
    const controls = [...(elements.uploadForm?.querySelectorAll(`[name="${CSS.escape(key)}"]`) || [])];
    if (type === 'checkbox' || type === 'multiple_choice') return controls.filter((input) => input.checked).map((input) => input.value).join(', ');
    if (type === 'radio' || type === 'single_choice') return controls.find((input) => input.checked)?.value || '';
    const input = elements.uploadForm?.elements[key];
    return String(input?.value || '').trim();
  }

  function getEffectiveMaxFiles(assignment = currentAssignment) {
    const systemLimit = Math.max(1, Number(systemMaxUploadFiles || 20));
    if (!assignment?.enableLimit) return systemLimit;
    const taskLimit = Math.max(1, Number(assignment.maxFiles || 1));
    return Math.min(taskLimit, systemLimit);
  }

  function getEffectiveMaxFileSizeMb(assignment = currentAssignment) {
    const systemLimit = Math.max(1, Number(systemMaxUploadSizeMb || 500));
    if (!assignment?.enableLimit) return systemLimit;
    const taskLimit = Math.max(1, Number(assignment.maxFileSizeMb || systemLimit));
    return Math.min(taskLimit, systemLimit);
  }

  function syncFileInputRequired() {
    if (!elements.fileInput || !currentAssignment) return;
    elements.fileInput.required = currentAssignment.requiredUpload !== false;
  }

  function updateFileRules() {
    if (!elements.fileRules || !currentAssignment) return;
    const extensions = currentAssignment.allowedExtensions || [];
    const effectiveMaxFiles = getEffectiveMaxFiles();
    const effectiveMaxSizeMb = getEffectiveMaxFileSizeMb();
    const limitText = currentAssignment.enableLimit
      ? `<span>最多 ${effectiveMaxFiles} 个文件</span><span>单文件 ${effectiveMaxSizeMb} MB</span>`
      : `<span>系统最多 ${effectiveMaxFiles} 个文件</span><span>系统单文件上限 ${effectiveMaxSizeMb} MB</span>`;
    elements.fileRules.innerHTML = `
      <span>${currentAssignment.requiredUpload === false ? '文件可选' : '必须上传文件'}</span>
      ${limitText}
      <span>格式：${extensions.length ? extensions.join(', ') : '不限制'}</span>
    `;
  }

  function getSelectedFileError(files = selectedFiles) {
    if (!currentAssignment) return '';
    const fileList = [...files];
    if (!fileList.length) {
      return currentAssignment.requiredUpload === false ? '' : '请选择文件';
    }
    const maxFiles = getEffectiveMaxFiles();
    const maxFileSizeMb = getEffectiveMaxFileSizeMb();
    if (fileList.length > maxFiles) {
      return currentAssignment.enableLimit
        ? `文件数量超过限制，最多只能上传 ${maxFiles} 个文件`
        : `文件数量超过系统限制，最多只能上传 ${maxFiles} 个文件`;
    }
    const allowed = new Set((currentAssignment.allowedExtensions || []).map((item) => item.toLowerCase()));
    for (const file of fileList) {
      const ext = file.name.includes('.') ? file.name.split('.').pop().toLowerCase() : '';
      if (allowed.size && !allowed.has(ext)) return `不允许的文件格式：${file.name}`;
      if (file.size > maxFileSizeMb * 1024 * 1024) {
        return currentAssignment.enableLimit
          ? `文件超过大小限制：${file.name}，单文件最多 ${maxFileSizeMb} MB`
          : `文件超过系统大小限制：${file.name}，单文件最多 ${maxFileSizeMb} MB`;
      }
    }
    return '';
  }

  function clearSubmitResult() {
    if (!elements.submitResult) return;
    elements.submitResult.classList.add('is-hidden');
    elements.submitResult.innerHTML = '';
  }

  function renderSelectedFiles() {
    if (!elements.selectedFileList) return;
    const header = `<div class="selected-files-head"><strong>已选文件（${selectedFiles.length}）</strong></div>`;
    if (!selectedFiles.length) {
      elements.selectedFileList.innerHTML = `${header}<div class="upload-empty-note">尚未选择文件</div>`;
      return;
    }
    elements.selectedFileList.innerHTML = `${header}<div class="selected-files-body">${selectedFiles.map((file, index) => `
      <div class="selected-file">
        <span title="${escapeHtml(file.name)}">${escapeHtml(file.name)}</span>
        <strong>${formatSize(file.size)}</strong>
        <button class="secondary-button compact-button" type="button" data-remove-file="${index}">删除</button>
      </div>
    `).join('')}</div>`;
  }

  function handleSelectedFiles(files, { append = false } = {}) {
    clearSubmitResult();
    const incoming = [...files];
    if (!incoming.length) return;
    selectedFiles = append ? [...selectedFiles, ...incoming] : incoming;
    const error = getSelectedFileError();
    renderSelectedFiles();
    debugRecord(append ? 'assignment:dragUpload' : 'assignment:selectFile', {
      target: elements.fileInput,
      message: error || `选择 ${incoming.length} 个文件`,
      fileCount: incoming.length,
      selectedFileCount: selectedFiles.length,
      totalSize: selectedFiles.reduce((total, file) => total + Number(file.size || 0), 0),
    });
    if (error) debugRecord('assignment:fileValidationFailed', { target: elements.fileInput, message: error, selectedFileCount: selectedFiles.length });
    if (error) setMessage(elements.uploadMessage, error, 'error');
    else setMessage(elements.uploadMessage, '');
  }

  function validateDynamicFieldValues() {
    if (!currentAssignment || !elements.uploadForm) return;
    for (const field of (currentAssignment.fieldConfig || []).filter((item) => item.enabled !== false && item.visible !== false)) {
      const value = getUploadFieldValue(field.key, field.type);
      const wrapper = elements.uploadForm.querySelector(`[data-dynamic-field="${CSS.escape(field.key)}"]`);
      const error = wrapper?.querySelector('.field-error');
      if (error) error.classList.add('is-hidden');
      if (field.required && !value) {
        if (error) error.classList.remove('is-hidden');
        debugRecord('assignment:fieldValidationFailed', { target: wrapper, message: `${field.label}不能为空`, fieldKey: field.key, fieldType: field.type, fieldLabel: field.label });
        throw new Error(`${field.label}不能为空`);
      }
      if (!value) continue;
      if (field.type === 'name' && !(/^[\u4e00-\u9fa5]{1,5}$/.test(value) || (/^[A-Za-z\s]{1,20}$/.test(value) && /[A-Za-z]/.test(value)))) throw new Error(`${field.label}格式不正确`);
      if (field.type === 'phone' && !/^1[3-9]\d{9}$/.test(value)) throw new Error(`${field.label}格式不正确`);
      if (field.type === 'email' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) throw new Error(`${field.label}格式不正确`);
      if (field.type === 'idcard' && !isValidIdCard(value)) throw new Error(`${field.label}格式不正确`);
      if (field.type === 'birth_date' && !isValidBirthDate(value)) throw new Error(`${field.label}必须是 1900-01-01 至今天的真实日期`);
      if (field.type === 'single_line' && value.length > 50) throw new Error(`${field.label}长度不能超过 50 字`);
      if (field.type === 'multi_line' && value.length > 1000) throw new Error(`${field.label}长度不能超过 1000 字`);
      if (field.type === 'digits') {
        if (!/^\d+$/.test(value)) throw new Error(`${field.label}只能填写阿拉伯数字`);
        const length = field.rules?.length || field.digitLength || '';
        if (length && !new RegExp(`^\\d{${Number(length || 0)}}$`).test(value)) throw new Error(`${field.label}需填写${length}位数字`);
      }
      if (field.type === 'numeric') {
        if (!/^-?\d+(\.\d+)?$/.test(value)) throw new Error(`${field.label}必须是合法数值`);
        const numberValue = Number(value);
        const min = field.rules?.min ?? field.minValue ?? '';
        const max = field.rules?.max ?? field.maxValue ?? '';
        if (min !== '' && numberValue < Number(min)) throw new Error(`${field.label}不能小于${min}`);
        if (max !== '' && numberValue > Number(max)) throw new Error(`${field.label}不能大于${max}`);
      }
      if (field.type === 'single_choice') {
        const options = splitOptions(field.rules?.options || field.options);
        if (!options.includes(value)) throw new Error(`${field.label}选项不正确`);
      }
      if (field.type === 'multiple_choice') {
        const options = splitOptions(field.rules?.options || field.options);
        const values = splitOptions(value);
        if (new Set(values).size !== values.length) throw new Error(`${field.label}不能重复选择`);
        if (values.some((item) => !options.includes(item))) throw new Error(`${field.label}选项不正确`);
      }
      if (field.type === 'datetime' && !isValidDateTime(value)) throw new Error(`${field.label}日期时间格式不正确`);
      if (field.type === 'positive_integer' && !/^[1-9]\d*$/.test(value)) throw new Error(`${field.label}必须是大于0的整数`);
    }
  }

  function validateSelectedFiles() {
    if (!currentAssignment) throw new Error('请使用有效的任务链接');
    try {
      validateDynamicFieldValues();
    } catch (error) {
      debugRecord('assignment:fieldValidationFailed', { message: error.message });
      throw error;
    }
    const fileError = getSelectedFileError();
    if (fileError) {
      debugRecord('assignment:fileValidationFailed', { target: elements.fileInput, message: fileError, selectedFileCount: selectedFiles.length });
      throw new Error(fileError);
    }
  }

  function renderSubmitResult(result) {
    if (!elements.submitResult) return;
    elements.submitResult.classList.remove('is-hidden');
    const canRepeat = currentAssignment?.allowRepeat !== false;
    elements.submitResult.innerHTML = `
      <h3>提交成功</h3>
      <p><strong>任务：</strong>${escapeHtml(result.assignmentTitle)}</p>
      <p><strong>时间：</strong>${formatTime(result.submittedAt)}</p>
      <p><strong>文件：</strong>${result.files?.length ? result.files.map((file) => escapeHtml(file.originalFilename)).join(' / ') : '未上传文件'}</p>
      <p>${canRepeat ? '可以继续提交' : '已提交，不能重复提交'}</p>
    `;
  }

  function setUploadSubmitState({ submitting = false, disabled = false, text = '' } = {}) {
    uploadSubmitting = submitting;
    if (!elements.uploadSubmitButton) return;
    elements.uploadSubmitButton.disabled = submitting || disabled;
    const buttonText = text || (submitting ? '正在提交...' : '提交作业');
    const label = elements.uploadSubmitButton.querySelector('.upload-submit-text');
    if (label) label.textContent = buttonText;
    else elements.uploadSubmitButton.textContent = buttonText;
  }

  function restoreAssignmentIdField() {
    if (!elements.assignmentIdField) return;
    const params = new URLSearchParams(window.location.search);
    const assignmentId = currentAssignment?.id || params.get('id') || params.get('assignmentId') || '';
    elements.assignmentIdField.value = assignmentId;
  }

  function resetUploadFormAfterSuccess() {
    if (!elements.uploadForm) return;
    elements.uploadForm.reset();
    restoreAssignmentIdField();
    syncFileInputRequired();
    selectedFiles = [];
    renderSelectedFiles();
  }

  function getUploadErrorMessage(result, fallback = '上传失败，请稍后重试') {
    const message = String(result?.message || fallback);
    if (/too many files/i.test(message)) return `最多只能上传 ${getEffectiveMaxFiles()} 个文件`;
    if (/file too large/i.test(message)) return `单个文件不能超过 ${getEffectiveMaxFileSizeMb()} MB`;
    if (/unexpected field/i.test(message)) return '上传字段不正确，请刷新页面后重试';
    return message;
  }

  function getUploadStatusLabel(status) {
    return {
      ongoing: '进行中',
      expired: '已截止',
      ended: '已结束',
      archived: '已归档',
      deleted: '已删除',
    }[status] || getStatusLabel(status);
  }

  function setUploadFormDisabled(disabled) {
    elements.uploadForm?.querySelectorAll('input, textarea, button').forEach((element) => { element.disabled = disabled; });
  }

  function renderAssignmentInfo(assignment) {
    document.body.classList.remove('upload-invalid-state');
    elements.uploadForm?.classList.remove('is-hidden');
    const status = assignment.effectiveStatus || assignment.status || 'ongoing';
    const statusLabel = getUploadStatusLabel(status);
    const deadlineText = assignment.deadline ? `截止：${formatTime(assignment.deadline)}` : '未设置截止时间';
    elements.uploadTaskName.textContent = assignment.title || '未命名任务';
    elements.uploadPageIntro.textContent = assignment.description || '请按要求填写信息并上传文件。';
    if (elements.uploadStatusBadge) {
      elements.uploadStatusBadge.textContent = statusLabel;
      elements.uploadStatusBadge.className = `upload-status-badge status-${status}`;
    }
    elements.assignmentMeta.textContent = deadlineText;
    elements.assignmentMeta.className = `assignment-meta status-${status}`;
    const hintMap = {
      ongoing: '任务正在收集中，请确认信息和文件后提交。',
      expired: assignment.allowLate ? '已逾期，但允许继续提交' : '已超过截止时间，不能继续提交',
      ended: '该任务已结束，不能继续提交',
      archived: '该任务已归档，不能继续提交',
      deleted: '任务不存在或已删除',
    };
    if (elements.uploadStatusHint) {
      elements.uploadStatusHint.textContent = hintMap[status] || '请确认任务状态后提交。';
      elements.uploadStatusHint.className = `upload-status-hint status-${status}`;
    }
  }

  function showUploadLoadError(message) {
    document.body.classList.add('upload-invalid-state');
    elements.uploadTaskName.textContent = message || '任务不存在或链接无效';
    elements.uploadPageIntro.textContent = '请确认班长分享的任务链接是否完整。';
    if (elements.uploadStatusBadge) {
      elements.uploadStatusBadge.textContent = '无效链接';
      elements.uploadStatusBadge.className = 'upload-status-badge status-deleted';
    }
    if (elements.assignmentMeta) elements.assignmentMeta.className = 'assignment-meta is-hidden';
    if (elements.uploadStatusHint) {
      elements.uploadStatusHint.textContent = message || '任务不存在或链接无效';
      elements.uploadStatusHint.className = 'upload-status-hint status-deleted';
    }
    setUploadFormDisabled(true);
    setMessage(elements.uploadMessage, message || '任务不存在或链接无效', 'error');
    debugRecord('assignment:loadFailed', { message: message || '任务不存在或链接无效' });
  }

  function getBlockedSubmitMessage(assignment) {
    const status = assignment?.effectiveStatus || assignment?.status;
    if (status === 'expired' && !assignment?.allowLate) return '已超过截止时间，不能继续提交。';
    if (status === 'archived') return '该任务已归档，不能继续提交。';
    if (status === 'deleted') return '任务不存在或已删除。';
    return '该任务已结束，不能继续提交。';
  }

  async function loadUploadAssignment() {
    if (!elements.uploadForm) return;
    await publicConfigReady;
    const params = new URLSearchParams(window.location.search);
    const shareCode = params.get('code');
    const assignmentId = params.get('id') || params.get('assignmentId');
    if (!shareCode && !assignmentId) {
      showUploadLoadError('任务不存在或链接无效');
      return;
    }
    elements.assignmentIdField.value = assignmentId || '';
    try {
      const query = shareCode
        ? `code=${encodeURIComponent(shareCode)}`
        : `id=${encodeURIComponent(assignmentId)}`;
      const assignment = api.get
        ? await api.get(`/api/public-assignment?${query}`, { fallbackMessage: '任务不存在或链接无效' })
        : await fetch(`/api/public-assignment?${query}`).then(async (response) => {
          const data = await response.json();
          if (!response.ok) throw new Error(data.message || '任务不存在或链接无效');
          return data;
        });
      currentAssignment = assignment;
      uploadSubmittedOnce = false;
      restoreAssignmentIdField();
      setUploadFormDisabled(false);
      renderAssignmentInfo(assignment);
      renderDynamicFields(assignment);
      syncFileInputRequired();
      updateFileRules();
      renderSelectedFiles();
      debugRecord('assignment:loadSuccess', { message: '任务加载成功', assignmentId: assignment.id, status: assignment.effectiveStatus || assignment.status || '' });
      if (assignment.effectiveStatus !== 'ongoing' && !(assignment.effectiveStatus === 'expired' && assignment.allowLate)) {
        setUploadFormDisabled(true);
        setMessage(elements.uploadMessage, getBlockedSubmitMessage(assignment), 'error');
      } else if (assignment.effectiveStatus === 'expired' && assignment.allowLate) {
        setMessage(elements.uploadMessage, '已逾期，但允许继续提交', 'success');
      } else {
        setMessage(elements.uploadMessage, '');
      }
    } catch (error) {
      const friendlyMessage = error.message && !/failed to fetch|network|网络请求失败/i.test(error.message)
        ? error.message
        : '任务加载失败，请稍后重试';
      showUploadLoadError(friendlyMessage);
    }
  }

  function bindEvents() {
    elements.fileInput?.addEventListener('change', () => {
      handleSelectedFiles(elements.fileInput.files);
    });

    elements.dynamicFields?.addEventListener('input', (event) => {
      const field = event.target.closest('[name]');
      if (!field) return;
      debugRecord('assignment:fieldInput', { event, target: field, message: '填写信息输入' });
    });

    elements.uploadDropzone?.addEventListener('dragover', (event) => {
      event.preventDefault();
      if (elements.fileInput?.disabled) return;
      elements.uploadDropzone.classList.add('is-dragover');
    });

    elements.uploadDropzone?.addEventListener('dragleave', (event) => {
      if (!elements.uploadDropzone.contains(event.relatedTarget)) elements.uploadDropzone.classList.remove('is-dragover');
    });

    elements.uploadDropzone?.addEventListener('drop', (event) => {
      event.preventDefault();
      elements.uploadDropzone.classList.remove('is-dragover');
      if (elements.fileInput?.disabled) return;
      handleSelectedFiles(event.dataTransfer?.files || [], { append: true });
      if (elements.fileInput) elements.fileInput.value = '';
    });

    elements.selectedFileList?.addEventListener('click', (event) => {
      const button = event.target.closest('[data-remove-file]');
      if (!button) return;
      clearSubmitResult();
      selectedFiles.splice(Number(button.dataset.removeFile), 1);
      if (elements.fileInput) elements.fileInput.value = '';
      renderSelectedFiles();
      debugRecord('assignment:removeSelectedFile', { event, target: button, message: '删除已选文件', selectedFileCount: selectedFiles.length });
      const error = getSelectedFileError();
      if (error) setMessage(elements.uploadMessage, error, 'error');
      else setMessage(elements.uploadMessage, '');
    });

    elements.uploadForm.addEventListener('submit', (event) => {
      event.preventDefault();
      if (uploadSubmitting) return;
      debugRecord('assignment:submitAssignment', { event, target: elements.uploadForm, message: '提交作业' });
      if (uploadSubmittedOnce && currentAssignment?.allowRepeat === false) {
        setMessage(elements.uploadMessage, '该任务不允许重复提交，你已成功提交过一次。', 'error');
        setUploadSubmitState({ disabled: true, text: '已提交' });
        return;
      }
      clearSubmitResult();
      setUploadSubmitState({ submitting: true, text: '正在提交...' });
      try {
        validateSelectedFiles();
        restoreAssignmentIdField();
      } catch (error) {
        setMessage(elements.uploadMessage, error.message, 'error');
        setUploadSubmitState({ disabled: false });
        debugRecord('assignment:submitFailed', { message: error.message });
        return;
      }
      const formData = new FormData(elements.uploadForm);
      formData.delete('files');
      selectedFiles.forEach((file) => formData.append('files', file));
      elements.uploadProgressBar.style.width = '0%';
      setMessage(elements.uploadMessage, '正在上传...', null);

      const xhr = new XMLHttpRequest();
      xhr.open('POST', '/api/upload');
      xhr.timeout = 120000;
      xhr.upload.addEventListener('progress', (progress) => {
        if (progress.lengthComputable) elements.uploadProgressBar.style.width = `${Math.round((progress.loaded / progress.total) * 100)}%`;
      });
      xhr.addEventListener('load', () => {
        let result = {};
        try {
          result = JSON.parse(xhr.responseText || '{}');
        } catch {
          result = { message: xhr.responseText || '' };
        }
        if (xhr.status >= 200 && xhr.status < 300) {
          elements.uploadProgressBar.style.width = '100%';
          uploadSubmittedOnce = true;
          resetUploadFormAfterSuccess();
          renderSubmitResult(result);
          if (currentAssignment?.allowRepeat === false) {
            setUploadSubmitState({ disabled: true, text: '已提交' });
            setMessage(elements.uploadMessage, '提交成功。该任务不允许重复提交，请勿再次提交。', 'success');
          } else {
            setUploadSubmitState({ disabled: false });
            setMessage(elements.uploadMessage, result.message || '提交成功', 'success');
          }
          debugRecord('assignment:submitSuccess', { message: result.message || '提交成功', status: xhr.status });
        } else {
          setUploadSubmitState({ disabled: false });
          setMessage(elements.uploadMessage, getUploadErrorMessage(result), 'error');
          debugRecord('assignment:submitFailed', { message: getUploadErrorMessage(result), status: xhr.status });
        }
      });
      xhr.addEventListener('error', () => {
        setUploadSubmitState({ disabled: false });
        setMessage(elements.uploadMessage, '网络错误，上传失败', 'error');
        debugRecord('assignment:submitFailed', { message: '网络错误，上传失败' });
      });
      xhr.addEventListener('timeout', () => {
        setUploadSubmitState({ disabled: false });
        setMessage(elements.uploadMessage, '上传超时，请检查网络后重试', 'error');
        debugRecord('assignment:submitFailed', { message: '上传超时，请检查网络后重试' });
      });
      xhr.send(formData);
    });
  }

  function init() {
    elements = getElements();
    if (!elements.uploadForm) return;
    if (elements.uploadForm.dataset.cloudnoteAssignmentInitialized === 'true') return;
    elements.uploadForm.dataset.cloudnoteAssignmentInitialized = 'true';
    debugRecord('assignment:init', { message: '上传页初始化' });
    publicConfigReady = loadPublicConfig();
    bindEvents();
    loadUploadAssignment();
  }

  CloudNote.assignmentPage = {
    init,
    loadUploadAssignment,
    getEffectiveMaxFiles,
    getEffectiveMaxFileSizeMb,
  };

  (common.ready || ((callback) => callback()))(init);
})(window, document);
