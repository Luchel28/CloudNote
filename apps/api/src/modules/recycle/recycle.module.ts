import { Module } from '@nestjs/common';

import { DatabaseModule } from '../../database/database.module';
import { AuthModule } from '../auth/auth.module';
import { StorageModule } from '../storage/storage.module';
import { RecycleController } from './recycle.controller';
import { RecycleService } from './recycle.service';

@Module({
  imports: [DatabaseModule, AuthModule, StorageModule],
  controllers: [RecycleController],
  providers: [RecycleService],
})
export class RecycleModule {}
