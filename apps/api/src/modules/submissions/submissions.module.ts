import { Module } from '@nestjs/common';

import { CloudNoteConfigModule } from '../../config/config.module';
import { DatabaseModule } from '../../database/database.module';
import { AuthModule } from '../auth/auth.module';
import { FilesModule } from '../files/files.module';
import { StorageModule } from '../storage/storage.module';
import { SubmissionsController } from './submissions.controller';
import { SubmissionsService } from './submissions.service';

@Module({
  imports: [CloudNoteConfigModule, DatabaseModule, AuthModule, StorageModule, FilesModule],
  controllers: [SubmissionsController],
  providers: [SubmissionsService],
  exports: [SubmissionsService],
})
export class SubmissionsModule {}
