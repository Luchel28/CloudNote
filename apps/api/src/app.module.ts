import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { APP_FILTER, APP_INTERCEPTOR } from '@nestjs/core';

import { ApiResponseInterceptor } from './common/api-response.interceptor';
import { HttpExceptionFilter } from './common/http-exception.filter';
import { TraceIdMiddleware } from './common/trace-id.middleware';
import { CloudNoteConfigModule } from './config/config.module';
import { DatabaseModule } from './database/database.module';
import { AssignmentsModule } from './modules/assignments/assignments.module';
import { AuthModule } from './modules/auth/auth.module';
import { FilesModule } from './modules/files/files.module';
import { RecycleModule } from './modules/recycle/recycle.module';
import { StatisticsModule } from './modules/statistics/statistics.module';
import { StorageModule } from './modules/storage/storage.module';
import { SubmissionsModule } from './modules/submissions/submissions.module';
import { SystemModule } from './modules/system/system.module';
import { TemplatesModule } from './modules/templates/templates.module';

@Module({
  imports: [
    CloudNoteConfigModule,
    DatabaseModule,
    AuthModule,
    SystemModule,
    AssignmentsModule,
    SubmissionsModule,
    TemplatesModule,
    StorageModule,
    StatisticsModule,
    RecycleModule,
    FilesModule,
  ],
  providers: [
    {
      provide: APP_INTERCEPTOR,
      useClass: ApiResponseInterceptor,
    },
    {
      provide: APP_FILTER,
      useClass: HttpExceptionFilter,
    },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(TraceIdMiddleware).forRoutes('{*path}');
  }
}
