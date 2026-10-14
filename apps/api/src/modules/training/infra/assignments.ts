import { InstructorAssigned, InstructorUnassigned } from '@driveos/shared';
import { Injectable } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import { newId } from '../../../kernel/db/columns.js';
import { TenantContext } from '../../../kernel/tenant/tenant-context.js';
import type { AssignmentPlan } from '../domain/assignments.js';
import type { StudentStream } from '../events/student-stream.js';
import { People } from './people.js';
import { studentInstructors } from './schema.js';
import type { AssignmentRow } from './student-records.js';

@Injectable()
export class Assignments {
  constructor(
    private readonly tenant: TenantContext,
    private readonly people: People,
  ) {}

  async apply(
    stream: StudentStream,
    current: readonly AssignmentRow[],
    plan: AssignmentPlan,
    now: Date,
  ): Promise<void> {
    const byId = new Map(current.map((row) => [row.id, row]));
    await this.unassign(
      stream,
      plan.unassign.flatMap((row) => byId.get(row.assignmentId) ?? []),
      now,
    );
    const names = await this.people.staffNames();
    const flips = [
      ...plan.demote.map((row) => ({ row, isPrimary: false })),
      ...plan.promote.map((row) => ({ row, isPrimary: true })),
    ];
    for (const { row, isPrimary } of flips) {
      const stored = byId.get(row.assignmentId);
      if (!stored) continue;
      await this.tenant.tx
        .update(studentInstructors)
        .set({ isPrimary })
        .where(eq(studentInstructors.id, stored.id));
      stream.add(InstructorAssigned, {
        assignmentId: stored.id,
        studentId: stream.studentId,
        instructorMembershipId: stored.instructorMembershipId,
        instructorName: names.get(stored.instructorMembershipId) ?? '',
        isPrimary,
        assignedAt: stored.assignedAt.toISOString(),
      });
    }
    for (const wanted of plan.assign) {
      const id = newId();
      const schoolId = this.tenant.schoolId;
      if (!schoolId) throw new Error('Assigning an instructor needs a school scope');
      await this.tenant.tx.insert(studentInstructors).values({
        id,
        schoolId,
        studentId: stream.studentId,
        instructorMembershipId: wanted.instructorMembershipId,
        isPrimary: wanted.isPrimary,
        assignedAt: now,
      });
      stream.add(InstructorAssigned, {
        assignmentId: id,
        studentId: stream.studentId,
        instructorMembershipId: wanted.instructorMembershipId,
        instructorName: names.get(wanted.instructorMembershipId) ?? '',
        isPrimary: wanted.isPrimary,
        assignedAt: now.toISOString(),
      });
    }
  }

  async unassign(stream: StudentStream, rows: readonly AssignmentRow[], now: Date): Promise<void> {
    for (const row of rows) {
      await this.tenant.tx
        .update(studentInstructors)
        .set({ unassignedAt: now })
        .where(eq(studentInstructors.id, row.id));
      stream.add(InstructorUnassigned, {
        assignmentId: row.id,
        studentId: stream.studentId,
        instructorMembershipId: row.instructorMembershipId,
        wasPrimary: row.isPrimary,
        unassignedAt: now.toISOString(),
      });
    }
  }
}
