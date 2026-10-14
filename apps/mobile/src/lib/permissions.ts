export const PERMISSIONS = [
  'school.read',
  'school.manage',
  'settings.manage',
  'branches.manage',
  'vehicles.manage',
  'staff.read',
  'invitations.manage',
  'memberships.manage',
  'prices.read',
  'prices.manage',
  'lesson_types.manage',
  'syllabus.read',
  'calendar.read',
  'calendar.read.own',
  'lessons.read.own',
  'lessons.create',
  'lessons.create.own',
  'lessons.move',
  'lessons.move.own',
  'lessons.cancel',
  'lessons.cancel.own',
  'lessons.complete',
  'lessons.complete.own',
  'availability.manage',
  'availability.manage.own',
  'students.read',
  'students.read.own',
  'students.manage',
  'students.export',
  'students.anonymize',
  'progress.read',
  'progress.read.own',
  'progress.write.own',
  'private_notes.read',
  'private_notes.write.own',
  'test_attempts.write',
  'test_attempts.write.own',
  'guardians.manage',
  'consent.give',
  'theory.use',
  'shop.read',
  'checkout.create',
  'balance.read',
  'balance.read.own',
  'ledger.adjust',
  'payments.cash.record',
  'refunds.create',
  'invoices.read',
  'invoices.read.own',
  'platform_statements.read',
  'documents.read',
  'documents.read.own',
  'documents.upload',
  'contracts.manage',
  'contracts.sign',
  'chat.use',
  'chat.read_all',
  'reports.read',
  'audit_log.read',
  'payment_account.manage',
  'subscription.manage',
  'platform.manage',
  'waiting_list.manage',
  'waiting_list.manage.own',
  'slot_offers.manage',
  'slot_offers.accept',
  'sync.use',
] as const;

export type Permission = (typeof PERMISSIONS)[number];

export const SCHOOL_ROLES = ['owner', 'office', 'instructor', 'student', 'parent'] as const;
export type SchoolRole = (typeof SCHOOL_ROLES)[number];

export const STAFF_ROLES: readonly SchoolRole[] = ['owner', 'office'];

const GLOBAL_PERMISSIONS: ReadonlySet<Permission> = new Set<Permission>(['platform.manage']);

const OFFICE: Permission[] = [
  'school.read',
  'staff.read',
  'invitations.manage',
  'prices.read',
  'syllabus.read',
  'calendar.read',
  'lessons.create',
  'lessons.move',
  'lessons.cancel',
  'lessons.complete',
  'availability.manage',
  'students.read',
  'students.manage',
  'students.export',
  'progress.read',
  'private_notes.read',
  'test_attempts.write',
  'guardians.manage',
  'shop.read',
  'balance.read',
  'ledger.adjust',
  'payments.cash.record',
  'refunds.create',
  'invoices.read',
  'documents.read',
  'documents.upload',
  'contracts.manage',
  'chat.use',
  'chat.read_all',
  'waiting_list.manage',
  'slot_offers.manage',
];

const INSTRUCTOR: Permission[] = [
  'school.read',
  'prices.read',
  'syllabus.read',
  'calendar.read.own',
  'lessons.create.own',
  'lessons.move.own',
  'lessons.cancel.own',
  'lessons.complete.own',
  'availability.manage.own',
  'students.read.own',
  'progress.read.own',
  'progress.write.own',
  'private_notes.write.own',
  'test_attempts.write.own',
  'balance.read.own',
  'payments.cash.record',
  'documents.read.own',
  'documents.upload',
  'chat.use',
  'sync.use',
];

const STUDENT: Permission[] = [
  'school.read',
  'syllabus.read',
  'lessons.read.own',
  'lessons.create.own',
  'lessons.cancel.own',
  'students.read.own',
  'progress.read.own',
  'theory.use',
  'shop.read',
  'checkout.create',
  'balance.read.own',
  'invoices.read.own',
  'documents.read.own',
  'documents.upload',
  'contracts.sign',
  'chat.use',
  'waiting_list.manage.own',
  'slot_offers.accept',
];

const PARENT: Permission[] = [
  'school.read',
  'syllabus.read',
  'lessons.read.own',
  'lessons.create.own',
  'lessons.cancel.own',
  'students.read.own',
  'progress.read.own',
  'shop.read',
  'checkout.create',
  'balance.read.own',
  'invoices.read.own',
  'documents.read.own',
  'contracts.sign',
  'consent.give',
  'waiting_list.manage.own',
  'slot_offers.accept',
];

export const ROLE_PERMISSIONS: Readonly<Record<SchoolRole, ReadonlySet<Permission>>> = {
  owner: new Set(PERMISSIONS.filter((p) => !GLOBAL_PERMISSIONS.has(p))),
  office: new Set(OFFICE),
  instructor: new Set(INSTRUCTOR),
  student: new Set(STUDENT),
  parent: new Set(PARENT),
};

const CATALOGUE: ReadonlySet<string> = new Set(PERMISSIONS);

function isPermission(value: string): value is Permission {
  return CATALOGUE.has(value);
}

function isSchoolRole(value: string): value is SchoolRole {
  return (SCHOOL_ROLES as readonly string[]).includes(value);
}

export function permissionsForRoles(
  roles: readonly string[],
  grants: readonly string[] = [],
): ReadonlySet<Permission> {
  const result = new Set<Permission>();
  for (const role of roles) {
    if (!isSchoolRole(role)) continue;
    for (const permission of ROLE_PERMISSIONS[role]) result.add(permission);
  }
  for (const grant of grants)
    if (isPermission(grant) && !GLOBAL_PERMISSIONS.has(grant)) result.add(grant);
  return result;
}

export function hasPermission(
  permissions: ReadonlySet<Permission>,
  anyOf: readonly Permission[],
): boolean {
  return anyOf.length === 0 || anyOf.some((permission) => permissions.has(permission));
}

export function isStaff(roles: readonly string[]): boolean {
  return roles.some((role) => (STAFF_ROLES as readonly string[]).includes(role));
}
