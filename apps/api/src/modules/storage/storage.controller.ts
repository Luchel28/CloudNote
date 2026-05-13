import { Controller, Get, UseGuards } from '@nestjs/common';
import type { StorageSummaryDto } from '@cloudnote/shared-types';

import { AdminAuthGuard } from '../auth/admin-auth.guard';
import { StorageService } from './storage.service';

@Controller('admin/storage')
@UseGuards(AdminAuthGuard)
export class StorageController {
  constructor(private readonly storage: StorageService) {}

  @Get('summary')
  summary(): Promise<StorageSummaryDto> {
    return this.storage.getSummary();
  }
}
