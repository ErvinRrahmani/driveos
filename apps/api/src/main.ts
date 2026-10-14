import 'reflect-metadata';
import { ConfigService } from '@nestjs/config';
import type { Env } from './kernel/config/env.js';
import { createHttpApp } from './http-app.js';

const app = await createHttpApp({ envFilePath: ['.env'] });
const port = app.get<ConfigService<Env, true>>(ConfigService).get('API_PORT', { infer: true });
await app.listen(port);
