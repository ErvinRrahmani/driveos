import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import * as shared from '@driveos/shared';
import { beforeAll, describe, expect, it } from 'vitest';
import { z } from 'zod';
import { emitOpenApi } from '../src/kernel/openapi/emit.js';
import {
  expressKey,
  IDEMPOTENT_ROUTES,
  PUBLIC_STUB_ROUTES,
  SPEC_ROUTES,
  type SpecRoute,
  STUB_ROUTES,
} from './support/spec-routes.js';
import { StatusCodes } from 'http-status-codes';

describe('emitOpenApi', () => {
  it('writes the document with the health route and shared schemas', async () => {
    const dir = await mkdtemp(path.join(tmpdir(), 'driveos-openapi-'));
    const file = path.join(dir, 'openapi.json');

    await emitOpenApi(file);

    const doc = JSON.parse(await readFile(file, 'utf8'));
    expect(doc.openapi).toMatch(/^3\./);
    expect(doc.paths['/v1/health'].get.responses['200'].content['application/json'].schema).toEqual(
      {
        $ref: '#/components/schemas/HealthResponse',
      },
    );
    expect(doc.components.schemas.HealthResponse.required).toEqual(['status', 'service']);
    expect(doc.components.schemas.ErrorResponse.properties.error).toBeDefined();
  });

  it('does not include test fixtures such as the ping module', async () => {
    const dir = await mkdtemp(path.join(tmpdir(), 'driveos-openapi-'));
    const file = path.join(dir, 'openapi.json');

    await emitOpenApi(file);

    const doc = JSON.parse(await readFile(file, 'utf8'));
    expect(Object.keys(doc.paths).filter((p) => p.includes('ping'))).toEqual([]);
  });

  it('documents the identity routes with shared request and response schemas', async () => {
    const dir = await mkdtemp(path.join(tmpdir(), 'driveos-openapi-'));
    const file = path.join(dir, 'openapi.json');

    await emitOpenApi(file);

    const doc = JSON.parse(await readFile(file, 'utf8'));
    const ref = (name: string) => ({ $ref: `#/components/schemas/${name}` });
    const body = (op: { requestBody: { content: Record<string, { schema: unknown }> } }) =>
      op.requestBody.content['application/json']?.schema;
    expect(doc.paths['/v1/auth/code'].post.operationId).toBe('requestLoginCode');
    expect(body(doc.paths['/v1/auth/code'].post)).toEqual(ref('RequestLoginCodeRequest'));
    expect(doc.paths['/v1/auth/code'].post.responses['202']).toBeDefined();
    expect(
      doc.paths['/v1/auth/verify'].post.responses['200'].content['application/json'].schema,
    ).toEqual(ref('SessionResponse'));
    expect(doc.paths['/v1/auth/refresh'].post.operationId).toBe('refreshSession');
    expect(doc.paths['/v1/auth/logout'].post.responses['204']).toBeDefined();
    expect(doc.paths['/v1/me'].get.responses['200'].content['application/json'].schema).toEqual(
      ref('MeResponse'),
    );
    expect(body(doc.paths['/v1/me/switch-school'].post)).toEqual(ref('SwitchSchoolRequest'));
    expect(doc.paths['/v1/devices'].post.responses['201']).toBeDefined();
    expect(doc.paths['/v1/me/tenant']).toBeUndefined();
    expect(doc.components.schemas.SwitchSchoolRequest.required).toEqual(['membershipId']);
    expect(doc.components.schemas.SessionResponse.required).toEqual([
      'accessToken',
      'refreshToken',
      'expiresIn',
      'memberships',
      'activeMembershipId',
    ]);
  });
});

type Operation = {
  operationId?: string;
  tags?: string[];
  security?: Record<string, string[]>[];
  parameters?: { name: string; in: string; required?: boolean; schema?: unknown }[];
  requestBody?: { content: Record<string, { schema: { $ref?: string } }> };
  responses: Record<string, { content?: Record<string, { schema: { $ref?: string } }> }>;
  'x-permissions'?: { mode: string; permissions: string[] };
};

const HTTP_METHODS = ['get', 'post', 'put', 'patch', 'delete'] as const;

