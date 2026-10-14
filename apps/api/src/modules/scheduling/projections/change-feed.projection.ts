import {
  AvailabilityChanged,
  type EventPayload,
  InstructorAssigned,
  InstructorUnassigned,
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
  TimeOffAdded,
  VehicleChanged,
} from '@driveos/shared';
import { Injectable } from '@nestjs/common';
import { type DomainEvent, QueryBus } from '../../../kernel/cqrs/index.js';
import { Projection } from '../../../kernel/projections/index.js';
import { EventSubscriber } from '../../../kernel/subscribers/index.js';
import { TenantContext } from '../../../kernel/tenant/tenant-context.js';
import { GetStudentBookingProfileQuery, ListProgressEntriesQuery } from '../../training/index.js';
import { ChangeFeedRecords, type FeedEntry, type FeedOp } from '../infra/change-feed-records.js';
import { LessonRecords } from '../infra/lesson-records.js';

type LessonPayload =
  | EventPayload<typeof LessonBooked>
  | EventPayload<typeof LessonMoved>
  | EventPayload<typeof LessonCancelled>
  | EventPayload<typeof LessonCompleted>
  | EventPayload<typeof LessonMarkedNoShow>;

const LESSON_EVENTS: ReadonlySet<string> = new Set([
  LessonBooked.type,
  LessonMoved.type,
  LessonCancelled.type,
  LessonCompleted.type,
  LessonMarkedNoShow.type,
]);

const STUDENT_OPS: Readonly<Record<string, FeedOp>> = {
  [StudentCreated.type]: 'upsert',
  [StudentEnrolled.type]: 'upsert',
  [StudentArchived.type]: 'delete',
  [StudentAnonymized.type]: 'delete',
};

export const CHANGE_FEED_SUBSCRIBER = 'scheduling.change-feed';

const unique = (ids: readonly string[]) => [...new Set(ids)];

@Injectable()
@EventSubscriber({
  name: CHANGE_FEED_SUBSCRIBER,
  events: [
    LessonBooked,
    LessonMoved,
    LessonCancelled,
    LessonCompleted,
    LessonMarkedNoShow,
    StudentCreated,
    StudentEnrolled,
    StudentArchived,
    StudentAnonymized,
    InstructorAssigned,
    InstructorUnassigned,
    ProgressRecorded,
    VehicleChanged,
    AvailabilityChanged,
    TimeOffAdded,
  ],
})
export class ChangeFeedProjection extends Projection {
  protected override readonly serializePerSchool = true;

  constructor(
    tenant: TenantContext,
    private readonly feed: ChangeFeedRecords,
    private readonly lessons: LessonRecords,
    private readonly queryBus: QueryBus,
  ) {
    super(tenant);
  }

  protected async apply(event: DomainEvent): Promise<void> {
    await this.feed.append(await this.entriesFor(event), event.occurredAt);
  }

  private async entriesFor(event: DomainEvent): Promise<FeedEntry[]> {
    if (LESSON_EVENTS.has(event.type)) return this.lessonEntries(event.payload as LessonPayload);
    const studentOp = STUDENT_OPS[event.type];
    if (studentOp) {
      const { studentId } = event.payload as { studentId: string };
      return (await this.assignedTo(studentId)).map((audience) =>
        entry('student', studentId, studentOp, audience),
      );
    }
    switch (event.type) {
      case InstructorAssigned.type:
        return this.assigned(event.payload as EventPayload<typeof InstructorAssigned>);
      case InstructorUnassigned.type:
        return this.unassigned(event.payload as EventPayload<typeof InstructorUnassigned>);
      case ProgressRecorded.type:
        return this.progress(event.payload as EventPayload<typeof ProgressRecorded>);
      case VehicleChanged.type: {
        const vehicle = event.payload as EventPayload<typeof VehicleChanged>;
        return [entry('vehicle', vehicle.vehicleId, vehicle.active ? 'upsert' : 'delete', null)];
      }
      case AvailabilityChanged.type:
      case TimeOffAdded.type: {
        const { instructorMembershipId } = event.payload as { instructorMembershipId: string };
        return [entry('availability', instructorMembershipId, 'upsert', instructorMembershipId)];
      }
      default:
        return [];
    }
  }

  private async lessonEntries(lesson: LessonPayload): Promise<FeedEntry[]> {
    const audiences = unique([
      lesson.instructorMembershipId,
      ...(await this.assignedTo(lesson.studentId)),
    ]);
    const upserts = audiences.map((audience) =>
      entry('lesson', lesson.lessonId, 'upsert', audience),
    );
    const previous =
      'previousInstructorMembershipId' in lesson ? lesson.previousInstructorMembershipId : null;
    if (!previous || audiences.includes(previous)) return upserts;
    return [entry('lesson', lesson.lessonId, 'revoke', previous), ...upserts];
  }

  private async assigned({
    studentId,
    instructorMembershipId: audience,
  }: EventPayload<typeof InstructorAssigned>): Promise<FeedEntry[]> {
    const booked = await this.lessons.refsOfStudent(studentId, ['booked']);
    const progress = await this.queryBus.execute(
      new ListProgressEntriesQuery({ studentIds: [studentId] }),
    );
    return [
      entry('student', studentId, 'upsert', audience),
      ...booked.map((lesson) => entry('lesson', lesson.id, 'upsert', audience)),
      ...progress.map((progressEntry) =>
        entry('progress_entry', progressEntry.id, 'upsert', audience),
      ),
    ];
  }

  private async unassigned({
    studentId,
    instructorMembershipId: audience,
  }: EventPayload<typeof InstructorUnassigned>): Promise<FeedEntry[]> {
    const lessons = await this.lessons.refsOfStudent(studentId);
    const ownLessons = new Set(
      lessons
        .filter((lesson) => lesson.instructorMembershipId === audience)
        .map((lesson) => lesson.id),
    );
    const progress = await this.queryBus.execute(
      new ListProgressEntriesQuery({ studentIds: [studentId] }),
    );
    return [
      entry('student', studentId, 'revoke', audience),
      ...lessons
        .filter((lesson) => !ownLessons.has(lesson.id))
        .map((lesson) => entry('lesson', lesson.id, 'revoke', audience)),
      ...progress
        .filter((progressEntry) => !ownLessons.has(progressEntry.lessonId))
        .map((progressEntry) => entry('progress_entry', progressEntry.id, 'revoke', audience)),
    ];
  }

  private async progress(recorded: EventPayload<typeof ProgressRecorded>): Promise<FeedEntry[]> {
    const instructors = await this.lessons.instructorsOf([recorded.lessonId]);
    const audiences = unique([
      instructors.get(recorded.lessonId) ?? recorded.instructorMembershipId,
      ...(await this.assignedTo(recorded.studentId)),
    ]);
    return recorded.entries.flatMap((progressEntry) =>
      audiences.map((audience) =>
        entry('progress_entry', progressEntry.progressEntryId, 'upsert', audience),
      ),
    );
  }

  private async assignedTo(studentId: string): Promise<string[]> {
    const profile = await this.queryBus.execute(new GetStudentBookingProfileQuery(studentId));
    return profile?.allowedInstructorMembershipIds ?? [];
  }
}

function entry(
  entity: FeedEntry['entity'],
  entityId: string,
  op: FeedOp,
  audience: string | null,
): FeedEntry {
  return { entity, entityId, op, audience };
}
