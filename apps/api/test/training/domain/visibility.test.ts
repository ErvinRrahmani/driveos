import { describe, expect, it } from 'vitest';
import {
  LESSON_LOOKBACK_DAYS,
  lessonWindowStart,
  studentScope,
  visibleStudentIds,
} from '../../../src/modules/training/domain/visibility.js';

const none = { assigned: [], withLessons: [], self: [], linked: [] };

describe('studentScope', () => {
  it('lets callers who read every student see everyone, whatever their roles', () => {
    expect(
      studentScope({ readsAll: true, roles: ['owner', 'instructor'], membershipId: 'm1' }),
    ).toEqual({ all: true, asInstructor: false, asStudent: false, asParent: false });
  });

  it('derives the own-scopes from the role set', () => {
    expect(studentScope({ readsAll: false, roles: ['instructor'], membershipId: 'm1' })).toEqual({
      all: false,
      asInstructor: true,
      asStudent: false,
      asParent: false,
    });
    expect(
      studentScope({ readsAll: false, roles: ['student', 'parent'], membershipId: 'm1' }),
    ).toEqual({ all: false, asInstructor: false, asStudent: true, asParent: true });
  });

  it('needs a membership to see students as an instructor', () => {
    expect(studentScope({ readsAll: false, roles: ['instructor'], membershipId: null })).toEqual({
      all: false,
      asInstructor: false,
      asStudent: false,
      asParent: false,
    });
  });
});

describe('visibleStudentIds', () => {
  it('is everything for a read-all scope', () => {
    expect(
      visibleStudentIds(studentScope({ readsAll: true, roles: [], membershipId: null }), none),
    ).toBe('all');
  });

  it('gives an instructor the assigned students and the students they teach', () => {
    const scope = studentScope({ readsAll: false, roles: ['instructor'], membershipId: 'm1' });
    const ids = visibleStudentIds(scope, {
      assigned: ['s1'],
      withLessons: ['s2', 's1'],
      self: ['s3'],
      linked: ['s4'],
    });
    expect([...ids].sort()).toEqual(['s1', 's2']);
  });

  it('gives a student only their own record and a parent only linked students', () => {
    const sources = { assigned: ['s1'], withLessons: ['s2'], self: ['s3'], linked: ['s4'] };
    const student = studentScope({ readsAll: false, roles: ['student'], membershipId: 'm1' });
    const parent = studentScope({ readsAll: false, roles: ['parent'], membershipId: 'm1' });
    expect([...visibleStudentIds(student, sources)]).toEqual(['s3']);
    expect([...visibleStudentIds(parent, sources)]).toEqual(['s4']);
  });

  it('unions the scopes of a membership with several roles', () => {
    const scope = studentScope({
      readsAll: false,
      roles: ['instructor', 'parent'],
      membershipId: 'm1',
    });
    const ids = visibleStudentIds(scope, {
      assigned: ['s1'],
      withLessons: [],
      self: ['s3'],
      linked: ['s4'],
    });
    expect([...ids].sort()).toEqual(['s1', 's4']);
  });

  it('sees nothing without a matching role', () => {
    const scope = studentScope({ readsAll: false, roles: ['office'], membershipId: 'm1' });
    expect([...visibleStudentIds(scope, { ...none, assigned: ['s1'], self: ['s2'] })]).toEqual([]);
  });
});

describe('lessonWindowStart', () => {
  it('reaches back 90 days', () => {
    expect(LESSON_LOOKBACK_DAYS).toBe(90);
    expect(lessonWindowStart(new Date('2026-10-08T12:00:00Z')).toISOString()).toBe(
      '2026-07-10T12:00:00.000Z',
    );
  });
});
