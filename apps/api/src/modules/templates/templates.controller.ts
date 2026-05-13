import { Body, Controller, Delete, Get, Param, Post, Put, Query, UseGuards } from '@nestjs/common';
import type { PageQuery, PageResult, TemplateDto, TemplateMutationInput } from '@cloudnote/shared-types';

import { parsePositiveInt } from '../../common/ids';
import { AdminAuthGuard } from '../auth/admin-auth.guard';
import { TemplatesService } from './templates.service';

@Controller('admin/templates')
@UseGuards(AdminAuthGuard)
export class TemplatesController {
  constructor(private readonly templates: TemplatesService) {}

  @Get()
  list(@Query() query: PageQuery & { category?: string }): Promise<PageResult<TemplateDto>> {
    return this.templates.list(query);
  }

  @Post()
  create(@Body() body: TemplateMutationInput): Promise<TemplateDto> {
    return this.templates.create(body);
  }

  @Put(':id')
  update(@Param('id') id: string, @Body() body: TemplateMutationInput): Promise<TemplateDto> {
    return this.templates.update(parsePositiveInt(id, 'Template ID'), body);
  }

  @Delete(':id')
  delete(@Param('id') id: string): Promise<{ deleted: boolean }> {
    return this.templates.softDelete(parsePositiveInt(id, 'Template ID'));
  }
}
