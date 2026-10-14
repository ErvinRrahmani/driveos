import { ENTITY, seedId } from './ids.js';

const STUDENTS = [
  { user: 6, dateOfBirth: '2003-04-12', area: 'Mitte' },
  { user: 7, dateOfBirth: '2000-07-30', area: 'Kreuzberg' },
  { user: 8, dateOfBirth: '1997-11-05', area: 'Mitte' },
  { user: 9, dateOfBirth: '2006-01-20', area: 'Prenzlauer Berg' },
  { user: 10, dateOfBirth: null, area: 'Kreuzberg' },
] as const;

export const ENROLMENT_STARTED_AT = '2026-09-01T08:00:00.000Z';
export const COURSE_NAME = 'Class B course';
export const PRIMARY_INSTRUCTOR_MEMBERSHIP = seedId(ENTITY.membership, 3);
export const OPENING_CREDIT_MINUTES = 600;

export function minorDateOfBirth(now: Date): string {
  const date = new Date(now);
  date.setUTCFullYear(date.getUTCFullYear() - 16);
  date.setUTCDate(date.getUTCDate() - 60);
  return date.toISOString().slice(0, 10);
}

export const STUDENT_FIXTURES = STUDENTS.map((student, index) => ({
  id: seedId(ENTITY.student, index + 1),
  userId: seedId(ENTITY.user, student.user),
  dateOfBirth: student.dateOfBirth,
  area: student.area,
  enrolmentId: seedId(ENTITY.enrolment, index + 1),
  assignmentId: seedId(ENTITY.studentInstructor, index + 1),
}));

/**
 * The mock keeps no test attempts: these students count as having passed the practical test, so
 * they may review the school. Stella and Sam already have a review; Sofia has not reviewed yet.
 */
export const PASSED_PRACTICAL_STUDENT_IDS: ReadonlySet<string> = new Set(
  STUDENT_FIXTURES.slice(0, 3).map((student) => student.id),
);

export const GUARDIAN_LINK_FIXTURES = [
  {
    id: seedId(ENTITY.guardianLink, 1),
    studentId: seedId(ENTITY.student, 5),
    guardianUserId: seedId(ENTITY.user, 11),
  },
];

export const LESSON_FIXTURES = [
  {
    id: '0192f000-0101-7000-8000-000000000001',
    studentId: seedId(ENTITY.student, 1),
    lessonTypeId: seedId(ENTITY.lessonType, 1),
    vehicleId: seedId(ENTITY.vehicle, 1),
    start: '2026-10-12T07:00:00.000Z',
    pickupAddress: 'Friedrichstraße 100, 10117 Berlin',
    pickupLat: 52.52,
    pickupLng: 13.388,
  },
];
