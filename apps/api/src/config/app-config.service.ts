import { Injectable } from '@nestjs/common';
import path from 'path';

function parsePositiveInteger(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function normalizeBaseUrl(value: string | undefined, fallback: string): string {
  return String(value || fallback).replace(/\/+$/, '');
}

function normalizeRoutePrefix(value: string | undefined, fallback: string): string {
  const fallbackText = fallback.replace(/^\/+|\/+$/g, '');
  const trimmed = String(value || fallback).trim().replace(/^\/+|\/+$/g, '');
  return `/${trimmed || fallbackText}`;
}

@Injectable()
export class AppConfigService {
  readonly rootDir = process.cwd();
  readonly apiVersion = 'v1';
  readonly apiPrefix = process.env.API_PREFIX || 'api/v1';
  readonly port = parsePositiveInteger(process.env.API_PORT || process.env.PORT, 3001);
  readonly publicBaseUrl = normalizeBaseUrl(process.env.PUBLIC_BASE_URL, `http://localhost:${this.port}`);
  readonly uploadDir = this.resolveAppPath(process.env.UPLOAD_DIR, './uploads');
  readonly uploadTempDir = this.resolveAppPath(process.env.UPLOAD_TMP_DIR, path.join(this.uploadDir, '.tmp'));
  readonly maxUploadSizeMb = parsePositiveInteger(process.env.MAX_UPLOAD_SIZE_MB, 500);
  readonly maxUploadFiles = parsePositiveInteger(process.env.MAX_UPLOAD_FILES, 20);
  readonly webAdminBasePath = normalizeRoutePrefix(process.env.WEB_ADMIN_BASE_PATH, '/admin');
  readonly webStudentBasePath = normalizeRoutePrefix(process.env.WEB_STUDENT_BASE_PATH, '/student');
  readonly webAdminDist = this.resolveAppPath(process.env.WEB_ADMIN_DIST, './apps/web-admin/dist');
  readonly webStudentDist = this.resolveAppPath(process.env.WEB_STUDENT_DIST, './apps/web-student/dist');
  readonly adminUsername = String(process.env.ADMIN_USERNAME || 'admin').trim() || 'admin';
  readonly adminPassword = String(process.env.ADMIN_PASSWORD || 'admin123456');
  readonly adminTokenTtlSeconds = parsePositiveInteger(process.env.ADMIN_TOKEN_EXPIRE_HOURS, 12) * 60 * 60;
  readonly jwtSecret = process.env.ADMIN_JWT_SECRET || process.env.SESSION_SECRET || 'cloudnote-local-dev-secret';
  readonly requireDatabase = parseFlag(process.env.CLOUDNOTE_REQUIRE_DATABASE, false);
  readonly autoRunMigrations = parseFlag(process.env.CLOUDNOTE_RUN_MIGRATIONS, true);
  readonly databaseUrl = process.env.DATABASE_URL || process.env.POSTGRES_URL || '';
  readonly pgHost = process.env.PGHOST || '';
  readonly pgPort = parsePositiveInteger(process.env.PGPORT, 5432);
  readonly pgDatabase = process.env.PGDATABASE || '';
  readonly pgUser = process.env.PGUSER || '';
  readonly pgPassword = process.env.PGPASSWORD || '';

  constructor() {
    this.assertProductionSecrets();
  }

  get maxUploadSizeBytes(): number {
    return this.maxUploadSizeMb * 1024 * 1024;
  }

  get hasDatabaseConfig(): boolean {
    return Boolean(this.databaseUrl || (this.pgHost && this.pgDatabase && this.pgUser));
  }

  resolveAppPath(value: string | undefined, fallback: string): string {
    const target = String(value || fallback);
    return path.isAbsolute(target) ? target : path.resolve(this.rootDir, target);
  }

  private assertProductionSecrets(): void {
    if (process.env.NODE_ENV !== 'production') return;
    const password = this.adminPassword.trim();
    if (!password || password === 'admin123456') {
      throw new Error('Production deployments must set a strong ADMIN_PASSWORD.');
    }
    const secret = this.jwtSecret.trim();
    if (!secret || secret === 'cloudnote-local-dev-secret' || secret === 'change-me-in-production') {
      throw new Error('Production deployments must set a strong ADMIN_JWT_SECRET or SESSION_SECRET.');
    }
  }
}

function parseFlag(value: string | undefined, fallback: boolean): boolean {
  if (value === undefined) return fallback;
  return ['1', 'true', 'yes', 'on'].includes(value.trim().toLowerCase());
}
