import type {
  AdminLoginRequest,
  AdminLoginResponse,
  ApiEnvelope,
  AssignmentDto,
  AssignmentMutationInput,
  HealthCheckDto,
  PageQuery,
  PageResult,
  PublicAssignmentQuery,
  PublicConfigDto,
  RecycleItemDto,
  RecycleSelectionItem,
  StatisticsDto,
  StorageSummaryDto,
  SubmissionDto,
  SubmissionUploadResponse,
  TemplateDto,
  TemplateMutationInput,
  UserDto,
} from '@cloudnote/shared-types';

export interface CloudNoteSdkOptions {
  baseUrl?: string;
  token?: string;
  fetchImpl?: typeof fetch;
}

export class CloudNoteApiError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly status: number,
    public readonly details?: unknown
  ) {
    super(message);
    this.name = 'CloudNoteApiError';
  }
}

function buildQuery(query: object = {}): string {
  const params = new URLSearchParams();
  Object.entries(query as Record<string, unknown>).forEach(([key, value]) => {
    if (value === undefined || value === null || value === '') return;
    params.set(key, String(value));
  });
  const text = params.toString();
  return text ? `?${text}` : '';
}

export class CloudNoteClient {
  private token = '';
  private readonly baseUrl: string;
  private readonly fetchImpl: typeof fetch;

  constructor(options: CloudNoteSdkOptions = {}) {
    this.baseUrl = (options.baseUrl || '/api/v1').replace(/\/+$/, '');
    this.token = options.token || '';
    this.fetchImpl = options.fetchImpl || fetch;
  }

  setToken(token: string): void {
    this.token = token;
  }

  clearToken(): void {
    this.token = '';
  }

  async health(): Promise<HealthCheckDto> {
    return this.get('/health');
  }

  async getPublicConfig(): Promise<PublicConfigDto> {
    return this.get('/open/config');
  }

  async login(input: AdminLoginRequest): Promise<AdminLoginResponse> {
    const result = await this.post<AdminLoginResponse>('/admin/auth/login', input);
    this.setToken(result.token);
    return result;
  }

  async me(): Promise<UserDto> {
    return this.get('/admin/auth/me');
  }

  async listAssignments(query: PageQuery & { status?: string } = {}): Promise<PageResult<AssignmentDto>> {
    return this.get(`/admin/assignments${buildQuery(query)}`);
  }

  async getAssignment(id: number): Promise<AssignmentDto> {
    return this.get(`/admin/assignments/${id}`);
  }

  async getPublicAssignment(query: PublicAssignmentQuery): Promise<AssignmentDto> {
    return this.get(`/open/assignments${buildQuery(query)}`);
  }

  async createAssignment(input: AssignmentMutationInput): Promise<AssignmentDto> {
    return this.post('/admin/assignments', input);
  }

  async updateAssignment(id: number, input: AssignmentMutationInput): Promise<AssignmentDto> {
    return this.put(`/admin/assignments/${id}`, input);
  }

  async deleteAssignment(id: number, confirm = false): Promise<{ deleted: boolean }> {
    return this.delete(`/admin/assignments/${id}${buildQuery({ confirm })}`);
  }

  async listSubmissions(query: PageQuery & { assignmentId?: number; status?: string } = {}): Promise<PageResult<SubmissionDto>> {
    return this.get(`/admin/submissions${buildQuery(query)}`);
  }

  async uploadSubmission(formData: FormData): Promise<SubmissionUploadResponse> {
    return this.request('/open/submissions', { method: 'POST', body: formData });
  }

  async deleteSubmission(id: number): Promise<{ deleted: boolean }> {
    return this.delete(`/admin/submissions/${id}`);
  }

  async exportSubmissions(query: PageQuery & { assignmentId?: number; status?: string } = {}): Promise<Response> {
    return this.raw('/admin/submissions/export', {
      method: 'POST',
      body: JSON.stringify(query),
      headers: { 'Content-Type': 'application/json' },
    });
  }

  async listTemplates(query: PageQuery & { category?: string } = {}): Promise<PageResult<TemplateDto>> {
    return this.get(`/admin/templates${buildQuery(query)}`);
  }

  async createTemplate(input: TemplateMutationInput): Promise<TemplateDto> {
    return this.post('/admin/templates', input);
  }

