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
  const getStatusLabel = common.getStatusLabel || ((status) => status || '进行中');

  function debugRecord(action, details = {}) {
    try {
      window.CloudNoteDebug?.record?.(action, { page: 'admin', ...details });
    } catch {}
  }
  const showConfirmDialog = common.showConfirmDialog || common.confirmDialog || (() => Promise.resolve(window.confirm('确认操作？')));

  const LEGACY_TEMPLATES_KEY = 'cloudnoteAssignmentTemplates';
  const TEMPLATES_KEY = 'cloudnote_task_templates';
  const RECYCLE_BIN_KEY = 'cloudnote_recycle_bin';

  let initialized = false;
  let templateCache = [];
  let templatesLoadedFromServer = false;
  let templateModalMode = 'manage';
  let editingTemplateId = null;
  const selectedTemplateIds = new Set();

  function formModule() {
    return CloudNote.adminAssignmentForm || {};
  }

  function getConstants() {
    return (
      formModule().constants || {
        DEFAULT_FIELDS: [],
        FIELD_TYPE_LABELS: {},
        FILE_TYPE_EXTENSION_MAP: {},
      }
    );
  }

  function getElements() {
    return {
      assignmentForm: $('#assignmentForm'),
      assignmentMessage: $('#assignmentMessage'),
      saveTemplateButton: $('#saveTemplateButton'),
      applyTemplateButton: $('#applyTemplateButton'),
      manageTemplateButton: $('#manageTemplateButton'),
      saveTemplateModal: $('#saveTemplateModal'),
      saveTemplateForm: $('#saveTemplateForm'),
      templateNameInput: $('#templateNameInput'),
      templateCategorySelect: $('#templateCategorySelect'),
      templateModal: $('#templateModal'),
      templateModalTitle: $('#templateModalTitle'),
      templateSearchInput: $('#templateSearchInput'),
      templateCategoryFilter: $('#templateCategoryFilter'),
      templateManagerList: $('#templateManagerList'),
      templateSelectAll: $('#templateSelectAll'),
      templateSelectedCount: $('#templateSelectedCount'),
      templateBatchDeleteButton: $('#templateBatchDeleteButton'),
      templatePreviewModal: $('#templatePreviewModal'),
      templatePreviewContent: $('#templatePreviewContent'),
    };
  }

  function getTemplateVisibility() {
    return document.querySelector('input[name="templateVisible"]:checked')?.value || 'private';
  }

  function getCategoryLabel(category) {
    return { course: '课程作业', exam: '测试收集', material: '材料归集' }[category] || '课程作业';
  }

  function getVisibilityLabel(visibility) {
    return visibility === 'class' ? '班级共享' : '仅自己可见';
  }

  function snapshotToTemplateData(snapshot = {}) {
    return {
      title: snapshot.title,
      description: snapshot.description,
      deadline: snapshot.deadline,
      noDeadline: snapshot.noDeadline === true || snapshot.deadline === null,
      status: snapshot.status,
      allowLate: snapshot.allowLate,
      allowRepeat: snapshot.allowRepeat,
      repeatMode: snapshot.repeatMode,
      downloadStructure: snapshot.downloadStructure,
      requiredUpload: snapshot.requiredUpload,
      fileType: snapshot.fileType,
      enableLimit: snapshot.enableLimit,
      maxFileSizeMb: snapshot.maxFileSizeMb,
      maxFiles: snapshot.maxFiles,
      allowFolder: snapshot.allowFolder,
      renameEnabled: snapshot.renameEnabled,
      renameFields: snapshot.renameFields,
      allowedExtensions: snapshot.allowedExtensions,
      fieldConfig: snapshot.fieldConfig,
      template: snapshot.template,
    };
  }

  function normalizeTemplateRecord(template = {}, index = 0) {
    const { DEFAULT_FIELDS } = getConstants();
    const source = template.data || {
      ...(template.basicInfo || {}),
      ...(template.fileSettings || {}),
      fieldConfig: template.collectFields || [],
      template: {
        enabled: true,
        name: template.name,
        category: template.category,
        visibility: template.visibility,
      },
    };
    const normalizedFields =
      formModule().normalizeAdminFields?.(source.fieldConfig || source.collectFields || template.collectFields || DEFAULT_FIELDS) ||
      source.fieldConfig ||
      source.collectFields ||
      template.collectFields ||
      DEFAULT_FIELDS;
    const normalizedData = snapshotToTemplateData({
      ...source,
      fieldConfig: normalizedFields,
      template: {
        enabled: source.template?.enabled !== false,
        name: template.name || source.template?.name || '',
        category: template.category || source.template?.category || 'course',
        visibility: template.visibility || source.template?.visibility || 'private',
      },
    });
    return {
      id: String(template.id || `template-${Date.now()}-${index}`),
      name: template.name || normalizedData.template.name || normalizedData.title || '未命名模板',
      category: template.category || normalizedData.template.category || 'course',
      visibility: template.visibility || normalizedData.template.visibility || 'private',
      basicInfo: {
        title: normalizedData.title,
        description: normalizedData.description,
        deadline: normalizedData.deadline,
        noDeadline: normalizedData.noDeadline,
        status: normalizedData.status,
        allowLate: normalizedData.allowLate,
        allowRepeat: normalizedData.allowRepeat,
        repeatMode: normalizedData.repeatMode,
        downloadStructure: normalizedData.downloadStructure,
      },
      collectFields: normalizedData.fieldConfig || [],
      fileSettings: {
        requiredUpload: normalizedData.requiredUpload,
        fileType: normalizedData.fileType,
        enableLimit: normalizedData.enableLimit,
        maxFileSizeMb: normalizedData.maxFileSizeMb,
        maxFiles: normalizedData.maxFiles,
        allowFolder: normalizedData.allowFolder,
        renameEnabled: normalizedData.renameEnabled,
        renameFields: normalizedData.renameFields,
        allowedExtensions: normalizedData.allowedExtensions,
      },
      createdAt: template.createdAt || new Date().toISOString(),
      updatedAt: template.updatedAt || template.createdAt || new Date().toISOString(),
      data: normalizedData,
    };
  }

  function getStoredTemplates() {
    if (templatesLoadedFromServer) return templateCache.map(normalizeTemplateRecord);
    const stored = localStorage.getItem(TEMPLATES_KEY);
    if (stored !== null) return parseJson(stored, []).map(normalizeTemplateRecord);
    const legacy = parseJson(localStorage.getItem(LEGACY_TEMPLATES_KEY), []);
    const migrated = legacy.map(normalizeTemplateRecord);
    if (migrated.length) localStorage.setItem(TEMPLATES_KEY, JSON.stringify(migrated));
    return migrated;
  }

  function persistTemplates(templates) {
    const normalized = templates.map(normalizeTemplateRecord).slice(0, 50);
    templateCache = normalized;
    localStorage.setItem(TEMPLATES_KEY, JSON.stringify(normalized));
  }

  async function loadServerTemplates() {
    if (!api.getAdminToken?.()) return getStoredTemplates();
    const data = await api.adminGet('/api/templates');
    templateCache = (data.items || []).map(normalizeTemplateRecord);
    templatesLoadedFromServer = true;
    localStorage.setItem(TEMPLATES_KEY, JSON.stringify(templateCache));
    return templateCache;
  }

  function getLocalRecycleItems() {
    return parseJson(localStorage.getItem(RECYCLE_BIN_KEY), []).filter((item) => item && item.type === 'template');
  }

  function persistLocalRecycleItems(items) {
    localStorage.setItem(RECYCLE_BIN_KEY, JSON.stringify(items));
  }

  function moveTemplatesToRecycle(templates) {
    const deletedAt = new Date().toISOString();
    const recycleItems = getLocalRecycleItems();
    const existing = new Set(recycleItems.map((item) => item.id));
    templates.forEach((template) => {
      const record = normalizeTemplateRecord(template);
      if (existing.has(record.id)) return;
      recycleItems.unshift({
        type: 'template',
        id: record.id,
        key: `template:${record.id}`,
        name: record.name,
        origin: '模板中心',
        category: record.category,
        visibility: record.visibility,
        deletedAt,
        size: JSON.stringify(record).length,
        recoverable: true,
        template: record,
      });
    });
    persistLocalRecycleItems(recycleItems);
  }

  function generateTemplateName(baseName, templates) {
    const base = String(baseName || '').trim();
    if (!base) return '';
    const names = new Set(templates.map((item) => item.name));
    if (!names.has(base)) return base;
    let index = 2;
    while (names.has(`${base} (${index})`)) index += 1;
    return `${base} (${index})`;
  }

  async function saveTemplateFromSnapshot(snapshot, options = {}) {
    const { assignmentMessage, templateNameInput, templateCategorySelect } = getElements();
    const now = new Date().toISOString();
    const existing = getStoredTemplates();
    const overwriteId = options.overwriteId ? String(options.overwriteId) : '';
    const previous = overwriteId ? existing.find((item) => String(item.id) === overwriteId) : null;
    const name = overwriteId
      ? String(previous?.name || snapshot?.template?.name || snapshot?.title || '').trim()
      : generateTemplateName(templateNameInput?.value.trim() || snapshot?.title || '', existing);
    if (!name) {
      setMessage(assignmentMessage, '模板名称不能为空', 'error');
      throw new Error('模板名称不能为空');
    }
    const record = normalizeTemplateRecord({
      id: overwriteId || `${Date.now()}`,
      name,
      category: previous?.category || templateCategorySelect?.value || 'course',
      visibility: previous?.visibility || getTemplateVisibility(),
      createdAt: previous?.createdAt || now,
      updatedAt: now,
      data: snapshotToTemplateData(snapshot),
    });
    let saved = record;
    if (api.getAdminToken?.()) {
      saved = normalizeTemplateRecord(
        overwriteId
          ? await api.adminPut(`/api/templates/${overwriteId}`, {
              name,
              category: record.category,
              visibility: record.visibility,
              data: record.data,
            })
          : await api.adminPost('/api/templates', {
              name,
              category: record.category,
              visibility: record.visibility,
              data: record.data,
            })
      );
    }
    persistTemplates([saved, ...existing.filter((item) => item.id !== saved.id)]);
    if (!options.silent) setMessage(assignmentMessage, overwriteId ? '模板已覆盖保存' : '模板已保存', 'success');
    debugRecord('admin:saveTemplateSuccess', { message: overwriteId ? '模板已覆盖保存' : '模板已保存', templateId: saved.id });
    render();
    return saved;
  }

  function saveFromCurrentForm(options = {}) {
    const snapshot = formModule().getFormData?.();
    return saveTemplateFromSnapshot(snapshot, { ...options, overwriteId: options.overwriteId || editingTemplateId || '' });
  }

  function getTemplateSnapshot(template) {
    const record = normalizeTemplateRecord(template);
    return {
      ...record.data,
      ...record.basicInfo,
      ...record.fileSettings,
      fieldConfig: record.collectFields,
      template: {
        enabled: true,
        name: record.name,
        category: record.category,
        visibility: record.visibility,
      },
    };
  }

  function getDownloadStructureLabel(value) {
    return value === 'task-file' ? '任务/文件' : '任务/提交者/文件';
  }

  function getTemplatePreviewSummary(template) {
    const data = getTemplateSnapshot(template);
    const fields = data.fieldConfig || [];
    const requiredCount = fields.filter((field) => field.required).length;
    const limits = formModule().getSystemUploadLimits?.() || { systemMaxUploadFiles: 20, systemMaxUploadSizeMb: 500 };
    return {
      fields,
      fieldCount: fields.length,
      requiredCount,
      fileType: formModule().getFileTypeLabel?.(data.fileType || 'document') || data.fileType || '文档/文本',
      fileLimit: data.enableLimit
        ? `${data.maxFileSizeMb || 100}MB / ${Math.min(Number(data.maxFiles || 1), limits.systemMaxUploadFiles)}个`
        : `系统最大 ${limits.systemMaxUploadFiles} 个文件 / 单文件 ${limits.systemMaxUploadSizeMb}MB`,
      rename: data.renameEnabled === false ? '否' : '是',
      packageMode: getDownloadStructureLabel(data.downloadStructure),
      title: data.title || template.name,
      status: getStatusLabel(data.status || 'ongoing'),
      deadline: data.deadline ? formatTime(data.deadline) : '未设置',
    };
  }

  function renderTemplatePreviewChips(template) {
    const summary = getTemplatePreviewSummary(template);
    return `
      <div class="template-preview-chips">
        <span>${summary.fieldCount} 个字段</span>
        <span>${summary.requiredCount} 个必填</span>
        <span>${escapeHtml(summary.fileType)}</span>
        <span>${escapeHtml(summary.fileLimit)}</span>
        <span>重命名：${summary.rename}</span>
        <span>${summary.packageMode}</span>
      </div>
    `;
  }

  async function applyTemplateRecord(template) {
    const { assignmentForm, assignmentMessage } = getElements();
    editingTemplateId = null;
    updateSaveTemplateButton();
    const snapshot = getTemplateSnapshot(template);
    const existingTitle = assignmentForm?.title?.value.trim();
    const existingDeadline = assignmentForm?.deadline?.value;
    const shouldAsk = Boolean(
      (existingTitle && snapshot.title && existingTitle !== snapshot.title) || (existingDeadline && snapshot.deadline && existingDeadline !== snapshot.deadline)
    );
    const overwrite = shouldAsk
      ? await showConfirmDialog({
          title: '套用模板',
          message: '当前已填写任务标题或截止时间，是否使用模板中的标题和截止时间覆盖？',
          confirmText: '覆盖并套用',
          variant: 'primary',
        })
      : true;
    if (!overwrite) {
      snapshot.title = assignmentForm.title.value;
      snapshot.deadline = assignmentForm.deadline.value;
    }
    formModule().setFormData?.(snapshot);
    closeTemplateModal();
    setMessage(assignmentMessage, `模板已套用：${template.name}`, 'success');
  }

  function updateSaveTemplateButton() {
    const { saveTemplateButton } = getElements();
    if (!saveTemplateButton) return;
    saveTemplateButton.textContent = editingTemplateId ? '保存' : '保存模板';
  }

  function clearEditingTemplate() {
    editingTemplateId = null;
    updateSaveTemplateButton();
  }

  function editTemplateInCreatePage(template) {
    const { assignmentMessage } = getElements();
    const record = normalizeTemplateRecord(template);
    editingTemplateId = record.id;
    formModule().setFormData?.(getTemplateSnapshot(record));
    closeTemplateModal();
    window.switchAdminSection?.('create');
    updateSaveTemplateButton();
    setMessage(assignmentMessage, `正在编辑模板：${record.name}`, 'success');
  }

  async function openTemplateModal(mode = 'manage') {
    const { assignmentMessage, templateModal, templateModalTitle, templateSearchInput, templateCategoryFilter } = getElements();
    templateModalMode = mode;
    if (templateModalTitle) templateModalTitle.textContent = mode === 'picker' ? '套用模板' : '模板管理';
    templateModal?.classList.remove('is-hidden');
    if (templateSearchInput) templateSearchInput.value = '';
    if (templateCategoryFilter) templateCategoryFilter.value = '';
    selectedTemplateIds.clear();
    updateTemplateSelectionUi();
    if (api.getAdminToken?.()) {
      try {
        await loadServerTemplates();
      } catch (error) {
        setMessage(assignmentMessage, error.message, 'error');
      }
    }
    render();
  }

  function closeTemplateModal() {
    const { templateModal } = getElements();
    templateModal?.classList.add('is-hidden');
    selectedTemplateIds.clear();
  }

  function updateTemplateSelectionUi() {
    const { templateSelectedCount, templateBatchDeleteButton, templateSelectAll, templateManagerList } = getElements();
    if (templateSelectedCount) templateSelectedCount.textContent = `已选择 ${selectedTemplateIds.size} 项`;
    if (templateBatchDeleteButton) templateBatchDeleteButton.disabled = selectedTemplateIds.size === 0;
    if (templateSelectAll && templateManagerList) {
      const boxes = [...templateManagerList.querySelectorAll('[data-template-select]')];
      templateSelectAll.checked = boxes.length > 0 && boxes.every((box) => box.checked);
      templateSelectAll.indeterminate = boxes.some((box) => box.checked) && !templateSelectAll.checked;
    }
  }

  function render(items) {
    const { templateManagerList, templateSearchInput, templateCategoryFilter } = getElements();
    if (!templateManagerList) return;
    if (Array.isArray(items) && api.getAdminToken?.()) {
      templateCache = items.map(normalizeTemplateRecord);
      templatesLoadedFromServer = true;
    }
    const keyword = templateSearchInput?.value.trim().toLowerCase() || '';
    const category = templateCategoryFilter?.value || '';
    const templates = getStoredTemplates().filter((template) => {
      const matchesKeyword = !keyword || template.name.toLowerCase().includes(keyword);
      const matchesCategory = !category || template.category === category;
      return matchesKeyword && matchesCategory;
    });
    if (!templates.length) {
      templateManagerList.innerHTML = '<div class="empty-card template-empty">暂无模板，可先填写任务配置后点击“保存模板”。</div>';
      updateTemplateSelectionUi();
      return;
    }
    templateManagerList.innerHTML = templates
      .map(
        (template) => `
      <article class="template-list-item" data-template-id="${escapeHtml(template.id)}">
        <label class="template-item-check" aria-label="选择模板">
          <input type="checkbox" data-template-select="${escapeHtml(template.id)}" ${selectedTemplateIds.has(template.id) ? 'checked' : ''}>
        </label>
        <div>
          <h3>${escapeHtml(template.name)}</h3>
          <p>${escapeHtml(getCategoryLabel(template.category))} · ${escapeHtml(getVisibilityLabel(template.visibility))}</p>
          <p>创建：${formatTime(template.createdAt)} · 更新：${formatTime(template.updatedAt)}</p>
          <p class="template-preview-title">任务预览</p>
          ${renderTemplatePreviewChips(template)}
        </div>
        <div class="template-list-actions">
          <button class="compact-button" type="button" data-template-apply="${escapeHtml(template.id)}">套用</button>
          <button class="secondary-button compact-button" type="button" data-template-preview="${escapeHtml(template.id)}">预览</button>
          <button class="secondary-button compact-button" type="button" data-template-edit="${escapeHtml(template.id)}">编辑</button>
          <button class="danger-outline-button compact-button" type="button" data-template-delete="${escapeHtml(template.id)}">删除</button>
        </div>
      </article>
    `
      )
      .join('');
    updateTemplateSelectionUi();
  }

  async function load() {
    const items = api.getAdminToken?.() ? await loadServerTemplates() : getStoredTemplates();
    render(items);
    return items;
  }

  function openTemplatePreviewModal(template) {
    const { templatePreviewModal, templatePreviewContent } = getElements();
    if (!templatePreviewModal || !templatePreviewContent) return;
    const record = normalizeTemplateRecord(template);
    const summary = getTemplatePreviewSummary(record);
    const { FIELD_TYPE_LABELS } = getConstants();
    templatePreviewContent.innerHTML = `
      <section>
        <h3>基础信息摘要</h3>
        <dl class="template-preview-dl">
          <div><dt>任务标题</dt><dd>${escapeHtml(summary.title || '-')}</dd></div>
          <div><dt>任务状态</dt><dd>${escapeHtml(summary.status)}</dd></div>
          <div><dt>截止时间</dt><dd>${escapeHtml(summary.deadline)}</dd></div>
          <div><dt>打包形式</dt><dd>${escapeHtml(summary.packageMode)}</dd></div>
        </dl>
      </section>
      <section>
        <h3>收集字段列表</h3>
        <div class="template-preview-fields">
          ${summary.fields.length ? summary.fields.map((field) => `<span>${escapeHtml(field.label)} · ${escapeHtml(FIELD_TYPE_LABELS[field.type] || field.type)}${field.required ? ' · 必填' : ''}</span>`).join('') : '<span>暂无字段</span>'}
        </div>
      </section>
      <section>
        <h3>文件设置摘要</h3>
        ${renderTemplatePreviewChips(record)}
      </section>
    `;
    templatePreviewModal.classList.remove('is-hidden');
  }

  function closeTemplatePreviewModal() {
    getElements().templatePreviewModal?.classList.add('is-hidden');
  }

  async function deleteTemplatesByIds(ids) {
    const { assignmentMessage } = getElements();
    const idSet = new Set(ids.map(String));
    const templates = getStoredTemplates();
    const deleting = templates.filter((item) => idSet.has(String(item.id)));
    if (!deleting.length) return;
    const ok = await showConfirmDialog({
      title: deleting.length > 1 ? '批量删除模板' : '删除模板',
      message:
        deleting.length > 1
          ? `确定删除选中的 ${deleting.length} 个模板吗？删除后可在回收站恢复。`
          : `确定删除模板“${deleting[0].name}”吗？删除后可在回收站恢复。`,
      confirmText: '删除',
      variant: 'danger',
    });
    if (!ok) return;
    if (api.getAdminToken?.()) {
      await Promise.all(deleting.map((template) => api.adminDelete(`/api/templates/${template.id}`)));
    } else {
      moveTemplatesToRecycle(deleting);
    }
    persistTemplates(templates.filter((item) => !idSet.has(String(item.id))));
    deleting.forEach((item) => selectedTemplateIds.delete(item.id));
    render();
    CloudNote.adminRecycle?.load?.();
    setMessage(assignmentMessage, deleting.length > 1 ? '已批量删除模板，模板已进入回收站' : '模板已进入回收站', 'success');
  }

  function deleteTemplate(templateId) {
    return deleteTemplatesByIds([templateId]);
  }

  function applyTemplate(templateId) {
    const template = getStoredTemplates().find((item) => String(item.id) === String(templateId));
    if (!template) return Promise.resolve(null);
    return applyTemplateRecord(template);
  }

  function openSaveTemplateModal() {
    const { templateNameInput, saveTemplateModal } = getElements();
    const snapshot = formModule().getFormData?.();
    if (templateNameInput && !templateNameInput.value.trim()) templateNameInput.value = snapshot?.title || '';
    saveTemplateModal?.classList.remove('is-hidden');
  }

  function applyLatestTemplate() {
    return openTemplateModal('picker');
  }

  function manageTemplates() {
    return openTemplateModal('manage');
  }

  function bindEvents() {
    const {
      assignmentMessage,
      saveTemplateButton,
      applyTemplateButton,
      manageTemplateButton,
      saveTemplateModal,
      saveTemplateForm,
      templateModal,
      templateSearchInput,
      templateCategoryFilter,
      templateManagerList,
      templateSelectAll,
      templateBatchDeleteButton,
      templatePreviewModal,
    } = getElements();

    saveTemplateButton?.addEventListener('click', async () => {
      if (!formModule().validate?.()) return;
      if (!editingTemplateId) {
        openSaveTemplateModal();
        return;
      }
      try {
        await saveFromCurrentForm({ overwriteId: editingTemplateId });
      } catch (error) {
        setMessage(assignmentMessage, error.message, 'error');
      }
    });
    saveTemplateForm?.addEventListener('submit', async (event) => {
      event.preventDefault();
      if (!formModule().validate?.()) return;
      try {
        await saveFromCurrentForm();
        saveTemplateModal?.classList.add('is-hidden');
      } catch (error) {
        setMessage(assignmentMessage, error.message, 'error');
      }
    });
    saveTemplateModal?.addEventListener('click', (event) => {
      if (event.target.closest('[data-close-save-template-modal]')) saveTemplateModal.classList.add('is-hidden');
    });
    applyTemplateButton?.addEventListener('click', applyLatestTemplate);
    manageTemplateButton?.addEventListener('click', manageTemplates);
    templateSearchInput?.addEventListener('input', () => render());
    templateCategoryFilter?.addEventListener('change', () => render());

    templateModal?.addEventListener('click', async (event) => {
      if (event.target.closest('[data-close-template-modal]')) {
        closeTemplateModal();
        return;
      }
      const applyButton = event.target.closest('[data-template-apply]');
      const previewButton = event.target.closest('[data-template-preview]');
      const editButton = event.target.closest('[data-template-edit]');
      const deleteButton = event.target.closest('[data-template-delete]');
      const templates = getStoredTemplates();
      try {
        if (applyButton) {
          const template = templates.find((item) => item.id === applyButton.dataset.templateApply);
          if (template) await applyTemplateRecord(template);
          return;
        }
        if (previewButton) {
          const template = templates.find((item) => item.id === previewButton.dataset.templatePreview);
          if (template) openTemplatePreviewModal(template);
          return;
        }
        if (editButton) {
          const template = templates.find((item) => item.id === editButton.dataset.templateEdit);
          if (template) editTemplateInCreatePage(template);
          return;
        }
        if (deleteButton) await deleteTemplatesByIds([deleteButton.dataset.templateDelete]);
      } catch (error) {
        setMessage(assignmentMessage, error.message, 'error');
      }
    });

    templateManagerList?.addEventListener('change', (event) => {
      const checkbox = event.target.closest('[data-template-select]');
      if (!checkbox) return;
      if (checkbox.checked) selectedTemplateIds.add(checkbox.dataset.templateSelect);
      else selectedTemplateIds.delete(checkbox.dataset.templateSelect);
      updateTemplateSelectionUi();
    });
    templateSelectAll?.addEventListener('change', () => {
      templateManagerList?.querySelectorAll('[data-template-select]').forEach((checkbox) => {
        checkbox.checked = templateSelectAll.checked;
        if (checkbox.checked) selectedTemplateIds.add(checkbox.dataset.templateSelect);
        else selectedTemplateIds.delete(checkbox.dataset.templateSelect);
      });
      updateTemplateSelectionUi();
    });
    templateBatchDeleteButton?.addEventListener('click', () => {
      deleteTemplatesByIds([...selectedTemplateIds]).catch((error) => setMessage(assignmentMessage, error.message, 'error'));
    });
    templatePreviewModal?.addEventListener('click', (event) => {
      if (event.target.closest('[data-close-template-preview-modal]')) closeTemplatePreviewModal();
    });
    document.getElementById('cancelEditButton')?.addEventListener('click', () => {
      clearEditingTemplate();
    });
  }

  function init() {
    if (initialized || !document.getElementById('templateManagerList')) return;
    initialized = true;
    bindEvents();
    updateSaveTemplateButton();
  }

  CloudNote.adminTemplates = {
    init,
    load,
    refresh: load,
    render,
    saveFromCurrentForm,
    saveFromSnapshot: saveTemplateFromSnapshot,
    applyTemplate,
    deleteTemplate,
    deleteTemplatesByIds,
    normalizeTemplateRecord,
    getStoredTemplates,
    persistTemplates,
    renderTemplateList: render,
    getCategoryLabel,
    getVisibilityLabel,
    openTemplateModal,
    closeTemplateModal,
    applyLatestTemplate,
    manageTemplates,
    editTemplateInCreatePage,
    clearEditingTemplate,
  };
})(window, document);
