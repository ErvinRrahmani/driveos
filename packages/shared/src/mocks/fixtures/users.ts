import { ENTITY, seedId } from './ids.js';
import { BERLIN, LISBON } from './schools.js';

const NAMES = [
  'Petra Platform',
  'Otto Owner',
  'Olga Office',
  'Ingo Instructor',
  'Ines Ferreira',
  'Stella Student',
  'Sam Schulz',
  'Sofia Silva',
  'Simon Sommer',
  'Mia Minor',
  'Gustav Minor',
] as const;

export const USER_FIXTURES = NAMES.map((fullName, index) => {
  const n = index + 1;
  return {
    id: seedId(ENTITY.user, n),
    fullName,
    phone: n === 5 ? '+351910000005' : `+49155500000${String(n).padStart(2, '0')}`,
    email: `${fullName.toLowerCase().replace(' ', '.')}@example.com`,
    locale: 'en',
  };
});

export const PLATFORM_ADMIN_USER = seedId(ENTITY.user, 1);

type Role = 'owner' | 'office' | 'instructor' | 'student' | 'parent';
type Status = 'active' | 'pending_consent';

const MEMBERSHIPS: [user: number, school: string, roles: Role[], status?: Status][] = [
  [2, BERLIN, ['owner']],
  [3, BERLIN, ['office']],
  [4, BERLIN, ['instructor']],
  [5, LISBON, ['owner', 'instructor']],
  [6, BERLIN, ['student']],
  [7, BERLIN, ['student']],
  [8, BERLIN, ['student']],
  [9, BERLIN, ['student']],
  [10, BERLIN, ['student'], 'pending_consent'],
  [11, BERLIN, ['parent']],
];

export const MEMBERSHIP_FIXTURES = MEMBERSHIPS.map(([user, schoolId, roles, status], index) => ({
  id: seedId(ENTITY.membership, index + 1),
  userId: seedId(ENTITY.user, user),
  schoolId,
  roles,
  status: status ?? 'active',
}));
