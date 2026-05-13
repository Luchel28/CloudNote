import { Module } from '@nestjs/common';

import { CloudNoteConfigModule } from '../../config/config.module';
import { DatabaseModule } from '../../database/database.module';
import { AdminAuthGuard } from './admin-auth.guard';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';

@Module({
  imports: [CloudNoteConfigModule, DatabaseModule],
  controllers: [AuthController],
  providers: [AuthService, AdminAuthGuard],
  exports: [AuthService, AdminAuthGuard],
})
export class AuthModule {}
