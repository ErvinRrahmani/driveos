import { newId } from '../../src/kernel/db/columns.js';
import {
  contracts,
  contractTemplates,
  documents,
} from '../../src/modules/documents/infra/schema.js';
import type { TestTenant, TestTenants } from '../support/tenants.js';

export async function createDocumentRow(
  tenants: TestTenants,
  tenant: TestTenant,
  input: { ownerStudentId: string | null; uploadedBy?: string; status?: 'pending' | 'ready' },
): Promise<string> {
  const id = newId();
  await tenants.asSchool(tenant, (tx) =>
    tx.insert(documents).values({
      id,
      schoolId: tenant.schoolId,
      ownerStudentId: input.ownerStudentId,
      kind: 'eye_test',
      storageKey: `${tenant.schoolId}/${id}`,
      mime: 'application/pdf',
      sizeBytes: 1024,
      uploadedBy: input.uploadedBy ?? tenant.ownerUserId,
      status: input.status ?? 'ready',
    }),
  );
  return id;
}

export async function createTemplateRow(
  tenants: TestTenants,
  tenant: TestTenant,
  input: { name?: string; body?: string; active?: boolean } = {},
): Promise<string> {
  const id = newId();
  await tenants.asSchool(tenant, (tx) =>
    tx.insert(contractTemplates).values({
      id,
      schoolId: tenant.schoolId,
      name: input.name ?? `Template ${id.slice(-6)}`,
      version: 1,
      body: input.body ?? 'Training contract body',
      active: input.active ?? true,
    }),
  );
  return id;
}

export async function createContractRow(
  tenants: TestTenants,
  tenant: TestTenant,
  input: { studentId: string; templateId: string; requiresGuardian?: boolean },
): Promise<string> {
  const id = newId();
  await tenants.asSchool(tenant, (tx) =>
    tx.insert(contracts).values({
      id,
      schoolId: tenant.schoolId,
      studentId: input.studentId,
      templateId: input.templateId,
      templateVersion: 1,
      bodySnapshot: 'Training contract body',
      requiresGuardian: input.requiresGuardian ?? false,
      status: 'pending',
    }),
  );
  return id;
}
