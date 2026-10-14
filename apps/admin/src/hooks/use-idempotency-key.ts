import { useMemo, useRef } from 'react';
import { StatusCodes } from 'http-status-codes';

export function useIdempotencyKey() {
  const key = useRef<string | null>(null);
  return useMemo(
    () => ({
      current: () => (key.current ??= crypto.randomUUID()),
      settle: (status: number) => {
        if (status < StatusCodes.INTERNAL_SERVER_ERROR) key.current = null;
      },
    }),
    [],
  );
}
