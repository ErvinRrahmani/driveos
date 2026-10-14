import { describe, expect, it } from 'vitest';
import {
  type MembershipState,
  mergeRoles,
  normalizeRoles,
  planMembershipUpdate,
} from '../../../src/modules/identity/domain/membership.js';

const state = (overrides: Partial<MembershipState> = {}): MembershipState => ({
  roles: ['office'],
  status: 'active',
  grants: [],
  branchIds: [],
  ...overrides,
});

const asOwner = { callerIsOwner: true, otherActiveOwners: 1 };
const asOffice = { callerIsOwner: false, otherActiveOwners: 1 };

describe('roles', () => {
  it('normalises to a unique, canonically ordered list', () => {
    expect(normalizeRoles(['student', 'owner', 'student', 'instructor'])).toEqual([
      'owner',
      'instructor',
      'student',
    ]);
  });

  it('merges invited roles into the existing ones', () => {
    expect(mergeRoles(['instructor'], ['owner', 'instructor'])).toEqual(['owner', 'instructor']);
  });
});

describe('planMembershipUpdate', () => {
  it('replaces roles and reports a roles and permissions change', () => {
    const result = planMembershipUpdate(state(), { roles: ['instructor', 'office'] }, asOwner);
    expect(result).toEqual({
      ok: true,
      next: state({ roles: ['office', 'instructor'] }),
      rolesChanged: true,
      permissionsChanged: true,
      disabled: false,
      enabled: false,
    });
  });

  it('reports nothing when the roles are the same set', () => {
    const result = planMembershipUpdate(state(), { roles: ['office'] }, asOwner);
    expect(result).toMatchObject({ ok: true, rolesChanged: false, permissionsChanged: false });
  });

  it('adds and removes grants (sorted) as a permissions change only', () => {
    const result = planMembershipUpdate(
      state({ grants: ['reports.read'] }),
      { grants: { add: ['prices.manage', 'audit_log.read'], remove: ['reports.read'] } },
      asOwner,
    );
    expect(result).toMatchObject({
      ok: true,
      next: { grants: ['audit_log.read', 'prices.manage'] },
      rolesChanged: false,
      permissionsChanged: true,
    });
  });

  it('rejects unknown and global permission names', () => {
    expect(
      planMembershipUpdate(
        state(),
        { grants: { add: ['prices.manage', 'lessons.fly', 'platform.manage'] } },
        asOwner,
      ),
    ).toEqual({
      ok: false,
      error: 'unknown_permission',
      permissions: ['lessons.fly', 'platform.manage'],
    });
  });

  it('replaces branches as a permissions change', () => {
    const result = planMembershipUpdate(
      state({ branchIds: ['b1'] }),
      { branchIds: ['b2', 'b2'] },
      asOwner,
    );
    expect(result).toMatchObject({
      ok: true,
      next: { branchIds: ['b2'] },
      permissionsChanged: true,
    });
  });

  it('only lets an owner give or take the owner role', () => {
    expect(planMembershipUpdate(state(), { roles: ['owner'] }, asOffice)).toEqual({
      ok: false,
      error: 'owner_required',
    });
    expect(
      planMembershipUpdate(
        state({ roles: ['owner', 'instructor'] }),
        { roles: ['instructor'] },
        asOffice,
      ),
    ).toEqual({ ok: false, error: 'owner_required' });
    expect(planMembershipUpdate(state(), { roles: ['owner'] }, asOwner)).toMatchObject({
      ok: true,
    });
  });

  it('only lets an owner disable an owner', () => {
    expect(planMembershipUpdate(state({ roles: ['owner'] }), { disabled: true }, asOffice)).toEqual(
      {
        ok: false,
        error: 'owner_required',
      },
    );
  });

  it('protects the last active owner from losing the role or being disabled', () => {
    const lastOwner = { callerIsOwner: true, otherActiveOwners: 0 };
    expect(
      planMembershipUpdate(state({ roles: ['owner'] }), { roles: ['office'] }, lastOwner),
    ).toEqual({
      ok: false,
      error: 'last_owner',
    });
    expect(
      planMembershipUpdate(state({ roles: ['owner'] }), { disabled: true }, lastOwner),
    ).toEqual({
      ok: false,
      error: 'last_owner',
    });
    expect(
      planMembershipUpdate(
        state({ roles: ['owner'] }),
        { roles: ['owner', 'instructor'] },
        lastOwner,
      ),
    ).toMatchObject({ ok: true, rolesChanged: true });
    expect(
      planMembershipUpdate(state({ roles: ['owner'] }), { roles: ['office'] }, asOwner),
    ).toMatchObject({
      ok: true,
    });
  });

  it('disables an active membership once', () => {
    expect(planMembershipUpdate(state(), { disabled: true }, asOwner)).toMatchObject({
      ok: true,
      next: { status: 'disabled' },
      disabled: true,
      enabled: false,
    });
    expect(
      planMembershipUpdate(state({ status: 'disabled' }), { disabled: true }, asOwner),
    ).toMatchObject({
      ok: true,
      disabled: false,
    });
  });

  it('re-enables a disabled membership as active', () => {
    expect(
      planMembershipUpdate(state({ status: 'disabled' }), { disabled: false }, asOwner),
    ).toMatchObject({
      ok: true,
      next: { status: 'active' },
      enabled: true,
      disabled: false,
    });
    expect(planMembershipUpdate(state(), { disabled: false }, asOwner)).toMatchObject({
      ok: true,
      enabled: false,
    });
  });
});
