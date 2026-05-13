import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';

import { AuthService } from './auth.service';

@Injectable()
export class AdminAuthGuard implements CanActivate {
  constructor(private readonly authService: AuthService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<{ headers: Record<string, string | string[] | undefined>; user?: unknown }>();
    const rawHeader = request.headers.authorization;
    const headerValue = Array.isArray(rawHeader) ? rawHeader[0] : rawHeader;
    request.user = await this.authService.verifyBearerToken(headerValue);
    return true;
  }
}
