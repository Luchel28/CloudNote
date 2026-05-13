const BASE_URL = '/api/v1';

export interface PublicConfig {
  publicBaseUrl: string;
  maxUploadSizeMb: number;
  maxUploadFiles: number;
  apiVersion: string;
  uploadFieldName: string;
}

export interface AssignmentFieldRule {
  min?: string;
  max?: string;
  length?: string;
  options?: string[];
}

export type AssignmentFieldType =
  | 'name'
  | 'phone'
  | 'idcard'
  | 'email'
  | 'birth_date'
  | 'single_line'
  | 'numeric'
  | 'digits'
  | 'single_choice'
  | 'multiple_choice'
  | 'multi_line'
  | 'datetime'
  | 'positive_integer';

export interface AssignmentField {
  key: string;
  label: string;
  type: AssignmentFieldType;
  required: boolean;
  enabled: boolean;
  visible: boolean;
  placeholder?: string;
  helpText?: string;
  rules?: AssignmentFieldRule;
}

export interface AssignmentFileRules {
  requiredUpload: boolean;
  fileType: string;
  allowedExtensions: string[];
  enableLimit: boolean;
  maxFileSizeMB: number;
  maxFileCount: number;
  enableRename: boolean;
  renameFields: string[];
  allowFolder: boolean;
}

export interface Assignment {
  id: number;
  title: string;
  description: string;
  deadline: string | null;
  status: string;
  effectiveStatus: 'ongoing' | 'expired' | 'ended' | 'archived' | 'deleted';
  shareCode: string;
  collectFields: AssignmentField[];
  fileRules: AssignmentFileRules;
  allowLate: boolean;
  allowRepeat: boolean;
  repeatMode: 'new' | 'overwrite';
}

export interface SubmissionReceiptFile {
  id: number;
  originalFilename: string;
  size: number;
  mimeType: string;
}

export interface SubmissionReceipt {
  id: number;
  assignmentId: number;
  assignmentTitle: string;
  submittedAt: string;
  submitterData: Record<string, string>;
  files: SubmissionReceiptFile[];
}

interface ApiEnvelope<T> {
  success: boolean;
  data?: T;
  error?: {
    code?: string;
    message?: string;
  };
}

async function parseJsonSafe<T>(response: Response): Promise<ApiEnvelope<T> | null> {
  try {
    return (await response.json()) as ApiEnvelope<T>;
  } catch {
    return null;
  }
}

async function request<T>(path: string): Promise<T> {
  const response = await fetch(`${BASE_URL}${path}`);
  const payload = await parseJsonSafe<T>(response);
  if (!response.ok || !payload?.success) {
    throw new Error(payload?.error?.message || response.statusText || '请求失败');
  }
  return payload.data as T;
}

export function getPublicConfig(): Promise<PublicConfig> {
  return request<PublicConfig>('/open/config');
}

export function getPublicAssignment(query: string): Promise<Assignment> {
  return request<Assignment>(`/open/assignments?${query}`);
}

export function uploadSubmission(formData: FormData, onProgress?: (percent: number) => void): Promise<SubmissionReceipt> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', `${BASE_URL}/open/submissions`);
    xhr.timeout = 120000;

    xhr.upload.addEventListener('progress', (event) => {
      if (!event.lengthComputable || !onProgress) return;
      onProgress(Math.round((event.loaded / event.total) * 100));
    });

    xhr.addEventListener('load', () => {
      let payload: ApiEnvelope<SubmissionReceipt> | null = null;
      try {
        payload = JSON.parse(xhr.responseText || '{}') as ApiEnvelope<SubmissionReceipt>;
      } catch {
        payload = null;
      }

      if (xhr.status >= 200 && xhr.status < 300 && payload?.success && payload.data) {
        resolve(payload.data);
        return;
      }

      reject(new Error(payload?.error?.message || '上传失败，请稍后重试'));
    });

    xhr.addEventListener('error', () => reject(new Error('网络错误，上传失败')));
    xhr.addEventListener('timeout', () => reject(new Error('上传超时，请检查网络后重试')));
    xhr.send(formData);
  });
}
