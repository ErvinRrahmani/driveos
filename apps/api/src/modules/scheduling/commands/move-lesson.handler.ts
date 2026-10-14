import { LessonMoved } from '@driveos/shared';
import { Inject } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import {
  CommandHandler,
  type CommandResult,
  EventPublisher,
  type ICommandHandler,
  newEvent,
  QueryBus,
} from '../../../kernel/cqrs/index.js';
import { ConflictError, invalidField, notFound } from '../../../kernel/http/errors.js';
import { t } from '../../../kernel/i18n/i18n.js';
import { LEDGER_WRITER, type LedgerWriter } from '../../billing/index.js';
import { GetStudentBookingProfileQuery, type StudentBookingProfile } from '../../training/index.js';
import { moveInsideWindow } from '../domain/move.js';
import { forbidden } from '../infra/access.js';
import { type LessonActor, LessonActors, type LockedLesson } from '../infra/lesson-actors.js';
import { LessonConflicts } from '../infra/lesson-conflicts.js';
import { LessonViews } from '../infra/lesson-views.js';
import { lessons } from '../infra/schema.js';
import { SchoolFacts } from '../infra/school-facts.js';
import { SlotValidator } from '../infra/slot-validator.js';
import { ViewerScope } from '../infra/viewer-scope.js';
import { MoveLessonCommand } from './move-lesson.command.js';

@CommandHandler(MoveLessonCommand)
export class MoveLessonHandler implements ICommandHandler<MoveLessonCommand, CommandResult> {
  constructor(
    private readonly queryBus: QueryBus,
    private readonly actors: LessonActors,
    private readonly viewer: ViewerScope,
    private readonly school: SchoolFacts,
    private readonly slots: SlotValidator,
    private readonly conflicts: LessonConflicts,
    private readonly views: LessonViews,
    private readonly publisher: EventPublisher,
    @Inject(LEDGER_WRITER) private readonly ledger: LedgerWriter,
  ) {}

  async execute(command: MoveLessonCommand): Promise<CommandResult> {
    const { actor, body } = command;
    if (!actor.membershipId) throw forbidden();
    const lesson = await this.actors.lock(command.lessonId);
    const mover = await this.actors.resolve(actor, lesson, 'lessons.move');
    if (lesson.status !== 'booked') {
      throw new ConflictError('lesson_not_booked', t('errors.lesson_not_booked'));
    }
    if (body.version !== undefined && body.version !== lesson.version) {
      const [serverVersion] = await this.views.toResponses([lesson]);
      throw new ConflictError('version_conflict', t('errors.version_conflict'), { serverVersion });
    }

    const instructorMembershipId = body.instructorMembershipId ?? lesson.instructorMembershipId;
    const profile = await this.queryBus.execute(
      new GetStudentBookingProfileQuery(lesson.studentId),
    );
    if (!profile) throw notFound();
    if (instructorMembershipId !== lesson.instructorMembershipId) {
      await this.requireInstructor(mover, profile, instructorMembershipId);
    }
    if (profile.status !== 'active') {
      throw new ConflictError('student_not_active', t('errors.student_not_active'));
    }
    if (body.lessonTypeId !== undefined && body.lessonTypeId !== lesson.lessonTypeId) {
      await this.requireSameEntitlement(lesson, body.lessonTypeId);
    }

    const vehicleId = body.vehicleId === undefined ? lesson.vehicleId : body.vehicleId;
    const { type, period } = await this.slots.validate({
      profile,
      lessonTypeId: body.lessonTypeId ?? lesson.lessonTypeId,
      instructorMembershipId,
      vehicleId,
      start: body.start === undefined ? lesson.period.start : new Date(body.start),
      excludeLessonId: lesson.id,
    });
    const typeChanged = type.id !== lesson.lessonTypeId;
    const slotChanged =
      typeChanged ||
      period.start.getTime() !== lesson.period.start.getTime() ||
      period.end.getTime() !== lesson.period.end.getTime() ||
      instructorMembershipId !== lesson.instructorMembershipId ||
      vehicleId !== lesson.vehicleId;

    const settings = await this.school.settings();
    const creditMinutes = typeChanged ? type.creditMinutes : lesson.creditMinutes;
    const { lateCancellation } = slotChanged
      ? moveInsideWindow({
          now: new Date(),
          originalStart: lesson.period.start,
          windowHours: settings.cancellationWindowHours,
          byRole: mover.role,
        })
      : { lateCancellation: false };
    const charge = lateCancellation ? creditMinutes : creditMinutes - lesson.creditMinutes;

    await this.ledger.lockStudent(lesson.studentId);
    if (charge > 0 && (await this.ledger.balance(lesson.studentId)) < charge) {
      if (mover.scope === 'own' || !settings.allowNegativeBalance) {
        throw new ConflictError('insufficient_balance', t('errors.insufficient_balance'));
      }
    }

    const version = lesson.version + 1;
    const keys = { studentId: lesson.studentId, instructorMembershipId, vehicleId };
    await this.conflicts.guard(
      keys,
      period,
      (tx) =>
        tx
          .update(lessons)
          .set({
            instructorMembershipId,
            vehicleId,
            lessonTypeId: type.id,
            creditMinutes,
            period,
            pickupAddress: body.pickupAddress ?? lesson.pickupAddress,
            pickupLat: body.pickupLat ?? lesson.pickupLat,
            pickupLng: body.pickupLng ?? lesson.pickupLng,
            version,
          })
          .where(eq(lessons.id, lesson.id)),
      lesson.id,
    );

    const entry = {
      studentId: lesson.studentId,
      minutes: Math.abs(charge),
      lessonId: lesson.id,
      createdByMembershipId: actor.membershipId,
    };
    if (charge > 0) await this.ledger.debit(entry);
    if (charge < 0) await this.ledger.restore(entry);

    await this.publisher.append([
      newEvent(LessonMoved, {
        aggregateType: 'lesson',
        aggregateId: lesson.id,
        aggregateVersion: version,
        payload: {
          lessonId: lesson.id,
          studentId: lesson.studentId,
          instructorMembershipId,
          vehicleId,
          lessonTypeId: type.id,
          creditMinutes,
          start: period.start.toISOString(),
          end: period.end.toISOString(),
          previousStart: lesson.period.start.toISOString(),
          previousEnd: lesson.period.end.toISOString(),
          previousInstructorMembershipId: lesson.instructorMembershipId,
          previousVehicleId: lesson.vehicleId,
          creditMinutesDelta: charge,
          lateCancellation,
          movedByMembershipId: actor.membershipId,
        },
      }),
    ]);
    return { id: lesson.id, version };
  }

  private async requireInstructor(
    mover: LessonActor,
    profile: StudentBookingProfile,
    instructorMembershipId: string,
  ): Promise<void> {
    if (mover.scope === 'instructor') throw forbidden();
    if (!(await this.viewer.activeInstructorIds()).includes(instructorMembershipId)) {
      throw notFound();
    }
    const assigned = profile.allowedInstructorMembershipIds;
    if (
      mover.scope === 'own' &&
      assigned.length > 0 &&
      !assigned.includes(instructorMembershipId)
    ) {
      throw forbidden();
    }
  }

  private async requireSameEntitlement(lesson: LockedLesson, lessonTypeId: string): Promise<void> {
    const next = await this.slots.activeLessonType(lessonTypeId);
    if (next.requiresEntitlement !== lesson.requiresEntitlement) {
      throw invalidField(
        ['lessonTypeId'],
        'the new lesson type must require the same entitlement as the current one',
      );
    }
  }
}
