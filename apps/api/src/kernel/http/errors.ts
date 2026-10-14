import { t } from '../i18n/i18n.js';
import { ApiError } from './api-error.js';
import { findPgError, PG_EXCLUSION_VIOLATION } from './pg-error.js';
import { StatusCodes } from 'http-status-codes';

export class NotFoundError extends ApiError {
  constructor(message: string = t('errors.not_found'), details?: unknown) {
    super(StatusCodes.NOT_FOUND, 'not_found', message, details);
    this.name = 'NotFoundError';
  }
}

export function notFound(message?: string, details?: unknown): NotFoundError {
  return new NotFoundError(message, details);
}

export function invalidField(path: (string | number)[], message: string): ApiError {
  return new ApiError(StatusCodes.BAD_REQUEST, 'validation_error', t('errors.validation'), {
    issues: [{ path, message }],
  });
}

export class ConflictError extends ApiError {
  constructor(code: string, message: string = t('errors.conflict'), details?: unknown) {
    super(StatusCodes.CONFLICT, code, message, details);
    this.name = 'ConflictError';
  }
}

export class NotImplementedError extends ApiError {
  constructor() {
    super(StatusCodes.NOT_IMPLEMENTED, 'not_implemented', t('errors.not_implemented'));
    this.name = 'NotImplementedError';
  }
}

export function notImplemented(): NotImplementedError {
  return new NotImplementedError();
}

export function mapExclusion(err: unknown, codes: Readonly<Record<string, string>>): never {
  const pgError = findPgError(err);
  const code =
    pgError?.code === PG_EXCLUSION_VIOLATION && pgError.constraint
      ? codes[pgError.constraint]
      : undefined;
  if (code) throw new ConflictError(code);
  throw err;
}
