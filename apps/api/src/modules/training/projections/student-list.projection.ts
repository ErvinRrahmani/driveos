import {
  type EventPayload,
  InstructorAssigned,
  InstructorUnassigned,
  LedgerEntryRecorded,
  LessonBooked,
  LessonCancelled,
  LessonCompleted,
  LessonMarkedNoShow,
  LessonMoved,
  ProgressRecorded,
  StudentAnonymized,
  StudentArchived,
  StudentCreated,
  StudentEnrolled,
  TestAttemptRecorded,
} from '@driveos/shared';
import { Injectable } from '@nestjs/common';
import type { DomainEvent } from '../../../kernel/cqrs/index.js';
import { Projection } from '../../../kernel/projections/index.js';
import { EventSubscriber } from '../../../kernel/subscribers/index.js';
import { TenantContext } from '../../../kernel/tenant/tenant-context.js';
import type { TrackedLessonStatus } from '../domain/lesson-dates.js';
import { StudentListRows } from '../infra/student-list.js';

const LESSON_STATUS: Readonly<Record<string, TrackedLessonStatus>> = {
  LessonBooked: 'booked',
  LessonMoved: 'booked',
  LessonCompleted: 'completed',
  LessonCancelled: 'cancelled',
  LessonMarkedNoShow: 'no_show',
};

type LessonPayload =
  | EventPayload<typeof LessonBooked>
  | EventPayload<typeof LessonMoved>
  | EventPayload<typeof LessonCompleted>
  | EventPayload<typeof LessonCancelled>
  | EventPayload<typeof LessonMarkedNoShow>;

type Payload = LessonPayload | EventPayload<typeof LedgerEntryRecorded> | { studentId: string };

@Injectable()
@EventSubscriber({
  name: 'training.student-list',
  events: [
    StudentCreated,
    StudentEnrolled,
    StudentArchived,
    StudentAnonymized,
    InstructorAssigned,
    InstructorUnassigned,
    ProgressRecorded,
    TestAttemptRecorded,
    LedgerEntryRecorded,
    LessonBooked,
    LessonMoved,
    LessonCancelled,
    LessonCompleted,
    LessonMarkedNoShow,
  ],
})
export class StudentListProjection extends Projection<Payload> {
  constructor(
    tenant: TenantContext,
    private readonly rows: StudentListRows,
  ) {
    super(tenant);
  }

  protected async apply(event: DomainEvent<Payload>): Promise<void> {
    const { studentId } = event.payload;
    await this.rows.lockStudent(studentId);
    const lessonStatus = LESSON_STATUS[event.type];
    if (lessonStatus) {
      const lesson = event.payload as LessonPayload;
      await this.rows.trackLesson({
        schoolId: event.schoolId as string,
        lessonId: lesson.lessonId,
        studentId,
        instructorMembershipId: lesson.instructorMembershipId,
        start: lesson.start,
        end: lesson.end,
        status: lessonStatus,
      });
      return;
    }
    if (event.type === LedgerEntryRecorded.type) {
      const entry = event.payload as EventPayload<typeof LedgerEntryRecorded>;
      await this.rows.setBalance(studentId, entry.balanceAfter);
      return;
    }
    await this.rows.refresh(studentId);
  }
}
