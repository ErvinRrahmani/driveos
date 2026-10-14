export const ENTITY = {
  school: 0x01,
  user: 0x02,
  membership: 0x03,
  branch: 0x04,
  vehicle: 0x05,
  lessonType: 0x06,
  student: 0x07,
  enrolment: 0x08,
  studentInstructor: 0x09,
  guardianLink: 0x0a,
  syllabusItem: 0x0b,
  priceItem: 0x0c,
  plan: 0x0d,
  subscription: 0x0e,
  openingHours: 0x0f,
  questionPack: 0x10,
  question: 0x11,
} as const;

export function seedId(entity: number, n: number): string {
  return `0192f000-${entity.toString(16).padStart(4, '0')}-7000-8000-${n.toString(16).padStart(12, '0')}`;
}

export function fixtureId(entity: number, schoolIndex: number, index: number): string {
  return seedId(entity, schoolIndex * 100 + index + 1);
}
