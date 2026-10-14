export const DEFAULT_AGE_OF_MAJORITY = 18;

function parts(date: string): [number, number, number] {
  const [year = 0, month = 0, day = 0] = date.split('-').map(Number);
  return [year, month, day];
}

export function ageOn(dateOfBirth: string, today: string): number {
  const [birthYear, birthMonth, birthDay] = parts(dateOfBirth);
  const [year, month, day] = parts(today);
  const beforeBirthday = month < birthMonth || (month === birthMonth && day < birthDay);
  return year - birthYear - (beforeBirthday ? 1 : 0);
}

export function isMinorOn(
  dateOfBirth: string,
  ageOfMajority: number | undefined,
  today: string,
): boolean {
  return ageOn(dateOfBirth, today) < (ageOfMajority ?? DEFAULT_AGE_OF_MAJORITY);
}

export function nameMatches(typed: string, fullName: string): boolean {
  return typed.trim().toLowerCase() === fullName.trim().toLowerCase();
}

export function exportFileBase(fullName: string): string {
  const slug = fullName
    .normalize('NFKD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, '-')
    .replace(/^-+|-+$/g, '');
  return `${slug || 'student'}-export`;
}

export const STUDENT_STATUSES = ['active', 'archived', 'anonymized'] as const;

export const STUDENT_TABS = [
  'overview',
  'progress',
  'notes',
  'tests',
  'balance',
  'lessons',
  'documents',
  'contracts',
  'guardians',
] as const;
export type StudentTab = (typeof STUDENT_TABS)[number];
