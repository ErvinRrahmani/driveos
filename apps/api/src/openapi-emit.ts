import 'reflect-metadata';
import path from 'node:path';
import { emitOpenApi } from './kernel/openapi/emit.js';

process.env.LOG_LEVEL = 'warn';

const outFile = path.resolve(process.argv[2] ?? 'openapi.json');
await emitOpenApi(outFile);
process.stdout.write(`OpenAPI document written to ${outFile}\n`);
