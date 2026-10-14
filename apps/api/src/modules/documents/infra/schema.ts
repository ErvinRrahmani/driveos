import {
  bigint,
  boolean,
  index,
  inet,
  integer,
  pgEnum,
  pgTable,
  text,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { id, timestamps, tstz } from '../../../kernel/db/columns.js';
import { users } from '../../identity/infra/schema.js';
import { schoolId } from '../../school/infra/schema.js';
import { students } from '../../training/infra/schema.js';

export const documentsStatus = pgEnum('documents_status', ['pending', 'ready']);

export const documents = pgTable(
  'documents',
  {
    id: id(),
    schoolId: schoolId(),
    ownerStudentId: uuid('owner_student_id').references(() => students.id),
    kind: text('kind').notNull(),
    storageKey: text('storage_key').notNull(),
    mime: text('mime').notNull(),
    sizeBytes: bigint('size_bytes', { mode: 'number' }).notNull(),
    uploadedBy: uuid('uploaded_by')
      .notNull()
      .references(() => users.id),
    status: documentsStatus('status').notNull(),
    ...timestamps(),
  },
  (t) => [index('documents_owner_student_idx').on(t.schoolId, t.ownerStudentId)],
);

export const contractTemplates = pgTable(
  'contract_templates',
  {
    id: id(),
    schoolId: schoolId(),
    name: text('name').notNull(),
    version: integer('version').notNull(),
    body: text('body').notNull(),
    active: boolean('active').notNull(),
    ...timestamps(),
  },
  (t) => [uniqueIndex('contract_templates_name_version_key').on(t.schoolId, t.name, t.version)],
);

export const contractsStatus = pgEnum('contracts_status', ['pending', 'signed']);

export const contracts = pgTable(
  'contracts',
  {
    id: id(),
    schoolId: schoolId(),
    studentId: uuid('student_id')
      .notNull()
      .references(() => students.id),
    templateId: uuid('template_id')
      .notNull()
      .references(() => contractTemplates.id),
    templateVersion: integer('template_version').notNull(),
    bodySnapshot: text('body_snapshot').notNull(),
    requiresGuardian: boolean('requires_guardian').notNull(),
    status: contractsStatus('status').notNull(),
    completedAt: tstz('completed_at'),
    ...timestamps(),
  },
  (t) => [index('contracts_student_idx').on(t.schoolId, t.studentId)],
);

export const contractSignaturesSignerRole = pgEnum('contract_signatures_signer_role', [
  'student',
  'guardian',
  'school',
]);

export const contractSignatures = pgTable(
  'contract_signatures',
  {
    id: id(),
    schoolId: schoolId(),
    contractId: uuid('contract_id')
      .notNull()
      .references(() => contracts.id),
    signerUserId: uuid('signer_user_id')
      .notNull()
      .references(() => users.id),
    signerRole: contractSignaturesSignerRole('signer_role').notNull(),
    signedAt: tstz('signed_at').notNull(),
    ip: inet('ip').notNull(),
    userAgent: text('user_agent').notNull(),
    ...timestamps(),
  },
  (t) => [uniqueIndex('contract_signatures_contract_role_key').on(t.contractId, t.signerRole)],
);
