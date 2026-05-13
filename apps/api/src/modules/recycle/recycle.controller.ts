import { Body, Controller, Delete, Get, Post, Query, UseGuards } from '@nestjs/common';
import type { PageQuery, PageResult, RecycleItemDto, RecycleSelectionItem } from '@cloudnote/shared-types';

import { AdminAuthGuard } from '../auth/admin-auth.guard';
import { RecycleService } from './recycle.service';

@Controller('admin/recycle')
@UseGuards(AdminAuthGuard)
export class RecycleController {
  constructor(private readonly recycle: RecycleService) {}

  @Get()
  list(@Query() query: PageQuery & { type?: string }): Promise<PageResult<RecycleItemDto>> {
    return this.recycle.list(query);
  }

  @Post('restore')
  restore(@Body() body: { items?: RecycleSelectionItem[] }): Promise<{ restored: number }> {
    return this.recycle.restore(body);
  }

  @Post('purge')
  purge(@Body() body: { items?: RecycleSelectionItem[] }): Promise<{ purged: number }> {
    return this.recycle.purge(body);
  }

  @Delete()
  purgeAll(): Promise<{ purged: number }> {
    return this.recycle.purgeAll();
  }
}
