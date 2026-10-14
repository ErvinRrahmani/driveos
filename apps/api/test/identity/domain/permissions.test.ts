import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  effectivePermissions,
  GLOBAL_PERMISSIONS,
  GRANTABLE_PERMISSIONS,
  hasRequiredPermissions,
  isPermission,
  type Permission,
  PERMISSIONS,
  permissionsForRoles,
  ROLE_PERMISSIONS,
  ROLES,
  type Role,
  SUPPORT_READ_PERMISSIONS,
} from '../../../src/modules/identity/domain/permissions.js';

const NAME = /^[a-z_]+(\.[a-z_]+)+$/;

type Expectation = [Role, Permission, boolean];

const CASES: Expectation[] = [
  ['owner', 'subscription.manage', true],
  ['owner', 'payment_account.manage', true],
  ['owner', 'prices.manage', true],
  ['owner', 'memberships.manage', true],
  ['owner', 'audit_log.read', true],
  ['owner', 'students.anonymize', true],
  ['owner', 'public_page.manage', true],
  ['owner', 'reviews.moderate', true],
  ['owner', 'platform.manage', false],
  ['office', 'students.manage', true],
  ['office', 'students.read', true],
  ['office', 'calendar.read', true],
  ['office', 'lessons.create', true],
  ['office', 'lessons.move', true],
  ['office', 'lessons.cancel', true],
  ['office', 'invoices.read', true],
  ['office', 'refunds.create', true],
  ['office', 'documents.read', true],
  ['office', 'chat.use', true],
  ['office', 'chat.read_all', true],
  ['office', 'invitations.manage', true],
  ['office', 'guardians.manage', true],
  ['office', 'prices.read', true],
  ['office', 'subscription.manage', false],
  ['office', 'payment_account.manage', false],
  ['office', 'prices.manage', false],
  ['office', 'memberships.manage', false],
  ['office', 'platform.manage', false],
  ['office', 'reviews.moderate', true],
  ['office', 'public_page.manage', false],
  ['office', 'reviews.submit', false],
  ['instructor', 'reviews.submit', false],
  ['instructor', 'reviews.moderate', false],
  ['student', 'reviews.submit', true],
  ['student', 'reviews.moderate', false],
  ['parent', 'reviews.submit', false],
  ['owner', 'leads.read', true],
  ['owner', 'leads.manage', true],
  ['office', 'leads.read', true],
  ['office', 'leads.manage', true],
  ['instructor', 'leads.read', false],
  ['instructor', 'leads.manage', false],
  ['student', 'leads.read', false],
  ['parent', 'leads.manage', false],
  ['instructor', 'availability.manage.own', true],
  ['instructor', 'lessons.create.own', true],
  ['instructor', 'lessons.cancel.own', true],
  ['instructor', 'lessons.complete.own', true],
  ['instructor', 'progress.write.own', true],
  ['instructor', 'private_notes.write.own', true],
  ['instructor', 'test_attempts.write.own', true],
  ['instructor', 'students.read.own', true],
  ['instructor', 'chat.use', true],
  ['instructor', 'payments.cash.record', true],
  ['instructor', 'sync.use', true],
  ['instructor', 'students.read', false],
  ['instructor', 'prices.manage', false],
  ['instructor', 'prices.read', true],
  ['instructor', 'lessons.move.own', true],
  ['instructor', 'lessons.create', false],
  ['instructor', 'invoices.read', false],
  ['instructor', 'chat.read_all', false],
  ['instructor', 'invitations.manage', false],
  ['student', 'lessons.create.own', true],
  ['student', 'lessons.cancel.own', true],
  ['student', 'checkout.create', true],
  ['student', 'theory.use', true],
  ['student', 'progress.read.own', true],
  ['student', 'documents.read.own', true],
  ['student', 'contracts.sign', true],
  ['student', 'chat.use', true],
  ['student', 'slot_offers.accept', true],
  ['student', 'waiting_list.manage.own', true],
  ['student', 'private_notes.read', false],
  ['student', 'students.read', false],
  ['student', 'students.read.own', true],
  ['student', 'consent.give', false],
  ['parent', 'lessons.read.own', true],
  ['parent', 'progress.read.own', true],
  ['parent', 'invoices.read.own', true],
  ['parent', 'checkout.create', true],
  ['parent', 'lessons.create.own', true],
  ['parent', 'lessons.cancel.own', true],
  ['parent', 'consent.give', true],
  ['parent', 'students.read.own', true],
  ['parent', 'students.read', false],
  ['student', 'lessons.move.own', false],
  ['parent', 'lessons.move.own', false],
  ['parent', 'contracts.sign', true],
  ['parent', 'progress.write.own', false],
  ['parent', 'test_attempts.write.own', false],
  ['parent', 'private_notes.read', false],
  ['parent', 'theory.use', false],
  ['platform_admin', 'platform.manage', true],
  ['platform_admin', 'students.read', false],
  ['platform_admin', 'school.read', false],
];

