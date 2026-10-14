import { randomUUID } from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { Options } from 'pino-http';
import { logContext } from './log-context.js';

const REQUEST_ID_HEADER = 'x-request-id';
const SAFE_REQUEST_ID = /^[A-Za-z0-9._:-]{1,128}$/;

function requestId(req: IncomingMessage, res: ServerResponse): string {
  const incoming = req.headers[REQUEST_ID_HEADER];
  const id =
    typeof incoming === 'string' && SAFE_REQUEST_ID.test(incoming) ? incoming : randomUUID();
  res.setHeader(REQUEST_ID_HEADER, id);
  return id;
}

interface TokenScope {
  schoolId?: unknown;
  userId?: unknown;
}

function tokenScope(req: IncomingMessage): Record<string, string> {
  const principal = (req as IncomingMessage & { principal?: TokenScope }).principal;
  const scope: Record<string, string> = {};
  if (typeof principal?.schoolId === 'string') scope.schoolId = principal.schoolId;
  if (typeof principal?.userId === 'string') scope.userId = principal.userId;
  return scope;
}

export function pinoHttpOptions(level: string): Options {
  return {
    level,
    genReqId: requestId,
    quietReqLogger: true,
    customAttributeKeys: { reqId: 'reqId' },
    customProps: tokenScope,
    mixin: () => ({ ...logContext() }),
    serializers: {
      req: (req: { method: string; url: string }) => ({ method: req.method, url: req.url }),
      res: (res: { statusCode: number }) => ({ statusCode: res.statusCode }),
    },
  };
}
