const BASE = '/api/v1'
const TOKEN_KEY = 'cloudnote.admin.token'

function token(): string {
  return localStorage.getItem(TOKEN_KEY) || ''
}

function setToken(value: string): void {
  localStorage.setItem(TOKEN_KEY, value)
}

function clearToken(): void {
  localStorage.removeItem(TOKEN_KEY)
}

async function request<T>(url: string, options: RequestInit = {}): Promise<T> {
  const headers: Record<string, string> = {
    ...(options.headers as Record<string, string> || {}),
  }
  const t = token()
  if (t) headers['Authorization'] = `Bearer ${t}`

  const response = await fetch(`${BASE}${url}`, {
    ...options,
    headers,
  })

  if (!response.ok) {
    const body = await response.json().catch(() => ({}))
    const msg = body.error?.message || body.message || response.statusText
    throw new Error(msg)
  }

  if (response.headers.get('content-type')?.includes('application/json')) {
    const json = await response.json()
    // NestJS ApiResponseInterceptor wraps with { success, data, traceId }
    if (json && typeof json === 'object' && 'data' in json && 'success' in json) {
      return json.data as T
    }
    return json as T
  }

  return response as unknown as T
}

function get<T>(url: string): Promise<T> {
  return request<T>(url)
}

function post<T>(url: string, body?: unknown): Promise<T> {
  return request<T>(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  })
}

function put<T>(url: string, body: unknown): Promise<T> {
  return request<T>(url, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

function del<T>(url: string): Promise<T> {
  return request<T>(url, { method: 'DELETE' })
}

async function download(url: string, filename: string, options: RequestInit = {}): Promise<void> {
  const t = token()
  const headers: Record<string, string> = {
    ...(options.headers as Record<string, string> || {}),
  }
  if (t) headers.Authorization = `Bearer ${t}`

  const response = await fetch(`${BASE}${url}`, {
    ...options,
    headers,
  })

  if (!response.ok) {
    const body = await response.json().catch(() => ({}))
    throw new Error(body.error?.message || body.message || response.statusText || 'Download failed')
  }
  const blob = await response.blob()
  const link = document.createElement('a')
  link.href = URL.createObjectURL(blob)
  link.download = filename
  link.click()
  URL.revokeObjectURL(link.href)
}

export const api = {
  get, post, put, del, download,
  token, setToken, clearToken,
  TOKEN_KEY,
}
