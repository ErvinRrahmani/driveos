import { Injectable } from '@nestjs/common';
import { and, asc, eq, isNotNull, isNull } from 'drizzle-orm';
import { TenantContext } from '../../../kernel/tenant/tenant-context.js';
import { guardianLinks, studentInstructors, students } from './schema.js';

@Injectable()
export class Relations {
  constructor(private readonly tenant: TenantContext) {}

  async assignedTo(instructorMembershipId: string): Promise<string[]> {
    const rows = await this.tenant.tx
      .selectDistinct({ studentId: studentInstructors.studentId })
      .from(studentInstructors)
      .where(
        and(
          eq(studentInstructors.instructorMembershipId, instructorMembershipId),
          isNull(studentInstructors.unassignedAt),
        ),
      )
      .orderBy(asc(studentInstructors.studentId));
    return rows.map((row) => row.studentId);
  }

  async ownedBy(userId: string): Promise<string[]> {
    const rows = await this.tenant.tx
      .select({ id: students.id })
      .from(students)
      .where(eq(students.userId, userId))
      .orderBy(asc(students.id));
    return rows.map((row) => row.id);
  }

  async consentedFor(guardianUserId: string): Promise<string[]> {
    const rows = await this.tenant.tx
      .selectDistinct({ studentId: guardianLinks.studentId })
      .from(guardianLinks)
      .where(
        and(
          eq(guardianLinks.guardianUserId, guardianUserId),
          isNotNull(guardianLinks.consentAt),
          isNull(guardianLinks.revokedAt),
        ),
      )
      .orderBy(asc(guardianLinks.studentId));
    return rows.map((row) => row.studentId);
  }

  async consentedGuardiansOf(studentId: string): Promise<string[]> {
    const rows = await this.tenant.tx
      .selectDistinct({ guardianUserId: guardianLinks.guardianUserId })
      .from(guardianLinks)
      .where(
        and(
          eq(guardianLinks.studentId, studentId),
          isNotNull(guardianLinks.consentAt),
          isNull(guardianLinks.revokedAt),
        ),
      )
      .orderBy(asc(guardianLinks.guardianUserId));
    return rows.map((row) => row.guardianUserId);
  }
}
