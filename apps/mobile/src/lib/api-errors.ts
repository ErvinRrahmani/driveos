import { errorResponseSchema } from '@driveos/shared';

export const NETWORK_ERROR = 'network_error';
export const UNKNOWN_ERROR = 'unknown_error';

export interface ApiFailure {
  ok: false;
  code: string;
  message: string | null;
}

export function toFailure(error: unknown): ApiFailure {
  const parsed = errorResponseSchema.safeParse(error);
  if (parsed.success) {
    return { ok: false, code: parsed.data.error.code, message: parsed.data.error.message };
  }
  return {
    ok: false,
    code: error instanceof TypeError ? NETWORK_ERROR : UNKNOWN_ERROR,
    message: null,
  };
}