describe('OpenAPI document completeness (SPEC §8)', () => {
  let doc: {
    paths: Record<string, Partial<Record<(typeof HTTP_METHODS)[number], Operation>>>;
    components: { schemas: Record<string, unknown> };
  };

  beforeAll(async () => {
    const dir = await mkdtemp(path.join(tmpdir(), 'driveos-openapi-'));
    const file = path.join(dir, 'openapi.json');
    await emitOpenApi(file);
    doc = JSON.parse(await readFile(file, 'utf8'));
  }, 60_000);

  const operation = (route: SpecRoute): Operation => {
    const op = doc.paths[route.path]?.[route.method.toLowerCase() as (typeof HTTP_METHODS)[number]];
    if (!op) throw new Error(`${route.method} ${route.path} is missing from openapi.json`);
    return op;
  };

  const componentOf = (schema: { $ref?: string } | undefined): string => {
    const name = schema?.$ref?.replace('#/components/schemas/', '');
    if (!name || !doc.components.schemas[name]) {
      throw new Error(`expected a $ref to a registered component, got ${JSON.stringify(schema)}`);
    }
    return name;
  };

  it('documents exactly the SPEC §8 routes plus the health check', () => {
    const documented = Object.entries(doc.paths).flatMap(([p, item]) =>
      HTTP_METHODS.filter((m) => item[m]).map((m) => `${m.toUpperCase()} ${p}`),
    );
    const expected = [...SPEC_ROUTES.map((r) => `${r.method} ${r.path}`), 'GET /v1/health'];
    expect([...documented].sort()).toEqual([...expected].sort());
  });

  it.each(SPEC_ROUTES.map((route) => [`${route.method} ${route.path}`, route] as const))(
    '%s has an operationId, its tag, path params and a typed success response',
    (_key, route) => {
      const op = operation(route);
      expect(op.operationId).toMatch(/^[A-Za-z][A-Za-z.]+$/);
      expect(op.tags).toContain(route.tag);
      for (const [, name] of route.path.matchAll(/\{([A-Za-z0-9_]+)\}/g)) {
        expect(op.parameters).toContainEqual(
          expect.objectContaining({ name, in: 'path', required: true }),
        );
      }
      const response = op.responses[String(route.status)];
      expect(response, `no ${route.status} response`).toBeDefined();
      if (route.status === StatusCodes.NO_CONTENT) {
        expect(response?.content).toBeUndefined();
      } else if (route.produces) {
        expect(response?.content?.[route.produces]?.schema).toEqual({
          type: 'string',
          format: 'binary',
        });
      } else {
        componentOf(response?.content?.['application/json']?.schema);
      }
      const body = op.requestBody?.content['application/json']?.schema;
      if (body) componentOf(body);
    },
  );

  it.each(STUB_ROUTES.map((route) => [`${route.method} ${route.path}`, route] as const))(
    '%s (stub) declares bearer auth and a permission, or is public',
    (_key, route) => {
      const op = operation(route);
      if (PUBLIC_STUB_ROUTES.includes(expressKey(route))) {
        expect(op.security).toBeUndefined();
        expect(op['x-permissions']).toBeUndefined();
        return;
      }
      expect(op.security).toContainEqual({ bearer: [] });
      expect(op['x-permissions']?.permissions.length).toBeGreaterThan(0);
      expect(op.responses['401']).toBeDefined();
      expect(op.responses['403']).toBeDefined();
    },
  );

  it('requires the Idempotency-Key header exactly on the SPEC §8 idempotent endpoints', () => {
    const idempotent = SPEC_ROUTES.filter((route) =>
      operation(route).parameters?.some((p) => p.in === 'header' && p.name === 'Idempotency-Key'),
    ).map(expressKey);
    expect(idempotent.sort()).toEqual([...IDEMPOTENT_ROUTES].sort());
  });

  it('uses unique operationIds', () => {
    const ids = SPEC_ROUTES.map((route) => operation(route).operationId);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('registers every shared DTO schema as a named component', () => {
    const names = Object.entries(shared)
      .filter(([key, value]) => key.endsWith('Schema') && value instanceof z.ZodType)
      .map(([key]) => key.charAt(0).toUpperCase() + key.slice(1, -'Schema'.length));
    expect(names.length).toBeGreaterThan(250);
    expect(names.filter((name) => !doc.components.schemas[name])).toEqual([]);
  });
});
