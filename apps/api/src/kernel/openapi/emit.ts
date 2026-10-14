import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { createHttpApp } from '../../http-app.js';
import { buildOpenApiDocument } from './document.js';

export async function emitOpenApi(outFile: string): Promise<void> {
  const app = await createHttpApp({ envFilePath: ['.env', '.env.example'] });
  try {
    await app.init();
    const document = buildOpenApiDocument(app);
    await mkdir(path.dirname(outFile), { recursive: true });
    await writeFile(outFile, `${JSON.stringify(document, null, 2)}\n`);
  } finally {
    await app.close();
  }
}
