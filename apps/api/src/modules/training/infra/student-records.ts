import { Injectable } from '@nestjs/common';
import { and, asc, eq, inArray, isNull, ne, sql } from 'drizzle-orm';
import { notFound } from '../../../kernel/http/errors.js';
import { TenantContext } from '../../../kernel/tenant/tenant-context.js';
import type { StudentBookingProfile } from '../queries/get-student-booking-profile.query.js';
import type { StudentBookingProfileFilter } from '../queries/list-student-booking-profiles.query.js';
import { studentInstructors, students } from './schema.js';
import { studentNotActive } from './training-errors.js';

export type StudentRow = typeof students.$inferSelect;
export type AssignmentRow = typeof studentInstructors.$inferSelect;

@Injectable()
export class StudentRecords {
  constructor(private readonly tenant: TenantContext) {}

  async find(studentId: string): Promise<StudentRow | null> {
    const [row] = await this.tenant.tx.select().from(students).where(eq(students.id, studentId));
    return row ?? null;
  }

  async lock(studentId: string): Promise<StudentRow> {
    const [row] = await this.tenant.tx
      .select()
      .from(students)
      .where(eq(students.id, studentId))
      .for('update');
    if (!row) throw notFound();
    return row;
  }

  async lockActive(studentId: string): Promise<StudentRow> {
    const row = await this.lock(studentId);
    if (row.status !== 'active') throw studentNotActive();
    return row;
  }

  async setVersion(studentId: string, version: number): Promise<void> {
    await this.tenant.tx.update(students).set({ version }).where(eq(students.id, studentId));
  }

  async activeAssignments(studentId: string): Promise<AssignmentRow[]> {
    return this.tenant.tx
      .select()
      .from(studentInstructors)
      .where(
        and(eq(studentInstructors.studentId, studentId), isNull(studentInstructors.unassignedAt)),
      )
      .orderBy(asc(studentInstructors.assignedAt), asc(studentInstructors.id));
  }

  async profile(studentId: string): Promise<StudentBookingProfile | null> {
    const row = await this.find(studentId);
    return row ? this.toProfile(row) : null;
  }

  async profileOfUser(userId: string): Promise<StudentBookingProfile | null> {
    const [row] = await this.tenant.tx
      .select()
      .from(students)
      .where(and(eq(students.userId, userId), ne(students.status, 'anonymized')))
      .orderBy(asc(students.id))
      .limit(1);
    return row ? this.toProfile(row) : null;
  }

  async profiles(filter: StudentBookingProfileFilter): Promise<StudentBookingProfile[]> {
    if (filter.studentIds?.length === 0) return [];
    const area = filter.area?.trim().toLowerCase();
    const rows = await this.tenant.tx
      .select()
      .from(students)
      .where(
        and(
          filter.studentIds ? inArray(students.id, [...new Set(filter.studentIds)]) : undefined,
          area !== undefined ? sql`lower(trim(${students.area})) = ${area}` : undefined,
          filter.licenceClass ? eq(students.licenceClass, filter.licenceClass) : undefined,
          filter.activeOnly ? eq(students.status, 'active') : undefined,
        ),
      )
      .orderBy(asc(students.id));
    if (rows.length === 0) return [];
    const assignments = await this.tenant.tx
      .select()
      .from(studentInstructors)
      .where(
        and(
          inArray(
            studentInstructors.studentId,
            rows.map((row) => row.id),
          ),
          isNull(studentInstructors.unassignedAt),
        ),
      )
      .orderBy(asc(studentInstructors.assignedAt), asc(studentInstructors.id));
    return rows.map((row) =>
      this.profileOf(
        row,
        assignments.filter((assignment) => assignment.studentId === row.id),
      ),
    );
  }

  private async toProfile(row: StudentRow): Promise<StudentBookingProfile> {
    return this.profileOf(row, await this.activeAssignments(row.id));
  }

  private profileOf(row: StudentRow, assignments: readonly AssignmentRow[]): StudentBookingProfile {
    return {
      studentId: row.id,
      userId: row.userId,
      fullName: row.fullName,
      licenceClass: row.licenceClass,
      status: row.status,
      area: row.area,
      pickupAddress: row.pickupAddress,
      pickupLat: row.pickupLat,
      pickupLng: row.pickupLng,
      primaryInstructorMembershipId:
        assignments.find((assignment) => assignment.isPrimary)?.instructorMembershipId ?? null,
      allowedInstructorMembershipIds: assignments.map(
        (assignment) => assignment.instructorMembershipId,
      ),
    };
  }
}
