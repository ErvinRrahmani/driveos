import type { SignerRole } from '@driveos/shared';

export interface ContractPeople {
  studentUserId: string | null;
  guardianUserIds: readonly string[];
}

export interface SignerRoleInput {
  held: readonly SignerRole[];
  required: readonly SignerRole[];
  signed: readonly SignerRole[];
  requested?: SignerRole;
}

export type SignerRoleDecision =
  | { ok: true; role: SignerRole }
  | { ok: false; reason: 'not_a_signer' | 'not_required' | 'already_signed' };

export function requiredSignerRoles(requiresGuardian: boolean): SignerRole[] {
  return requiresGuardian ? ['student', 'guardian'] : ['student'];
}

export function isContractComplete(
  requiresGuardian: boolean,
  signed: readonly SignerRole[],
): boolean {
  return requiredSignerRoles(requiresGuardian).every((role) => signed.includes(role));
}

export function heldSignerRoles(userId: string, people: ContractPeople): SignerRole[] {
  const roles: SignerRole[] = [];
  if (people.studentUserId !== null && people.studentUserId === userId) roles.push('student');
  if (people.guardianUserIds.includes(userId)) roles.push('guardian');
  return roles;
}

export function signerRoleFor(input: SignerRoleInput): SignerRoleDecision {
  const candidates = input.requested
    ? input.held.filter((role) => role === input.requested)
    : [...input.held];
  if (candidates.length === 0) return { ok: false, reason: 'not_a_signer' };
  const needed = candidates.filter((role) => input.required.includes(role));
  if (needed.length === 0) return { ok: false, reason: 'not_required' };
  const open = needed.find((role) => !input.signed.includes(role));
  return open ? { ok: true, role: open } : { ok: false, reason: 'already_signed' };
}
