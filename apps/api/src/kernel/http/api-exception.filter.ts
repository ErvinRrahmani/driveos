import {
  type ArgumentsHost,
  Catch,
  type ExceptionFilter,
  HttpException,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import type { ErrorResponse } from '@driveos/shared';
import type { Response } from 'express';
import { ZodError } from 'zod';
import { t } from '../i18n/i18n.js';
import { ApiError } from './api-error.js';
import {
  findPgError,
  PG_EXCLUSION_VIOLATION,
  PG_FOREIGN_KEY_VIOLATION,
  PG_UNIQUE_VIOLATION,
  isStillReferenced,
} from './pg-error.js';
import { StatusCodes } from 'http-status-codes';

export interface RenderedError {
  status: number;
  body: ErrorResponse;
}

// Error codes for framework HttpExceptions are the lower-cased status name. These
// statuses keep the names Nest's HttpStatus gave them, so the codes clients see
// stay the same now that names come from http-status-codes.
const LEGACY_STATUS_CODES: Partial<Record<StatusCodes, string>> = {
  [StatusCodes.EARLY_HINTS]: 'earlyhints',
  [StatusCodes.MULTIPLE_CHOICES]: 'ambiguous',
  [StatusCodes.MOVED_TEMPORARILY]: 'found',
  [StatusCodes.USE_PROXY]: 'http_error',
  [StatusCodes.REQUEST_TOO_LONG]: 'payload_too_large',
  [StatusCodes.REQUEST_URI_TOO_LONG]: 'uri_too_long',
  [StatusCodes.IM_A_TEAPOT]: 'i_am_a_teapot',
  [StatusCodes.INSUFFICIENT_SPACE_ON_RESOURCE]: 'http_error',
  [StatusCodes.METHOD_FAILURE]: 'http_error',
  [StatusCodes.MISDIRECTED_REQUEST]: 'misdirected',
  [StatusCodes.UPGRADE_REQUIRED]: 'http_error',
  [StatusCodes.REQUEST_HEADER_FIELDS_TOO_LARGE]: 'http_error',
  [StatusCodes.UNAVAILABLE_FOR_LEGAL_REASONS]: 'http_error',
  [StatusCodes.NETWORK_AUTHENTICATION_REQUIRED]: 'http_error',
};

function codeFromStatus(status: number): string {
  const legacy = LEGACY_STATUS_CODES[status as StatusCodes];
  if (legacy) return legacy;
  const name = StatusCodes[status];
  return typeof name === 'string' ? name.toLowerCase() : 'http_error';
}

function messageFromHttpException(exception: HttpException): string {
  const response = exception.getResponse();
  if (typeof response === 'string') return response;
  const message = (response as { message?: unknown }).message;
  if (typeof message === 'string') return message;
  if (Array.isArray(message)) return message.join('; ');
  return exception.message;
}

export function renderError(exception: unknown): RenderedError {
  if (exception instanceof ApiError) {
    const error: ErrorResponse['error'] = { code: exception.code, message: exception.message };
    if (exception.details !== undefined) error.details = exception.details;
    return { status: exception.status, body: { error } };
  }
  if (exception instanceof ZodError) {
    return {
      status: StatusCodes.BAD_REQUEST,
      body: {
        error: {
          code: 'validation_error',
          message: t('errors.validation'),
          details: { issues: exception.issues },
        },
      },
    };
  }
  if (exception instanceof NotFoundException) {
    return {
      status: StatusCodes.NOT_FOUND,
      body: { error: { code: 'not_found', message: t('errors.not_found') } },
    };
  }
  const pgError = findPgError(exception);
  if (
    pgError?.code === PG_EXCLUSION_VIOLATION ||
    pgError?.code === PG_UNIQUE_VIOLATION ||
    (pgError && isStillReferenced(pgError))
  ) {
    return {
      status: StatusCodes.CONFLICT,
      body: { error: { code: 'conflict', message: t('errors.conflict') } },
    };
  }
  if (pgError?.code === PG_FOREIGN_KEY_VIOLATION) {
    return {
      status: StatusCodes.NOT_FOUND,
      body: { error: { code: 'not_found', message: t('errors.not_found') } },
    };
  }
  if (exception instanceof HttpException) {
    const status = exception.getStatus();
    return {
      status,
      body: {
        error: { code: codeFromStatus(status), message: messageFromHttpException(exception) },
      },
    };
  }
  return {
    status: StatusCodes.INTERNAL_SERVER_ERROR,
    body: { error: { code: 'internal_error', message: t('errors.internal') } },
  };
}

@Catch()
export class ApiExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(ApiExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const { status, body } = renderError(exception);
    if (status >= StatusCodes.INTERNAL_SERVER_ERROR && status !== StatusCodes.NOT_IMPLEMENTED) {
      this.logger.error(exception instanceof Error ? exception : String(exception));
    }
    host.switchToHttp().getResponse<Response>().status(status).json(body);
  }
}
