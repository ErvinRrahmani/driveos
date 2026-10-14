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
  'public_page.manage',
  'reviews.moderate',
  'reviews.submit',
  'leads.read',
  'leads.manage',
] as const;

export type Permission = (typeof PERMISSIONS)[number];

export const SCHOOL_ROLES = ['owner', 'office', 'instructor', 'student', 'parent'] as const;
export type SchoolRole = (typeof SCHOOL_ROLES)[number];

export const ROLES = [...SCHOOL_ROLES, 'platform_admin'] as const;
export type Role = (typeof ROLES)[number];

export type PermissionMode = 'all' | 'any';

const CATALOGUE: ReadonlySet<string> = new Set(PERMISSIONS);

export function isPermission(value: string): value is Permission {
  return CATALOGUE.has(value);
}

export const GLOBAL_PERMISSIONS: ReadonlySet<Permission> = new Set<Permission>(['platform.manage']);

export const GRANTABLE_PERMISSIONS: ReadonlySet<Permission> = new Set(
  PERMISSIONS.filter((p) => !GLOBAL_PERMISSIONS.has(p)),
);

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
  'reviews.moderate',
  'leads.read',
  'leads.manage',
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
  'reviews.submit',
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

export const ROLE_PERMISSIONS: Readonly<Record<Role, ReadonlySet<Permission>>> = {
  owner: GRANTABLE_PERMISSIONS,
  office: new Set(OFFICE),
  instructor: new Set(INSTRUCTOR),
  student: new Set(STUDENT),
  parent: new Set(PARENT),
  platform_admin: GLOBAL_PERMISSIONS,
};

export const SUPPORT_READ_PERMISSIONS: ReadonlySet<Permission> = new Set(
  PERMISSIONS.filter((p) => p.endsWith('.read') && p !== 'private_notes.read'),
);

function isRole(value: string): value is Role {
  return (ROLES as readonly string[]).includes(value);
}

export function permissionsForRoles(roles: readonly string[]): Set<Permission> {
  const result = new Set<Permission>();
  for (const role of roles) {
    if (!isRole(role)) continue;
    for (const permission of ROLE_PERMISSIONS[role]) result.add(permission);
  }
  return result;
}

export function effectivePermissions(
  roles: readonly string[],
  grants: readonly string[],
): Set<Permission> {
  const result = permissionsForRoles(roles);
  for (const grant of grants) if (isPermission(grant)) result.add(grant);
  return result;
}

export function hasRequiredPermissions(
  effective: ReadonlySet<Permission>,
  required: readonly Permission[],
  mode: PermissionMode,
): boolean {
  return mode === 'all'
    ? required.every((p) => effective.has(p))
    : required.some((p) => effective.has(p));
}
