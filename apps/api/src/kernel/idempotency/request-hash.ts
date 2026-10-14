import { createHash } from 'node:crypto';

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((key) => [key, canonicalize((value as Record<string, unknown>)[key])]),
    );
  }
  return value;
}

export function canonicalJson(value: unknown): string {
  return JSON.stringify(canonicalize(value)) ?? 'null';
}

export interface HashedRequest {
  method: string;
  path: string;
  body: unknown;
}

export function requestHash({ method, path, body }: HashedRequest): string {
  return createHash('sha256')
    .update(`${method.toUpperCase()}\n${path}\n${canonicalJson(body)}`)
    .digest('hex');
}
