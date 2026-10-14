import { describe, expect, it } from 'vitest';
import { visibleNavItems } from '../../src/lib/navigation';
import { hasPermission, permissionsForRoles } from '../../src/lib/permissions';

const navTargets = (roles: string[], grants: string[] = [], features = ['enrolment_page']) =>
  visibleNavItems(permissionsForRoles(roles, grants), new Set(features)).map((item) => item.to);

describe('permissionsForRoles', () => {
  it('gives the owner every school permission but not platform.manage', () => {
    const owner = permissionsForRoles(['owner']);
    expect(owner.has('prices.manage')).toBe(true);
    expect(owner.has('subscription.manage')).toBe(true);
    expect(owner.has('platform.manage')).toBe(false);
  });

  it('denies office the subscription, payment account and price management', () => {
    const office = permissionsForRoles(['office']);
    expect(office.has('students.manage')).toBe(true);
    expect(office.has('prices.manage')).toBe(false);
    expect(office.has('payment_account.manage')).toBe(false);
    expect(office.has('subscription.manage')).toBe(false);
  });

  it('unions the permissions of every role and adds known grants only', () => {
    const merged = permissionsForRoles(['instructor', 'office'], ['prices.manage', 'nonsense']);
    expect(merged.has('sync.use')).toBe(true);
    expect(merged.has('chat.read_all')).toBe(true);
    expect(merged.has('prices.manage')).toBe(true);
    expect([...merged]).not.toContain('nonsense');
  });

  it('ignores unknown roles', () => {
    expect(permissionsForRoles(['janitor']).size).toBe(0);
  });
});

describe('hasPermission', () => {
  it('accepts when any of the listed permissions is held', () => {
    const office = permissionsForRoles(['office']);
    expect(hasPermission(office, ['lesson_types.manage', 'calendar.read'])).toBe(true);
    expect(hasPermission(office, ['prices.manage'])).toBe(false);
    expect(hasPermission(office, [])).toBe(true);
  });
});

describe('visibleNavItems', () => {
  it('shows the owner every admin screen', () => {
    expect(navTargets(['owner'])).toEqual([
      '/',
      '/calendar',
      '/students',
      '/leads',
      '/instructors',
      '/waiting-list',
      '/slot-offers',
      '/inbox',
      '/invoices',
      '/payments',
      '/reports',
      '/settings',
      '/branches',
      '/vehicles',
      '/staff',
      '/lesson-types',
      '/price-items',
      '/platform-statements',
      '/audit-log',
    ]);
  });

  it('hides school settings and prices from office staff', () => {
    expect(navTargets(['office'])).toEqual([
      '/',
      '/calendar',
      '/students',
      '/leads',
      '/instructors',
      '/waiting-list',
      '/slot-offers',
      '/inbox',
      '/invoices',
      '/payments',
      '/branches',
      '/vehicles',
      '/staff',
      '/lesson-types',
    ]);
  });

  it('hides the leads inbox when the plan lacks the enrolment page', () => {
    expect(navTargets(['owner'], [], [])).not.toContain('/leads');
    expect(navTargets(['instructor'])).not.toContain('/leads');
  });

  it('shows prices to office staff granted prices.manage', () => {
    expect(navTargets(['office'], ['prices.manage'])).toContain('/price-items');
  });
});
