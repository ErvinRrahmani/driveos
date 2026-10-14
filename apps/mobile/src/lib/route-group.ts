import type { MembershipSummary } from '@driveos/shared';
import type { AuthState } from './auth-store';

export type RouteGroup = 'instructor' | 'student' | 'parent' | 'staff-only';

export type Destination =
  '/login' | '/choose-school' | '/instructor' | '/student' | '/parent' | '/staff-only';

export function routeGroupForRoles(roles: readonly string[]): RouteGroup {
  if (roles.includes('instructor')) return 'instructor';
  if (roles.includes('student')) return 'student';
  if (roles.includes('parent')) return 'parent';
  return 'staff-only';
}

export function activeMembership(
  state: Pick<AuthState, 'activeMembershipId' | 'memberships'>,
): MembershipSummary | null {
  return state.memberships.find((m) => m.membershipId === state.activeMembershipId) ?? null;
}

export function resolveDestination(state: AuthState): Destination | null {
  if (state.status === 'restoring') return null;
  if (state.status === 'signedOut') return '/login';
  const membership = activeMembership(state);
  if (!membership) return '/choose-school';
  return `/${routeGroupForRoles(membership.roles)}`;
}

export function selectableMemberships(memberships: readonly MembershipSummary[]) {
  return memberships.filter((m) => m.status === 'active');
}

export function needsSchoolChoice(memberships: readonly MembershipSummary[]): boolean {
  return selectableMemberships(memberships).length > 1;
}
