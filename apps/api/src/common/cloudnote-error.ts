import { HttpStatus } from '@nestjs/common';

export class CloudNoteError extends Error {
  constructor(
    public readonly statusCode: number,
    public readonly code: string,
    message: string,
    public readonly details?: unknown
  ) {
    super(message);
    this.name = 'CloudNoteError';
  }

  static badRequest(code: string, message: string, details?: unknown): CloudNoteError {
    return new CloudNoteError(HttpStatus.BAD_REQUEST, code, message, details);
  }

  static unauthorized(code: string, message: string, details?: unknown): CloudNoteError {
    return new CloudNoteError(HttpStatus.UNAUTHORIZED, code, message, details);
  }

  static forbidden(code: string, message: string, details?: unknown): CloudNoteError {
    return new CloudNoteError(HttpStatus.FORBIDDEN, code, message, details);
  }

  static notFound(message = 'Resource not found', details?: unknown): CloudNoteError {
    return new CloudNoteError(HttpStatus.NOT_FOUND, 'NOT_FOUND', message, details);
  }

  static conflict(message: string, details?: unknown): CloudNoteError {
    return new CloudNoteError(HttpStatus.CONFLICT, 'CONFLICT', message, details);
  }

  static databaseUnavailable(message = 'PostgreSQL database is not configured or unavailable', details?: unknown): CloudNoteError {
    return new CloudNoteError(HttpStatus.SERVICE_UNAVAILABLE, 'DATABASE_UNAVAILABLE', message, details);
  }
}
