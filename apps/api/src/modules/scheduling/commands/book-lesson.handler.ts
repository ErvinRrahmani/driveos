import { type BookedVia, LessonBooked, type LessonResponse } from '@driveos/shared';
import { Inject } from '@nestjs/common';
import type { Principal } from '../../../kernel/auth/principal.js';
import {
  CommandBus,
  CommandHandler,
  EventPublisher,
  type ICommandHandler,
  newEvent,
  QueryBus,
} from '../../../kernel/cqrs/index.js';
import { newId } from '../../../kernel/db/columns.js';
import { t } from '../../../kernel/i18n/i18n.js';
import { ConflictError, invalidField, notFound } from '../../../kernel/http/errors.js';
import { TenantContext } from '../../../kernel/tenant/tenant-context.js';
import {
  ConsumeEntitlementCommand,
  LEDGER_WRITER,
  type LedgerWriter,
} from '../../billing/index.js';
import { GetStudentBookingProfileQuery, type StudentBookingProfile } from '../../training/index.js';
import { forbidden, SchedulingAccess } from '../infra/access.js';
import { LessonConflicts } from '../infra/lesson-conflicts.js';
import { LessonViews } from '../infra/lesson-views.js';
import { lessons } from '../infra/schema.js';
import { SchoolFacts } from '../infra/school-facts.js';
import { SlotValidator } from '../infra/slot-validator.js';
import { schoolIdOf } from '../infra/tenant.js';
import { ViewerScope } from '../infra/viewer-scope.js';
import { BookLessonCommand } from './book-lesson.command.js';

type BookingScope = 'staff' | 'instructor' | 'own';

function defaultBookedVia(
  actor: Principal,
  scope: BookingScope,
  profile: StudentBookingProfile,
): BookedVia {
  if (scope === 'own') return profile.userId === actor.userId ? 'student' : 'parent';
  if (actor.roles.includes('owner') || actor.roles.includes('office')) return 'office';
  return actor.roles.includes('instructor') ? 'instructor' : 'office';
}

@CommandHandler(BookLessonCommand)
export class BookLessonHandler implements ICommandHandler<BookLessonCommand, LessonResponse> {
  constructor(
    private readonly tenant: TenantContext,
    private readonly queryBus: QueryBus,
    private readonly commandBus: CommandBus,
    private readonly access: SchedulingAccess,
    private readonly viewer: ViewerScope,
    private readonly school: SchoolFacts,
    private readonly slots: SlotValidator,
    private readonly conflicts: LessonConflicts,
    private readonly views: LessonViews,
    private readonly publisher: EventPublisher,
    @Inject(LEDGER_WRITER) private readonly ledger: LedgerWriter,
  ) {}

  async execute(command: BookLessonCommand): Promise<LessonResponse> {
    const { actor, body } = command;
    if (!actor.membershipId) throw forbidden();
    const scope = await this.scopeOf(actor, body.studentId, body.instructorMembershipId);
    const profile = await this.queryBus.execute(new GetStudentBookingProfileQuery(body.studentId));
    if (!profile) throw notFound();
    await this.requireInstructor(scope, profile, body.instructorMembershipId);
    if (profile.status !== 'active') {
      throw new ConflictError('student_not_active', t('errors.student_not_active'));
    }
    const pickupAddress = body.pickupAddress ?? profile.pickupAddress;
    const pickupLat = body.pickupLat ?? profile.pickupLat;
    const pickupLng = body.pickupLng ?? profile.pickupLng;
    if (pickupAddress == null || pickupLat == null || pickupLng == null) {
      throw invalidField(['pickupAddress'], 'a pickup address and position are required');
    }

    const vehicleId = body.vehicleId ?? null;
    const { type, period } = await this.slots.validate({
      profile,
      lessonTypeId: body.lessonTypeId,
      instructorMembershipId: body.instructorMembershipId,
      vehicleId,
      start: new Date(body.start),
    });

    await this.ledger.lockStudent(profile.studentId);
    const balance = await this.ledger.balance(profile.studentId);
    if (balance < type.creditMinutes) {
      const allowNegative = scope !== 'own' && (await this.school.settings()).allowNegativeBalance;
      if (!allowNegative) {
        throw new ConflictError('insufficient_balance', t('errors.insufficient_balance'));
      }
    }

    const keys = {
      studentId: profile.studentId,
      instructorMembershipId: body.instructorMembershipId,
      vehicleId,
    };
    const bookedVia = command.bookedVia ?? defaultBookedVia(actor, scope, profile);
    const row = await this.conflicts.guard(keys, period, async (tx) => {
      const [inserted] = await tx
        .insert(lessons)
        .values({
          id: command.lessonId ?? newId(),
          schoolId: schoolIdOf(this.tenant),
          ...keys,
          lessonTypeId: type.id,
          creditMinutes: type.creditMinutes,
          period,
          status: 'booked',
          pickupAddress,
          pickupLat,
          pickupLng,
          bookedByMembershipId: actor.membershipId as string,
          bookedVia,
          version: 1,
        })
        .returning();
      if (!inserted) throw new Error('Lesson insert returned no row');
      return inserted;
    });

    if (type.creditMinutes > 0) {
      await this.ledger.debit({
        studentId: row.studentId,
        minutes: type.creditMinutes,
        lessonId: row.id,
        createdByMembershipId: actor.membershipId,
      });
    }
    if (type.requiresEntitlement) {
      await this.commandBus.execute(
        new ConsumeEntitlementCommand({
          studentId: row.studentId,
          kind: type.requiresEntitlement,
          lessonId: row.id,
        }),
      );
    }
    await this.publisher.append([
      newEvent(LessonBooked, {
        aggregateType: 'lesson',
        aggregateId: row.id,
        aggregateVersion: row.version,
        payload: {
          lessonId: row.id,
          studentId: row.studentId,
          instructorMembershipId: row.instructorMembershipId,
          vehicleId: row.vehicleId,
          lessonTypeId: row.lessonTypeId,
          creditMinutes: row.creditMinutes,
          start: period.start.toISOString(),
          end: period.end.toISOString(),
          bookedVia: row.bookedVia,
          bookedByMembershipId: row.bookedByMembershipId,
          pickupAddress: row.pickupAddress,
        },
      }),
    ]);
    const [response] = await this.views.toResponses([
      { ...row, lessonTypeName: type.name, lessonTypeKind: type.kind },
    ]);
    if (!response) throw new Error('Booked lesson has no response');
    return response;
  }

  private async scopeOf(
    actor: Principal,
    studentId: string,
    instructorMembershipId: string,
  ): Promise<BookingScope> {
    if (await this.access.holdsAny(actor, ['lessons.create'])) return 'staff';
    if (actor.roles.includes('instructor') && actor.membershipId === instructorMembershipId) {
      return 'instructor';
    }
    if ((await this.viewer.ownStudentIds(actor)).includes(studentId)) return 'own';
    throw forbidden();
  }

  private async requireInstructor(
    scope: BookingScope,
    profile: StudentBookingProfile,
    instructorMembershipId: string,
  ): Promise<void> {
    const active = await this.viewer.activeInstructorIds();
    if (!active.includes(instructorMembershipId)) throw notFound();
    const assigned = profile.allowedInstructorMembershipIds;
    if (scope === 'instructor' && !assigned.includes(instructorMembershipId)) throw forbidden();
    if (scope === 'own' && assigned.length > 0 && !assigned.includes(instructorMembershipId)) {
      throw forbidden();
    }
  }
}
