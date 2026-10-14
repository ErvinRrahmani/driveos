import { describe, expect, it } from 'vitest';
import {
  createUploadUrlRequestSchema,
  DOCUMENT_MAX_BYTES,
  signContractRequestSchema,
} from '../src/index.js';
import { DTO_SAMPLES } from '../src/dto/samples/index.js';

const ok = (schema: { safeParse: (v: unknown) => { success: boolean } }, value: unknown) =>
  schema.safeParse(value).success;

describe('POST /v1/documents/upload-url', () => {
  const body = DTO_SAMPLES.documents.createUploadUrlRequest;

  it('limits size and mime type', () => {
    expect(ok(createUploadUrlRequestSchema, { ...body, sizeBytes: DOCUMENT_MAX_BYTES })).toBe(true);
    expect(ok(createUploadUrlRequestSchema, { ...body, sizeBytes: DOCUMENT_MAX_BYTES + 1 })).toBe(
      false,
    );
    expect(ok(createUploadUrlRequestSchema, { ...body, sizeBytes: 0 })).toBe(false);
    expect(ok(createUploadUrlRequestSchema, { ...body, mime: 'application/x-msdownload' })).toBe(
      false,
    );
  });

  it('takes a known kind', () => {
    expect(ok(createUploadUrlRequestSchema, { ...body, kind: 'whatever' })).toBe(false);
  });
});

describe('POST /v1/contracts/{id}/sign', () => {
  it('takes an optional signer role', () => {
    expect(ok(signContractRequestSchema, {})).toBe(true);
    expect(ok(signContractRequestSchema, { role: 'guardian' })).toBe(true);
    expect(ok(signContractRequestSchema, { role: 'owner' })).toBe(false);
  });
});
