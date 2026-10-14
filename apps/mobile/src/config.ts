import { z } from 'zod';

const apiUrlSchema = z.url({ protocol: /^https?$/ });

export function parseApiUrl(value: string | undefined): string {
  const result = apiUrlSchema.safeParse(value);
  if (!result.success) {
    throw new Error(
      'EXPO_PUBLIC_API_URL must be an http(s) URL; copy apps/mobile/.env.example to .env',
    );
  }
  return result.data;
}

export function parseUseMocks(value: string | undefined): boolean {
  if (value === undefined || value === 'false') return false;
  if (value === 'true') return true;
  throw new Error('EXPO_PUBLIC_USE_MOCKS must be true or false; see apps/mobile/.env.example');
}
