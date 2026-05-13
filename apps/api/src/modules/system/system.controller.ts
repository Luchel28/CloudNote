import { Controller, Get, Post, UseGuards } from '@nestjs/common';
import type { HealthCheckDto, PublicConfigDto } from '@cloudnote/shared-types';

import { AppConfigService } from '../../config/app-config.service';
import { DatabaseService } from '../../database/database.service';
import { MigrationService } from '../../database/migration.service';
import { AdminAuthGuard } from '../auth/admin-auth.guard';

@Controller()
export class SystemController {
  constructor(
    private readonly config: AppConfigService,
    private readonly database: DatabaseService,
    private readonly migrations: MigrationService
  ) {}

  @Get('health')
  async health(): Promise<HealthCheckDto> {
    const db = await this.database.health();
    return {
      status: !this.database.configured || db.reachable ? 'ok' : 'degraded',
      time: new Date().toISOString(),
      apiVersion: this.config.apiVersion,
      database: {
        configured: this.database.configured,
        reachable: db.reachable,
        latencyMs: db.latencyMs,
        error: db.error,
      },
    };
  }

  @Get('open/config')
  getOpenConfig(): PublicConfigDto {
    return {
      publicBaseUrl: this.config.publicBaseUrl,
      maxUploadSizeMb: this.config.maxUploadSizeMb,
      maxUploadFiles: this.config.maxUploadFiles,
      apiVersion: this.config.apiVersion,
      uploadFieldName: 'files',
    };
  }

  @Get('admin/system/migrations')
  @UseGuards(AdminAuthGuard)
  async listMigrations(): Promise<{ applied: string[] }> {
    return { applied: await this.migrations.listAppliedMigrationIds() };
  }

  @Post('admin/system/migrations/run')
  @UseGuards(AdminAuthGuard)
  async runMigrations(): Promise<{ applied: string[]; skipped: string[] }> {
    return this.migrations.runPendingMigrations();
  }
}
