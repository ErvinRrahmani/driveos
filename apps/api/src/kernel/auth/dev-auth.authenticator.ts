import { membershipRoleSchema } from '@driveos/shared';
import { z } from 'zod';
import type { Authenticator } from './authenticator.js';
import type { AuthRequest, Principal } from './principal.js';

const devRole = z.union([membershipRoleSchema, z.literal('platform_admin')]);

const devHeaders = z.object({
  'x-dev-user': z.uuid(),
  'x-dev-school': z.union([z.uuid(), z.literal('')]).optional(),
  'x-dev-membership': z.union([z.uuid(), z.literal('')]).optional(),
  'x-dev-roles': z
    .string()
    .optional()
    .transform((value) =>
      (value ?? '')
        .split(',')
        .map((role) => role.trim())
        .filter(Boolean),
    )
    .pipe(z.array(devRole)),
});

export class DevHeaderAuthenticator implements Authenticator {
  authenticate(request: Pick<AuthRequest, 'headers'>): Principal | null {
    const parsed = devHeaders.safeParse(request.headers);
    if (!parsed.success) return null;
    return {
      userId: parsed.data['x-dev-user'],
      schoolId: parsed.data['x-dev-school'] || null,
      membershipId: parsed.data['x-dev-membership'] || null,
      roles: parsed.data['x-dev-roles'],
      tokenType: 'access',
      sessionId: null,
    };
  }
}
