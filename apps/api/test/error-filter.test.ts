import { BadRequestException, Controller, Get, type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { z } from 'zod';
import { ApiError } from '../src/kernel/http/api-error.js';
import { ApiExceptionFilter } from '../src/kernel/http/api-exception.filter.js';
import {
  ConflictError,
  NotFoundError,
  notFound,
  notImplemented,
} from '../src/kernel/http/errors.js';
import { StatusCodes } from 'http-status-codes';

@Controller('boom')
class BoomController {
  @Get('api-error')
  apiError(): never {
    throw new ApiError(StatusCodes.CONFLICT, 'lesson_conflict', 'The instructor is busy.', {
      lessonId: 'l1',
    });
  }

  @Get('http')
  http(): never {
    throw new BadRequestException('limit must be positive');
  }

  @Get('zod')
  zod(): never {
    z.object({ limit: z.number().int().positive() }).parse({ limit: -1 });
    throw new Error('unreachable');
  }

  @Get('not-found')
  notFound(): never {
    throw new NotFoundError();
  }

  @Get('not-found-custom')
  notFoundCustom(): never {
    throw notFound('No such lesson.');
  }

  @Get('conflict')
  conflict(): never {
    throw new ConflictError('slot_taken', 'The slot is taken.', { slotId: 's1' });
  }

  @Get('not-implemented')
  notImplemented(): never {
    throw notImplemented();
  }

  @Get('crash')
  crash(): never {
    throw new Error('secret internal detail');
  }
}

describe('ApiExceptionFilter', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ controllers: [BoomController] }).compile();
    app = moduleRef.createNestApplication({ logger: false });
    app.useGlobalFilters(new ApiExceptionFilter());
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('renders an ApiError with its status, code, message and details', async () => {
    const res = await request(app.getHttpServer())
      .get('/boom/api-error')
      .expect(StatusCodes.CONFLICT);
    expect(res.body).toEqual({
      error: {
        code: 'lesson_conflict',
        message: 'The instructor is busy.',
        details: { lessonId: 'l1' },
      },
    });
  });

  it('maps Nest HTTP exceptions to a snake_case code', async () => {
    const res = await request(app.getHttpServer())
      .get('/boom/http')
      .expect(StatusCodes.BAD_REQUEST);
    expect(res.body).toEqual({ error: { code: 'bad_request', message: 'limit must be positive' } });
  });

  it('maps zod errors to 400 validation_error with issues as details', async () => {
    const res = await request(app.getHttpServer()).get('/boom/zod').expect(StatusCodes.BAD_REQUEST);
    expect(res.body.error.code).toBe('validation_error');
    expect(res.body.error.details.issues[0].path).toEqual(['limit']);
  });

  it('renders NotFoundError as 404 not_found with the default message', async () => {
    const res = await request(app.getHttpServer())
      .get('/boom/not-found')
      .expect(StatusCodes.NOT_FOUND);
    expect(res.body).toEqual({
      error: { code: 'not_found', message: 'The requested resource was not found.' },
    });
  });

  it('renders notFound(message) as 404 not_found with that message', async () => {
    const res = await request(app.getHttpServer())
      .get('/boom/not-found-custom')
      .expect(StatusCodes.NOT_FOUND);
    expect(res.body).toEqual({ error: { code: 'not_found', message: 'No such lesson.' } });
  });

  it('renders ConflictError as 409 with the code chosen by the handler', async () => {
    const res = await request(app.getHttpServer())
      .get('/boom/conflict')
      .expect(StatusCodes.CONFLICT);
    expect(res.body).toEqual({
      error: { code: 'slot_taken', message: 'The slot is taken.', details: { slotId: 's1' } },
    });
  });

  it('renders notImplemented() as 501 not_implemented', async () => {
    const res = await request(app.getHttpServer())
      .get('/boom/not-implemented')
      .expect(StatusCodes.NOT_IMPLEMENTED);
    expect(res.body).toEqual({
      error: { code: 'not_implemented', message: 'This endpoint is not available yet.' },
    });
  });

  it('hides unexpected errors behind 500 internal_error', async () => {
    const res = await request(app.getHttpServer())
      .get('/boom/crash')
      .expect(StatusCodes.INTERNAL_SERVER_ERROR);
    expect(res.body).toEqual({
      error: { code: 'internal_error', message: 'Something went wrong. Please try again.' },
    });
  });
});
