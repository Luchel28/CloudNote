import { Module } from '@nestjs/common';

import { CloudNoteConfigModule } from '../../config/config.module';
import { DatabaseModule } from '../../database/database.module';
import { AuthModule } from '../auth/auth.module';
import { SystemController } from './system.controller';

@Module({
  imports: [CloudNoteConfigModule, DatabaseModule, AuthModule],
  controllers: [SystemController],
})
export class SystemModule {}
