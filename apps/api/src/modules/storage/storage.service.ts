import { Injectable } from '@nestjs/common';
import fs from 'fs/promises';
import path from 'path';
import { randomUUID } from 'crypto';
import type { StorageSummaryDto } from '@cloudnote/shared-types';

import { AppConfigService } from '../../config/app-config.service';

export interface UploadedFileLike {
  originalname: string;
  mimetype: string;
  size: number;
  buffer?: Buffer;
  path?: string;
}

export interface StoredFileResult {
  originalFilename: string;
  storedFilename: string;
  storageKey: string;
  size: number;
  mimeType: string;
}

function safeName(value: string): string {
  return String(value || 'file')
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, '_')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 180);
}

function decodeOriginalName(originalName: string): string {
  const maybeMojibake = /[\u0080-\u009f\u00a0-\u00ff]/.test(originalName);
  if (!maybeMojibake) return originalName;
  const decoded = Buffer.from(originalName, 'latin1').toString('utf8');
  if (!decoded || decoded === originalName || decoded.includes('\uFFFD')) return originalName;
  return /[^\x00-\x7f]/.test(decoded) ? decoded : originalName;
}

@Injectable()
export class StorageService {
  constructor(private readonly config: AppConfigService) {}

  get uploadDir(): string {
    return this.config.uploadDir;
  }

  async saveUploadedFile(file: UploadedFileLike): Promise<StoredFileResult> {
    await fs.mkdir(this.config.uploadDir, { recursive: true });
    const originalFilename = safeName(decodeOriginalName(file.originalname || 'file') || file.originalname || 'file');
    const ext = path.extname(originalFilename);
    const storedFilename = `${Date.now()}-${randomUUID()}${ext}`;
    const storageKey = storedFilename;
    const target = this.resolveStoredFilePath(storageKey);
    if (file.path) {
      await fs
        .rename(file.path, target)
        .catch(async () => {
          await fs.copyFile(file.path || '', target);
          await fs.unlink(file.path || '').catch(() => undefined);
        });
    } else {
      await fs.writeFile(target, file.buffer || Buffer.alloc(0));
    }
    return {
      originalFilename,
      storedFilename,
      storageKey,
      size: file.size,
      mimeType: file.mimetype || '',
    };
  }

  resolveStoredFilePath(storageKey: string): string {
    const root = path.resolve(this.config.uploadDir);
    const fallbackName = path.basename(String(storageKey || 'file'));
    const safeFallbackName = fallbackName && fallbackName !== '.' && fallbackName !== '..' ? fallbackName : 'file';
    const normalized = String(storageKey || '')
      .replace(/\\/g, '/')
      .split('/')
      .filter((part) => part && part !== '.' && part !== '..')
      .join('/');
    const resolved = path.resolve(root, normalized || safeFallbackName);
    return resolved === root || !resolved.startsWith(`${root}${path.sep}`) ? path.join(root, safeFallbackName) : resolved;
  }

  async removeStoredFile(storageKey: string): Promise<void> {
    const target = this.resolveStoredFilePath(storageKey);
    await fs.unlink(target).catch(() => undefined);
  }

  async cleanupUploadedFile(file: UploadedFileLike): Promise<void> {
    if (!file.path) return;
    await fs.unlink(file.path).catch(() => undefined);
  }

  async getSummary(): Promise<StorageSummaryDto> {
    await fs.mkdir(this.config.uploadDir, { recursive: true });
    const entries = await fs.readdir(this.config.uploadDir, { withFileTypes: true }).catch(() => []);
    let totalFiles = 0;
    let totalBytes = 0;
    for (const entry of entries) {
      if (!entry.isFile()) continue;
      const stat = await fs.stat(path.join(this.config.uploadDir, entry.name)).catch(() => null);
      if (!stat) continue;
      totalFiles += 1;
      totalBytes += stat.size;
    }
    return {
      provider: 'local',
      uploadDir: this.config.uploadDir,
      totalFiles,
      totalBytes,
      cleanableBytes: 0,
      databaseBytes: 0,
    };
  }
}
