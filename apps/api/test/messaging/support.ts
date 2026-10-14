import { newId } from '../../src/kernel/db/columns.js';
import { conversations, messages } from '../../src/modules/messaging/infra/schema.js';
import type { TestTenant, TestTenants } from '../support/tenants.js';

export async function createConversationRow(
  tenants: TestTenants,
  tenant: TestTenant,
  input: { studentId: string; instructorMembershipId?: string },
): Promise<string> {
  const id = newId();
  await tenants.asSchool(tenant, (tx) =>
    tx.insert(conversations).values({
      id,
      schoolId: tenant.schoolId,
      kind: input.instructorMembershipId ? 'student_instructor' : 'student_school',
      studentId: input.studentId,
      instructorMembershipId: input.instructorMembershipId ?? null,
    }),
  );
  return id;
}

export async function createMessageRow(
  tenants: TestTenants,
  tenant: TestTenant,
  input: { conversationId: string; senderUserId: string; body?: string; sentAt?: Date },
): Promise<string> {
  const id = newId();
  await tenants.asSchool(tenant, (tx) =>
    tx.insert(messages).values({
      id,
      schoolId: tenant.schoolId,
      conversationId: input.conversationId,
      senderUserId: input.senderUserId,
      body: input.body ?? 'Hello',
      sentAt: input.sentAt ?? new Date(),
    }),
  );
  return id;
}
