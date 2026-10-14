import { GRANTABLE_PERMISSIONS, SCHOOL_ROLES, type SchoolRole } from './permissions.js';
import type { MembershipStatus } from './session.js';

export interface MembershipState {
  roles: SchoolRole[];
  status: MembershipStatus;
  grants: string[];
  branchIds: string[];
}

export interface MembershipPatch {
  roles?: readonly SchoolRole[];
  branchIds?: readonly string[];
  grants?: { add?: readonly string[]; remove?: readonly string[] };
  disabled?: boolean;
}

export interface MembershipUpdateContext {
  callerIsOwner: boolean;
  otherActiveOwners: number;
}

export type MembershipUpdatePlan =
  | {
      ok: true;
      next: MembershipState;
      rolesChanged: boolean;
      permissionsChanged: boolean;
      disabled: boolean;
      enabled: boolean;
    }
  | { ok: false; error: 'owner_required' | 'last_owner' }
  | { ok: false; error: 'unknown_permission'; permissions: string[] };

export function normalizeRoles(roles: readonly string[]): SchoolRole[] {
  return SCHOOL_ROLES.filter((role) => roles.includes(role));
}

export function mergeRoles(current: readonly string[], added: readonly string[]): SchoolRole[] {
  return normalizeRoles([...current, ...added]);
}

const sortedUnique = (values: readonly string[]): string[] => [...new Set(values)].sort();

const sameList = (a: readonly string[], b: readonly string[]): boolean =>
  a.length === b.length && a.every((value, i) => value === b[i]);

export function planMembershipUpdate(
  current: MembershipState,
  patch: MembershipPatch,
  context: MembershipUpdateContext,
): MembershipUpdatePlan {
  const requested = [...(patch.grants?.add ?? []), ...(patch.grants?.remove ?? [])];
  const unknown = sortedUnique(requested.filter((p) => !GRANTABLE_PERMISSIONS.has(p as never)));
  if (unknown.length > 0) return { ok: false, error: 'unknown_permission', permissions: unknown };

  const roles = patch.roles ? normalizeRoles(patch.roles) : current.roles;
  const removed = new Set(patch.grants?.remove ?? []);
  const grants = sortedUnique([...current.grants, ...(patch.grants?.add ?? [])]).filter(
    (p) => !removed.has(p),
  );
  const branchIds = patch.branchIds ? sortedUnique(patch.branchIds) : current.branchIds;
  const disabling = patch.disabled === true && current.status !== 'disabled';
  const enabling = patch.disabled === false && current.status === 'disabled';
  const status: MembershipStatus = disabling ? 'disabled' : enabling ? 'active' : current.status;

  const wasOwner = current.roles.includes('owner');
  const isOwner = roles.includes('owner');
  if ((wasOwner !== isOwner || (wasOwner && disabling)) && !context.callerIsOwner) {
    return { ok: false, error: 'owner_required' };
  }
  const losesOwner = wasOwner && current.status === 'active' && (!isOwner || disabling);
  if (losesOwner && context.otherActiveOwners === 0) return { ok: false, error: 'last_owner' };

  const rolesChanged = !sameList(roles, current.roles);
  const permissionsChanged =
    rolesChanged ||
    !sameList(grants, sortedUnique(current.grants)) ||
    !sameList(branchIds, sortedUnique(current.branchIds));
  return {
    ok: true,
    next: { roles, status, grants, branchIds },
    rolesChanged,
    permissionsChanged,
    disabled: disabling,
    enabled: enabling,
  };
}
