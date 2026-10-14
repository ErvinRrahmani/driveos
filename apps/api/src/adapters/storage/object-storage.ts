export interface PresignedRequest {
  url: string;
  headers: Record<string, string>;
  expiresAt: Date;
}

export interface PresignUploadInput {
  key: string;
  mime: string;
  sizeBytes: number;
  expiresInSeconds: number;
}

export interface PresignDownloadInput {
  key: string;
  expiresInSeconds: number;
}

export interface StoredObject {
  sizeBytes: number;
  mime: string | null;
}

export interface ObjectStorage {
  presignUpload(input: PresignUploadInput): Promise<PresignedRequest>;
  presignDownload(input: PresignDownloadInput): Promise<PresignedRequest>;
  head(key: string): Promise<StoredObject | null>;
  delete(keys: readonly string[]): Promise<void>;
}

export const OBJECT_STORAGE = Symbol('OBJECT_STORAGE');

export const SERVER_SIDE_ENCRYPTION = 'AES256';
