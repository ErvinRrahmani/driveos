import { randomUUID } from 'node:crypto';
import { setTimeout as sleep } from 'node:timers/promises';
import { Test, type TestingModule } from '@nestjs/testing';
import { StatusCodes } from 'http-status-codes';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AdaptersModule } from '../../src/adapters/adapters.module.js';
import { FakeObjectStorage } from '../../src/adapters/storage/fake-object-storage.js';
import {
  OBJECT_STORAGE,
  type ObjectStorage,
  SERVER_SIDE_ENCRYPTION,
} from '../../src/adapters/storage/object-storage.js';
import { AppConfigModule } from '../../src/kernel/config/config.module.js';

const PDF = Buffer.from('%PDF-1.4 SAMPLE DriveOS test document');
const MIME = 'application/pdf';

describe('S3 object storage against MinIO', () => {
  let moduleRef: TestingModule;
  let storage: ObjectStorage;
  const prefix = `test-${randomUUID()}`;
  const created: string[] = [];

  beforeAll(async () => {
    moduleRef = await Test.createTestingModule({
      imports: [AppConfigModule.forRoot({ envFilePath: ['.env.example'] }), AdaptersModule],
    }).compile();
    storage = moduleRef.get<ObjectStorage>(OBJECT_STORAGE);
  });

  afterAll(async () => {
    await storage?.delete(created);
    await moduleRef?.close();
  });

  async function put(key: string) {
    created.push(key);
    const upload = await storage.presignUpload({
      key,
      mime: MIME,
      sizeBytes: PDF.length,
      expiresInSeconds: 60,
    });
    return {
      upload,
      res: await fetch(upload.url, { method: 'PUT', headers: upload.headers, body: PDF }),
    };
  }

  it('uploads with server-side encryption through a signed PUT and reads it back', async () => {
    const key = `${prefix}/doc`;
    const { upload, res } = await put(key);
    expect(res.status).toBe(StatusCodes.OK);
    expect(upload.headers['x-amz-server-side-encryption']).toBe(SERVER_SIDE_ENCRYPTION);
    expect(await storage.head(key)).toEqual({ sizeBytes: PDF.length, mime: MIME });
    expect(await storage.head(`${prefix}/missing`)).toBeNull();

    const download = await storage.presignDownload({ key, expiresInSeconds: 60 });
    const got = await fetch(download.url);
    expect(got.status).toBe(StatusCodes.OK);
    expect(got.headers.get('x-amz-server-side-encryption')).toBe(SERVER_SIDE_ENCRYPTION);
    expect(Buffer.from(await got.arrayBuffer()).equals(PDF)).toBe(true);
  });

  it('rejects an upload with a different content type than was signed', async () => {
    const key = `${prefix}/wrong-type`;
    created.push(key);
    const upload = await storage.presignUpload({
      key,
      mime: MIME,
      sizeBytes: PDF.length,
      expiresInSeconds: 60,
    });
    const res = await fetch(upload.url, {
      method: 'PUT',
      headers: { ...upload.headers, 'Content-Type': 'image/png' },
      body: PDF,
    });
    expect(res.status).toBe(StatusCodes.FORBIDDEN);
    expect(await storage.head(key)).toBeNull();
  });

  it('rejects a download URL after it expires', async () => {
    const key = `${prefix}/expiring`;
    await put(key);
    const download = await storage.presignDownload({ key, expiresInSeconds: 1 });
    await sleep(2_100);
    const res = await fetch(download.url);
    expect(res.status).toBe(StatusCodes.FORBIDDEN);
  });

  it('deletes objects, ignoring ones that are already gone', async () => {
    const key = `${prefix}/to-delete`;
    await put(key);
    await storage.delete([key, `${prefix}/never-existed`]);
    expect(await storage.head(key)).toBeNull();
  });
});

describe('FakeObjectStorage', () => {
  it('expires signed URLs on its clock and checks the signed size and type', async () => {
    const storage = new FakeObjectStorage();
    const now = new Date('2026-10-10T10:00:00Z');
    storage.setClock(() => now);
    const upload = await storage.presignUpload({
      key: 'k',
      mime: MIME,
      sizeBytes: 5,
      expiresInSeconds: 60,
    });
    expect(storage.upload(upload.url, { sizeBytes: 6, mime: MIME })).toEqual({
      ok: false,
      reason: 'mismatch',
    });
    expect(storage.upload(upload.url, { sizeBytes: 5, mime: MIME })).toMatchObject({ ok: true });
    const download = await storage.presignDownload({ key: 'k', expiresInSeconds: 300 });
    expect(storage.upload(download.url, { sizeBytes: 5, mime: MIME })).toEqual({
      ok: false,
      reason: 'invalid',
    });
    expect(storage.download(download.url)).toMatchObject({ ok: true, key: 'k' });
    storage.setClock(() => new Date(now.getTime() + 300_000));
    expect(storage.download(download.url)).toEqual({ ok: false, reason: 'expired' });
  });
});
