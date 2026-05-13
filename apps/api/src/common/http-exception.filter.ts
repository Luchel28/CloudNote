import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus } from '@nestjs/common';

import { CloudNoteError } from './cloudnote-error';

function resolveHttpExceptionMessage(response: string | object): string {
  if (typeof response === 'string') return response;
  const value = response as { message?: string | string[]; error?: string };
  if (Array.isArray(value.message)) return value.message.join('; ');
  return value.message || value.error || 'Request failed';
}

@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse();
    const request = ctx.getRequest<{ traceId?: string }>();

    if (response.headersSent) return;

    if (exception instanceof CloudNoteError) {
      response.status(exception.statusCode).json({
        success: false,
        error: {
          code: exception.code,
          message: exception.message,
          details: exception.details,
        },
        traceId: request.traceId,
      });
      return;
    }

    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const exceptionResponse = exception.getResponse();
      response.status(status).json({
        success: false,
        error: {
          code: status === HttpStatus.UNAUTHORIZED ? 'AUTH_TOKEN_INVALID' : 'REQUEST_FAILED',
          message: resolveHttpExceptionMessage(exceptionResponse),
        },
        traceId: request.traceId,
      });
      return;
    }

    const error = exception instanceof Error ? exception : new Error(String(exception));
    console.error(error);
    response.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Internal server error',
      },
      traceId: request.traceId,
    });
  }
}
