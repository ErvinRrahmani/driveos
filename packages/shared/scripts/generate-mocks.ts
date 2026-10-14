/// <reference types="node" />
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

interface OpenApiMediaType {
  schema?: { $ref?: string };
}

interface OpenApiOperation {
  operationId: string;
  security?: unknown[];
  parameters?: { name: string; in: string; required?: boolean }[];
  requestBody?: { content: Record<string, OpenApiMediaType> };
  responses: Record<string, { content?: Record<string, OpenApiMediaType> }>;
}

interface OpenApiDocument {
  paths: Record<string, Record<string, OpenApiOperation>>;
}

const METHODS = new Set(['get', 'post', 'put', 'patch', 'delete']);

const here = dirname(fileURLToPath(import.meta.url));
const input = resolve(here, '../../../apps/api/openapi.json');
const output = resolve(here, '../src/mocks/generated/routes.ts');

const componentName = (media: OpenApiMediaType | undefined) =>
  media?.schema?.$ref?.split('/').pop() ?? null;

const document = JSON.parse(readFileSync(input, 'utf8')) as OpenApiDocument;

const routes = Object.entries(document.paths).flatMap(([path, item]) =>
  Object.entries(item)
    .filter(([method]) => METHODS.has(method))
    .map(([method, operation]) => {
      const success = Object.entries(operation.responses).find(([status]) =>
        status.startsWith('2'),
      );
      if (!success) throw new Error(`${operation.operationId} has no 2xx response`);
      const [status, response] = success;
      const content = response.content ?? {};
      const produces =
        'application/json' in content ? 'json' : 'application/pdf' in content ? 'pdf' : 'none';
      return {
        operationId: operation.operationId,
        method,
        path,
        mswPath: path.replace(/\{(\w+)\}/g, ':$1'),
        status: Number(status),
        response: componentName(content['application/json']),
        request: componentName(operation.requestBody?.content['application/json']),
        produces,
        idempotent: (operation.parameters ?? []).some(
          (parameter) => parameter.in === 'header' && parameter.name === 'Idempotency-Key',
        ),
        public: operation.security === undefined || operation.security.length === 0,
      };
    }),
);

mkdirSync(dirname(output), { recursive: true });
writeFileSync(
  output,
  `import type { MockRoute } from '../routes.js';\n\nexport const MOCK_ROUTES = ${JSON.stringify(routes, null, 2)} as const satisfies readonly MockRoute[];\n`,
);
console.log(`generate-mocks: ${routes.length} routes → ${output}`);
