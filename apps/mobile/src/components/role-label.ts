import type { MembershipRole } from '@driveos/shared';
import type { TFunction } from 'i18next';

const ROLE_KEYS = {
  owner: 'roles.owner',
  office: 'roles.office',
  instructor: 'roles.instructor',
  student: 'roles.student',
  parent: 'roles.parent',
} as const satisfies Record<MembershipRole, string>;

export function roleList(t: TFunction, roles: readonly MembershipRole[]): string {
  return roles.map((role) => t(ROLE_KEYS[role])).join(', ');
}
