import 'reflect-metadata';
import { createWorkerApp } from './worker-app.js';

const app = await createWorkerApp({ envFilePath: ['.env'] });
await app.init();
