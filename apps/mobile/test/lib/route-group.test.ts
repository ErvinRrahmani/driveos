import type { MembershipSummary } from '@driveos/shared';
import { describe, expect, it } from 'vitest';
import type { AuthState } from '../../src/lib/auth-store';
import {
  activeMembership,
  needsSchoolChoice,
  resolveDestination,
  routeGroupForRoles,
} from '../../src/lib/route-group';

function membership(
  id: string,
  roles: MembershipSummary['roles'],
  status: MembershipSummary['status'] = 'active',
): MembershipSummary {
  return {
    membershipId: id,
    schoolId: `school-${id}`,
    schoolName: `School ${id}`,
    roles,
    status,
  };
}

function signedIn(memberships: MembershipSummary[], activeMembershipId: string | null): AuthState {
  return {
    status: 'signedIn',
    accessToken: 'a',
    refreshToken: 'r',
    memberships,
    activeMembershipId,
  };
}

describe('routeGroupForRoles', () => {
  it('sends an owner who also teaches to the instructor app', () => {
    expect(routeGroupForRoles(['owner', 'instructor'])).toBe('instructor');
    expect(routeGroupForRoles(['instructor'])).toBe('instructor');
  });

  it('sends students and parents to their own groups', () => {
    expect(routeGroupForRoles(['student'])).toBe('student');
    expect(routeGroupForRoles(['parent'])).toBe('parent');
  });

  it('prefers the student group when a membership is both student and parent', () => {
    expect(routeGroupForRoles(['parent', 'student'])).toBe('student');
  });

  it('sends owner or office only to the admin web app screen', () => {
    expect(routeGroupForRoles(['owner'])).toBe('staff-only');
    expect(routeGroupForRoles(['office'])).toBe('staff-only');
    expect(routeGroupForRoles(['owner', 'office'])).toBe('staff-only');
    expect(routeGroupForRoles([])).toBe('staff-only');
  });
});

describe('resolveDestination', () => {
  it('waits while the stored session is restored', () => {
    expect(
      resolveDestination({
        status: 'restoring',
        accessToken: null,
        refreshToken: null,
        memberships: [],
        activeMembershipId: null,
      }),
    ).toBeNull();
  });

  it('sends signed-out users to the login screen', () => {
    expect(
      resolveDestination({
        status: 'signedOut',
        accessToken: null,
        refreshToken: null,
        memberships: [],
        activeMembershipId: null,
      }),
    ).toBe('/login');
  });

  it('asks for a school when no membership is active or the active one is unknown', () => {
    expect(resolveDestination(signedIn([membership('a', ['student'])], null))).toBe(
      '/choose-school',
    );
    expect(resolveDestination(signedIn([membership('a', ['student'])], 'zzz'))).toBe(
      '/choose-school',
    );
  });

  it('routes by the roles of the active membership', () => {
    const memberships = [membership('a', ['owner']), membership('b', ['owner', 'instructor'])];
    expect(resolveDestination(signedIn(memberships, 'a'))).toBe('/staff-only');
    expect(resolveDestination(signedIn(memberships, 'b'))).toBe('/instructor');
    expect(resolveDestination(signedIn([membership('c', ['parent'])], 'c'))).toBe('/parent');
    expect(resolveDestination(signedIn([membership('d', ['student'])], 'd'))).toBe('/student');
  });
});

describe('activeMembership', () => {
  it('finds the active membership summary', () => {
    const state = signedIn([membership('a', ['student']), membership('b', ['parent'])], 'b');
    expect(activeMembership(state)?.schoolName).toBe('School b');
    expect(activeMembership(signedIn([], 'b'))).toBeNull();
  });
});

describe('needsSchoolChoice', () => {
  it('asks only when more than one membership is active', () => {
    expect(needsSchoolChoice([membership('a', ['student'])])).toBe(false);
    expect(
      needsSchoolChoice([membership('a', ['student']), membership('b', ['parent'], 'disabled')]),
    ).toBe(false);
    expect(needsSchoolChoice([membership('a', ['student']), membership('b', ['parent'])])).toBe(
      true,
    );
  });
});
