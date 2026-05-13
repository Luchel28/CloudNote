import type { Writable } from 'stream';
import { Controller, Delete, Get, Param, Query, Res, UseGuards } from '@nestjs/common';

import { parseOptionalPositiveInt, parsePositiveInt } from '../../common/ids';
import { AdminAuthGuard } from '../auth/admin-auth.guard';
import { FilesService } from './files.service';

interface ZipArchive {
  on(event: 'error', handler: (error: Error) => void): ZipArchive;
  pipe(stream: Writable): Writable;
  file(path: string, data: { name: string }): ZipArchive;
  finalize(): Promise<void>;
}

const createArchive = require('archiver') as (format: 'zip', options?: { zlib?: { level?: number } }) => ZipArchive;

@Controller('admin/files')
@UseGuards(AdminAuthGuard)
export class FilesController {
  constructor(private readonly files: FilesService) {}

  @Get('download-all')
  async downloadAll(
    @Query('assignmentId') assignmentId: string | undefined,
    @Res()
    response: {
      attachment: (filename: string) => void;
      end: () => void;
      headersSent?: boolean;
      status: (code: number) => { json: (body: unknown) => void };
    }
  ): Promise<void> {
    const archiveData = await this.files.resolveArchiveDownload({ assignmentId: parseOptionalPositiveInt(assignmentId, 'Assignment ID') });
    response.attachment(archiveData.filename);
    const archive = createArchive('zip', { zlib: { level: 9 } });
    archive.on('error', (error) => {
      console.error(error);
      if (!response.headersSent) response.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Failed to archive files.' } });
      else response.end();
    });
    archive.pipe(response as unknown as Writable);
    archiveData.files.forEach((file) => archive.file(file.path, { name: file.archiveName }));
    await archive.finalize();
  }

  @Get(':id/download')
  async download(@Param('id') id: string, @Res() response: { download: (path: string, filename: string) => void }): Promise<void> {
    const file = await this.files.resolveDownload(parsePositiveInt(id, 'File ID'));
    response.download(file.path, file.filename);
  }

  @Delete(':id')
  delete(@Param('id') id: string): Promise<{ deleted: boolean }> {
    return this.files.softDelete(parsePositiveInt(id, 'File ID'));
  }
}