describe('permission catalogue', () => {
  it('names every permission <resource>.<action> without duplicates', () => {
    for (const permission of PERMISSIONS) expect(permission).toMatch(NAME);
    expect(new Set(PERMISSIONS).size).toBe(PERMISSIONS.length);
  });

  it('contains the Phase 1 permissions later modules rely on', () => {
    for (const permission of [
      'school.read',
      'school.manage',
      'settings.manage',
      'branches.manage',
      'vehicles.manage',
      'staff.read',
      'lesson_types.manage',
      'students.export',
      'balance.read',
      'balance.read.own',
      'ledger.adjust',
      'invoices.read.own',
      'contracts.manage',
      'reports.read',
      'slot_offers.manage',
    ]) {
      expect(isPermission(permission), permission).toBe(true);
    }
    expect(isPermission('lessons.fly')).toBe(false);
  });

  it('maps only catalogue permissions to the six roles', () => {
    expect([...ROLES].sort()).toEqual(
      ['instructor', 'office', 'owner', 'parent', 'platform_admin', 'student'].sort(),
    );
    for (const role of ROLES) {
      for (const permission of ROLE_PERMISSIONS[role]) expect(isPermission(permission)).toBe(true);
    }
  });
});

describe('role permission map (SPEC §4)', () => {
  it.each(CASES)('%s → %s: %s', (role, permission, allowed) => {
    expect(ROLE_PERMISSIONS[role].has(permission)).toBe(allowed);
  });

  it('gives the owner everything in the school except platform.manage', () => {
    expect([...ROLE_PERMISSIONS.owner].sort()).toEqual(
      PERMISSIONS.filter((p) => p !== 'platform.manage').sort(),
    );
  });

  it('gives platform_admin only platform.manage', () => {
    expect([...ROLE_PERMISSIONS.platform_admin]).toEqual(['platform.manage']);
  });

  it('never gives a school role a global permission', () => {
    for (const role of ROLES.filter((r) => r !== 'platform_admin')) {
      for (const permission of GLOBAL_PERMISSIONS) {
        expect(ROLE_PERMISSIONS[role].has(permission)).toBe(false);
      }
    }
  });
});

describe('effective permissions', () => {
  it('is the union of every role of the membership', () => {
    const both = permissionsForRoles(['owner', 'instructor']);
    for (const permission of [...ROLE_PERMISSIONS.owner, ...ROLE_PERMISSIONS.instructor]) {
      expect(both.has(permission)).toBe(true);
    }
    const office = permissionsForRoles(['office', 'instructor']);
    expect(office.has('students.manage')).toBe(true);
    expect(office.has('progress.write.own')).toBe(true);
    expect(office.has('prices.manage')).toBe(false);
  });

  it('ignores unknown roles', () => {
    expect(permissionsForRoles(['wizard'])).toEqual(new Set());
  });

  it('adds grants on top of the roles and ignores unknown grant names', () => {
    const effective = effectivePermissions(['office'], ['prices.manage', 'nope.nope']);
    expect(effective.has('prices.manage')).toBe(true);
    expect(effective.has('students.manage')).toBe(true);
    expect(effective.has('nope.nope' as Permission)).toBe(false);
  });

  it('checks all-of and any-of requirements', () => {
    const effective = permissionsForRoles(['instructor']);
    expect(hasRequiredPermissions(effective, ['students.read.own'], 'all')).toBe(true);
    expect(hasRequiredPermissions(effective, ['students.read.own', 'students.read'], 'all')).toBe(
      false,
    );
    expect(hasRequiredPermissions(effective, ['students.read', 'students.read.own'], 'any')).toBe(
      true,
    );
    expect(hasRequiredPermissions(effective, ['students.read'], 'any')).toBe(false);
  });
});

describe('grantable and support permissions', () => {
  it('lets every school permission be granted, but no global one', () => {
    expect(GRANTABLE_PERMISSIONS.has('prices.manage')).toBe(true);
    expect(GRANTABLE_PERMISSIONS.has('platform.manage')).toBe(false);
    expect(GRANTABLE_PERMISSIONS.size).toBe(PERMISSIONS.length - GLOBAL_PERMISSIONS.size);
  });

  it('gives support sessions the *.read permissions only, never private notes', () => {
    expect(SUPPORT_READ_PERMISSIONS.size).toBeGreaterThan(5);
    for (const permission of SUPPORT_READ_PERMISSIONS) {
      expect(permission.endsWith('.read')).toBe(true);
    }
    expect(SUPPORT_READ_PERMISSIONS.has('students.read')).toBe(true);
    expect(SUPPORT_READ_PERMISSIONS.has('calendar.read')).toBe(true);
    expect(SUPPORT_READ_PERMISSIONS.has('private_notes.read')).toBe(false);
    expect(SUPPORT_READ_PERMISSIONS.has('lessons.create')).toBe(false);
  });
});

describe('frontend copies of the role map', () => {
  const read = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8');
  const roleLists = (source: string) => {
    const lists: Record<string, string> = {};
    for (const name of ['PERMISSIONS', 'OFFICE', 'INSTRUCTOR', 'STUDENT', 'PARENT']) {
      const match = new RegExp(`const ${name}[^=]*= \\[([^\\]]*)\\]`).exec(source);
      expect(match, name).not.toBeNull();
      lists[name] = (match?.[1] ?? '').replace(/\s+/g, '');
    }
    return lists;
  };
  const api = roleLists(read('../../../src/modules/identity/domain/permissions.ts'));

  it.each([
    ['admin', '../../../../admin/src/lib/permissions.ts'],
    ['mobile', '../../../../mobile/src/lib/permissions.ts'],
  ])('keeps the %s copy identical to the API role map', (_app, path) => {
    expect(roleLists(read(path))).toEqual(api);
  });
});
