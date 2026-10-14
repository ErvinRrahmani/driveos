import { z } from 'zod';

const adminEnvSchema = z.object({
  VITE_API_URL: z.url({ protocol: /^https?$/ }),
  VITE_USE_MOCKS: z.enum(['true', 'false']).default('false'),
});

export interface AdminEnv {
  apiUrl: string;
  useMocks: boolean;
}

export function parseAdminEnv(raw: Record<string, unknown>): AdminEnv {
  const result = adminEnvSchema.safeParse(raw);
  if (!result.success) {
    const keys = result.error.issues.map((issue) => issue.path.join('.')).join(', ');
    throw new Error(`Invalid admin environment (${keys}); copy apps/admin/.env.example to .env`);
  }
  return { apiUrl: result.data.VITE_API_URL, useMocks: result.data.VITE_USE_MOCKS === 'true' };
}
