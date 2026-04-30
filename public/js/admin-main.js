(function (window, document) {
  'use strict';

  const CloudNote = window.CloudNote = window.CloudNote || {};
  const common = CloudNote.common || {};

  function isAdminPage() {
    return Boolean(document.getElementById('adminPanel') || document.querySelector('.admin-page'));
  }

  function showLoginPanel() {
    document.getElementById('adminPanel')?.classList.add('is-hidden');
    document.getElementById('loginPanel')?.classList.remove('is-hidden');
  }

  function init() {
    if (!isAdminPage()) return;
    if (document.documentElement.dataset.cloudnoteAdminMainInitialized === 'true') return;
    document.documentElement.dataset.cloudnoteAdminMainInitialized = 'true';
    CloudNote.adminStorage?.init?.();
    CloudNote.adminRecycle?.init?.();
    CloudNote.adminStatistics?.init?.();
    CloudNote.adminSubmissions?.init?.();
    CloudNote.adminAssignmentForm?.init?.();
    CloudNote.adminTemplates?.init?.();
    CloudNote.adminAssignments?.init?.();
  }

  window.addEventListener('cloudnote:admin-unauthorized', showLoginPanel);

  CloudNote.adminMain = {
    init,
    isAdminPage,
    showLoginPanel,
    refreshStorage: () => CloudNote.adminStorage?.render?.(),
  };

  (common.ready || ((callback) => callback()))(init);
})(window, document);
