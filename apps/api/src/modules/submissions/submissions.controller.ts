import type { Writable } from 'stream';
import { randomUUID } from 'crypto';
import fs from 'fs';
import path from 'path';
import { Body, Controller, Delete, Get, Param, Post, Query, Res, UploadedFiles, UseGuards, UseInterceptors } from '@nestjs/common';
import { FileFieldsInterceptor } from '@nestjs/platform-express';
import type { PageQuery, PageResult, SubmissionDto, SubmissionUploadResponse } from '@cloudnote/shared-types';

import { parseOptionalPositiveInt, parsePositiveInt } from '../../common/ids';
import { AppConfigService } from '../../config/app-config.service';
import { AdminAuthGuard } from '../auth/admin-auth.guard';
import { FilesService } from '../files/files.service';
import { UploadedFileLike } from '../storage/storage.service';
import { SubmissionsService } from './submissions.service';

interface ZipArchive {
  on(event: 'error', handler: (error: Error) => void): ZipArchive;
  pipe(stream: Writable): Writable;
  file(path: string, data: { name: string }): ZipArchive;
  finalize(): Promise<void>;
}

const createArchive = require('archiver') as (format: 'zip', options?: { zlib?: { level?: number } }) => ZipArchive;
const multer = require('multer') as any;

const uploadLimits = {
  files: Number(process.env.MAX_UPLOAD_FILES || 20),
  fileSize: Number(process.env.MAX_UPLOAD_SIZE_MB || 500) * 1024 * 1024,
};
const uploadRootDir = path.resolve(process.cwd(), process.env.UPLOAD_DIR || './uploads');
const uploadTempDir = path.resolve(process.cwd(), process.env.UPLOAD_TMP_DIR || path.join(uploadRootDir, '.tmp'));
fs.mkdirSync(uploadTempDir, { recursive: true });
const uploadStorage = multer.diskStorage({
  destination: (_request: unknown, _file: unknown, callback: (error: Error | null, destination: string) => void) => callback(null, uploadTempDir),
  filename: (_request: unknown, file: { originalname?: string }, callback: (error: Error | null, filename: string) => void) => {
    const ext = path.extname(file.originalname || '');
    callback(null, `${Date.now()}-${randomUUID()}${ext}`);
  },
});

@Controller()
export class SubmissionsController {
  constructor(
    private readonly config: AppConfigService,
    private readonly submissions: SubmissionsService,
    private readonly files: FilesService
  ) {}

  @Get('admin/submissions')
  @UseGuards(AdminAuthGuard)
  list(@Query() query: PageQuery & { assignmentId?: string; status?: string }): Promise<PageResult<SubmissionDto>> {
    return this.submissions.list({ ...query, assignmentId: parseOptionalPositiveInt(query.assignmentId, 'Assignment ID') });
  }

  @Post('open/submissions')
  @UseInterceptors(
    FileFieldsInterceptor(
      [
        { name: 'files', maxCount: uploadLimits.files },
        { name: 'homeworkFile', maxCount: uploadLimits.files },
      ],
      { limits: uploadLimits, storage: uploadStorage }
    )
  )
  upload(@Body() body: Record<string, unknown>, @UploadedFiles() files: Record<string, UploadedFileLike[] | undefined>): Promise<SubmissionUploadResponse> {
    const uploadedFiles = [...(files.files || []), ...(files.homeworkFile || [])].slice(0, this.config.maxUploadFiles);
    return this.submissions.upload(body, uploadedFiles);
  }

  @Delete('admin/submissions/:id')
  @UseGuards(AdminAuthGuard)
  delete(@Param('id') id: string): Promise<{ deleted: boolean }> {
    return this.submissions.softDelete(parsePositiveInt(id, 'Submission ID'));
  }

  @Post('admin/submissions/bulk-delete')
  @UseGuards(AdminAuthGuard)
  bulkDelete(@Body() body: { ids?: Array<string | number> }): Promise<{ deleted: number }> {
    return this.submissions.bulkSoftDelete(Array.isArray(body?.ids) ? body.ids.map((id) => parsePositiveInt(id, 'Submission ID')) : []);
  }

  @Post('admin/submissions/export')
  @UseGuards(AdminAuthGuard)
  async exportCsv(
    @Body() body: PageQuery & { assignmentId?: string | number; status?: string },
    @Res() response: { setHeader: (name: string, value: string) => void; send: (body: string) => void }
  ): Promise<void> {
    const result = await this.submissions.exportCsv({ ...body, assignmentId: parseOptionalPositiveInt(body.assignmentId, 'Assignment ID') });
    response.setHeader('Content-Type', 'text/csv; charset=utf-8');
    response.setHeader('Content-Disposition', `attachment; filename="${result.filename}"`);
    response.send(result.content);
  }

  @Get('admin/submissions/:id/download')
  @UseGuards(AdminAuthGuard)
  async download(
    @Param('id') id: string,
    @Res() response: {
      attachment: (filename: string) => void;
      download: (path: string, filename: string) => void;
      end: () => void;
      headersSent?: boolean;
      status: (code: number) => { json: (body: unknown) => void };
    }
  ): Promise<void> {
    const submissionId = parsePositiveInt(id, 'Submission ID');
    const files = await this.files.resolveSubmissionDownload(submissionId);
    if (files.length === 1) {
      response.download(files[0].path, files[0].filename);
      return;
    }

    response.attachment(`cloudnote-submission-${submissionId}.zip`);
    const archive = createArchive('zip', { zlib: { level: 9 } });
    archive.on('error', (error) => {
      console.error(error);
      if (!response.headersSent) response.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Failed to archive files.' } });
      else response.end();
    });
    archive.pipe(response as unknown as Writable);
    files.forEach((file) => archive.file(file.path, { name: file.filename }));
    await archive.finalize();
  }
}
