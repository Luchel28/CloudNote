(function (window, document) {
  'use strict';

  const CloudNote = (window.CloudNote = window.CloudNote || {});
  const ADMIN_TOKEN_KEY = 'cloudnoteAdminToken';

  function getAdminToken() {
    return sessionStorage.getItem(ADMIN_TOKEN_KEY);
  }

  function setAdminToken(token) {
    sessionStorage.setItem(ADMIN_TOKEN_KEY, token);
  }

  function clearAdminToken() {
    sessionStorage.removeItem(ADMIN_TOKEN_KEY);
  }

  function getAdminHeaders(extraHeaders = {}) {
    return { 'x-admin-token': getAdminToken() || '', ...extraHeaders };
  }

  function makeHeaders(headers, admin) {
    const result = new Headers(headers || {});
    if (admin && !result.has('x-admin-token')) result.set('x-admin-token', getAdminToken() || '');
    return result;
  }

  async function parseResponseBody(response) {
    const text = await response.text();
    if (!text) return null;
    try {
      return JSON.parse(text);
    } catch {
      return text;
    }
  }

  function handleUnauthorized(admin) {
    if (!admin) return;
    clearAdminToken();
    window.dispatchEvent(new CustomEvent('cloudnote:admin-unauthorized'));
  }

  async function apiFetch(url, options = {}) {
    const { admin = false, fallbackMessage = '操作失败', headers, ...fetchOptions } = options;
    let response;
    try {
      response = await fetch(url, {
        ...fetchOptions,
        headers: makeHeaders(headers, admin),
      });
    } catch {
      throw new Error('网络请求失败，请稍后重试');
    }

    if (!response.ok) {
      const body = await parseResponseBody(response).catch(() => null);
      if (response.status === 401) handleUnauthorized(admin);
      throw new Error((body && typeof body === 'object' && body.message) || response.statusText || fallbackMessage);
    }
    return response;
  }

  async function request(url, options = {}) {
    const response = await apiFetch(url, options);
    return parseResponseBody(response);
  }

  function get(url, options = {}) {
    return request(url, { ...options, method: 'GET' });
  }

  function post(url, body, options = {}) {
    return request(url, {
      ...options,
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
      body: JSON.stringify(body || {}),
    });
  }

  function put(url, body, options = {}) {
    return request(url, {
      ...options,
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
      body: JSON.stringify(body || {}),
    });
  }

  function del(url, options = {}) {
    return request(url, { ...options, method: 'DELETE' });
  }

  function adminGet(url, options = {}) {
    return get(url, { ...options, admin: true });
  }

  function adminPost(url, body, options = {}) {
    return post(url, body, { ...options, admin: true });
  }

  function adminPut(url, body, options = {}) {
    return put(url, body, { ...options, admin: true });
  }

  function adminDelete(url, options = {}) {
    return del(url, { ...options, admin: true });
  }

  async function downloadBlob(url, filename, options = {}) {
    const response = await apiFetch(url, options);
    const disposition = response.headers.get('Content-Disposition') || '';
    const match = disposition.match(/filename\*?=(?:UTF-8'')?([^;\s]+)/i);
    const serverFilename = match ? decodeURIComponent(match[1]) : filename;
    const blob = await response.blob();
    const objectUrl = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = objectUrl;
    link.download = serverFilename || filename || 'download';
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(objectUrl);
  }

  function adminDownloadBlob(url, filename, options = {}) {
    return downloadBlob(url, filename, { ...options, admin: true });
  }

  CloudNote.api = {
    ADMIN_TOKEN_KEY,
    getAdminToken,
    setAdminToken,
    clearAdminToken,
    getAdminHeaders,
    apiFetch,
    request,
    get,
    post,
    put,
    delete: del,
    del,
    adminGet,
    adminPost,
    adminPut,
    adminDelete,
    downloadBlob,
    adminDownloadBlob,
  };
})(window, document);
