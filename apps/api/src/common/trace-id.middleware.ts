import { Injectable, NestMiddleware } from '@nestjs/common';
import { randomUUID } from 'crypto';

@Injectable()
export class TraceIdMiddleware implements NestMiddleware {
  use(req: { headers: Record<string, string | string[] | undefined>; traceId?: string }, res: { setHeader: (name: string, value: string) => void }, next: () => void): void {
    const incoming = req.headers['x-request-id'];
    const traceId = Array.isArray(incoming) ? incoming[0] : incoming || randomUUID();
    req.traceId = traceId;
    res.setHeader('X-Request-Id', traceId);
    next();
  }
}
