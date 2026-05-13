import { Body, Controller, Get, Post, Query, Res, UseGuards } from '@nestjs/common';
import type { StatisticsDto } from '@cloudnote/shared-types';

import { parseOptionalPositiveInt } from '../../common/ids';
import { AdminAuthGuard } from '../auth/admin-auth.guard';
import { StatisticsService } from './statistics.service';

@Controller('admin/statistics')
@UseGuards(AdminAuthGuard)
export class StatisticsController {
  constructor(private readonly statistics: StatisticsService) {}

  @Get()
  async get(
    @Query('assignmentId') assignmentId?: string,
    @Query('status') status?: string,
    @Query('dateFrom') dateFrom?: string,
    @Query('dateTo') dateTo?: string
  ): Promise<StatisticsDto> {
    const query = {
      assignmentId: parseOptionalPositiveInt(assignmentId, 'Assignment ID'),
      status,
      dateFrom,
      dateTo,
    };
    const [statistics, trend] = await Promise.all([
      this.statistics.getStatistics(query),
      this.statistics.getSubmissionTrend(query),
    ]);
    return {
      ...statistics,
      trend,
    };
  }

  @Post('export')
  async exportCsv(
    @Body() body: { assignmentId?: string | number; status?: string; dateFrom?: string; dateTo?: string },
    @Res() response: { setHeader: (name: string, value: string) => void; send: (body: string) => void }
  ): Promise<void> {
    const result = await this.statistics.exportCsv({
      assignmentId: parseOptionalPositiveInt(body.assignmentId, 'Assignment ID'),
      status: body.status,
      dateFrom: body.dateFrom,
      dateTo: body.dateTo,
    });
    response.setHeader('Content-Type', 'text/csv; charset=utf-8');
    response.setHeader('Content-Disposition', `attachment; filename="${result.filename}"`);
    response.send(result.content);
  }
}
