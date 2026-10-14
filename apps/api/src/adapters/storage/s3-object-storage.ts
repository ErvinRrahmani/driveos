import {
  CreateBucketCommand,
  DeleteObjectsCommand,
  GetObjectCommand,
  HeadBucketCommand,
  HeadObjectCommand,
  PutBucketEncryptionCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import {
  type ObjectStorage,
  type PresignDownloadInput,
  type PresignedRequest,
  type PresignUploadInput,
  SERVER_SIDE_ENCRYPTION,
  type StoredObject,
} from './object-storage.js';

export interface S3ObjectStorageOptions {
  endpoint: string;
  region: string;
  accessKeyId: string;
  secretAccessKey: string;
  bucket: string;
}

const DELETE_BATCH = 1000;
const SSE_HEADER = 'x-amz-server-side-encryption';

function statusOf(error: unknown): number | undefined {
  return (error as { $metadata?: { httpStatusCode?: number } }).$metadata?.httpStatusCode;
}

function isMissing(error: unknown): boolean {
  const name = (error as { name?: string }).name;
  return (
    name === 'NotFound' ||
    name === 'NoSuchKey' ||
    name === 'NoSuchBucket' ||
    statusOf(error) === 404
  );
}

export class S3ObjectStorage implements ObjectStorage {
  private readonly client: S3Client;
  private ready: Promise<void> | null = null;

  constructor(private readonly options: S3ObjectStorageOptions) {
    this.client = new S3Client({
      endpoint: options.endpoint,
      region: options.region,
      forcePathStyle: true,
      credentials: {
        accessKeyId: options.accessKeyId,
        secretAccessKey: options.secretAccessKey,
      },
      requestChecksumCalculation: 'WHEN_REQUIRED',
      responseChecksumValidation: 'WHEN_REQUIRED',
    });
  }

  async presignUpload(input: PresignUploadInput): Promise<PresignedRequest> {
    await this.ensureBucket();
    const command = new PutObjectCommand({
      Bucket: this.options.bucket,
      Key: input.key,
      ContentType: input.mime,
      ContentLength: input.sizeBytes,
      ServerSideEncryption: SERVER_SIDE_ENCRYPTION,
    });
    const url = await getSignedUrl(this.client, command, {
      expiresIn: input.expiresInSeconds,
      signableHeaders: new Set(['content-type', 'content-length', SSE_HEADER]),
      unhoistableHeaders: new Set([SSE_HEADER]),
    });
    return {
      url,
      headers: {
        'Content-Type': input.mime,
        'Content-Length': String(input.sizeBytes),
        [SSE_HEADER]: SERVER_SIDE_ENCRYPTION,
      },
      expiresAt: new Date(Date.now() + input.expiresInSeconds * 1000),
    };
  }

  async presignDownload(input: PresignDownloadInput): Promise<PresignedRequest> {
    await this.ensureBucket();
    const url = await getSignedUrl(
      this.client,
      new GetObjectCommand({ Bucket: this.options.bucket, Key: input.key }),
      { expiresIn: input.expiresInSeconds },
    );
    return { url, headers: {}, expiresAt: new Date(Date.now() + input.expiresInSeconds * 1000) };
  }

  async head(key: string): Promise<StoredObject | null> {
    await this.ensureBucket();
    try {
      const found = await this.client.send(
        new HeadObjectCommand({ Bucket: this.options.bucket, Key: key }),
      );
      return { sizeBytes: found.ContentLength ?? 0, mime: found.ContentType ?? null };
    } catch (error) {
      if (isMissing(error)) return null;
      throw error;
    }
  }

  async delete(keys: readonly string[]): Promise<void> {
    if (keys.length === 0) return;
    await this.ensureBucket();
    for (let start = 0; start < keys.length; start += DELETE_BATCH) {
      const batch = keys.slice(start, start + DELETE_BATCH);
      const result = await this.client.send(
        new DeleteObjectsCommand({
          Bucket: this.options.bucket,
          Delete: { Objects: batch.map((Key) => ({ Key })), Quiet: true },
        }),
      );
      const failed = (result.Errors ?? []).filter((error) => error.Code !== 'NoSuchKey');
      if (failed.length > 0) {
        throw new Error(`Object storage could not delete ${failed.length} object(s)`);
      }
    }
  }

  ensureBucket(): Promise<void> {
    this.ready ??= this.createBucket().catch((error: unknown) => {
      this.ready = null;
      throw error;
    });
    return this.ready;
  }

  private async createBucket(): Promise<void> {
    const Bucket = this.options.bucket;
    try {
      await this.client.send(new HeadBucketCommand({ Bucket }));
      return;
    } catch (error) {
      if (!isMissing(error)) throw error;
    }
    try {
      await this.client.send(new CreateBucketCommand({ Bucket }));
    } catch (error) {
      const name = (error as { name?: string }).name;
      if (name !== 'BucketAlreadyOwnedByYou' && name !== 'BucketAlreadyExists') throw error;
    }
    await this.client.send(
      new PutBucketEncryptionCommand({
        Bucket,
        ServerSideEncryptionConfiguration: {
          Rules: [{ ApplyServerSideEncryptionByDefault: { SSEAlgorithm: SERVER_SIDE_ENCRYPTION } }],
        },
      }),
    );
  }
}
