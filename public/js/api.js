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
    const { admin = false, fallbackMessage = '操作失败', method = 'GET', headers, ...fetchOptions } = options;
    CloudNote.debug?.record?.('api:request', { message: `${method} ${url}`, url });
    let response;
    const startTime = Date.now();
    try {
      response = await fetch(url, {
        method,
        ...fetchOptions,
        headers: makeHeaders(headers, admin),
      });
    } catch (err) {
      CloudNote.debug?.record?.('api:error', { message: `请求失败: ${url}`, url, error: err.message });
      throw new Error('网络请求失败，请稍后重试', { cause: err });
    }
    const elapsed = Date.now() - startTime;
    if (!response.ok) {
      const body = await parseResponseBody(response).catch(() => null);
      CloudNote.debug?.record?.('api:error', { message: `${response.status} ${url}`, url, status: response.status, elapsed });
      if (response.status === 401) handleUnauthorized(admin);
      throw new Error((body && typeof body === 'object' && body.message) || response.statusText || fallbackMessage);
    }
    CloudNote.debug?.record?.('api:success', { message: `${method} ${url} ${response.status}`, url, elapsed });
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
    const { admin = false, method = 'GET', headers, body, ...fetchOptions } = options;
    CloudNote.debug?.record?.('api:downloadBlob', { message: `Download: ${filename}`, url });
    let response;
    const startTime = Date.now();
    try {
      response = await fetch(url, {
        method,
        ...(method !== 'GET' && method !== 'HEAD' ? { body } : {}),
        ...fetchOptions,
        headers: makeHeaders(headers, admin),
      });
    } catch (err) {
      CloudNote.debug?.record?.('api:error', { message: `下载请求失败: ${url}`, url, error: err.message });
      throw new Error('网络请求失败，请稍后重试', { cause: err });
    }
    const elapsed = Date.now() - startTime;
    if (!response.ok) {
      const body = await parseResponseBody(response).catch(() => null);
      CloudNote.debug?.record?.('api:error', { message: `${response.status} ${url}`, url, status: response.status, elapsed });
      if (response.status === 401) handleUnauthorized(admin);
      throw new Error((body && typeof body === 'object' && body.message) || response.statusText || '下载文件失败');
    }
    CloudNote.debug?.record?.('api:success', { message: `Download: ${filename} ${response.status}`, url, elapsed });
    const blob = await response.blob();
    const blobUrl = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = blobUrl;
    link.download = filename || 'download';
    link.style.display = 'none';
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(blobUrl), 1000);
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
