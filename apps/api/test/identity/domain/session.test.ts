import { describe, expect, it } from 'vitest';
import {
  autoSelectMembership,
  findActiveMembership,
  type MembershipView,
  sessionRoles,
} from '../../../src/modules/identity/domain/session.js';

const membership = (n: number, status: MembershipView['status'], roles = ['student']) => ({
  membershipId: `m${n}`,
  schoolId: `s${n}`,
  schoolName: `School ${n}`,
  roles,
  status,
});

describe('autoSelectMembership', () => {
  it('selects the only active membership', () => {
    const active = membership(1, 'active');
    expect(autoSelectMembership([active, membership(2, 'disabled')])).toBe(active);
  });

  it('selects nothing with several active memberships or none', () => {
    expect(autoSelectMembership([membership(1, 'active'), membership(2, 'active')])).toBeNull();
    expect(autoSelectMembership([membership(1, 'pending_consent')])).toBeNull();
    expect(autoSelectMembership([])).toBeNull();
  });
});

describe('findActiveMembership', () => {
  it('finds an active membership by id and ignores inactive ones', () => {
    const list = [membership(1, 'active'), membership(2, 'invited')];
    expect(findActiveMembership(list, 'm1')).toBe(list[0]);
    expect(findActiveMembership(list, 'm2')).toBeNull();
    expect(findActiveMembership(list, 'm9')).toBeNull();
    expect(findActiveMembership(list, null)).toBeNull();
  });
});

describe('sessionRoles', () => {
  it('uses the membership roles when a school is selected', () => {
    expect(sessionRoles(membership(1, 'active', ['owner', 'instructor']), true)).toEqual([
      'owner',
      'instructor',
    ]);
  });

  it('is platform_admin without a school for a platform admin, else empty', () => {
    expect(sessionRoles(null, true)).toEqual(['platform_admin']);
    expect(sessionRoles(null, false)).toEqual([]);
  });
});
