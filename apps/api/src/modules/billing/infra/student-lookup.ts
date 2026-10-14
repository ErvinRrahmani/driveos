import { Inject, Injectable } from '@nestjs/common';
import { QueryBus } from '../../../kernel/cqrs/index.js';
import { MembershipDirectory } from '../../identity/index.js';
import {
  GetStudentBookingProfileQuery,
  GetStudentByUserQuery,
  ListLinkedStudentIdsQuery,
} from '../../training/index.js';

export interface StudentContact {
  userId: string | null;
  name: string | null;
  email: string | null;
  phone: string | null;
}

@Injectable()
export class StudentLookup {
  constructor(
    private readonly queryBus: QueryBus,
    @Inject(MembershipDirectory)
    private readonly memberships: MembershipDirectory,
  ) {}

  async exists(studentId: string): Promise<boolean> {
    return (await this.queryBus.execute(new GetStudentBookingProfileQuery(studentId))) !== null;
  }

  async studentIdOfUser(userId: string): Promise<string | null> {
    const student = await this.queryBus.execute(new GetStudentByUserQuery(userId));
    return student?.studentId ?? null;
  }

  linkedStudentIds(guardianUserId: string): Promise<string[]> {
    return this.queryBus.execute(new ListLinkedStudentIdsQuery(guardianUserId));
  }

  async contactOf(studentId: string): Promise<StudentContact | null> {
    const student = await this.queryBus.execute(new GetStudentBookingProfileQuery(studentId));
    if (!student) return null;
    const [contact] = student.userId ? await this.memberships.contactsOf([student.userId]) : [];
    return {
      userId: student.userId,
      name: student.fullName || contact?.fullName || null,
      email: contact?.email ?? null,
      phone: contact?.phone ?? null,
    };
  }
}
