import { randomBytes } from 'node:crypto';
import type {
  ObjectStorage,
  PresignDownloadInput,
  PresignedRequest,
  PresignUploadInput,
  StoredObject,
} from './object-storage.js';

const BASE_URL = 'https://storage.fake.local/driveos-documents';

type Method = 'GET' | 'PUT';

interface Grant {
  token: string;
  method: Method;
  key: string;
  expiresAt: Date;
  mime?: string;
  sizeBytes?: number;
}

export type FakeStorageResult =
  | { ok: true; key: string; object: StoredObject | null }
  | { ok: false; reason: 'expired' | 'missing' | 'invalid' | 'mismatch' };

export class FakeObjectStorage implements ObjectStorage {
  readonly objects = new Map<string, StoredObject>();
  private readonly grants = new Map<string, Grant>();
  private clock: () => Date = () => new Date();

  setClock(clock: () => Date): void {
    this.clock = clock;
  }

  presignUpload(input: PresignUploadInput): Promise<PresignedRequest> {
    const grant = this.grant('PUT', input.key, input.expiresInSeconds);
    grant.mime = input.mime;
    grant.sizeBytes = input.sizeBytes;
    return Promise.resolve({
      url: this.urlFor(grant),
      headers: { 'Content-Type': input.mime, 'Content-Length': String(input.sizeBytes) },
      expiresAt: grant.expiresAt,
    });
  }

  presignDownload(input: PresignDownloadInput): Promise<PresignedRequest> {
    const grant = this.grant('GET', input.key, input.expiresInSeconds);
    return Promise.resolve({ url: this.urlFor(grant), headers: {}, expiresAt: grant.expiresAt });
  }

  head(key: string): Promise<StoredObject | null> {
    const found = this.objects.get(key);
    return Promise.resolve(found ? { ...found } : null);
  }

  delete(keys: readonly string[]): Promise<void> {
    for (const key of keys) this.objects.delete(key);
    return Promise.resolve();
  }

  upload(url: string, object: StoredObject): FakeStorageResult {
    const grant = this.check(url, 'PUT');
    if (!('key' in grant)) return grant;
    if (grant.mime !== object.mime || grant.sizeBytes !== object.sizeBytes) {
      return { ok: false, reason: 'mismatch' };
    }
    this.objects.set(grant.key, { ...object });
    return { ok: true, key: grant.key, object: { ...object } };
  }

  download(url: string): FakeStorageResult {
    const grant = this.check(url, 'GET');
    if (!('key' in grant)) return grant;
    const object = this.objects.get(grant.key);
    if (!object) return { ok: false, reason: 'missing' };
    return { ok: true, key: grant.key, object: { ...object } };
  }

  private check(url: string, method: Method): Grant | Extract<FakeStorageResult, { ok: false }> {
    const token = new URL(url).searchParams.get('token');
    const grant = token ? this.grants.get(token) : undefined;
    if (!grant || grant.method !== method) return { ok: false, reason: 'invalid' };
    if (this.clock().getTime() >= grant.expiresAt.getTime())
      return { ok: false, reason: 'expired' };
    return grant;
  }

  private grant(method: Method, key: string, expiresInSeconds: number): Grant {
    const grant: Grant = {
      token: randomBytes(12).toString('hex'),
      method,
      key,
      expiresAt: new Date(this.clock().getTime() + expiresInSeconds * 1000),
    };
    this.grants.set(grant.token, grant);
    return grant;
  }

  private urlFor(grant: Grant): string {
    const url = new URL(`${BASE_URL}/${grant.key}`);
    url.searchParams.set('method', grant.method);
    url.searchParams.set('expires', grant.expiresAt.toISOString());
    url.searchParams.set('token', grant.token);
    return url.toString();
  }
}
