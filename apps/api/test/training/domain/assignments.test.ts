import { describe, expect, it } from 'vitest';
import {
  hasOnePrimary,
  planAssignments,
} from '../../../src/modules/training/domain/assignments.js';

const row = (assignmentId: string, instructorMembershipId: string, isPrimary: boolean) => ({
  assignmentId,
  instructorMembershipId,
  isPrimary,
});

describe('hasOnePrimary', () => {
  it('needs exactly one primary instructor unless the list is empty', () => {
    expect(hasOnePrimary([])).toBe(true);
    expect(hasOnePrimary([{ instructorMembershipId: 'i1', isPrimary: true }])).toBe(true);
    expect(hasOnePrimary([{ instructorMembershipId: 'i1', isPrimary: false }])).toBe(false);
    expect(
      hasOnePrimary([
        { instructorMembershipId: 'i1', isPrimary: true },
        { instructorMembershipId: 'i2', isPrimary: true },
      ]),
    ).toBe(false);
  });
});

describe('planAssignments', () => {
  it('assigns new instructors and unassigns removed ones', () => {
    const plan = planAssignments(
      [row('a1', 'i1', true), row('a2', 'i2', false)],
      [
        { instructorMembershipId: 'i1', isPrimary: true },
        { instructorMembershipId: 'i3', isPrimary: false },
      ],
    );
    expect(plan).toEqual({
      unassign: [row('a2', 'i2', false)],
      demote: [],
      promote: [],
      assign: [{ instructorMembershipId: 'i3', isPrimary: false }],
    });
  });

  it('moves the primary flag in place for instructors who stay', () => {
    const plan = planAssignments(
      [row('a1', 'i1', true), row('a2', 'i2', false)],
      [
        { instructorMembershipId: 'i1', isPrimary: false },
        { instructorMembershipId: 'i2', isPrimary: true },
      ],
    );
    expect(plan).toEqual({
      unassign: [],
      demote: [row('a1', 'i1', true)],
      promote: [row('a2', 'i2', false)],
      assign: [],
    });
  });

  it('changes nothing when the list is the same', () => {
    expect(
      planAssignments([row('a1', 'i1', true)], [{ instructorMembershipId: 'i1', isPrimary: true }]),
    ).toEqual({ unassign: [], demote: [], promote: [], assign: [] });
  });

  it('unassigns everyone for an empty list', () => {
    const plan = planAssignments([row('a1', 'i1', true), row('a2', 'i2', false)], []);
    expect(plan.unassign.map((r) => r.assignmentId)).toEqual(['a1', 'a2']);
    expect(plan.assign).toEqual([]);
  });
});
