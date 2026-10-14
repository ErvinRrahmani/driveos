import { createServer, type IncomingMessage } from 'node:http';
import { Writable } from 'node:stream';
import { pinoHttp } from 'pino-http';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { logContext, withLogContext } from '../src/kernel/logging/log-context.js';
import { pinoHttpOptions } from '../src/kernel/logging/pino-options.js';
import { StatusCodes } from 'http-status-codes';

function capture() {
  const lines: Record<string, unknown>[] = [];
  const sink = new Writable({
    write(chunk, _enc, done) {
      for (const line of chunk.toString().trim().split('\n')) lines.push(JSON.parse(line));
      done();
    },
  });
  return { lines, logger: pinoHttp({ ...pinoHttpOptions('info'), stream: sink }) };
}

function serverWith(
  logger: ReturnType<typeof capture>['logger'],
  principal?: Record<string, unknown>,
) {
  return createServer((req, res) => {
    logger(req, res);
    if (principal) (req as IncomingMessage & { principal?: unknown }).principal = principal;
    res.end('ok');
  });
}

describe('pinoHttpOptions', () => {
  it('writes one JSON line per request carrying the request id', async () => {
    const { lines, logger } = capture();

    const res = await request(serverWith(logger)).get('/v1/health').set('x-request-id', 'trace-1');

    expect(res.headers['x-request-id']).toBe('trace-1');
    const entry = lines.at(-1) ?? {};
    expect(entry.reqId).toBe('trace-1');
    expect(entry.req).toEqual({ method: 'GET', url: '/v1/health' });
    expect(entry.res).toEqual({ statusCode: StatusCodes.OK });
    expect(entry).not.toHaveProperty('schoolId');
    expect(entry).not.toHaveProperty('userId');
  });

  it('adds the school and user of the access token, and no contact details', async () => {
    const { lines, logger } = capture();
    const principal = {
      userId: 'user-1',
      schoolId: 'school-1',
      membershipId: 'membership-1',
      roles: ['owner'],
      phone: '+4915550000002',
      email: 'otto@example.com',
    };

    await request(serverWith(logger, principal)).get('/v1/school').set('x-request-id', 'trace-2');

    const entry = lines.at(-1) ?? {};
    expect(entry).toMatchObject({ reqId: 'trace-2', schoolId: 'school-1', userId: 'user-1' });
    expect(JSON.stringify(entry)).not.toContain('+4915550000002');
    expect(JSON.stringify(entry)).not.toContain('otto@example.com');
  });

  it('adds the event being delivered to every line logged while it is handled', () => {
    const { lines, logger } = capture();

    withLogContext({ eventId: 'event-1', subscriber: 'sub.one' }, () => {
      expect(logContext()).toEqual({ eventId: 'event-1', subscriber: 'sub.one' });
      logger.logger.info('inside');
    });
    logger.logger.info('outside');

    expect(lines.find((line) => line.msg === 'inside')).toMatchObject({
      eventId: 'event-1',
      subscriber: 'sub.one',
    });
    expect(lines.find((line) => line.msg === 'outside')).not.toHaveProperty('eventId');
  });
});
