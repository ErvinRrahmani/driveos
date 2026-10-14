import type { StudentInstructor, StudentResponse } from '@driveos/shared';
import { Injectable } from '@nestjs/common';
import { asc, eq } from 'drizzle-orm';
import { TenantContext } from '../../../kernel/tenant/tenant-context.js';
import { MinorStatus } from './minor-status.js';
import { People } from './people.js';
import { enrolments, guardianLinks } from './schema.js';
import { type StudentRow, StudentRecords } from './student-records.js';

@Injectable()
export class StudentViews {
  constructor(
    private readonly tenant: TenantContext,
    private readonly records: StudentRecords,
    private readonly people: People,
    private readonly minors: MinorStatus,
  ) {}

  async instructors(studentId: string): Promise<StudentInstructor[]> {
    const rows = await this.records.activeAssignments(studentId);
    const names = await this.people.staffNames();
    return rows.map((row) => ({
      assignmentId: row.id,
      instructorMembershipId: row.instructorMembershipId,
      instructorName: names.get(row.instructorMembershipId) ?? '',
      isPrimary: row.isPrimary,
      assignedAt: row.assignedAt.toISOString(),
    }));
  }

  async detail(student: StudentRow): Promise<StudentResponse> {
    const enrolled = await this.tenant.tx
      .select()
      .from(enrolments)
      .where(eq(enrolments.studentId, student.id))
      .orderBy(asc(enrolments.startedAt), asc(enrolments.id));
    const links = await this.tenant.tx
      .select()
      .from(guardianLinks)
      .where(eq(guardianLinks.studentId, student.id))
      .orderBy(asc(guardianLinks.id));
    const contacts = await this.people.contacts([
      student.userId,
      ...links.map((link) => link.guardianUserId),
    ]);
    const own = student.userId ? contacts.get(student.userId) : undefined;
    return {
      id: student.id,
      userId: student.userId,
      fullName: student.fullName,
      phone: own?.phone ?? null,
      email: own?.email ?? null,
      dateOfBirth: student.dateOfBirth,
      isMinor: await this.minors.isMinor(student.dateOfBirth),
      licenceClass: student.licenceClass,
      examLanguage: student.examLanguage,
      testDate: student.testDate,
      area: student.area,
      pickupAddress: student.pickupAddress,
      pickupLat: student.pickupLat,
      pickupLng: student.pickupLng,
      status: student.status,
      enrolments: enrolled.map((row) => ({
        id: row.id,
        courseName: row.courseName,
        licenceClass: row.licenceClass,
        startedAt: row.startedAt.toISOString(),
        endedAt: row.endedAt?.toISOString() ?? null,
      })),
      instructors: await this.instructors(student.id),
      guardians: links.map((link) => {
        const contact = contacts.get(link.guardianUserId);
        return {
          id: link.id,
          guardianUserId: link.guardianUserId,
          fullName: contact?.fullName ?? '',
          phone: contact?.phone ?? null,
          email: contact?.email ?? null,
          consentAt: link.consentAt?.toISOString() ?? null,
          consentTextVersion: link.consentTextVersion,
          revokedAt: link.revokedAt?.toISOString() ?? null,
        };
      }),
    };
  }
}
