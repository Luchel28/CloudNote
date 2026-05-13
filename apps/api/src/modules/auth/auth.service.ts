import { Injectable } from '@nestjs/common';
import type { AdminLoginRequest, AdminLoginResponse, UserDto } from '@cloudnote/shared-types';

import { CloudNoteError } from '../../common/cloudnote-error';
import { AppConfigService } from '../../config/app-config.service';
import { DatabaseService } from '../../database/database.service';
import { hashPassword, verifyPassword } from './password';
import { createSignedAdminToken, verifySignedAdminToken } from './token';

interface UserRow {
  id: string;
  username: string;
  display_name: string;
  password_hash: string | null;
  role: 'admin' | 'teacher' | 'student';
  status: 'active' | 'disabled';
}

interface LoginFailureRecord {
  count: number;
  lockedUntil: number;
}

const ADMIN_LOGIN_MAX_FAILURES = 5;
const ADMIN_LOGIN_LOCK_MS = 10 * 60 * 1000;

@Injectable()
export class AuthService {
  private readonly loginFailureStore = new Map<string, LoginFailureRecord>();

  constructor(
    private readonly config: AppConfigService,
    private readonly database: DatabaseService
  ) {}

  async login(input: AdminLoginRequest, source = 'unknown'): Promise<AdminLoginResponse> {
    this.assertLoginAllowed(source);
    const username = String(input.username || this.config.adminUsername).trim() || this.config.adminUsername;
    let user: UserDto;
    try {
      user = this.database.configured ? await this.loginWithDatabase(username, input.password) : this.loginWithBootstrap(username, input.password);
    } catch (error) {
      const record = this.recordLoginFailure(source);
      if (record.lockedUntil > Date.now()) {
        throw new CloudNoteError(429, 'AUTH_TOO_MANY_ATTEMPTS', 'Too many login attempts. Please try again later.');
      }
      throw error;
    }
    this.clearLoginFailure(source);

    const token = createSignedAdminToken({ sub: user.id, username: user.username, role: 'admin' }, this.config.jwtSecret, this.config.adminTokenTtlSeconds);
    return {
      token,
      tokenType: 'Bearer',
      expiresIn: this.config.adminTokenTtlSeconds,
      expiresAt: new Date(Date.now() + this.config.adminTokenTtlSeconds * 1000).toISOString(),
      user,
    };
  }

  private assertLoginAllowed(source: string): void {
    const record = this.getLoginFailureRecord(source);
    if (record.lockedUntil > Date.now()) {
      throw new CloudNoteError(429, 'AUTH_TOO_MANY_ATTEMPTS', 'Too many login attempts. Please try again later.');
    }
  }

  private getLoginFailureRecord(source: string, now = Date.now()): LoginFailureRecord {
    const key = this.normalizeLoginSource(source);
    const record = this.loginFailureStore.get(key);
    if (!record) return { count: 0, lockedUntil: 0 };
    if (record.lockedUntil && record.lockedUntil <= now) {
      this.loginFailureStore.delete(key);
      return { count: 0, lockedUntil: 0 };
    }
    return record;
  }

  private recordLoginFailure(source: string, now = Date.now()): LoginFailureRecord {
    const key = this.normalizeLoginSource(source);
    const record = this.getLoginFailureRecord(key, now);
    const nextRecord = {
      count: Number(record.count || 0) + 1,
      lockedUntil: Number(record.lockedUntil || 0),
    };
    if (nextRecord.count >= ADMIN_LOGIN_MAX_FAILURES) {
      nextRecord.lockedUntil = now + ADMIN_LOGIN_LOCK_MS;
    }
    this.loginFailureStore.set(key, nextRecord);
    return nextRecord;
  }

  private clearLoginFailure(source: string): void {
    this.loginFailureStore.delete(this.normalizeLoginSource(source));
  }

  private normalizeLoginSource(source: string): string {
    return String(source || 'unknown').trim() || 'unknown';
  }

