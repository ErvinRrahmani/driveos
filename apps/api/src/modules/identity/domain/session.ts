export type MembershipStatus = 'invited' | 'pending_consent' | 'active' | 'disabled';

export interface MembershipView {
  membershipId: string;
  schoolId: string;
  schoolName: string;
  roles: string[];
  status: MembershipStatus;
}

export const PLATFORM_ADMIN_ROLE = 'platform_admin';

export function autoSelectMembership<M extends MembershipView>(
  memberships: readonly M[],
): M | null {
  const active = memberships.filter((m) => m.status === 'active');
  return active.length === 1 ? (active[0] ?? null) : null;
}

export function findActiveMembership<M extends MembershipView>(
  memberships: readonly M[],
  membershipId: string | null,
): M | null {
  if (!membershipId) return null;
  return memberships.find((m) => m.membershipId === membershipId && m.status === 'active') ?? null;
}

export function sessionRoles(active: MembershipView | null, isPlatformAdmin: boolean): string[] {
  if (active) return [...active.roles];
  return isPlatformAdmin ? [PLATFORM_ADMIN_ROLE] : [];
}