  async updateTemplate(id: number, input: TemplateMutationInput): Promise<TemplateDto> {
    return this.put(`/admin/templates/${id}`, input);
  }

  async deleteTemplate(id: number): Promise<{ deleted: boolean }> {
    return this.delete(`/admin/templates/${id}`);
  }

  async getStatistics(query: PageQuery & { assignmentId?: number } = {}): Promise<StatisticsDto> {
    return this.get(`/admin/statistics${buildQuery(query)}`);
  }

  async exportStatistics(query: { assignmentId?: number } = {}): Promise<Response> {
    return this.raw('/admin/statistics/export', {
      method: 'POST',
      body: JSON.stringify(query),
      headers: { 'Content-Type': 'application/json' },
    });
  }

  async getStorageSummary(): Promise<StorageSummaryDto> {
    return this.get('/admin/storage/summary');
  }

  async listRecycleItems(query: PageQuery & { type?: string } = {}): Promise<PageResult<RecycleItemDto>> {
    return this.get(`/admin/recycle${buildQuery(query)}`);
  }

  async restoreRecycleItems(items: RecycleSelectionItem[]): Promise<{ restored: number }> {
    return this.post('/admin/recycle/restore', { items });
  }

  async purgeRecycleItems(items: RecycleSelectionItem[]): Promise<{ purged: number }> {
    return this.post('/admin/recycle/purge', { items });
  }

  async emptyRecycleBin(): Promise<{ purged: number }> {
    return this.delete('/admin/recycle');
  }

  async downloadSubmission(id: number): Promise<Response> {
    return this.raw(`/admin/submissions/${id}/download`);
  }

  async downloadFile(id: number): Promise<Response> {
    return this.raw(`/admin/files/${id}/download`);
  }

  async deleteFile(id: number): Promise<{ deleted: boolean }> {
    return this.delete(`/admin/files/${id}`);
  }

  async downloadAllFiles(query: { assignmentId?: number } = {}): Promise<Response> {
    return this.raw(`/admin/files/download-all${buildQuery(query)}`);
  }

  async listMigrations(): Promise<{ applied: string[] }> {
    return this.get('/admin/system/migrations');
  }

  async runMigrations(): Promise<{ applied: string[]; skipped: string[] }> {
    return this.post('/admin/system/migrations/run');
  }

  private async get<T>(path: string): Promise<T> {
    return this.request<T>(path, { method: 'GET' });
  }

  private async post<T>(path: string, body?: unknown): Promise<T> {
    return this.request<T>(path, { method: 'POST', body: JSON.stringify(body) });
  }

  private async put<T>(path: string, body?: unknown): Promise<T> {
    return this.request<T>(path, { method: 'PUT', body: JSON.stringify(body) });
  }

  private async delete<T>(path: string): Promise<T> {
    return this.request<T>(path, { method: 'DELETE' });
  }

  private async raw(path: string, init: RequestInit = {}): Promise<Response> {
    const headers = new Headers(init.headers);
    if (this.token) headers.set('Authorization', `Bearer ${this.token}`);
    const response = await this.fetchImpl(`${this.baseUrl}${path}`, { ...init, headers });
    if (!response.ok) {
      const payload = (await response.clone().json().catch(() => null)) as ApiEnvelope<unknown> | null;
      const error = payload && !payload.success ? payload.error : { code: 'HTTP_ERROR', message: response.statusText };
      throw new CloudNoteApiError(error.code, error.message, response.status, error.details);
    }
    return response;
  }

  private async request<T>(path: string, init: RequestInit = {}): Promise<T> {
    const headers = new Headers(init.headers);
    const isFormData = init.body instanceof FormData;
    if (!isFormData && init.body !== undefined) headers.set('Content-Type', 'application/json');
    if (this.token) headers.set('Authorization', `Bearer ${this.token}`);

    const response = await this.fetchImpl(`${this.baseUrl}${path}`, { ...init, headers });
    const payload = (await response.json().catch(() => null)) as ApiEnvelope<T> | null;
    if (!response.ok || !payload?.success) {
      const error = payload && !payload.success ? payload.error : { code: 'HTTP_ERROR', message: response.statusText };
      throw new CloudNoteApiError(error.code, error.message, response.status, error.details);
    }
    return payload.data;
  }
}
