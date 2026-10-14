import {
  type CallHandler,
  type ExecutionContext,
  Injectable,
  type NestInterceptor,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { sql } from 'drizzle-orm';
import type { Request, Response } from 'express';
import { from, lastValueFrom, type Observable } from 'rxjs';
import { ApiError } from '../http/api-error.js';
import { t } from '../i18n/i18n.js';
import { TenantContext } from '../tenant/tenant-context.js';
import {
  IDEMPOTENCY_KEY_HEADER,
  IDEMPOTENCY_KEY_MAX_LENGTH,
  isIdempotentRoute,
} from './idempotent.decorator.js';
import { requestHash } from './request-hash.js';
import { StatusCodes } from 'http-status-codes';

type StoredResponse = {
  request_hash: string;
  response_status: number;
  response_body: unknown;
};

@Injectable()
export class IdempotencyInterceptor implements NestInterceptor {
  constructor(
    private readonly reflector: Reflector,
    private readonly tenant: TenantContext,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (context.getType() !== 'http' || !isIdempotentRoute(this.reflector, context)) {
      return next.handle();
    }
    const http = context.switchToHttp();
    return from(this.handle(http.getRequest<Request>(), http.getResponse<Response>(), next));
  }

  private async handle(req: Request, res: Response, next: CallHandler): Promise<unknown> {
    const key = req.header(IDEMPOTENCY_KEY_HEADER)?.trim();
    if (!key) {
      throw new ApiError(
        StatusCodes.BAD_REQUEST,
        'idempotency_key_required',
        t('errors.idempotency_key_required'),
      );
    }
    if (key.length > IDEMPOTENCY_KEY_MAX_LENGTH) {
      throw new ApiError(
        StatusCodes.BAD_REQUEST,
        'idempotency_key_invalid',
        t('errors.idempotency_key_invalid'),
      );
    }
    if (!this.tenant.active) {
      throw new Error('IdempotencyInterceptor must run inside the tenant transaction');
    }
    const schoolId = this.tenant.schoolId;
    if (!schoolId)
      throw new ApiError(StatusCodes.FORBIDDEN, 'school_required', t('errors.school_required'));
    const tx = this.tenant.tx;
    const hash = requestHash({ method: req.method, path: req.originalUrl, body: req.body });

    await tx.execute(
      sql`select pg_advisory_xact_lock(hashtext('idempotency_keys'), hashtext(${schoolId} || ':' || ${key}))`,
    );
    const found = await tx.execute<StoredResponse>(
      sql`select request_hash, response_status, response_body from idempotency_keys
        where school_id = ${schoolId} and key = ${key}`,
    );
    const stored = found.rows[0];
    if (stored) {
      if (stored.request_hash !== hash) {
        throw new ApiError(
          StatusCodes.UNPROCESSABLE_ENTITY,
          'idempotency_key_reused',
          t('errors.idempotency_key_reused'),
        );
      }
      res.status(stored.response_status);
      return stored.response_body;
    }

    const result: unknown = await lastValueFrom(next.handle(), { defaultValue: undefined });
    const endpoint = `${req.method} ${(req.route as { path?: string } | undefined)?.path ?? req.path}`;
    await tx.execute(
      sql`insert into idempotency_keys
        (school_id, key, endpoint, request_hash, response_status, response_body)
        values (${schoolId}, ${key}, ${endpoint}, ${hash}, ${res.statusCode},
        ${JSON.stringify(result ?? null)}::jsonb)`,
    );
    return result;
  }
}
