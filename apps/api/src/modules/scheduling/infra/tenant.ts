import type { TenantContext } from '../../../kernel/tenant/tenant-context.js';

export function schoolIdOf(tenant: TenantContext): string {
  const schoolId = tenant.schoolId;
  if (!schoolId) throw new Error('The scheduling module needs a school in the tenant context');
  return schoolId;
}
