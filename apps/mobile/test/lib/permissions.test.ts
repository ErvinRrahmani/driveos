import { describe, expect, it } from 'vitest';
import { hasPermission, permissionsForRoles } from '../../src/lib/permissions';

describe('permissionsForRoles', () => {
  it('gives the owner every school permission but not platform.manage', () => {
    const owner = permissionsForRoles(['owner']);
    expect(owner.has('prices.manage')).toBe(true);
    expect(owner.has('platform.manage')).toBe(false);
  });

  it('keeps private notes away from students and parents', () => {
    for (const role of ['student', 'parent']) {
      const permissions = permissionsForRoles([role]);
      expect(permissions.has('private_notes.read')).toBe(false);
      expect(permissions.has('private_notes.write.own')).toBe(false);
    }
  });

  it('lets instructors use offline sync and write their own private notes', () => {
    const instructor = permissionsForRoles(['instructor']);
    expect(instructor.has('sync.use')).toBe(true);
    expect(instructor.has('private_notes.write.own')).toBe(true);
    expect(instructor.has('prices.manage')).toBe(false);
  });

  it('lets students practise theory and parents give consent', () => {
    expect(permissionsForRoles(['student']).has('theory.use')).toBe(true);
    expect(permissionsForRoles(['parent']).has('consent.give')).toBe(true);
    expect(permissionsForRoles(['parent']).has('theory.use')).toBe(false);
  });

  it('unions the permissions of every role and adds known grants only', () => {
    const merged = permissionsForRoles(['owner', 'instructor'], ['nonsense']);
    expect(merged.has('sync.use')).toBe(true);
    expect(merged.has('subscription.manage')).toBe(true);
    expect([...merged]).not.toContain('nonsense');
  });

  it('ignores unknown roles', () => {
    expect(permissionsForRoles(['janitor']).size).toBe(0);
  });
});

describe('hasPermission', () => {
  it('accepts when any of the listed permissions is held', () => {
    const student = permissionsForRoles(['student']);
    expect(hasPermission(student, ['lessons.create', 'lessons.create.own'])).toBe(true);
    expect(hasPermission(student, ['lessons.create'])).toBe(false);
    expect(hasPermission(student, [])).toBe(true);
  });
});
