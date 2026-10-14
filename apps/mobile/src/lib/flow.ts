import { type ApiFailure, toFailure } from './api-errors';
import { StatusCodes } from 'http-status-codes';

export type FlowResult<T extends object = object> = ({ ok: true } & T) | ApiFailure;

export type Sent<T> = { ok: true; data: T } | (ApiFailure & { retryable: boolean });

interface Reply<T> {
  data?: T;
  error?: unknown;
  response?: Response;
}

export async function send<T>(call: () => Promise<Reply<T>>): Promise<Sent<T>> {
  try {
    const { data, error, response } = await call();
    if (data !== undefined) return { ok: true, data };
    return {
      ...toFailure(error),
      retryable:
        (response?.status ?? StatusCodes.INTERNAL_SERVER_ERROR) >=
        StatusCodes.INTERNAL_SERVER_ERROR,
    };
  } catch (error) {
    return { ...toFailure(error), retryable: true };
  }
}

export function failure(sent: ApiFailure): ApiFailure {
  return { ok: false, code: sent.code, message: sent.message };
}

export interface Attempt {
  keyFor(body: unknown): string;
  settle(): void;
}

export function createAttempt(newKey: () => string): Attempt {
  let current: { fingerprint: string; key: string } | null = null;
  return {
    keyFor(body) {
      const fingerprint = JSON.stringify(body ?? null);
      if (current?.fingerprint !== fingerprint) current = { fingerprint, key: newKey() };
      return current.key;
    },
    settle() {
      current = null;
    },
  };
}

export async function sendIdempotent<T>(
  attempt: Attempt,
  body: unknown,
  call: (key: string) => Promise<Reply<T>>,
): Promise<Sent<T>> {
  const key = attempt.keyFor(body);
  const result = await send(() => call(key));
  if (result.ok || !result.retryable) attempt.settle();
  return result;
}
