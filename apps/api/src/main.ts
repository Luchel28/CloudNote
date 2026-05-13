import 'reflect-metadata';
import 'dotenv/config';
import { NestFactory } from '@nestjs/core';
import express from 'express';
import fs from 'fs';
import path from 'path';
import type { Express, NextFunction, Request, Response } from 'express';

import { AppModule } from './app.module';
import { AppConfigService } from './config/app-config.service';

function mountSpa(expressApp: Express, basePath: string, distDir: string, label: string): boolean {
  const indexPath = path.join(distDir, 'index.html');
  if (!fs.existsSync(indexPath)) {
    console.warn(`CloudNote ${label} web app was not mounted. Missing ${indexPath}`);
    return false;
  }

  expressApp.use((request: Request, response: Response, next: NextFunction) => {
    if ((request.method !== 'GET' && request.method !== 'HEAD') || request.path !== basePath) {
      next();
      return;
    }
    const query = request.originalUrl.includes('?') ? request.originalUrl.slice(request.originalUrl.indexOf('?')) : '';
    response.redirect(302, `${basePath}/${query}`);
  });
  expressApp.use(basePath, express.static(distDir, { index: false }));
  expressApp.use(basePath, (request: Request, response: Response, next: NextFunction) => {
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      next();
      return;
    }
    if (path.extname(request.path)) {
      next();
      return;
    }
    response.sendFile(indexPath);
  });
  console.log(`CloudNote ${label} web app is mounted at ${basePath}`);
  return true;
}

function mountPlatformWebApps(expressApp: Express, config: AppConfigService): void {
  const mountedStudent = mountSpa(expressApp, config.webStudentBasePath, config.webStudentDist, 'student');
  mountSpa(expressApp, config.webAdminBasePath, config.webAdminDist, 'admin');

  if (mountedStudent) {
    expressApp.get('/', (request: Request, response: Response) => {
      const query = request.originalUrl.includes('?') ? request.originalUrl.slice(request.originalUrl.indexOf('?')) : '';
      response.redirect(302, `${config.webStudentBasePath}/${query}`);
    });
  }
}

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule, { bufferLogs: true });
  const config = app.get(AppConfigService);
  const expressApp = app.getHttpAdapter().getInstance() as Express;

  app.enableCors({
    origin: true,
    credentials: true,
  });
  app.setGlobalPrefix(config.apiPrefix);
  mountPlatformWebApps(expressApp, config);

  await app.listen(config.port);
  console.log(`CloudNote platform API is running at ${config.publicBaseUrl}/${config.apiPrefix}`);
}

bootstrap().catch((error) => {
  console.error('Failed to start CloudNote platform API:', error);
  process.exit(1);
});
