import { describe, expect, it } from 'vitest';
import {
  chooseStudent,
  type LinkedStudent,
  linkedStudentsFrom,
} from '../../src/lib/parent-students';

const MIA = '0192f000-0007-7000-8000-000000000005';
const MAX = '0192f000-0007-7000-8000-000000000006';

const lesson = (studentId: string, studentName: string) => ({ studentId, studentName });

describe('linkedStudentsFrom', () => {
  it('returns nobody when the shop finds no linked student', () => {
    expect(linkedStudentsFrom({ kind: 'none' }, [])).toEqual([]);
  });

  it('takes the single student from the shop and the name from a lesson', () => {
    expect(linkedStudentsFrom({ kind: 'one', studentId: MIA }, [lesson(MIA, 'Mia Minor')])).toEqual(
      [{ id: MIA, name: 'Mia Minor' }],
    );
  });

  it('keeps a student without lessons, with no name', () => {
    expect(linkedStudentsFrom({ kind: 'one', studentId: MIA }, [])).toEqual([
      { id: MIA, name: null },
    ]);
  });

  it('lists several students from their lessons, once each, sorted by name', () => {
    const lessons = [lesson(MIA, 'Mia Minor'), lesson(MAX, 'Max Minor'), lesson(MIA, 'Mia Minor')];
    expect(linkedStudentsFrom({ kind: 'several' }, lessons)).toEqual([
      { id: MAX, name: 'Max Minor' },
      { id: MIA, name: 'Mia Minor' },
    ]);
  });
});

describe('chooseStudent', () => {
  const students: LinkedStudent[] = [
    { id: MAX, name: 'Max Minor' },
    { id: MIA, name: 'Mia Minor' },
  ];

  it('keeps the chosen student while still linked', () => {
    expect(chooseStudent(students, MIA)).toEqual(students[1]);
  });

  it('falls back to the first student when the choice is gone or empty', () => {
    expect(chooseStudent(students, 'gone')).toEqual(students[0]);
    expect(chooseStudent(students, null)).toEqual(students[0]);
  });

  it('returns null without linked students', () => {
    expect(chooseStudent([], MIA)).toBeNull();
  });
});
