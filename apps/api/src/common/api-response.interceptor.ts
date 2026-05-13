import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { Observable, map } from 'rxjs';

@Injectable()
export class ApiResponseInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const request = context.switchToHttp().getRequest<{ traceId?: string }>();
    return next.handle().pipe(
      map((data) => {
        if (data && typeof data === 'object' && ('success' in data || '__raw' in data)) return data;
        return {
          success: true,
          data: data ?? null,
          traceId: request.traceId,
        };
      })
    );
  }
}
