export type ApiErrorCode =
  | 'AUTH_INVALID_CREDENTIALS'
  | 'AUTH_TOO_MANY_ATTEMPTS'
  | 'AUTH_TOKEN_EXPIRED'
  | 'AUTH_TOKEN_INVALID'
  | 'DATABASE_NOT_CONFIGURED'
  | 'DATABASE_UNAVAILABLE'
  | 'FORBIDDEN'
  | 'NOT_FOUND'
  | 'VALIDATION_FAILED'
  | 'UPLOAD_REJECTED'
  | 'CONFLICT'
  | 'INTERNAL_ERROR';

export interface ApiErrorBody {
  code: ApiErrorCode | string;
  message: string;
  details?: unknown;
}

export type ApiEnvelope<T> =
  | {
      success: true;
      data: T;
      traceId?: string;
    }
  | {
      success: false;
      error: ApiErrorBody;
      traceId?: string;
    };

export interface PageQuery {
  page?: number;
  perPage?: number;
  search?: string;
  sort?: string;
}

export interface PageResult<T> {
  items: T[];
  total: number;
  page: number;
  perPage: number;
  totalPages: number;
}

export type UserRole = 'admin' | 'teacher' | 'student';
export type UserStatus = 'active' | 'disabled';

export interface UserDto {
  id: string;
  username: string;
  displayName: string;
  role: UserRole;
  status: UserStatus;
}

export interface AdminLoginRequest {
  username?: string;
  password: string;
}

export interface AdminLoginResponse {
  token: string;
  tokenType: 'Bearer';
  expiresIn: number;
  expiresAt: string;
  user: UserDto;
}

export interface PublicConfigDto {
  publicBaseUrl: string;
  maxUploadSizeMb: number;
  maxUploadFiles: number;
  apiVersion: string;
  uploadFieldName: 'files';
}

export type AssignmentStatus = 'ongoing' | 'ended' | 'archived' | 'deleted';
export type EffectiveAssignmentStatus = AssignmentStatus | 'expired';
export type RepeatMode = 'new' | 'overwrite';
export type DownloadStructure = 'task-file' | 'task-field-file';
export type TemplateCategory = 'course' | 'exam' | 'material';
export type TemplateVisibility = 'private' | 'class';
export type FieldCategory = 'basic' | 'custom';
export type FieldType =
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

export interface FieldRuleDto {
  min?: string;
  max?: string;
  length?: string;
  options?: string[];
}

export interface AssignmentFieldDto {
  key: string;
  label: string;
  type: FieldType;
  category: FieldCategory;
  required: boolean;
  enabled: boolean;
  visible: boolean;
  placeholder?: string;
  helpText?: string;
  rules?: FieldRuleDto;
  system?: boolean;
}

export interface FileRuleDto {
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

export interface AssignmentDto {
  id: number;
  title: string;
  description: string;
  deadline: string | null;
  status: AssignmentStatus;
  effectiveStatus: EffectiveAssignmentStatus;
  shareCode: string;
  createdAt: string;
  updatedAt: string;
  deletedAt?: string | null;
  previousStatus?: AssignmentStatus;
  submissionCount: number;
  submitterCount: number;
  collectFields: AssignmentFieldDto[];
  fileRules: FileRuleDto;
  allowLate: boolean;
  allowRepeat: boolean;
  repeatMode: RepeatMode;
  downloadStructure: DownloadStructure;
}

export interface AssignmentMutationInput {
  title: string;
  description?: string;
  deadline?: string | null;
  status?: AssignmentStatus;
  collectFields?: AssignmentFieldDto[];
  fileRules?: Partial<FileRuleDto>;
  allowLate?: boolean;
  allowRepeat?: boolean;
  repeatMode?: RepeatMode;
  downloadStructure?: DownloadStructure;
}

export interface PublicAssignmentQuery {
  id?: number;
  code?: string;
}

export interface SubmissionFileDto {
  id: number;
  originalFilename: string;
  storedFilename?: string;
  size: number;
  mimeType: string;
  createdAt?: string;
}

export interface SubmissionDto {
  id: number;
  assignmentId: number;
  assignmentTitle?: string;
  submitterData: Record<string, string>;
  studentName: string;
  studentId: string;
  homeworkTitle: string;
  uploadTime: string;
  isLate: boolean;
  files: SubmissionFileDto[];
}

export interface SubmissionUploadResponse {
  id: number;
  assignmentId: number;
  assignmentTitle: string;
  submittedAt: string;
  submitterData: Record<string, string>;
  files: Pick<SubmissionFileDto, 'id' | 'originalFilename' | 'size' | 'mimeType'>[];
}

export interface TemplateDto {
  id: number;
  name: string;
  category: TemplateCategory;
  visibility: TemplateVisibility;
  data: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
  deletedAt?: string | null;
}

export interface TemplateMutationInput {
  name: string;
  category?: TemplateCategory;
  visibility?: TemplateVisibility;
  data: Record<string, unknown>;
}

export interface StatisticsSummaryDto {
  assignmentCount: number;
  submittedCount: number;
  submitterCount: number;
  lateCount: number;
}

export interface AssignmentStatisticsDto {
  assignmentId: number;
  assignmentTitle: string;
  effectiveStatus: EffectiveAssignmentStatus;
  submittedCount: number;
  submitterCount: number;
  lateCount: number;
  deadline: string | null;
}

export interface StatisticsDto {
  summary: StatisticsSummaryDto;
  items: AssignmentStatisticsDto[];
  trend?: Array<{
    day: string;
    count: number;
  }>;
}

export type RecycleItemType = 'task' | 'submission' | 'file' | 'template';

export interface RecycleItemDto {
  type: RecycleItemType;
  id: number;
  title: string;
  deletedAt: string;
  source: string;
  remainingDays?: number;
  size?: number;
  fileCount?: number;
  recoverable?: boolean;
  restoreDisabledReason?: string;
}

export interface RecycleSelectionItem {
  type: RecycleItemType;
  id: number;
}

export interface StorageSummaryDto {
  provider: 'local';
  uploadDir: string;
  totalFiles: number;
  totalBytes: number;
  cleanableBytes?: number;
  databaseBytes?: number;
}

export interface HealthCheckDto {
  status: 'ok' | 'degraded';
  time: string;
  apiVersion: string;
  database: {
    configured: boolean;
    reachable: boolean;
    latencyMs?: number;
    error?: string;
  };
}
