import { sql } from 'drizzle-orm';
import {
  type AnyPgColumn,
  integer,
  pgEnum,
  pgTable,
  primaryKey,
  smallint,
  text,
  unique,
  uuid,
} from 'drizzle-orm/pg-core';
import { id, timestamps, tstz } from '../../../kernel/db/columns.js';
import { branches, schoolId } from '../../school/infra/schema.js';
import { students } from '../../training/infra/schema.js';

export const users = pgTable('users', {
  id: id(),
  fullName: text('full_name').notNull(),
  phone: text('phone').unique('users_phone_key'),
  email: text('email').unique('users_email_key'),
  locale: text('locale').notNull(),
  ...timestamps(),
});

export const platformAdmins = pgTable('platform_admins', {
  userId: uuid('user_id')
    .primaryKey()
    .references(() => users.id),
  ...timestamps(),
});

export const membershipsStatus = pgEnum('memberships_status', [
  'invited',
  'pending_consent',
  'active',
  'disabled',
]);

export const memberships = pgTable(
  'memberships',
  {
    id: id(),
    schoolId: schoolId(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id),
    roles: text('roles').array().notNull(),
    status: membershipsStatus('status').notNull(),
    version: integer('version').notNull().default(1),
    ...timestamps(),
  },
  (t) => [unique('memberships_school_user_key').on(t.schoolId, t.userId)],
);

export const membershipBranches = pgTable(
  'membership_branches',
  {
    schoolId: schoolId(),
    membershipId: uuid('membership_id')
      .notNull()
      .references(() => memberships.id),
    branchId: uuid('branch_id')
      .notNull()
      .references(() => branches.id),
    ...timestamps(),
  },
  (t) => [primaryKey({ name: 'membership_branches_pkey', columns: [t.membershipId, t.branchId] })],
);

export const permissionGrants = pgTable(
  'permission_grants',
  {
    schoolId: schoolId(),
    membershipId: uuid('membership_id')
      .notNull()
      .references(() => memberships.id),
    permission: text('permission').notNull(),
    ...timestamps(),
  },
  (t) => [primaryKey({ name: 'permission_grants_pkey', columns: [t.membershipId, t.permission] })],
);

export const invitations = pgTable('invitations', {
  id: id(),
  schoolId: schoolId(),
  roles: text('roles').array().notNull(),
  phone: text('phone'),
  email: text('email'),
  studentId: uuid('student_id').references(() => students.id),
  branchIds: uuid('branch_ids')
    .array()
    .notNull()
    .default(sql`'{}'::uuid[]`),
  tokenHash: text('token_hash').notNull().unique('invitations_token_hash_key'),
  invitedBy: uuid('invited_by')
    .notNull()
    .references(() => users.id),
  expiresAt: tstz('expires_at').notNull(),
  acceptedAt: tstz('accepted_at'),
  ...timestamps(),
});

export const otpCodes = pgTable('otp_codes', {
  id: id(),
  contact: text('contact').notNull(),
  codeHash: text('code_hash').notNull(),
  attempts: smallint('attempts').notNull(),
  expiresAt: tstz('expires_at').notNull(),
  consumedAt: tstz('consumed_at'),
  ...timestamps(),
});

export const refreshTokensClient = pgEnum('refresh_tokens_client', ['web', 'mobile']);

export const refreshTokens = pgTable('refresh_tokens', {
  id: id(),
  userId: uuid('user_id')
    .notNull()
    .references(() => users.id),
  familyId: uuid('family_id').notNull(),
  tokenHash: text('token_hash').notNull().unique('refresh_tokens_token_hash_key'),
  membershipId: uuid('membership_id').references(() => memberships.id),
  client: refreshTokensClient('client').notNull(),
  expiresAt: tstz('expires_at').notNull(),
  rotatedAt: tstz('rotated_at'),
  revokedAt: tstz('revoked_at'),
  successorId: uuid('successor_id').references((): AnyPgColumn => refreshTokens.id),
  ...timestamps(),
});

export const devicesPlatform = pgEnum('devices_platform', ['ios', 'android']);

export const devices = pgTable('devices', {
  id: id(),
  userId: uuid('user_id')
    .notNull()
    .references(() => users.id),
  platform: devicesPlatform('platform').notNull(),
  pushToken: text('push_token').notNull().unique('devices_push_token_key'),
  locale: text('locale').notNull(),
  lastSeenAt: tstz('last_seen_at').notNull(),
  ...timestamps(),
});
