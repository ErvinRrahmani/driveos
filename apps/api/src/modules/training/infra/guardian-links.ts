import { GuardianLinked } from '@driveos/shared';
import { Injectable } from '@nestjs/common';
import { and, eq, isNull } from 'drizzle-orm';
import { EventPublisher } from '../../../kernel/cqrs/index.js';
import { TenantContext } from '../../../kernel/tenant/tenant-context.js';
import { StudentStream } from '../events/student-stream.js';
import { MinorStatus } from './minor-status.js';
import { guardianLinks } from './schema.js';
import { StudentRecords } from './student-records.js';

export interface LinkedGuardian {
  id: string;
  version: number;
  created: boolean;
}

@Injectable()
export class GuardianLinks {
  constructor(
    private readonly tenant: TenantContext,
    private readonly students: StudentRecords,
    private readonly minors: MinorStatus,
    private readonly publisher: EventPublisher,
  ) {}

  async link(studentId: string, guardianUserId: string): Promise<LinkedGuardian> {
    const student = await this.students.lock(studentId);
    const [existing] = await this.tenant.tx
      .select({ id: guardianLinks.id, version: guardianLinks.version })
      .from(guardianLinks)
      .where(
        and(
          eq(guardianLinks.studentId, studentId),
          eq(guardianLinks.guardianUserId, guardianUserId),
          isNull(guardianLinks.revokedAt),
        ),
      );
    if (existing) return { ...existing, created: false };
    const [row] = await this.tenant.tx
      .insert(guardianLinks)
      .values({ schoolId: student.schoolId, studentId, guardianUserId })
      .returning({ id: guardianLinks.id, version: guardianLinks.version });
    if (!row) throw new Error('Guardian link insert returned no row');
    const stream = new StudentStream(studentId, student.version);
    stream.add(GuardianLinked, {
      guardianLinkId: row.id,
      studentId,
      guardianUserId,
      studentUserId: student.userId,
      consentRequired: await this.minors.isMinor(student.dateOfBirth),
    });
    await this.students.setVersion(studentId, stream.version);
    await this.publisher.append(stream.events);
    return { ...row, created: true };
  }
}
