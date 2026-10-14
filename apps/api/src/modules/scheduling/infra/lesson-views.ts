import type { LessonResponse } from '@driveos/shared';
import { Inject, Injectable } from '@nestjs/common';
import { QueryBus } from '../../../kernel/cqrs/index.js';
import { MembershipDirectory } from '../../identity/index.js';
import { ListStudentNamesQuery } from '../../training/index.js';
import type { CalendarRow } from './lesson-records.js';
import { SchoolFacts } from './school-facts.js';

@Injectable()
export class LessonViews {
  constructor(
    private readonly queryBus: QueryBus,
    private readonly school: SchoolFacts,
    @Inject(MembershipDirectory)
    private readonly directory: MembershipDirectory,
  ) {}

  async instructorNames(): Promise<Map<string, string>> {
    const staff = await this.directory.listStaff();
    return new Map(staff.map((member) => [member.membershipId, member.fullName]));
  }

  async toResponses(rows: readonly CalendarRow[]): Promise<LessonResponse[]> {
    if (rows.length === 0) return [];
    const students = await this.queryBus.execute(
      new ListStudentNamesQuery(rows.map((row) => row.studentId)),
    );
    const instructors = await this.instructorNames();
    const vehicles = rows.some((row) => row.vehicleId) ? await this.school.vehicles() : [];
    const studentNames = new Map(students.map((student) => [student.studentId, student.fullName]));
    const plates = new Map(vehicles.map((vehicle) => [vehicle.id, vehicle.plate]));
    return rows.map((row) => ({
      id: row.id,
      studentId: row.studentId,
      studentName: studentNames.get(row.studentId) ?? '',
      instructorMembershipId: row.instructorMembershipId,
      instructorName: instructors.get(row.instructorMembershipId) ?? '',
      vehicleId: row.vehicleId,
      vehiclePlate: row.vehicleId ? (plates.get(row.vehicleId) ?? null) : null,
      lessonTypeId: row.lessonTypeId,
      lessonTypeName: row.lessonTypeName,
      lessonTypeKind: row.lessonTypeKind,
      creditMinutes: row.creditMinutes,
      start: row.period.start.toISOString(),
      end: row.period.end.toISOString(),
      status: row.status,
      pickupAddress: row.pickupAddress,
      pickupLat: row.pickupLat,
      pickupLng: row.pickupLng,
      bookedVia: row.bookedVia,
      bookedByMembershipId: row.bookedByMembershipId,
      lateCancel: row.lateCancel,
      cancelledAt: row.cancelledAt?.toISOString() ?? null,
      cancelReason: row.cancelReason,
      version: row.version,
    }));
  }
}
