import { Body, Controller, Delete, Get, Param, Post, Put, Query, UseGuards } from '@nestjs/common';
import type { AssignmentDto, AssignmentMutationInput, PageQuery, PageResult, PublicAssignmentQuery } from '@cloudnote/shared-types';

import { parseOptionalPositiveInt, parsePositiveInt } from '../../common/ids';
import { AdminAuthGuard } from '../auth/admin-auth.guard';
import { AssignmentsService } from './assignments.service';

@Controller()
export class AssignmentsController {
  constructor(private readonly assignments: AssignmentsService) {}

  @Get('open/assignments')
  getOpenAssignment(@Query() query: PublicAssignmentQuery & { id?: string }): Promise<AssignmentDto> {
    return this.assignments.findPublic({
      ...query,
      id: parseOptionalPositiveInt(query.id, 'Assignment ID'),
    });
  }

  @Get('admin/assignments')
  @UseGuards(AdminAuthGuard)
  list(@Query() query: PageQuery & { status?: string }): Promise<PageResult<AssignmentDto>> {
    return this.assignments.list(query);
  }

  @Post('admin/assignments')
  @UseGuards(AdminAuthGuard)
  create(@Body() body: AssignmentMutationInput): Promise<AssignmentDto> {
    return this.assignments.create(body);
  }

  @Get('admin/assignments/:id')
  @UseGuards(AdminAuthGuard)
  get(@Param('id') id: string): Promise<AssignmentDto> {
    return this.assignments.findAdmin(parsePositiveInt(id, 'Assignment ID'));
  }

  @Put('admin/assignments/:id')
  @UseGuards(AdminAuthGuard)
  update(@Param('id') id: string, @Body() body: AssignmentMutationInput): Promise<AssignmentDto> {
    return this.assignments.update(parsePositiveInt(id, 'Assignment ID'), body);
  }

  @Delete('admin/assignments/:id')
  @UseGuards(AdminAuthGuard)
  delete(@Param('id') id: string): Promise<{ deleted: boolean }> {
    return this.assignments.softDelete(parsePositiveInt(id, 'Assignment ID'));
  }
}