  async verifyBearerToken(headerValue: string | undefined): Promise<UserDto> {
    const token = String(headerValue || '').replace(/^Bearer\s+/i, '').trim();
    if (!token) throw CloudNoteError.unauthorized('AUTH_TOKEN_INVALID', 'Missing administrator token.');
    const payload = verifySignedAdminToken(token, this.config.jwtSecret);
    if (!payload) throw CloudNoteError.unauthorized('AUTH_TOKEN_INVALID', 'Administrator token is invalid or expired.');
    if (this.database.configured && payload.sub !== 'bootstrap-admin') {
      const row = await this.database.queryOne<UserRow>(
        'SELECT id, username, display_name, password_hash, role, status FROM users WHERE id = $1',
        [payload.sub]
      );
      if (!row || row.status !== 'active' || row.role !== 'admin') throw CloudNoteError.unauthorized('AUTH_TOKEN_INVALID', 'Administrator token is no longer valid.');
      return this.mapUser(row);
    }
    return {
      id: payload.sub,
      username: payload.username,
      displayName: payload.username,
      role: 'admin',
      status: 'active',
    };
  }

  getBootstrapAdmin(): UserDto {
    return {
      id: 'bootstrap-admin',
      username: this.config.adminUsername,
      displayName: this.config.adminUsername,
      role: 'admin',
      status: 'active',
    };
  }

  private loginWithBootstrap(username: string, password: string): UserDto {
    if (username !== this.config.adminUsername || password !== this.config.adminPassword) {
      throw CloudNoteError.unauthorized('AUTH_INVALID_CREDENTIALS', 'Invalid administrator credentials.');
    }
    return this.getBootstrapAdmin();
  }

  private async loginWithDatabase(username: string, password: string): Promise<UserDto> {
    const row = await this.findOrCreateBootstrapAdmin(username);
    if (!row || row.status !== 'active' || row.role !== 'admin') {
      throw CloudNoteError.unauthorized('AUTH_INVALID_CREDENTIALS', 'Invalid administrator credentials.');
    }
    let ok = await verifyPassword(password, row.password_hash);
    let activeRow = row;
    if (!ok && row.username === this.config.adminUsername && password === this.config.adminPassword) {
      activeRow = await this.updateBootstrapAdminPassword(row.id);
      ok = true;
    }
    if (!ok) throw CloudNoteError.unauthorized('AUTH_INVALID_CREDENTIALS', 'Invalid administrator credentials.');
    return this.mapUser(activeRow);
  }

  private async findOrCreateBootstrapAdmin(username: string): Promise<UserRow | null> {
    const row = await this.database.queryOne<UserRow>(
      'SELECT id, username, display_name, password_hash, role, status FROM users WHERE lower(username) = lower($1)',
      [username]
    );
    if (row) {
      if (!row.password_hash && row.username === this.config.adminUsername) {
        const passwordHash = await hashPassword(this.config.adminPassword);
        const updated = await this.database.queryOne<UserRow>(
          `
            UPDATE users
            SET password_hash = $1, updated_at = now()
            WHERE id = $2
            RETURNING id, username, display_name, password_hash, role, status
          `,
          [passwordHash, row.id]
        );
        return updated || row;
      }
      return row;
    }

    if (username !== this.config.adminUsername) return null;
    const passwordHash = await hashPassword(this.config.adminPassword);
    return this.database.queryOne<UserRow>(
      `
        INSERT INTO users (username, display_name, password_hash, role, status)
        VALUES ($1, $2, $3, 'admin', 'active')
        RETURNING id, username, display_name, password_hash, role, status
      `,
      [this.config.adminUsername, this.config.adminUsername, passwordHash]
    );
  }

  private async updateBootstrapAdminPassword(id: string): Promise<UserRow> {
    const passwordHash = await hashPassword(this.config.adminPassword);
    const updated = await this.database.queryOne<UserRow>(
      `
        UPDATE users
        SET password_hash = $1, updated_at = now()
        WHERE id = $2
        RETURNING id, username, display_name, password_hash, role, status
      `,
      [passwordHash, id]
    );
    if (!updated) throw CloudNoteError.unauthorized('AUTH_INVALID_CREDENTIALS', 'Invalid administrator credentials.');
    return updated;
  }

  private mapUser(row: UserRow): UserDto {
    return {
      id: row.id,
      username: row.username,
      displayName: row.display_name || row.username,
      role: row.role,
      status: row.status,
    };
  }
}
