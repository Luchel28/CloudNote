(function (window, document) {
  'use strict';

  const CloudNote = (window.CloudNote = window.CloudNote || {});
  const common = CloudNote.common || {};
  const api = CloudNote.api || {};
  const $ = common.$ || ((selector) => document.querySelector(selector));
  const setMessage = common.setMessage || (() => {});

  function debugRecord(action, details = {}) {
    try {
      window.CloudNoteDebug?.record?.(action, { page: 'admin', ...details });
    } catch {}
  }

  function isAdminPage() {
    return Boolean(document.getElementById('adminPanel') || document.querySelector('.admin-page'));
  }

  function getElements() {
    return {
      loginPanel: $('#loginPanel'),
      adminPanel: $('#adminPanel'),
      adminLoginForm: $('#adminLoginForm'),
      loginMessage: $('#loginMessage'),
      logoutButton: $('#logoutButton'),
      adminNavItems: document.querySelectorAll('[data-admin-section]'),
      adminSectionPanels: document.querySelectorAll('[data-section-panel]'),
    };
  }

  function showAdminPanel() {
    $('#loginPanel')?.classList.add('is-hidden');
    $('#adminPanel')?.classList.remove('is-hidden');
  }

  function showLoginPanel() {
    $('#adminPanel')?.classList.add('is-hidden');
    $('#loginPanel')?.classList.remove('is-hidden');
  }

  function loadAssignments() {
    return CloudNote.adminAssignments?.load?.();
  }

  function refreshAssignments() {
    return CloudNote.adminAssignments?.refresh?.();
  }

  function loadAssignmentOptions() {
    return CloudNote.adminAssignments?.loadAssignmentOptions?.();
  }

  function renderAssignmentSelectors(items) {
    return CloudNote.adminAssignments?.renderAssignmentSelectors?.(items);
  }

  function fetchAssignmentPages(status, sort) {
    return CloudNote.adminAssignments?.fetchAssignmentPages?.(status, sort);
  }

  function renderAssignmentStats() {
    return CloudNote.adminAssignments?.renderAssignmentStats?.();
  }

  function renderAssignmentCard(item) {
    return CloudNote.adminAssignments?.renderAssignmentCard?.(item) || '';
  }

  function editAssignment(id) {
    return CloudNote.adminAssignmentForm?.editAssignment?.(id);
  }

  function deleteAssignment(id) {
    return CloudNote.adminAssignments?.deleteAssignment?.(id);
  }

  function copyTaskLink(urlOrId) {
    return CloudNote.adminAssignments?.copyLink?.(urlOrId);
  }

  function getAssignmentUrl(assignment) {
    return (
      CloudNote.adminAssignmentForm?.getAssignmentUrl?.(assignment) ||
      CloudNote.adminAssignments?.getAssignmentUrl?.(assignment) ||
      common.buildAssignmentLink?.(assignment)
    );
  }

  function loadTemplates() {
    return CloudNote.adminTemplates?.load?.();
  }

  function renderTemplateList(items) {
    return CloudNote.adminTemplates?.render?.(items);
  }

  function loadServerTemplates() {
    return CloudNote.adminTemplates?.load?.();
  }

  function getStoredTemplates() {
    return CloudNote.adminTemplates?.getStoredTemplates?.() || [];
  }

  function persistTemplates(templates) {
    return CloudNote.adminTemplates?.persistTemplates?.(templates);
  }

  function normalizeTemplateRecord(template, index) {
    return CloudNote.adminTemplates?.normalizeTemplateRecord?.(template, index) || template;
  }

  function saveTemplateFromSnapshot(snapshot, options) {
    return CloudNote.adminTemplates?.saveFromSnapshot?.(snapshot, options);
  }

  function applyTemplate(id) {
    return CloudNote.adminTemplates?.applyTemplate?.(id);
  }

  function deleteTemplate(id) {
    return CloudNote.adminTemplates?.deleteTemplate?.(id);
  }

  function saveAssignmentTemplate() {
    return CloudNote.adminTemplates?.saveFromCurrentForm?.();
  }

  function applyLatestTemplate() {
    return CloudNote.adminTemplates?.applyLatestTemplate?.();
  }

  function manageTemplates() {
    return CloudNote.adminTemplates?.manageTemplates?.();
  }

  function resetForm() {
    return CloudNote.adminAssignmentForm?.reset?.();
  }

  function resetAssignmentForm() {
    return CloudNote.adminAssignmentForm?.reset?.();
  }

  function fillAssignmentForm(item) {
    return CloudNote.adminAssignmentForm?.fillAssignmentForm?.(item);
  }

  function getFieldConfigFromForm() {
    return CloudNote.adminAssignmentForm?.getFieldConfigFromForm?.() || [];
  }

  function renderFieldConfig(fields) {
    return CloudNote.adminAssignmentForm?.renderFields?.(fields);
  }

  function addCollectField(type, label) {
    return CloudNote.adminAssignmentForm?.addField?.(type, label);
  }

  function loadSubmissions() {
    return CloudNote.adminSubmissions?.load?.();
  }

  function loadStatistics() {
    return CloudNote.adminStatistics?.load?.();
  }

  function loadRecycleBin() {
    return CloudNote.adminRecycle?.load?.();
  }

  function renderStorageSummary() {
    return CloudNote.adminStorage?.render?.();
  }

  function switchAdminSection(section) {
    const { adminNavItems, adminSectionPanels } = getElements();
    adminNavItems.forEach((button) => {
      button.classList.toggle('is-active', button.dataset.adminSection === section);
    });
    adminSectionPanels.forEach((panel) => {
      panel.classList.toggle('is-hidden', panel.dataset.sectionPanel !== section);
    });

    if (section === 'tasks') loadAssignments();
    if (section === 'stats') loadStatistics();
    if (section === 'submissions') loadSubmissions();
    if (section === 'recycle') loadRecycleBin();
    debugRecord('admin:menuSwitch', { message: `切换到 ${section}`, section });
  }

  async function refreshAdminData() {
    await CloudNote.adminAssignmentForm?.loadPublicConfig?.().catch?.(() => {});
    CloudNote.adminStorage?.render?.();
    CloudNote.adminTemplates?.load?.().catch?.(() => {});
    CloudNote.adminAssignments?.load?.();
    CloudNote.adminAssignments?.loadAssignmentOptions?.();
    CloudNote.adminStatistics?.load?.();
    CloudNote.adminSubmissions?.load?.();
    debugRecord('admin:refreshAll', { message: '刷新后台数据与存储空间' });
  }

  async function loginAdminWithPassword(password) {
    const result = await api.post('/api/admin/login', { password });
    api.setAdminToken?.(result.token);
    await CloudNote.adminAssignmentForm?.loadPublicConfig?.().catch?.(() => {});
    showAdminPanel();
    refreshAdminData();
    debugRecord('admin:loginSuccess', { message: '登录成功' });
  }

  function cleanPasswordFromUrl() {
    const url = new URL(window.location.href);
    if (!url.searchParams.has('password')) return;
    url.searchParams.delete('password');
    window.history.replaceState({}, document.title, `${url.pathname}${url.search}${url.hash}`);
  }

  function configureHooks() {
    CloudNote.adminRecycleHooks = {
      getStoredTemplates: () => CloudNote.adminTemplates?.getStoredTemplates?.() || [],
      persistTemplates: (templates) => CloudNote.adminTemplates?.persistTemplates?.(templates),
      normalizeTemplateRecord: (template) => CloudNote.adminTemplates?.normalizeTemplateRecord?.(template) || template,
      renderTemplateList,
      loadAssignments,
      loadAssignmentOptions,
      loadSubmissions,
      loadStatistics,
      renderStorageSummary,
      getCategoryLabel: (category) => CloudNote.adminTemplates?.getCategoryLabel?.(category) || category,
      getVisibilityLabel: (visibility) => CloudNote.adminTemplates?.getVisibilityLabel?.(visibility) || visibility,
    };

    CloudNote.adminSubmissionsHooks = {
      loadAssignments,
      loadStatistics,
      loadRecycleBin,
      renderStorageSummary,
    };
  }

  function bindEvents() {
    const { adminLoginForm, loginMessage, logoutButton, adminNavItems } = getElements();

    adminNavItems.forEach((button) => {
      button.addEventListener('click', () => switchAdminSection(button.dataset.adminSection));
    });
    document.querySelectorAll('[data-admin-section-shortcut]').forEach((button) => {
      button.addEventListener('click', () => switchAdminSection(button.dataset.adminSectionShortcut));
    });

    if (adminLoginForm) {
      const urlPassword = new URLSearchParams(window.location.search).get('password');
      const passwordInput = adminLoginForm.elements.password;
      if (urlPassword && passwordInput) {
        passwordInput.value = urlPassword;
        cleanPasswordFromUrl();
        loginAdminWithPassword(urlPassword).catch((error) => setMessage(loginMessage, error.message, 'error'));
      }

      adminLoginForm.addEventListener('submit', async (event) => {
        event.preventDefault();
        debugRecord('admin:loginAttempt', { event, target: adminLoginForm, message: '管理员登录尝试' });
        try {
          const formData = new FormData(adminLoginForm);
          await loginAdminWithPassword(formData.get('password'));
        } catch (error) {
          setMessage(loginMessage, error.message, 'error');
          debugRecord('admin:loginFailed', { message: error.message });
        }
      });
    }

    logoutButton?.addEventListener('click', () => {
      api.clearAdminToken?.();
      showLoginPanel();
    });
  }

  function exposeCompatibilityProxies() {
    Object.assign(window, {
      showAdminPanel,
      showLoginPanel,
      switchAdminSection,
      loginAdminWithPassword,
      loadAssignments,
      refreshAssignments,
      loadAssignmentOptions,
      renderAssignmentSelectors,
      fetchAssignmentPages,
      renderAssignmentStats,
      renderAssignmentCard,
      editAssignment,
      deleteAssignment,
      copyTaskLink,
      getAssignmentUrl,
      loadTemplates,
      loadServerTemplates,
      renderTemplateList,
      getStoredTemplates,
      persistTemplates,
      normalizeTemplateRecord,
      saveTemplateFromSnapshot,
      applyTemplate,
      deleteTemplate,
      saveAssignmentTemplate,
      applyLatestTemplate,
      manageTemplates,
      resetForm,
      resetAssignmentForm,
      fillAssignmentForm,
      getFieldConfigFromForm,
      renderFieldConfig,
      addCollectField,
      loadSubmissions,
      loadStatistics,
      loadRecycleBin,
      renderStorageSummary,
    });
  }

  function init() {
    if (!isAdminPage()) return;
    if (document.documentElement.dataset.cloudnoteAdminMainInitialized === 'true') return;
    document.documentElement.dataset.cloudnoteAdminMainInitialized = 'true';

    configureHooks();
    CloudNote.adminStorage?.init?.();
    CloudNote.adminRecycle?.init?.();
    CloudNote.adminStatistics?.init?.();
    CloudNote.adminSubmissions?.init?.();
    CloudNote.adminAssignmentForm?.init?.();
    CloudNote.adminTemplates?.init?.();
    CloudNote.adminAssignments?.init?.();
    exposeCompatibilityProxies();
    bindEvents();

    if (api.getAdminToken?.()) {
      showAdminPanel();
      refreshAdminData();
    } else {
      showLoginPanel();
    }
  }

  window.addEventListener('cloudnote:admin-unauthorized', showLoginPanel);

  CloudNote.adminMain = Object.assign(CloudNote.adminMain || {}, {
    init,
    isAdminPage,
    showAdminPanel,
    showLoginPanel,
    switchSection: switchAdminSection,
    refreshAdminData,
    refreshStorage: renderStorageSummary,
  });

  (common.ready || ((cb) => { cb(); }))(init);
})(window, document);
