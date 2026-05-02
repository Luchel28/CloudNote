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
    let _a, _b;
    (_a = $('#loginPanel')) === null || _a === void 0 ? void 0 : _a.classList.add('is-hidden');
    (_b = $('#adminPanel')) === null || _b === void 0 ? void 0 : _b.classList.remove('is-hidden');
  }

  function showLoginPanel() {
    let _a, _b;
    (_a = $('#adminPanel')) === null || _a === void 0 ? void 0 : _a.classList.add('is-hidden');
    (_b = $('#loginPanel')) === null || _b === void 0 ? void 0 : _b.classList.remove('is-hidden');
  }

  function loadAssignments() {
    let _a;
    return (_a = CloudNote.adminAssignments) === null || _a === void 0 ? void 0 : _a.load();
  }

  function refreshAssignments() {
    let _a;
    return (_a = CloudNote.adminAssignments) === null || _a === void 0 ? void 0 : _a.refresh();
  }

  function loadAssignmentOptions() {
    let _a;
    return (_a = CloudNote.adminAssignments) === null || _a === void 0 ? void 0 : _a.loadAssignmentOptions();
  }

  function renderAssignmentSelectors(items) {
    let _a;
    return (_a = CloudNote.adminAssignments) === null || _a === void 0 ? void 0 : _a.renderAssignmentSelectors(items);
  }

  function fetchAssignmentPages(status, sort) {
    let _a;
    return (_a = CloudNote.adminAssignments) === null || _a === void 0 ? void 0 : _a.fetchAssignmentPages(status, sort);
  }

  function renderAssignmentStats() {
    let _a;
    return (_a = CloudNote.adminAssignments) === null || _a === void 0 ? void 0 : _a.renderAssignmentStats();
  }

  function renderAssignmentCard(item) {
    let _a;
    return ((_a = CloudNote.adminAssignments) === null || _a === void 0 ? void 0 : _a.renderAssignmentCard(item)) || '';
  }

  function editAssignment(id) {
    let _a;
    return (_a = CloudNote.adminAssignmentForm) === null || _a === void 0 ? void 0 : _a.editAssignment(id);
  }

  function deleteAssignment(id) {
    let _a;
    return (_a = CloudNote.adminAssignments) === null || _a === void 0 ? void 0 : _a.deleteAssignment(id);
  }

  function copyTaskLink(urlOrId) {
    let _a;
    return (_a = CloudNote.adminAssignments) === null || _a === void 0 ? void 0 : _a.copyLink(urlOrId);
  }

  function getAssignmentUrl(assignment) {
    let _a, _b;
    return (
      ((_a = CloudNote.adminAssignmentForm) === null || _a === void 0 ? void 0 : _a.getAssignmentUrl(assignment)) ||
      ((_b = CloudNote.adminAssignments) === null || _b === void 0 ? void 0 : _b.getAssignmentUrl(assignment)) ||
      (common.buildAssignmentLink ? common.buildAssignmentLink(assignment) : undefined)
    );
  }

  function loadTemplates() {
    let _a;
    return (_a = CloudNote.adminTemplates) === null || _a === void 0 ? void 0 : _a.load();
  }

  function renderTemplateList(items) {
    let _a;
    return (_a = CloudNote.adminTemplates) === null || _a === void 0 ? void 0 : _a.render(items);
  }

  function loadServerTemplates() {
    let _a;
    return (_a = CloudNote.adminTemplates) === null || _a === void 0 ? void 0 : _a.load();
  }

  function getStoredTemplates() {
    let _a;
    return ((_a = CloudNote.adminTemplates) === null || _a === void 0 ? void 0 : _a.getStoredTemplates()) || [];
  }

  function persistTemplates(templates) {
    let _a;
    return (_a = CloudNote.adminTemplates) === null || _a === void 0 ? void 0 : _a.persistTemplates(templates);
  }

  function normalizeTemplateRecord(template, index) {
    let _a;
    return ((_a = CloudNote.adminTemplates) === null || _a === void 0 ? void 0 : _a.normalizeTemplateRecord(template, index)) || template;
  }

  function saveTemplateFromSnapshot(snapshot, options) {
    let _a;
    return (_a = CloudNote.adminTemplates) === null || _a === void 0 ? void 0 : _a.saveFromSnapshot(snapshot, options);
  }

  function applyTemplate(id) {
    let _a;
    return (_a = CloudNote.adminTemplates) === null || _a === void 0 ? void 0 : _a.applyTemplate(id);
  }

  function deleteTemplate(id) {
    let _a;
    return (_a = CloudNote.adminTemplates) === null || _a === void 0 ? void 0 : _a.deleteTemplate(id);
  }

  function saveAssignmentTemplate() {
    let _a;
    return (_a = CloudNote.adminTemplates) === null || _a === void 0 ? void 0 : _a.saveFromCurrentForm();
  }

  function applyLatestTemplate() {
    let _a;
    return (_a = CloudNote.adminTemplates) === null || _a === void 0 ? void 0 : _a.applyLatestTemplate();
  }

  function manageTemplates() {
    let _a;
    return (_a = CloudNote.adminTemplates) === null || _a === void 0 ? void 0 : _a.manageTemplates();
  }

  function resetForm() {
    let _a;
    return (_a = CloudNote.adminAssignmentForm) === null || _a === void 0 ? void 0 : _a.reset();
  }

  function resetAssignmentForm() {
    let _a;
    return (_a = CloudNote.adminAssignmentForm) === null || _a === void 0 ? void 0 : _a.reset();
  }

  function fillAssignmentForm(item) {
    let _a;
    return (_a = CloudNote.adminAssignmentForm) === null || _a === void 0 ? void 0 : _a.fillAssignmentForm(item);
  }

  function getFieldConfigFromForm() {
    let _a;
    return ((_a = CloudNote.adminAssignmentForm) === null || _a === void 0 ? void 0 : _a.getFieldConfigFromForm()) || [];
  }

  function renderFieldConfig(fields) {
    let _a;
    return (_a = CloudNote.adminAssignmentForm) === null || _a === void 0 ? void 0 : _a.renderFields(fields);
  }

  function addCollectField(type, label) {
    let _a;
    return (_a = CloudNote.adminAssignmentForm) === null || _a === void 0 ? void 0 : _a.addField(type, label);
  }

  function loadSubmissions() {
    let _a;
    return (_a = CloudNote.adminSubmissions) === null || _a === void 0 ? void 0 : _a.load();
  }

  function loadStatistics() {
    let _a;
    return (_a = CloudNote.adminStatistics) === null || _a === void 0 ? void 0 : _a.load();
  }

  function loadRecycleBin() {
    let _a;
    return (_a = CloudNote.adminRecycle) === null || _a === void 0 ? void 0 : _a.load();
  }

  function renderStorageSummary() {
    let _a;
    return (_a = CloudNote.adminStorage) === null || _a === void 0 ? void 0 : _a.render();
  }

  function switchAdminSection(section) {
    const _a = getElements(), adminNavItems = _a.adminNavItems, adminSectionPanels = _a.adminSectionPanels;
    adminNavItems.forEach(function (button) {
      button.classList.toggle('is-active', button.dataset.adminSection === section);
    });
    adminSectionPanels.forEach(function (panel) {
      panel.classList.toggle('is-hidden', panel.dataset.sectionPanel !== section);
    });

    if (section === 'tasks') loadAssignments();
    if (section === 'stats') loadStatistics();
    if (section === 'submissions') loadSubmissions();
    if (section === 'recycle') loadRecycleBin();
    debugRecord('admin:menuSwitch', { message: '切换到 ' + section, section: section });
  }

  function refreshAdminData() {
    let _a, _b, _c, _d, _e;
    (_a = CloudNote.adminAssignmentForm) === null || _a === void 0 ? void 0 : _a.loadPublicConfig().catch(function () {});
    (_b = CloudNote.adminStorage) === null || _b === void 0 ? void 0 : _b.render();
    (_c = CloudNote.adminTemplates) === null || _c === void 0 ? void 0 : _c.load().catch(function () {});
    (_d = CloudNote.adminAssignments) === null || _d === void 0 ? void 0 : _d.load();
    (_e = CloudNote.adminAssignments) === null || _e === void 0 ? void 0 : _e.loadAssignmentOptions();
    CloudNote.adminStatistics && CloudNote.adminStatistics.load();
    CloudNote.adminSubmissions && CloudNote.adminSubmissions.load();
    debugRecord('admin:refreshAll', { message: 'refresh admin data and storage' });
  }

  function loginAdminWithPassword(password) {
    return api.post('/api/admin/login', { password: password }).then(function (result) {
      let _a;
      (_a = api.setAdminToken) === null || _a === void 0 ? void 0 : _a.call(api, result.token);
      let _b;
      (_b = CloudNote.adminAssignmentForm) === null || _b === void 0 ? void 0 : _b.loadPublicConfig().catch(function () {});
      showAdminPanel();
      refreshAdminData();
      debugRecord('admin:loginSuccess', { message: 'login success' });
    });
  }

  function cleanPasswordFromUrl() {
    const url = new URL(window.location.href);
    if (!url.searchParams.has('password')) return;
    url.searchParams.delete('password');
    window.history.replaceState({}, document.title, '' + url.pathname + url.search + url.hash);
  }

  function configureHooks() {
    CloudNote.adminRecycleHooks = {
      getStoredTemplates: function () { let _a; return ((_a = CloudNote.adminTemplates) === null || _a === void 0 ? void 0 : _a.getStoredTemplates()) || []; },
      persistTemplates: function (templates) { let _a; return (_a = CloudNote.adminTemplates) === null || _a === void 0 ? void 0 : _a.persistTemplates(templates); },
      normalizeTemplateRecord: function (template) { let _a; return ((_a = CloudNote.adminTemplates) === null || _a === void 0 ? void 0 : _a.normalizeTemplateRecord(template)) || template; },
      renderTemplateList: renderTemplateList,
      loadAssignments: loadAssignments,
      loadAssignmentOptions: loadAssignmentOptions,
      loadSubmissions: loadSubmissions,
      loadStatistics: loadStatistics,
      renderStorageSummary: renderStorageSummary,
      getCategoryLabel: function (category) { let _a; return ((_a = CloudNote.adminTemplates) === null || _a === void 0 ? void 0 : _a.getCategoryLabel(category)) || category; },
      getVisibilityLabel: function (visibility) { let _a; return ((_a = CloudNote.adminTemplates) === null || _a === void 0 ? void 0 : _a.getVisibilityLabel(visibility)) || visibility; },
    };

    CloudNote.adminSubmissionsHooks = {
      loadAssignments: loadAssignments,
      loadStatistics: loadStatistics,
      loadRecycleBin: loadRecycleBin,
      renderStorageSummary: renderStorageSummary,
    };
  }

  function bindEvents() {
    const _a = getElements(), adminLoginForm = _a.adminLoginForm, loginMessage = _a.loginMessage, logoutButton = _a.logoutButton, adminNavItems = _a.adminNavItems;

    adminNavItems.forEach(function (button) {
      button.addEventListener('click', function () { return switchAdminSection(button.dataset.adminSection); });
    });
    document.querySelectorAll('[data-admin-section-shortcut]').forEach(function (button) {
      button.addEventListener('click', function () { return switchAdminSection(button.dataset.adminSectionShortcut); });
    });

    if (adminLoginForm) {
      const urlPassword = new URLSearchParams(window.location.search).get('password');
      const passwordInput = adminLoginForm.elements.password;
      if (urlPassword && passwordInput) {
        passwordInput.value = urlPassword;
        cleanPasswordFromUrl();
        loginAdminWithPassword(urlPassword).catch(function (error) { return setMessage(loginMessage, error.message, 'error'); });
      }

      adminLoginForm.addEventListener('submit', function (event) {
        event.preventDefault();
        debugRecord('admin:loginAttempt', { event: event, target: adminLoginForm, message: '管理员登录尝试' });
        const formData = new FormData(adminLoginForm);
        loginAdminWithPassword(formData.get('password')).catch(function (error) {
          setMessage(loginMessage, error.message, 'error');
          debugRecord('admin:loginFailed', { message: error.message });
        });
      });
    }

    if (logoutButton) {
      logoutButton.addEventListener('click', function () {
        let _a;
        (_a = api.clearAdminToken) === null || _a === void 0 ? void 0 : _a.call(api);
        showLoginPanel();
      });
    }
  }

  function exposeCompatibilityProxies() {
    Object.assign(window, {
      showAdminPanel: showAdminPanel,
      showLoginPanel: showLoginPanel,
      switchAdminSection: switchAdminSection,
      loginAdminWithPassword: loginAdminWithPassword,
      loadAssignments: loadAssignments,
      refreshAssignments: refreshAssignments,
      loadAssignmentOptions: loadAssignmentOptions,
      renderAssignmentSelectors: renderAssignmentSelectors,
      fetchAssignmentPages: fetchAssignmentPages,
      renderAssignmentStats: renderAssignmentStats,
      renderAssignmentCard: renderAssignmentCard,
      editAssignment: editAssignment,
      deleteAssignment: deleteAssignment,
      copyTaskLink: copyTaskLink,
      getAssignmentUrl: getAssignmentUrl,
      loadTemplates: loadTemplates,
      loadServerTemplates: loadServerTemplates,
      renderTemplateList: renderTemplateList,
      getStoredTemplates: getStoredTemplates,
      persistTemplates: persistTemplates,
      normalizeTemplateRecord: normalizeTemplateRecord,
      saveTemplateFromSnapshot: saveTemplateFromSnapshot,
      applyTemplate: applyTemplate,
      deleteTemplate: deleteTemplate,
      saveAssignmentTemplate: saveAssignmentTemplate,
      applyLatestTemplate: applyLatestTemplate,
      manageTemplates: manageTemplates,
      resetForm: resetForm,
      resetAssignmentForm: resetAssignmentForm,
      fillAssignmentForm: fillAssignmentForm,
      getFieldConfigFromForm: getFieldConfigFromForm,
      renderFieldConfig: renderFieldConfig,
      addCollectField: addCollectField,
      loadSubmissions: loadSubmissions,
      loadStatistics: loadStatistics,
      loadRecycleBin: loadRecycleBin,
      renderStorageSummary: renderStorageSummary,
    });
  }

  function init() {
    if (!isAdminPage()) return;
    if (document.documentElement.dataset.cloudnoteAdminMainInitialized === 'true') return;
    document.documentElement.dataset.cloudnoteAdminMainInitialized = 'true';

    configureHooks();
    // Initialize sub-modules
    let _a, _b, _c, _d, _e, _f, _g;
    (_a = CloudNote.adminStorage) === null || _a === void 0 ? void 0 : _a.init();
    (_b = CloudNote.adminRecycle) === null || _b === void 0 ? void 0 : _b.init();
    (_c = CloudNote.adminStatistics) === null || _c === void 0 ? void 0 : _c.init();
    (_d = CloudNote.adminSubmissions) === null || _d === void 0 ? void 0 : _d.init();
    (_e = CloudNote.adminAssignmentForm) === null || _e === void 0 ? void 0 : _e.init();
    (_f = CloudNote.adminTemplates) === null || _f === void 0 ? void 0 : _f.init();
    (_g = CloudNote.adminAssignments) === null || _g === void 0 ? void 0 : _g.init();
    exposeCompatibilityProxies();
    bindEvents();

    if ((api.getAdminToken && api.getAdminToken())) {
      showAdminPanel();
      refreshAdminData();
    } else {
      showLoginPanel();
    }
  }

  window.addEventListener('cloudnote:admin-unauthorized', showLoginPanel);

  CloudNote.adminMain = Object.assign(CloudNote.adminMain || {}, {
    init: init,
    isAdminPage: isAdminPage,
    showAdminPanel: showAdminPanel,
    showLoginPanel: showLoginPanel,
    switchSection: switchAdminSection,
    refreshAdminData: refreshAdminData,
    refreshStorage: renderStorageSummary,
  });

  (common.ready || (function (cb) { cb(); }))(init);
})(window, document);
