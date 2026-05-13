import { Body, Controller, Get, Post, Req, UseGuards } from '@nestjs/common';
import type { AdminLoginRequest, AdminLoginResponse, UserDto } from '@cloudnote/shared-types';
import type { Request } from 'express';

import { AuthService } from './auth.service';
import { AdminAuthGuard } from './admin-auth.guard';

@Controller('admin/auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('login')
  login(@Body() body: AdminLoginRequest, @Req() request: Request): Promise<AdminLoginResponse> {
    return this.authService.login(body, getLoginSource(request));
  }

  @Get('me')
  @UseGuards(AdminAuthGuard)
  me(@Req() request: { user: UserDto }): UserDto {
    return request.user;
  }
}

function getLoginSource(request: Request): string {
  const forwarded = String(request.headers['x-forwarded-for'] || '')
    .split(',')[0]
    .trim();
  return forwarded || request.ip || request.socket?.remoteAddress || 'unknown';
}
