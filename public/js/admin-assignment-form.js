(function (window, document) {
  'use strict';

  const CloudNote = window.CloudNote = window.CloudNote || {};
  const common = CloudNote.common || {};
  const api = CloudNote.api || {};
  const $ = common.$ || ((selector) => document.querySelector(selector));
  const escapeHtml = common.escapeHtml || ((value) => String(value ?? ''));
  const setMessage = common.setMessage || (() => {});
  const formatTime = common.formatTime || common.formatDateTime || ((value) => value || '-');
  const showConfirmDialog = common.showConfirmDialog || common.confirmDialog || (() => Promise.resolve(window.confirm('确认操作？')));

  const DRAFT_KEY = 'cloudnoteAssignmentDraft';
  const BASIC_FIELD_TYPES = ['name', 'phone', 'idcard', 'email', 'birth_date'];
  const CUSTOM_FIELD_TYPES = ['single_line', 'numeric', 'digits', 'single_choice', 'multiple_choice', 'multi_line', 'datetime', 'positive_integer'];
  const FIELD_TYPE_LABELS = {
    name: '姓名',
    phone: '手机号',
    idcard: '身份证号',
    email: '邮箱',
    birth_date: '出生日期',
    single_line: '单行文本',
    numeric: '纯数值',
    digits: '纯数字',
    single_choice: '单选',
    multiple_choice: '多选',
    multi_line: '多行文本',
    datetime: '日期和时间',
    positive_integer: '正整数',
  };
  const BASIC_FIELD_KEYS = {
    name: 'studentName',
    phone: 'phone',
    idcard: 'idcard',
    email: 'email',
    birth_date: 'birthDate',
  };
  const SUBMISSION_IDENTITY_FIELD_KEYS = new Set(['studentName', 'studentId', 'phone', 'email']);
  const SUBMISSION_IDENTITY_FIELD_TYPES = new Set(['name', 'phone', 'email']);
  const SUBMISSION_IDENTITY_FIELD_LABELS = new Set(['姓名', '学号', '手机号', '邮箱']);
  const DUPLICATE_IDENTITY_WARNING = '当前任务未启用姓名、学号、手机号或邮箱字段，系统可能无法准确判断重复提交。请至少启用一个身份识别字段，或开启允许重复提交。';
  const LEGACY_FIELD_TYPE_MAP = {
    tel: 'phone',
    date: 'birth_date',
    radio: 'single_choice',
    checkbox: 'multiple_choice',
    textarea: 'multi_line',
    number_digits: 'digits',
    number_value: 'numeric',
  };
  const VALID_FIELD_TYPES = new Set([...BASIC_FIELD_TYPES, ...CUSTOM_FIELD_TYPES]);
  const FILE_TYPE_EXTENSION_MAP = {
    any: [],
    word: ['doc', 'docx'],
    pdf: ['pdf'],
    text: ['txt'],
    excel: ['xls', 'xlsx'],
    ppt: ['ppt', 'pptx'],
    image: ['jpg', 'jpeg', 'png', 'gif', 'webp'],
    video: ['mp4', 'mov', 'avi', 'mkv'],
    document: ['doc', 'docx', 'pdf', 'txt', 'xls', 'xlsx', 'ppt', 'pptx'],
    archive: ['zip', 'rar', '7z'],
    installer: ['apk', 'exe', 'msi', 'dmg'],
  };
  const DEFAULT_FIELDS = [];

  let initialized = false;
  let fieldKeySeed = Date.now();
  let hasSubmittedCreateForm = false;
  let autosaveInterval = null;
  let draftDirty = false;
  let draftDirtyReason = '';
  const fieldNameErrors = new Map();
  const DEBUG_LOG_KEY = 'cloudnoteDebugLogs';
  const DEBUG_LOG_LIMIT = 1000;

  function getDebugLogs() {
    if (window.CloudNoteDebug?.getLogs) return window.CloudNoteDebug.getLogs();
    try {
      const parsed = JSON.parse(localStorage.getItem(DEBUG_LOG_KEY) || '[]');
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }

  function getFieldsDebugSnapshot() {
    try {
      const { fieldConfigList } = getElements();
      return [...(fieldConfigList?.querySelectorAll('.collect-field-row') || [])].map((row, index) => {
        const typeSelect = row.querySelector('select[data-field-type]');
        return {
          index,
          rowKey: row.dataset.fieldKey || '',
          fieldType: typeSelect?.value || row.dataset.currentFieldType || '',
          fieldLabel: row.dataset.fieldLabel || '',
          draftLabel: row.dataset.fieldNameDraft || row.querySelector('[data-field-name]')?.value || '',
          required: Boolean(row.querySelector('[data-field-required]')?.checked),
        };
      });
    } catch {
      return [];
    }
  }

  function getSafeDataset(target) {
    try {
      const dataset = target?.dataset ? { ...target.dataset } : {};
      ['token', 'password', 'file', 'path', 'content'].forEach((key) => {
        Object.keys(dataset).forEach((name) => {
          if (name.toLowerCase().includes(key)) delete dataset[name];
        });
      });
      return dataset;
    } catch {
      return {};
    }
  }

  function recordDebug(action, details = {}) {
    try {
      const target = details.target || null;
      const row = details.row || target?.closest?.('.collect-field-row') || null;
      const typeSelect = row?.querySelector?.('select[data-field-type]');
      const entry = {
        page: 'admin',
        event: details.event,
        target,
        eventType: details.eventType || details.event?.type || '',
        rowKey: details.rowKey ?? row?.dataset?.fieldKey ?? '',
        fieldType: details.fieldType ?? typeSelect?.value ?? row?.dataset?.currentFieldType ?? '',
        fieldLabel: details.fieldLabel ?? row?.dataset?.fieldLabel ?? '',
        targetTag: details.targetTag ?? target?.tagName ?? '',
        targetDataset: details.targetDataset ?? getSafeDataset(target),
        fieldsSnapshot: details.fieldsSnapshot ?? getFieldsDebugSnapshot(),
        previousType: details.previousType || '',
        nextType: details.nextType || '',
        previousLabel: details.previousLabel || '',
        nextLabel: details.nextLabel || '',
        message: details.message || '',
      };
      if (window.CloudNoteDebug?.record) return window.CloudNoteDebug.record(action, entry);
      const logs = getDebugLogs();
      logs.push({ timestamp: new Date().toISOString(), action, ...entry });
      localStorage.setItem(DEBUG_LOG_KEY, JSON.stringify(logs.slice(-DEBUG_LOG_LIMIT)));
      console.info('[CloudNoteCreateTaskDebug]', action, {
        rowKey: entry.rowKey,
        fieldType: entry.fieldType,
        fieldLabel: entry.fieldLabel,
        message: entry.message,
      });
      return entry;
    } catch {
      return null;
    }
  }

  function exportDebugLogs() {
    if (window.CloudNoteDebug?.export) {
      window.CloudNoteDebug.export();
      return;
    }
    try {
      const blob = new Blob([JSON.stringify(getDebugLogs(), null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `cloudnote-create-task-debug-${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch {}
  }

  function clearDebugLogs() {
    if (window.CloudNoteDebug?.clear) {
      window.CloudNoteDebug.clear();
      return;
    }
    try {
      localStorage.removeItem(DEBUG_LOG_KEY);
      console.info('[CloudNoteCreateTaskDebug] logs cleared');
    } catch {}
  }

  window.CloudNoteCreateTaskDebug = {
    record: recordDebug,
    export: exportDebugLogs,
    clear: clearDebugLogs,
    getLogs: getDebugLogs,
  };

  const runtime = CloudNote.adminRuntime = CloudNote.adminRuntime || {
    publicBaseUrl: window.location.origin,
    systemMaxUploadSizeMb: 500,
    systemMaxUploadFiles: 20,
  };

  function getElements() {
    return {
      assignmentForm: $('#assignmentForm'),
      assignmentSubmitButton: $('#assignmentSubmitButton'),
      cancelEditButton: $('#cancelEditButton'),
      assignmentMessage: $('#assignmentMessage'),
      fieldConfigList: $('#fieldConfigList'),
      addFieldButton: $('#addFieldButton'),
      deleteSelectedFieldsButton: $('#deleteSelectedFieldsButton'),
      fieldSelectAll: $('#fieldSelectAll'),
      taskTabs: document.querySelectorAll('[data-task-tab]'),
      taskTabPanels: document.querySelectorAll('[data-task-tab-panel]'),
      fieldTypePopover: $('#fieldTypePopover'),
      fileTypeSelect: $('#fileTypeSelect'),
      fileTypeChecks: document.querySelectorAll('[data-extension-group]'),
      renameRuleButton: $('#renameRuleButton'),
      renameRuleMenu: $('#renameRuleMenu'),
      renameRuleOptions: $('#renameRuleOptions'),
      renameRulePreview: $('#renameRulePreview'),
      descriptionCount: $('#descriptionCount'),
      noDeadlineSwitch: document.querySelector('[name="noDeadline"]'),
      createPageTitle: $('#createPageTitle') || document.querySelector('.create-page-head h1'),
      draftStatusText: $('#draftStatusText'),
      overviewStatus: $('#overviewStatus'),
    };
  }

  async function loadPublicConfig() {
    if (runtime.publicConfigPromise) return runtime.publicConfigPromise;
    runtime.publicConfigPromise = (async () => {
      try {
        const response = await fetch('/api/public-config');
        if (!response.ok) return runtime;
        const config = await response.json();
        if (config.publicBaseUrl) runtime.publicBaseUrl = String(config.publicBaseUrl).replace(/\/+$/, '');
        if (Number(config.maxUploadSizeMb) > 0) runtime.systemMaxUploadSizeMb = Number(config.maxUploadSizeMb);
        if (Number(config.maxUploadFiles) > 0) runtime.systemMaxUploadFiles = Number(config.maxUploadFiles);
      } catch {
        runtime.publicBaseUrl = window.location.origin;
      }
      return runtime;
    })();
    return runtime.publicConfigPromise;
  }

  function toDatetimeLocal(value) {
    if (!value) return '';
    const date = new Date(value);
    const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
    return local.toISOString().slice(0, 16);
  }

  function getAssignmentUrl(assignment) {
    const baseUrl = runtime.publicBaseUrl || window.location.origin;
    if (common.buildAssignmentLink) return common.buildAssignmentLink(assignment, baseUrl);
    if (assignment && typeof assignment === 'object') {
      if (assignment.shareCode) return `${baseUrl}/assignment.html?code=${encodeURIComponent(assignment.shareCode)}`;
      return `${baseUrl}/assignment.html?id=${encodeURIComponent(assignment.id)}`;
    }
    return `${baseUrl}/assignment.html?id=${encodeURIComponent(assignment)}`;
  }

  function getTemplateVisibility() {
    return document.querySelector('input[name="templateVisible"]:checked')?.value || 'private';
  }

  function isBasicFieldType(type) {
    return BASIC_FIELD_TYPES.includes(type);
  }

  function getFieldCategory(type, fallback = 'custom') {
    return isBasicFieldType(type) ? 'basic' : fallback === 'basic' && isBasicFieldType(type) ? 'basic' : 'custom';
  }

  function isSubmissionIdentityField(field = {}) {
    const key = String(field.key || field.id || '').trim();
    const type = String(field.type || '').trim();
    const label = String(field.label || field.name || '').trim();
    return field.enabled !== false && field.visible !== false && (
      SUBMISSION_IDENTITY_FIELD_KEYS.has(key)
      || SUBMISSION_IDENTITY_FIELD_TYPES.has(type)
      || SUBMISSION_IDENTITY_FIELD_LABELS.has(label)
    );
  }

  function normalizeFieldType(field = {}) {
    const rawType = String(field.type || '').trim();
    if (VALID_FIELD_TYPES.has(rawType)) return rawType;
    if (rawType === 'number') return field.numberRuleMode === 'digits' ? 'digits' : 'numeric';
    if (LEGACY_FIELD_TYPE_MAP[rawType]) return LEGACY_FIELD_TYPE_MAP[rawType];
    const label = String(field.label || field.name || '').trim();
    const key = String(field.key || field.id || '').trim();
    if (key === 'studentName' || label === '姓名') return 'name';
    if (key === 'studentId' || label === '学号') return 'digits';
    if (label === '手机号') return 'phone';
    if (label === '身份证号' || label === '身份证号码') return 'idcard';
    if (label === '邮箱') return 'email';
    if (label === '出生日期') return 'birth_date';
    if (label === '多行文本') return 'multi_line';
    return 'single_line';
  }

  function splitOptions(value) {
    return Array.isArray(value)
      ? value.map((item) => String(item || '').trim()).filter(Boolean)
      : String(value || '').split(/[,，\n]/).map((item) => item.trim()).filter(Boolean);
  }

  function getFixedFieldLabel(type) {
    return FIELD_TYPE_LABELS[type] || '单行文本';
  }

  function getDefaultFieldOptions(type) {
    if (type === 'single_choice') return ['选项一', '选项二'];
    if (type === 'multiple_choice') return ['选项一', '选项二', '选项三'];
    return [];
  }

  function getDefaultFieldRules(type, source = {}) {
    const rules = source.rules && typeof source.rules === 'object' ? source.rules : {};
    if (type === 'numeric') {
      return {
        min: rules.min ?? source.minValue ?? '',
        max: rules.max ?? source.maxValue ?? '',
      };
    }
    if (type === 'digits') {
      return {
        length: rules.length ?? source.digitLength ?? source.maxLength ?? '',
      };
    }
    if (type === 'single_choice' || type === 'multiple_choice') {
      return {
        options: splitOptions(rules.options ?? source.options).length
          ? splitOptions(rules.options ?? source.options)
          : getDefaultFieldOptions(type),
      };
    }
    return {};
  }

  function prepareFieldForType(field, type, options = {}) {
    const nextType = VALID_FIELD_TYPES.has(type) ? type : 'single_line';
    const category = getFieldCategory(nextType);
    const fixedLabel = getFixedFieldLabel(nextType);
    const wasBasic = isBasicFieldType(field.type) || field.category === 'basic';
    const currentLabel = String(field.label || field.name || '').trim();
    const shouldUseDefaultLabel = options.resetLabel === true || category === 'basic' || !currentLabel || wasBasic;
    return {
      ...field,
      type: nextType,
      category,
      label: shouldUseDefaultLabel ? fixedLabel : currentLabel,
      name: shouldUseDefaultLabel ? fixedLabel : currentLabel,
      system: category === 'basic',
      maxLength: '',
      numberRuleMode: nextType === 'digits' ? 'digits' : nextType === 'numeric' ? 'range' : '',
      minValue: '',
      maxValue: '',
      digitLength: '',
      options: getDefaultFieldOptions(nextType),
      rules: getDefaultFieldRules(nextType),
    };
  }

  function getFieldConfigFromForm() {
    const { fieldConfigList } = getElements();
    if (!fieldConfigList) return DEFAULT_FIELDS;
    return [...fieldConfigList.querySelectorAll('.collect-field-row')].map((row, index) => {
      const type = row.querySelector('select[data-field-type]')?.value || row.dataset.currentFieldType || 'single_line';
      const category = getFieldCategory(type, row.dataset.category);
      const label = category === 'basic'
        ? getFixedFieldLabel(type)
        : String(row.dataset.fieldNameDraft ?? row.dataset.fieldLabel ?? '').trim();
      const minValue = row.querySelector('[data-number-min]')?.value ?? '';
      const maxValue = row.querySelector('[data-number-max]')?.value ?? '';
      const digitLength = row.querySelector('[data-number-digits]')?.value ?? '';
      const options = splitOptions(row.querySelector('[data-field-options]')?.value || '');
      const rules = {};
      if (type === 'numeric') {
        rules.min = minValue;
        rules.max = maxValue;
      }
      if (type === 'digits') rules.length = digitLength;
      if (type === 'single_choice' || type === 'multiple_choice') rules.options = options;
      return {
        key: row.dataset.fieldKey || `custom${Date.now()}${index}`,
        id: row.dataset.fieldId || row.dataset.fieldKey || `field-${index + 1}`,
        name: label,
        label,
        type,
        category,
        enabled: true,
        visible: true,
        required: row.querySelector('[data-field-required]')?.checked || false,
        maxLength: undefined,
        numberRuleMode: type === 'digits' ? 'digits' : type === 'numeric' ? 'range' : '',
        minValue,
        maxValue,
        digitLength,
        placeholder: '',
        helpText: '',
        options,
        rules,
        system: category === 'basic',
      };
    });
  }

  function getAssignmentSnapshot() {
    const { assignmentForm, fileTypeSelect } = getElements();
    if (!assignmentForm) return null;
    const formData = new FormData(assignmentForm);
    const noDeadline = Boolean(formData.get('noDeadline'));
    return {
      title: formData.get('title') || '',
      description: formData.get('description') || '',
      deadline: noDeadline ? null : (formData.get('deadline') || ''),
      noDeadline,
      status: 'ongoing',
      allowLate: Boolean(formData.get('allowLate')),
      allowRepeat: Boolean(formData.get('allowRepeat')),
      repeatMode: formData.get('repeatMode') || 'overwrite',
      downloadStructure: formData.get('downloadStructure') || 'task-file',
      requiredUpload: Boolean(formData.get('requiredUpload')),
      fileType: formData.get('fileType') || fileTypeSelect?.value || 'any',
      enableLimit: Boolean(formData.get('enableLimit')),
      maxFileSizeMb: Number(formData.get('maxFileSizeMb') || 100),
      maxFiles: Number(formData.get('maxFiles') || 1),
      allowFolder: Boolean(formData.get('allowFolder')),
      renameEnabled: Boolean(formData.get('renameEnabled')),
      renameFields: String(formData.get('renameFields') || '').split(',').map((item) => item.trim()).filter(Boolean),
      allowedExtensions: String(formData.get('allowedExtensions') || '').split(',').map((item) => item.trim()).filter(Boolean),
      fieldConfig: getFieldConfigFromForm(),
      template: {
        enabled: false,
        name: $('#templateNameInput')?.value || '',
        category: $('#templateCategorySelect')?.value || 'course',
        visibility: getTemplateVisibility(),
      },
    };
  }

  function createUniqueFieldKey(existingKeys = new Set(), prefix = 'customField') {
    let key = '';
    do {
      fieldKeySeed += 1;
      key = `${prefix}${fieldKeySeed}`;
    } while (existingKeys.has(key));
    existingKeys.add(key);
    return key;
  }

  function normalizeAdminFields(fields = DEFAULT_FIELDS) {
    const source = Array.isArray(fields) ? fields : DEFAULT_FIELDS;
    const usedKeys = new Set();
    const usedBasicTypes = new Set();
    return source.map((field, index) => {
      const normalizedType = normalizeFieldType(field);
      const isDuplicateBasic = isBasicFieldType(normalizedType) && usedBasicTypes.has(normalizedType);
      const type = isDuplicateBasic ? 'single_line' : normalizedType;
      const category = isBasicFieldType(type) ? 'basic' : 'custom';
      if (category === 'basic') usedBasicTypes.add(type);
      const fixedLabel = getFixedFieldLabel(type);
      const rules = getDefaultFieldRules(type, field);
      const originalLabel = String(field.name || field.label || '').trim();
      const label = category === 'basic'
        ? fixedLabel
        : (originalLabel || (isDuplicateBasic ? getFixedFieldLabel(normalizedType) : fixedLabel) || `信息${index + 1}`);
      const originalKey = String(field.key || field.id || '').trim();
      const preferredKey = category === 'basic' ? BASIC_FIELD_KEYS[type] : originalKey;
      const key = preferredKey && !usedKeys.has(preferredKey)
        ? preferredKey
        : createUniqueFieldKey(usedKeys);
      usedKeys.add(key);
      return {
        key,
        id: field.id || key,
        name: label,
        label,
        type,
        category,
        enabled: field.enabled !== false,
        visible: field.visible !== false,
        required: Boolean(field.required),
        maxLength: field.maxLength || '',
        numberRuleMode: type === 'digits' ? 'digits' : type === 'numeric' ? 'range' : '',
        minValue: rules.min ?? '',
        maxValue: rules.max ?? '',
        digitLength: rules.length ?? '',
        options: rules.options || [],
        rules,
        system: category === 'basic',
      };
    }).filter((field) => field.enabled !== false && field.visible !== false);
  }

  function updateCreateOverview() {
    const { assignmentForm, overviewStatus } = getElements();
    if (!assignmentForm || !overviewStatus) return;
  }

  function updateDescriptionCount() {
    const { assignmentForm, descriptionCount } = getElements();
    if (!descriptionCount || !assignmentForm?.description) return;
    descriptionCount.textContent = String(assignmentForm.description.value.length);
  }

  function getSelectedRenameFields() {
    const { assignmentForm } = getElements();
    return String(assignmentForm?.renameFields?.value || 'originalFilename').split(',').map((item) => item.trim()).filter(Boolean);
  }

  function getRenameFieldLabel(key) {
    const builtIns = { originalFilename: '原文件名', submitterName: '上传者称呼', uploadTime: '上传时间', studentName: '姓名', studentId: '学号' };
    if (builtIns[key]) return builtIns[key];
    return getFieldConfigFromForm().find((field) => field.key === key)?.label || key;
  }

  function updateRenamePreview() {
    const { assignmentForm, renameRulePreview } = getElements();
    if (!renameRulePreview || !assignmentForm?.renameFields) return;
    const labels = getSelectedRenameFields().map(getRenameFieldLabel);
    renameRulePreview.textContent = labels.length ? labels.join('_') : '原文件名';
  }

  function renderRenameRuleOptions() {
    const { assignmentForm, renameRuleOptions } = getElements();
    if (!renameRuleOptions || !assignmentForm?.renameFields) return;
    const fields = getFieldConfigFromForm();
    const selected = new Set(getSelectedRenameFields());
    const options = [
      { key: 'originalFilename', label: '原文件名' },
      { key: 'submitterName', label: '上传者称呼' },
      { key: 'uploadTime', label: '上传时间' },
      ...fields.map((field) => ({ key: field.key, label: field.label })),
    ];
    const unique = [];
    const seen = new Set();
    options.forEach((option) => {
      if (!seen.has(option.key)) {
        seen.add(option.key);
        unique.push(option);
      }
    });
    renameRuleOptions.innerHTML = unique.map((option) => `
      <button class="rename-option ${selected.has(option.key) ? 'is-selected' : ''}" type="button" data-rename-field="${escapeHtml(option.key)}">
        <span>${selected.has(option.key) ? '✓' : ''}</span>${escapeHtml(option.label)}
      </button>
    `).join('');
    updateRenamePreview();
  }

  function renderFields(fields = DEFAULT_FIELDS) {
    const { fieldConfigList } = getElements();
    if (!fieldConfigList) return;
    recordDebug('renderFields:before', { fieldsSnapshot: getFieldsDebugSnapshot(), message: `incoming ${Array.isArray(fields) ? fields.length : 0} fields` });
    const normalized = normalizeAdminFields(fields);
    if (!normalized.length) {
      fieldConfigList.innerHTML = '<div class="empty-card collect-empty-state">暂无收集信息，点击上方按钮添加信息类型。</div>';
      updateFieldSelectionState();
      renderRenameRuleOptions();
      updateCreateOverview();
      updateTaskTabStates();
      recordDebug('renderFields:after', { message: 'rendered empty field list' });
      return;
    }
    fieldConfigList.innerHTML = normalized.map((field, index) => {
      const isBasic = field.category === 'basic' || isBasicFieldType(field.type);
      const ruleSummary = (() => {
        if (field.type === 'name') return '<span class="field-rule-text">中文1-5 / 英文1-20</span>';
        if (field.type === 'phone') return '<span class="field-rule-text">大陆手机号</span>';
        if (field.type === 'idcard') return '<span class="field-rule-text">15/18位，含日期与校验位</span>';
        if (field.type === 'email') return '<span class="field-rule-text">邮箱格式</span>';
        if (field.type === 'birth_date') return '<span class="field-rule-text">1900-01-01 至今</span>';
        if (field.type === 'single_line') return '<span class="field-rule-text">1-50字</span>';
        if (field.type === 'multi_line') return '<span class="field-rule-text">1-1000字</span>';
        if (field.type === 'datetime') return '<span class="field-rule-text">日期+时间</span>';
        if (field.type === 'positive_integer') return '<span class="field-rule-text">大于0的整数</span>';
        if (field.type === 'digits') {
          return `<label class="number-rule compact-rule">
            <span>长度</span>
            <input type="number" data-number-digits data-field-tab="collect" min="1" max="30" placeholder="不限" value="${escapeHtml(field.digitLength ?? field.rules?.length ?? '')}">
          </label>`;
        }
        if (field.type === 'numeric') {
          return `<span class="number-rule compact-range-rule">
            <input type="number" step="any" data-number-min data-field-tab="collect" placeholder="最小值" value="${escapeHtml(field.minValue ?? field.rules?.min ?? '')}">
            <span>-</span>
            <input type="number" step="any" data-number-max data-field-tab="collect" placeholder="最大值" value="${escapeHtml(field.maxValue ?? field.rules?.max ?? '')}">
          </span>`;
        }
        if (field.type === 'single_choice' || field.type === 'multiple_choice') {
          return `<label class="field-options-control compact-options">
            <span>选项</span>
            <input type="text" data-field-options data-field-tab="collect" placeholder="选项一, 选项二" value="${escapeHtml((field.options || []).join(', '))}">
          </label>`;
        }
        return '<span class="field-rule-text">1-50字</span>';
      })();
      return `
        <div class="collect-field-row" data-field-key="${escapeHtml(field.key)}" data-field-id="${escapeHtml(field.id)}" data-current-field-type="${escapeHtml(field.type)}" data-category="${escapeHtml(field.category)}" data-field-label="${escapeHtml(field.label)}" data-field-name-draft="${escapeHtml(field.label)}" data-system="${isBasic ? 'true' : 'false'}">
          <span class="field-index">${index + 1}</span>
          <div class="field-name-editor">
            <div class="field-name-control ${isBasic ? 'is-readonly' : 'has-confirm'}">
              <input class="field-name-input" type="text" data-field-name data-field-tab="collect" value="${escapeHtml(field.label)}" aria-label="信息名称" ${isBasic ? 'readonly aria-readonly="true"' : ''}>
              ${isBasic ? '' : '<button class="field-name-confirm" type="button" data-confirm-field-name title="确认信息名称" aria-label="确认信息名称">✓</button>'}
            </div>
            ${fieldNameErrors.has(field.key) ? `<small class="field-error-message">${escapeHtml(fieldNameErrors.get(field.key))}</small>` : ''}
          </div>
          <select data-field-type data-field-tab="collect" aria-label="信息类型" ${isBasic ? 'disabled aria-disabled="true"' : ''}>
            ${isBasic
              ? `<option value="${field.type}" selected>${FIELD_TYPE_LABELS[field.type]}</option>`
              : CUSTOM_FIELD_TYPES.map((type) => `<option value="${type}" ${field.type === type ? 'selected' : ''}>${FIELD_TYPE_LABELS[type]}</option>`).join('')}
          </select>
          <label class="check-inline">
            <input type="checkbox" data-field-required data-field-tab="collect" ${field.required ? 'checked' : ''}>
            <span>必填</span>
          </label>
          <div class="field-rule-cell">${ruleSummary}</div>
          <div class="field-order-actions">
            <button class="icon-button" type="button" data-move-field="${index}" data-move-dir="-1" title="上移" ${index === 0 ? 'disabled' : ''}>↑</button>
            <button class="icon-button" type="button" data-move-field="${index}" data-move-dir="1" title="下移" ${index === normalized.length - 1 ? 'disabled' : ''}>↓</button>
          </div>
          <button class="icon-button delete-icon iconfont icon-shanchu" type="button" data-remove-field="${index}" title="删除字段" aria-label="删除字段"></button>
          <label class="field-select-cell" title="选择字段">
            <input type="checkbox" data-select-field="${escapeHtml(field.key)}" data-field-tab="collect" aria-label="选择${escapeHtml(field.label)}">
          </label>
        </div>
      `;
    }).join('');
    updateFieldSelectionState();
    renderRenameRuleOptions();
    updateCreateOverview();
    updateTaskTabStates();
    recordDebug('renderFields:after', { message: `rendered ${normalized.length} fields` });
  }

  function updateFieldSelectionState() {
    const { fieldConfigList, fieldSelectAll, deleteSelectedFieldsButton } = getElements();
    const checkboxes = [...(fieldConfigList?.querySelectorAll('[data-select-field]') || [])];
    const selectedCount = checkboxes.filter((checkbox) => checkbox.checked).length;
    if (fieldSelectAll) {
      fieldSelectAll.checked = checkboxes.length > 0 && selectedCount === checkboxes.length;
      fieldSelectAll.indeterminate = selectedCount > 0 && selectedCount < checkboxes.length;
      fieldSelectAll.disabled = checkboxes.length === 0;
    }
    if (deleteSelectedFieldsButton) deleteSelectedFieldsButton.disabled = selectedCount === 0;
  }

  function setFieldNameError(row, message = '') {
    const key = row?.dataset.fieldKey;
    if (!key) return;
    if (message) fieldNameErrors.set(key, message);
    else fieldNameErrors.delete(key);
    const editor = row.querySelector('.field-name-editor');
    editor?.querySelector('.field-error-message')?.remove();
    if (message && editor) {
      const hint = document.createElement('small');
      hint.className = 'field-error-message';
      hint.textContent = message;
      editor.appendChild(hint);
    }
  }

  function commitFieldName(row, { focusOnError = false, event = null } = {}) {
    const input = row?.querySelector('[data-field-name]');
    if (!row || !input) return true;
    const type = row.querySelector('select[data-field-type]')?.value || row.dataset.currentFieldType;
    const previousLabel = row.dataset.fieldLabel || '';
    if (isBasicFieldType(type)) {
      const fixed = getFixedFieldLabel(type);
      input.value = fixed;
      row.dataset.fieldLabel = fixed;
      row.dataset.fieldNameDraft = fixed;
      setFieldNameError(row, '');
      recordDebug('fieldName:confirmBasic', { event, row, target: input, fieldType: type, fieldLabel: fixed, previousLabel, nextLabel: fixed });
      return true;
    }
    const nextLabel = String(input.value || '').trim();
    if (!nextLabel) {
      setFieldNameError(row, '信息名称不能为空');
      if (focusOnError) input.focus();
      recordDebug('fieldName:confirmFailed', { event, row, target: input, fieldType: type, previousLabel, nextLabel: '', message: '信息名称不能为空' });
      return false;
    }
    row.dataset.fieldLabel = nextLabel;
    row.dataset.fieldNameDraft = nextLabel;
    input.value = nextLabel;
    setFieldNameError(row, '');
    renderRenameRuleOptions();
    updateCreateOverview();
    updateTaskTabStates();
    markDraftDirty('fieldName:confirmed');
    recordDebug('fieldName:confirmed', { event, row, target: input, fieldType: type, fieldLabel: nextLabel, previousLabel, nextLabel });
    return true;
  }

  function commitAllFieldNames({ focusOnError = false, event = null } = {}) {
    const { fieldConfigList } = getElements();
    const rows = [...(fieldConfigList?.querySelectorAll('.collect-field-row') || [])];
    for (const row of rows) {
      if (!commitFieldName(row, { focusOnError, event })) return false;
    }
    return true;
  }

  function inferFileType(extensions = []) {
    const list = (extensions || []).map((item) => item.toLowerCase()).sort().join(',');
    for (const [type, values] of Object.entries(FILE_TYPE_EXTENSION_MAP)) {
      if (values.slice().sort().join(',') === list) return type;
    }
    return list ? 'document' : 'any';
  }

  function getSelectedFileTypeGroups() {
    const { fileTypeChecks } = getElements();
    return [...(fileTypeChecks || [])].filter((input) => input.checked);
  }

  function inferFileTypeFromExtensions(extensions = []) {
    const list = new Set((extensions || []).map((item) => item.toLowerCase()));
    if (!list.size) return 'any';
    const groupNames = getSelectedFileTypeGroups().map((input) => input.dataset.extensionGroup);
    if (groupNames.length === 1 && FILE_TYPE_EXTENSION_MAP[groupNames[0]]) return groupNames[0];
    if ([...list].every((ext) => FILE_TYPE_EXTENSION_MAP.document.includes(ext))) return 'document';
    return 'custom';
  }

  function updateAllowedExtensionsFromChecks() {
    const { assignmentForm, fileTypeSelect } = getElements();
    if (!assignmentForm?.allowedExtensions) return;
    const selected = getSelectedFileTypeGroups();
    const extensions = selected.flatMap((input) => String(input.dataset.extensions || '').split(',').map((item) => item.trim()).filter(Boolean));
    const unique = [...new Set(extensions.map((item) => item.toLowerCase()))];
    assignmentForm.allowedExtensions.value = unique.join(',');
    if (fileTypeSelect) fileTypeSelect.value = inferFileTypeFromExtensions(unique);
  }

  function syncFileTypeChecksFromExtensions(extensions = []) {
    const { fileTypeChecks } = getElements();
    const list = new Set((extensions || []).map((item) => String(item).toLowerCase()));
    fileTypeChecks.forEach((input) => {
      const groupExtensions = String(input.dataset.extensions || '').split(',').map((item) => item.trim().toLowerCase()).filter(Boolean);
      input.checked = groupExtensions.length > 0 && groupExtensions.every((ext) => list.has(ext));
    });
    updateAllowedExtensionsFromChecks();
  }

  function syncLimitState() {
    const { assignmentForm } = getElements();
    const row = document.querySelector('[data-limit-row]');
    const enabled = Boolean(assignmentForm?.enableLimit?.checked);
    row?.classList.toggle('is-muted', !enabled);
    row?.querySelectorAll('input').forEach((input) => {
      input.readOnly = !enabled;
      input.setAttribute('aria-disabled', String(!enabled));
    });
  }

  function syncRenameState() {
    const { assignmentForm, renameRuleButton, renameRuleMenu } = getElements();
    const box = document.querySelector('[data-rename-rule-box]');
    const enabled = assignmentForm?.renameEnabled?.checked !== false;
    box?.classList.toggle('is-muted', !enabled);
    if (renameRuleButton) renameRuleButton.disabled = !enabled;
    if (!enabled) renameRuleMenu?.classList.add('is-hidden');
  }

  function getTodayEndDatetimeLocal() {
    const now = new Date();
    now.setHours(23, 59, 0, 0);
    return toDatetimeLocal(now.toISOString());
  }

  function ensureDefaultDeadline() {
    const { assignmentForm } = getElements();
    if (assignmentForm?.deadline && !assignmentForm.deadline.value) assignmentForm.deadline.value = getTodayEndDatetimeLocal();
  }

  function syncNoDeadlineState() {
    const { assignmentForm } = getElements();
    if (!assignmentForm?.deadline || !assignmentForm?.noDeadline) return;
    const noDeadline = Boolean(assignmentForm.noDeadline.checked);
    if (!noDeadline && !assignmentForm.deadline.value) assignmentForm.deadline.value = getTodayEndDatetimeLocal();
    assignmentForm.deadline.disabled = noDeadline;
    assignmentForm.deadline.closest('label')?.classList.toggle('is-muted', noDeadline);
  }

  function setActiveTaskTab(tabName = 'basic', shouldFocusPanel = false) {
    const { taskTabs, taskTabPanels } = getElements();
    taskTabs.forEach((tab) => {
      const active = tab.dataset.taskTab === tabName;
      tab.classList.toggle('is-active', active);
      tab.setAttribute('aria-selected', String(active));
      tab.tabIndex = active ? 0 : -1;
    });
    taskTabPanels.forEach((panel) => {
      const active = panel.dataset.taskTabPanel === tabName;
      panel.classList.toggle('is-hidden', !active);
      panel.toggleAttribute('hidden', !active);
      if (active && shouldFocusPanel) panel.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  }

  function clearCreateFieldErrors() {
    const { assignmentForm } = getElements();
    assignmentForm?.querySelectorAll('.is-field-error').forEach((item) => item.classList.remove('is-field-error'));
    assignmentForm?.querySelectorAll('.field-error-message').forEach((item) => item.remove());
  }

  function markCreateFieldError(element, message) {
    if (!element) return;
    const wrapper = element.matches?.('[data-field-name]')
      ? element.closest('.field-name-editor')
      : element.closest('label') || element.closest('.collect-field-row') || element;
    wrapper.classList.add('is-field-error');
    if (!wrapper.querySelector('.field-error-message')) {
      const hint = document.createElement('small');
      hint.className = 'field-error-message';
      hint.textContent = message;
      wrapper.appendChild(hint);
    }
  }

  function getTaskTabForElement(element) {
    return element?.dataset?.fieldTab || element?.closest?.('[data-task-tab-panel]')?.dataset.taskTabPanel || 'basic';
  }

  function getCreateValidationErrors(showErrors = false) {
    const { assignmentForm, fieldConfigList } = getElements();
    if (!assignmentForm) return [];
    if (showErrors) clearCreateFieldErrors();
    const errors = [];
    const addError = (element, message, tab = getTaskTabForElement(element)) => {
      errors.push({ element, message, tab });
      if (showErrors) markCreateFieldError(element, message);
    };

    if (!assignmentForm.title.value.trim()) addError(assignmentForm.title, '请填写任务标题', 'basic');
    if (!assignmentForm.noDeadline?.checked && !assignmentForm.deadline.value) addError(assignmentForm.deadline, '请选择截止时间', 'basic');

    const seenBasicTypes = new Set();
    fieldConfigList?.querySelectorAll('.collect-field-row').forEach((row) => {
      const labelInput = row.querySelector('[data-field-name]');
      const fieldType = row.querySelector('select[data-field-type]')?.value || row.dataset.currentFieldType;
      const isBasic = isBasicFieldType(fieldType);
      const labelValue = String(labelInput ? labelInput.value : row.dataset.fieldLabel || '').trim();
      if (!VALID_FIELD_TYPES.has(fieldType)) addError(row, '信息类型不正确', 'collect');
      if (!labelValue) addError(labelInput, '信息名称不能为空', 'collect');
      if (isBasic) {
        if (labelValue && labelValue !== getFixedFieldLabel(fieldType)) addError(labelInput, '基础类型信息名称不可修改', 'collect');
        if (seenBasicTypes.has(fieldType)) addError(row.querySelector('select[data-field-type]'), '该基础类型已存在', 'collect');
        seenBasicTypes.add(fieldType);
      }

      const digitInput = row.querySelector('[data-number-digits]');
      if (fieldType === 'digits') {
        const value = Number(digitInput?.value || 0);
        if (digitInput?.value && (!Number.isInteger(value) || value < 1 || value > 30)) addError(digitInput, '数字长度需为 1-30', 'collect');
      }
      if (fieldType === 'numeric') {
        const minInput = row.querySelector('[data-number-min]');
        const maxInput = row.querySelector('[data-number-max]');
        const hasMin = minInput?.value !== '';
        const hasMax = maxInput?.value !== '';
        const min = Number(minInput?.value);
        const max = Number(maxInput?.value);
        if (hasMin && !Number.isFinite(min)) addError(minInput, '最小值必须是合法数值', 'collect');
        if (hasMax && !Number.isFinite(max)) addError(maxInput, '最大值必须是合法数值', 'collect');
        if (hasMin && hasMax && min > max) addError(maxInput, '最大值不能小于最小值', 'collect');
      }
      if (fieldType === 'single_choice' || fieldType === 'multiple_choice') {
        const optionInput = row.querySelector('[data-field-options]');
        const rawOptions = String(optionInput?.value || '').split(/[,，\n]/).map((item) => item.trim());
        const options = rawOptions.filter(Boolean);
        const minOptions = fieldType === 'single_choice' ? 2 : 3;
        if (rawOptions.some((item) => !item)) addError(optionInput, '选项不可为空', 'collect');
        if (options.length < minOptions) addError(optionInput, `${fieldType === 'single_choice' ? '单选' : '多选'}至少填写 ${minOptions} 个选项`, 'collect');
        if (options.some((item) => item.length > 50)) addError(optionInput, '每个选项长度需为 1-50', 'collect');
        if (new Set(options).size !== options.length) addError(optionInput, '选项不可重复', 'collect');
      }
    });

    const fieldConfig = getFieldConfigFromForm();
    if (!assignmentForm.allowRepeat?.checked && !fieldConfig.some(isSubmissionIdentityField)) {
      addError(assignmentForm.allowRepeat, DUPLICATE_IDENTITY_WARNING, 'basic');
    }

    if (assignmentForm.enableLimit?.checked) {
      const size = Number(assignmentForm.maxFileSizeMb.value);
      const count = Number(assignmentForm.maxFiles.value);
      if (!Number.isInteger(size) || size < 1 || size > runtime.systemMaxUploadSizeMb) addError(assignmentForm.maxFileSizeMb, `单文件大小需为 1-${runtime.systemMaxUploadSizeMb} MB`, 'files');
      if (!Number.isInteger(count) || count < 1 || count > 20) addError(assignmentForm.maxFiles, '文件数量需为 1-20', 'files');
    }

    return errors;
  }

  function updateTaskTabStates(showErrors = hasSubmittedCreateForm) {
    const { assignmentForm, taskTabs } = getElements();
    if (!assignmentForm || !taskTabs.length) return;
    const errors = getCreateValidationErrors(showErrors);
    const errorCounts = errors.reduce((acc, error) => {
      acc[error.tab] = (acc[error.tab] || 0) + 1;
      return acc;
    }, {});
    const snapshot = getAssignmentSnapshot();
    const completeState = {
      basic: Boolean(snapshot.title.trim() && (snapshot.noDeadline || snapshot.deadline)),
      collect: snapshot.fieldConfig.every((field) => field.label),
      files: !snapshot.enableLimit || (
        Number.isInteger(snapshot.maxFileSizeMb) && snapshot.maxFileSizeMb >= 1 && snapshot.maxFileSizeMb <= runtime.systemMaxUploadSizeMb &&
        Number.isInteger(snapshot.maxFiles) && snapshot.maxFiles >= 1 && snapshot.maxFiles <= 20
      ),
    };

    taskTabs.forEach((tab) => {
      const count = errorCounts[tab.dataset.taskTab] || 0;
      tab.classList.toggle('has-error', showErrors && count > 0);
      tab.classList.toggle('is-complete', !showErrors && completeState[tab.dataset.taskTab]);
      tab.dataset.errorCount = count ? String(count) : '';
    });
  }

  function validateAssignmentTabs() {
    const { assignmentMessage } = getElements();
    hasSubmittedCreateForm = true;
    recordDebug('publish:validateBefore', { message: '发布前校验开始' });
    commitAllFieldNames({ focusOnError: true });
    const errors = getCreateValidationErrors(true);
    updateTaskTabStates(true);
    if (!errors.length) {
      recordDebug('publish:validatePassed', { message: '发布前校验通过' });
      return true;
    }
    const first = errors[0];
    setActiveTaskTab(first.tab, true);
    window.setTimeout(() => first.element?.focus?.(), 80);
    setMessage(assignmentMessage, first.message, 'error');
    recordDebug('publish:validateFailed', { target: first.element, message: first.message });
    return false;
  }

  function markDraftDirty(reason = 'changed') {
    const { assignmentForm, draftStatusText } = getElements();
    if (!assignmentForm) return;
    draftDirty = true;
    draftDirtyReason = reason;
    if (draftStatusText) draftStatusText.textContent = '有未保存更改 · 每15秒更新';
  }

  function saveDraftNow(reason = 'autosave:tick', { force = false } = {}) {
    const { assignmentForm, draftStatusText } = getElements();
    if (!assignmentForm || (!draftDirty && !force)) return;
    recordDebug('autosave:tick', { message: reason || draftDirtyReason || '定时检查草稿' });
    try {
      const snapshot = getAssignmentSnapshot();
      localStorage.setItem(DRAFT_KEY, JSON.stringify({ ...snapshot, savedAt: new Date().toISOString() }));
      draftDirty = false;
      draftDirtyReason = '';
      if (draftStatusText) draftStatusText.textContent = '已自动保存 · 每15秒更新';
      recordDebug('autosave:saved', { fieldsSnapshot: snapshot.fieldConfig || [], message: force ? '强制自动保存' : '定时自动保存' });
    } catch (error) {
      draftDirty = true;
      if (draftStatusText) draftStatusText.textContent = '自动保存失败 · 每15秒重试';
      recordDebug('autosave:failed', { message: error.message || '自动保存失败' });
    }
  }

  function startDraftAutosaveTimer() {
    if (autosaveInterval) return;
    autosaveInterval = window.setInterval(() => saveDraftNow('定时检查草稿'), 15000);
  }

  function scheduleAssignmentAutosave(reason = 'changed') {
    markDraftDirty(reason);
  }

  function startAssignmentAutosave() {
    startDraftAutosaveTimer();
  }

  function initDebugToolbar() {
    try {
      window.CloudNoteDebug?.record?.('debug:toolbarReady', { page: 'admin', message: '调试工具条由公共日志器管理' });
    } catch {}
  }

  function applyAssignmentSnapshot(snapshot) {
    const { assignmentForm, fileTypeSelect } = getElements();
    if (!assignmentForm || !snapshot) return;
    fieldNameErrors.clear();
    assignmentForm.title.value = snapshot.title || '';
    assignmentForm.description.value = snapshot.description || '';
    assignmentForm.noDeadline.checked = snapshot.noDeadline === true || snapshot.deadline === null || snapshot.deadline === '';
    assignmentForm.deadline.value = assignmentForm.noDeadline.checked ? '' : (snapshot.deadline || getTodayEndDatetimeLocal());
    assignmentForm.status.value = 'ongoing';
    assignmentForm.allowLate.checked = Boolean(snapshot.allowLate);
    assignmentForm.allowRepeat.checked = snapshot.allowRepeat !== false;
    assignmentForm.repeatMode.value = snapshot.repeatMode || 'overwrite';
    assignmentForm.downloadStructure.value = snapshot.downloadStructure || 'task-file';
    if (assignmentForm.requiredUpload) assignmentForm.requiredUpload.checked = snapshot.requiredUpload !== false;
    if (fileTypeSelect) fileTypeSelect.value = snapshot.fileType || 'document';
    if (assignmentForm.enableLimit) assignmentForm.enableLimit.checked = Boolean(snapshot.enableLimit);
    assignmentForm.maxFileSizeMb.value = snapshot.maxFileSizeMb || 100;
    assignmentForm.maxFiles.value = snapshot.maxFiles || 1;
    if (assignmentForm.allowFolder) assignmentForm.allowFolder.checked = snapshot.allowFolder !== false;
    assignmentForm.renameEnabled.checked = snapshot.renameEnabled !== false;
    assignmentForm.renameFields.value = (snapshot.renameFields || ['originalFilename']).join(',');
    assignmentForm.allowedExtensions.value = (snapshot.allowedExtensions || FILE_TYPE_EXTENSION_MAP.document || []).join(',');
    syncFileTypeChecksFromExtensions(assignmentForm.allowedExtensions.value.split(',').filter(Boolean));
    const templateNameInput = $('#templateNameInput');
    const templateCategorySelect = $('#templateCategorySelect');
    if (templateNameInput) templateNameInput.value = snapshot.template?.name || '';
    if (templateCategorySelect) templateCategorySelect.value = snapshot.template?.category || 'course';
    const visibility = snapshot.template?.visibility || 'private';
    const visibilityInput = document.querySelector(`input[name="templateVisible"][value="${visibility}"]`);
    if (visibilityInput) visibilityInput.checked = true;
    renderFields(snapshot.fieldConfig || DEFAULT_FIELDS);
    updateRenamePreview();
    syncLimitState();
    syncRenameState();
    syncNoDeadlineState();
    updateDescriptionCount();
    updateCreateOverview();
    draftDirty = false;
    draftDirtyReason = '';
  }

  function reset() {
    const { assignmentForm, assignmentSubmitButton, cancelEditButton, createPageTitle, fileTypeSelect, draftStatusText } = getElements();
    if (!assignmentForm) return;
    assignmentForm.reset();
    fieldNameErrors.clear();
    hasSubmittedCreateForm = false;
    draftDirty = false;
    draftDirtyReason = '';
    clearCreateFieldErrors();
    assignmentForm.assignmentId.value = '';
    assignmentForm.status.value = 'ongoing';
    if (assignmentForm.noDeadline) assignmentForm.noDeadline.checked = false;
    ensureDefaultDeadline();
    assignmentForm.repeatMode.value = 'overwrite';
    assignmentForm.downloadStructure.value = 'task-file';
    if (fileTypeSelect) fileTypeSelect.value = 'any';
    assignmentForm.allowedExtensions.value = '';
    syncFileTypeChecksFromExtensions([]);
    assignmentForm.renameFields.value = 'originalFilename';
    renderFields(DEFAULT_FIELDS);
    updateRenamePreview();
    syncLimitState();
    syncRenameState();
    syncNoDeadlineState();
    updateDescriptionCount();
    updateCreateOverview();
    if (assignmentSubmitButton) assignmentSubmitButton.textContent = '发布任务';
    if (createPageTitle) createPageTitle.textContent = '创建任务';
    if (draftStatusText) draftStatusText.textContent = '已自动保存 · 每15秒更新';
    setActiveTaskTab('basic');
    updateTaskTabStates();
  }

  function fillAssignmentForm(item) {
    const { assignmentForm, assignmentSubmitButton, cancelEditButton, createPageTitle, fileTypeSelect } = getElements();
    if (!assignmentForm || !item) return;
    fieldNameErrors.clear();
    assignmentForm.assignmentId.value = item.id;
    assignmentForm.title.value = item.title;
    assignmentForm.description.value = item.description || '';
    assignmentForm.noDeadline.checked = !item.deadline;
    assignmentForm.deadline.value = item.deadline ? toDatetimeLocal(item.deadline) : '';
    assignmentForm.status.value = 'ongoing';
    assignmentForm.allowLate.checked = item.allowLate;
    assignmentForm.allowRepeat.checked = item.allowRepeat;
    assignmentForm.repeatMode.value = item.repeatMode || 'new';
    assignmentForm.maxFiles.value = item.maxFiles || 1;
    assignmentForm.maxFileSizeMb.value = item.maxFileSizeMb || 100;
    assignmentForm.allowedExtensions.value = (item.allowedExtensions || []).join(',');
    syncFileTypeChecksFromExtensions(item.allowedExtensions || []);
    if (assignmentForm.requiredUpload) assignmentForm.requiredUpload.checked = item.requiredUpload !== false;
    if (assignmentForm.enableLimit) assignmentForm.enableLimit.checked = Boolean(item.enableLimit);
    assignmentForm.renameEnabled.checked = item.renameEnabled;
    assignmentForm.renameFields.value = (item.renameFields || ['originalFilename']).join(',');
    if (assignmentForm.allowFolder) assignmentForm.allowFolder.checked = item.allowFolder !== false;
    assignmentForm.downloadStructure.value = item.downloadStructure || 'task-field-file';
    renderFields(item.fieldConfig || item.collectFields);
    updateRenamePreview();
    syncLimitState();
    syncRenameState();
    syncNoDeadlineState();
    updateDescriptionCount();
    updateCreateOverview();
    draftDirty = false;
    draftDirtyReason = '';
    if (assignmentSubmitButton) assignmentSubmitButton.textContent = '保存修改';
    if (createPageTitle) createPageTitle.textContent = '编辑任务';
    cancelEditButton?.classList.remove('is-hidden');
    setActiveTaskTab('basic');
    assignmentForm.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }

  function addField(fieldOrType = 'single_line', label = '单行文本') {
    const fields = getFieldConfigFromForm();
    if (typeof fieldOrType === 'object' && fieldOrType) {
      fields.push(normalizeAdminFields([{ ...fieldOrType, key: fieldOrType.key || createUniqueFieldKey(new Set(fields.map((field) => field.key))) }])[0]);
      recordDebug('field:added', { fieldType: fieldOrType.type || '', fieldLabel: fieldOrType.label || fieldOrType.name || '', message: '添加字段对象' });
      renderFields(fields);
      markDraftDirty('field:added');
      return;
    }
    const type = VALID_FIELD_TYPES.has(fieldOrType) ? fieldOrType : 'single_line';
    const isBasic = isBasicFieldType(type);
    const { assignmentMessage } = getElements();
    if (isBasic && fields.some((field) => normalizeFieldType(field) === type)) {
      setMessage(assignmentMessage, '该基础类型已存在', 'error');
      return;
    }
    const existingKeys = new Set(fields.map((field) => field.key));
    const key = isBasic && !existingKeys.has(BASIC_FIELD_KEYS[type])
      ? BASIC_FIELD_KEYS[type]
      : createUniqueFieldKey(existingKeys);
    const fieldLabel = isBasic ? getFixedFieldLabel(type) : (label || getFixedFieldLabel(type));
    fields.push({
      key,
      id: key,
      name: fieldLabel,
      label: fieldLabel,
      type,
      category: isBasic ? 'basic' : 'custom',
      enabled: true,
      visible: true,
      required: false,
      system: isBasic,
      numberRuleMode: type === 'digits' ? 'digits' : type === 'numeric' ? 'range' : '',
      digitLength: '',
      minValue: '',
      maxValue: '',
      options: getDefaultFieldOptions(type),
      rules: getDefaultFieldRules(type),
    });
    recordDebug('field:added', { fieldType: type, fieldLabel, message: '添加收集信息字段' });
    renderFields(fields);
    markDraftDirty('field:added');
  }

  function removeField(indexOrKey) {
    const fields = getFieldConfigFromForm();
    const index = Number.isInteger(Number(indexOrKey))
      ? Number(indexOrKey)
      : fields.findIndex((field) => field.key === indexOrKey || field.id === indexOrKey);
    if (index < 0 || index >= fields.length) return;
    const removed = fields.splice(index, 1);
    if (removed[0]?.key) fieldNameErrors.delete(removed[0].key);
    recordDebug('field:deleted', { rowKey: removed[0]?.key || '', fieldType: removed[0]?.type || '', fieldLabel: removed[0]?.label || '', message: `removed index ${index}` });
    renderFields(fields);
    markDraftDirty('field:deleted');
  }

  async function removeSelectedFields() {
    const { fieldConfigList, assignmentMessage } = getElements();
    const selectedKeys = [...(fieldConfigList?.querySelectorAll('[data-select-field]:checked') || [])]
      .map((checkbox) => checkbox.dataset.selectField)
      .filter(Boolean);
    if (!selectedKeys.length) {
      setMessage(assignmentMessage, '请先选择要删除的信息字段', 'error');
      recordDebug('field:batchDeleteEmpty', { message: '未选择信息字段' });
      return;
    }
    const confirmed = await showConfirmDialog({
      title: '删除信息字段',
      message: `确定删除选中的 ${selectedKeys.length} 个信息字段吗？`,
      confirmText: '删除',
      variant: 'danger',
    });
    if (!confirmed) return;
    const selected = new Set(selectedKeys);
    const fields = getFieldConfigFromForm();
    const removed = fields.filter((field) => selected.has(field.key));
    const remaining = fields.filter((field) => !selected.has(field.key));
    removed.forEach((field) => {
      if (field.key) fieldNameErrors.delete(field.key);
    });
    recordDebug('field:batchDeleted', {
      message: `removed ${removed.length} fields`,
      removedCount: removed.length,
      removedKeys: removed.map((field) => field.key),
      fieldsSnapshot: remaining,
    });
    renderFields(remaining);
    updateRenamePreview();
    markDraftDirty('field:batchDeleted');
  }

  function updateField(indexOrKey, data = {}) {
    const fields = getFieldConfigFromForm();
    const index = Number.isInteger(Number(indexOrKey))
      ? Number(indexOrKey)
      : fields.findIndex((field) => field.key === indexOrKey || field.id === indexOrKey);
    if (index < 0 || index >= fields.length) return;
    fields[index] = { ...fields[index], ...data };
    recordDebug('field:updated', { rowKey: fields[index]?.key || '', fieldType: fields[index]?.type || '', fieldLabel: fields[index]?.label || '', message: 'updateField called' });
    renderFields(fields);
    markDraftDirty('field:updated');
  }

  function getAssignmentPayload() {
    const { assignmentForm } = getElements();
    const formData = new FormData(assignmentForm);
    const noDeadline = Boolean(formData.get('noDeadline'));
    const fieldConfig = getFieldConfigFromForm();
    recordDebug('publish:fieldConfigSnapshot', { fieldsSnapshot: fieldConfig, message: '发布 payload 生成前 fieldConfig 快照' });
    return {
      title: formData.get('title'),
      description: formData.get('description'),
      deadline: noDeadline ? null : formData.get('deadline'),
      status: 'ongoing',
      allowLate: Boolean(formData.get('allowLate')),
      allowRepeat: Boolean(formData.get('allowRepeat')),
      repeatMode: formData.get('repeatMode'),
      maxFiles: Number(formData.get('maxFiles')),
      maxFileSizeMb: Number(formData.get('maxFileSizeMb')),
      allowedExtensions: String(formData.get('allowedExtensions') || '').split(',').map((item) => item.trim()).filter(Boolean),
      requiredUpload: Boolean(formData.get('requiredUpload')),
      fileType: formData.get('fileType') || 'any',
      enableLimit: Boolean(formData.get('enableLimit')),
      allowFolder: Boolean(formData.get('allowFolder')),
      renameEnabled: Boolean(formData.get('renameEnabled')),
      renameFields: String(formData.get('renameFields') || '').split(',').map((item) => item.trim()).filter(Boolean),
      downloadStructure: formData.get('downloadStructure'),
      fieldConfig,
      collectFields: fieldConfig,
      fileRules: {
        requiredUpload: Boolean(formData.get('requiredUpload')),
        fileType: formData.get('fileType') || 'any',
        allowedExtensions: String(formData.get('allowedExtensions') || '').split(',').map((item) => item.trim()).filter(Boolean),
        enableLimit: Boolean(formData.get('enableLimit')),
        maxFileSizeMB: Number(formData.get('maxFileSizeMb')),
        maxFileCount: Number(formData.get('maxFiles')),
        enableRename: Boolean(formData.get('renameEnabled')),
        renameFields: String(formData.get('renameFields') || '').split(',').map((item) => item.trim()).filter(Boolean),
        allowFolder: Boolean(formData.get('allowFolder')),
      },
    };
  }

  async function submit() {
    const { assignmentForm, assignmentMessage } = getElements();
    if (!assignmentForm) return null;
    if (!validateAssignmentTabs()) return null;
    const formData = new FormData(assignmentForm);
    const assignmentId = formData.get('assignmentId');
    const body = getAssignmentPayload();
    try {
      const savedAssignment = await (assignmentId
        ? api.adminPut(`/api/assignments/${assignmentId}`, body)
        : api.adminPost('/api/assignments', body));
      reset();
      CloudNote.adminTemplates?.clearEditingTemplate?.();
      setMessage(assignmentMessage, assignmentId ? '任务已更新' : `任务已创建，链接：${getAssignmentUrl(savedAssignment)}`, 'success');
      recordDebug('publish:success', { message: assignmentId ? '任务已更新' : '任务已创建' });
      CloudNote.adminAssignments?.refresh?.();
      CloudNote.adminAssignments?.loadAssignmentOptions?.();
      CloudNote.adminTemplates?.refresh?.().catch?.(() => {});
      CloudNote.adminStatistics?.load?.();
      CloudNote.adminStorage?.render?.();
      return savedAssignment;
    } catch (error) {
      setMessage(assignmentMessage, error.message, 'error');
      recordDebug('publish:failed', { message: error.message });
      return null;
    }
  }

  function save() {
    return submit();
  }

  async function editAssignment(assignmentId, assignmentData) {
    const { assignmentMessage } = getElements();
    try {
      let item = assignmentData;
      if (!item && assignmentId) item = await api.adminGet(`/api/assignments/${assignmentId}`);
      fillAssignmentForm(item);
      window.switchAdminSection?.('create');
      return item;
    } catch (error) {
      setMessage(assignmentMessage, error.message, 'error');
      return null;
    }
  }

  async function applyTemplate(snapshot) {
    applyAssignmentSnapshot(snapshot);
  }

  function getFileTypeLabel(fileType = 'document') {
    return {
      any: '不限制',
      word: 'Word',
      pdf: 'PDF',
      text: '文本',
      excel: 'Excel',
      ppt: 'PPT',
      document: '文档/文本',
      image: '图片',
      video: '视频',
      archive: '压缩包',
      installer: '安装包',
      custom: '自定义组合',
    }[fileType] || fileType || '文档/文本';
  }

  function getSystemUploadLimits() {
    return {
      systemMaxUploadSizeMb: runtime.systemMaxUploadSizeMb,
      systemMaxUploadFiles: runtime.systemMaxUploadFiles,
      publicBaseUrl: runtime.publicBaseUrl,
    };
  }

  function handleFieldConfigChange(event) {
    const { fieldConfigList } = getElements();
    const target = event.target;
    const row = target?.closest?.('.collect-field-row');
    if (event.type === 'change' && target?.matches?.('select[data-field-type]')) {
      const typeSelect = target;
      const row = typeSelect.closest('.collect-field-row');
      if (!row || row.dataset.system === 'true' || typeSelect.disabled) return;
      const previousType = row.dataset.currentFieldType || 'single_line';
      const nextType = CUSTOM_FIELD_TYPES.includes(typeSelect.value) ? typeSelect.value : previousType;
      if (nextType !== typeSelect.value) {
        typeSelect.value = previousType;
        recordDebug('fieldType:changeRejected', { event, row, target: typeSelect, previousType, nextType, message: '自定义字段不能切换为基础类型' });
        return;
      }
      const fields = getFieldConfigFromForm();
      const index = [...fieldConfigList.querySelectorAll('.collect-field-row')].indexOf(row);
      if (fields[index]) {
        fields[index].type = previousType;
        fields[index].category = getFieldCategory(fields[index].type, row.dataset.category);
        fields[index] = prepareFieldForType(fields[index], nextType, { resetLabel: true });
      }
      recordDebug('fieldType:changed', { event, row, target: typeSelect, fieldType: nextType, previousType, nextType, message: '信息类型下拉框变更' });
      renderFields(fields);
      markDraftDirty('fieldType:changed');
      return;
    }

    if (event.type === 'change' && target?.matches?.('[data-field-required]')) {
      recordDebug('fieldRequired:changed', { event, row, target, message: target.checked ? '设置必填' : '取消必填' });
      updateCreateOverview();
      updateTaskTabStates();
      markDraftDirty('fieldRequired:changed');
    }
  }

  function handleFieldConfigInput(event) {
    const target = event.target;
    if (target?.matches?.('[data-field-name]')) return;
    const row = target?.closest?.('.collect-field-row');
    if (!row) return;
    if (target?.matches?.('[data-number-digits]')) {
      recordDebug('digitsLength:changed', { event, row, target, message: `纯数字长度：${target.value || '不限'}` });
    } else if (target?.matches?.('[data-number-min], [data-number-max]')) {
      recordDebug('numericRange:changed', { event, row, target, message: '纯数值范围变更' });
    } else if (target?.matches?.('[data-field-options]')) {
      recordDebug('choiceOptions:changed', { event, row, target, message: '单选/多选选项变更' });
    } else {
      return;
    }
    renderRenameRuleOptions();
    updateCreateOverview();
    updateTaskTabStates();
    markDraftDirty('fieldRule:changed');
  }

  function bindEvents() {
    const {
      assignmentForm,
      assignmentMessage,
      fieldConfigList,
      addFieldButton,
      deleteSelectedFieldsButton,
      fieldSelectAll,
      fieldTypePopover,
      fileTypeSelect,
      fileTypeChecks,
      renameRuleButton,
      renameRuleMenu,
      renameRuleOptions,
      cancelEditButton,
      taskTabs,
      draftStatusText,
    } = getElements();

    addFieldButton?.addEventListener('click', () => fieldTypePopover?.classList.toggle('is-hidden'));
    fieldTypePopover?.addEventListener('click', (event) => {
      const closeButton = event.target.closest('[data-close-popover]');
      if (closeButton) {
        fieldTypePopover.classList.add('is-hidden');
        return;
      }
      const typeButton = event.target.closest('[data-add-field-type]');
      if (!typeButton) return;
      addField(typeButton.dataset.addFieldType, typeButton.dataset.fieldLabel);
      recordDebug('field:addFromPicker', { target: typeButton, fieldType: typeButton.dataset.addFieldType, fieldLabel: typeButton.dataset.fieldLabel });
      fieldTypePopover.classList.add('is-hidden');
    });

    fieldConfigList?.addEventListener('click', async (event) => {
      const confirmNameButton = event.target.closest('[data-confirm-field-name]');
      const removeButton = event.target.closest('[data-remove-field]');
      const fields = getFieldConfigFromForm();
      const moveButton = event.target.closest('[data-move-field]');
      if (confirmNameButton) {
        commitFieldName(confirmNameButton.closest('.collect-field-row'), { focusOnError: true, event });
        return;
      }
      if (moveButton) {
        const index = Number(moveButton.dataset.moveField);
        const target = index + Number(moveButton.dataset.moveDir);
        if (target >= 0 && target < fields.length) {
          [fields[index], fields[target]] = [fields[target], fields[index]];
          recordDebug('field:moved', { target: moveButton, rowKey: fields[target]?.key || '', fieldType: fields[target]?.type || '', fieldLabel: fields[target]?.label || '', message: `from ${index} to ${target}` });
          renderFields(fields);
          markDraftDirty('field:moved');
        }
        return;
      }
      if (!removeButton) return;
      if (!await showConfirmDialog({ title: '删除字段', message: '确定删除这个字段吗？', confirmText: '删除', variant: 'danger' })) return;
      recordDebug('field:deleteRequested', { target: removeButton, message: `index ${removeButton.dataset.removeField}` });
      removeField(Number(removeButton.dataset.removeField));
    });

    fieldConfigList?.addEventListener('input', (event) => {
      const nameInput = event.target.closest('[data-field-name]');
      if (!nameInput) return;
      const row = nameInput.closest('.collect-field-row');
      if (row?.dataset.system === 'true') {
        const fixed = getFixedFieldLabel(row.querySelector('select[data-field-type]')?.value || row.dataset.currentFieldType);
        nameInput.value = fixed;
        row.dataset.fieldLabel = fixed;
        row.dataset.fieldNameDraft = fixed;
        return;
      }
      row.dataset.fieldNameDraft = nameInput.value;
      if (String(nameInput.value || '').trim()) setFieldNameError(row, '');
      recordDebug('fieldName:input', { event, row, target: nameInput, message: '编辑字段名称草稿' });
      markDraftDirty('fieldName:input');
    });
    fieldConfigList?.addEventListener('keydown', (event) => {
      const nameInput = event.target.closest('[data-field-name]');
      if (!nameInput) return;
      const row = nameInput.closest('.collect-field-row');
      if (event.key === 'Enter') {
        event.preventDefault();
        commitFieldName(row, { focusOnError: true, event });
      }
      if (event.key === 'Escape') {
        event.preventDefault();
        nameInput.value = row?.dataset.fieldLabel || '';
        if (row) row.dataset.fieldNameDraft = row.dataset.fieldLabel || '';
        setFieldNameError(row, '');
        recordDebug('fieldName:escapeRestore', { event, row, target: nameInput, message: '恢复上一次已确认的信息名称' });
      }
    });
    fieldConfigList?.addEventListener('input', handleFieldConfigInput);
    fieldConfigList?.addEventListener('change', handleFieldConfigChange);
    fieldConfigList?.addEventListener('change', (event) => {
      if (!event.target.closest('[data-select-field]')) return;
      updateFieldSelectionState();
      recordDebug('fieldSelection:changed', { event, target: event.target, message: '选择信息字段' });
    });
    fieldSelectAll?.addEventListener('change', () => {
      fieldConfigList?.querySelectorAll('[data-select-field]').forEach((checkbox) => {
        checkbox.checked = fieldSelectAll.checked;
      });
      updateFieldSelectionState();
      recordDebug('fieldSelection:selectAll', { target: fieldSelectAll, message: fieldSelectAll.checked ? '全选信息字段' : '取消全选信息字段' });
    });
    deleteSelectedFieldsButton?.addEventListener('click', () => {
      removeSelectedFields().catch((error) => setMessage(assignmentMessage, error.message, 'error'));
    });

    fileTypeSelect?.addEventListener('change', () => { updateAllowedExtensionsFromChecks(); updateCreateOverview(); markDraftDirty('fileType:changed'); });
    fileTypeChecks.forEach((checkbox) => {
      checkbox.addEventListener('change', () => {
        updateAllowedExtensionsFromChecks();
        updateCreateOverview();
        updateTaskTabStates();
        markDraftDirty('fileType:changed');
        recordDebug('fileType:changed', { target: checkbox, message: checkbox.checked ? '勾选文件类型' : '取消文件类型' });
      });
    });
    assignmentForm?.noDeadline?.addEventListener('change', () => { syncNoDeadlineState(); updateCreateOverview(); updateTaskTabStates(); markDraftDirty('basic:noDeadline'); });
    assignmentForm?.enableLimit?.addEventListener('change', () => { syncLimitState(); updateCreateOverview(); markDraftDirty('fileLimit:enabled'); recordDebug('fileSetting:limitToggled', { target: assignmentForm.enableLimit }); });
    assignmentForm?.renameEnabled?.addEventListener('change', () => { syncRenameState(); updateCreateOverview(); markDraftDirty('rename:enabled'); recordDebug('fileSetting:renameToggled', { target: assignmentForm.renameEnabled }); });
    renameRuleButton?.addEventListener('click', (event) => {
      event.stopPropagation();
      renameRuleMenu?.classList.toggle('is-hidden');
      recordDebug('renameRule:toggle', { event, target: renameRuleButton, message: renameRuleMenu?.classList.contains('is-hidden') ? '隐藏重命名规则' : '显示重命名规则' });
    });
    renameRuleMenu?.addEventListener('click', (event) => event.stopPropagation());
    renameRuleOptions?.addEventListener('click', (event) => {
      const button = event.target.closest('[data-rename-field]');
      if (!button || !assignmentForm?.renameFields) return;
      event.stopPropagation();
      const selected = new Set(getSelectedRenameFields());
      if (selected.has(button.dataset.renameField)) selected.delete(button.dataset.renameField);
      else selected.add(button.dataset.renameField);
      assignmentForm.renameFields.value = [...selected].join(',');
      renderRenameRuleOptions();
      renameRuleMenu?.classList.add('is-hidden');
      markDraftDirty('renameRule:changed');
      recordDebug('renameRule:selected', { event, target: button, message: '选择重命名规则' });
    });
    document.addEventListener('click', (event) => {
      if (!renameRuleMenu || renameRuleMenu.classList.contains('is-hidden')) return;
      const box = event.target.closest('[data-rename-rule-box]');
      if (!box) renameRuleMenu.classList.add('is-hidden');
    });
    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') renameRuleMenu?.classList.add('is-hidden');
    });

    assignmentForm?.addEventListener('input', (event) => {
      if (fieldConfigList?.contains(event.target)) return;
      updateDescriptionCount();
      updateCreateOverview();
      updateTaskTabStates();
      markDraftDirty('form:input');
    });
    assignmentForm?.addEventListener('change', (event) => {
      if (fieldConfigList?.contains(event.target)) return;
      updateCreateOverview();
      updateTaskTabStates();
      markDraftDirty('form:change');
    });
    assignmentForm?.addEventListener('submit', (event) => {
      event.preventDefault();
      submit();
    });

    cancelEditButton?.addEventListener('click', () => {
      reset();
      window.switchAdminSection?.('tasks');
    });
    taskTabs.forEach((tab) => {
      tab.addEventListener('click', () => {
        setActiveTaskTab(tab.dataset.taskTab);
        updateTaskTabStates();
      });
    });
  }

  function init() {
    const { assignmentForm } = getElements();
    if (initialized || !assignmentForm) return;
    initialized = true;
    initDebugToolbar();
    recordDebug('init:createTaskPage', { message: '初始化创建任务页' });
    loadPublicConfig().then(() => updateTaskTabStates()).catch(() => {});
    bindEvents();
    startAssignmentAutosave();
    setActiveTaskTab('basic');
    ensureDefaultDeadline();
    renderFields(DEFAULT_FIELDS);
    syncFileTypeChecksFromExtensions([]);
    syncLimitState();
    syncRenameState();
    syncNoDeadlineState();
    updateDescriptionCount();
    updateCreateOverview();
    updateTaskTabStates();
  }

  CloudNote.adminAssignmentForm = {
    init,
    reset,
    getFormData: getAssignmentSnapshot,
    getAssignmentSnapshot,
    getAssignmentPayload,
    setFormData: applyAssignmentSnapshot,
    applyTemplate,
    editAssignment,
    submit,
    save,
    renderFields,
    addField,
    removeField,
    updateField,
    fillAssignmentForm,
    getFieldConfigFromForm,
    normalizeAdminFields,
    validate: validateAssignmentTabs,
    constants: {
      DEFAULT_FIELDS,
      FIELD_TYPE_LABELS,
      FILE_TYPE_EXTENSION_MAP,
    },
    getAssignmentUrl,
    loadPublicConfig,
    getSystemUploadLimits,
    getFileTypeLabel,
    formatTime,
  };
})(window, document);
