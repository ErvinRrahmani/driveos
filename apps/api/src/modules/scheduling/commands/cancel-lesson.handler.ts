import { type CancelLessonResponse, LessonCancelled } from '@driveos/shared';
import { Inject } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import {
  CommandBus,
  CommandHandler,
  EventPublisher,
  type ICommandHandler,
  newEvent,
} from '../../../kernel/cqrs/index.js';
import { ConflictError, invalidField } from '../../../kernel/http/errors.js';
import { t } from '../../../kernel/i18n/i18n.js';
import { TenantContext } from '../../../kernel/tenant/tenant-context.js';
import {
  LEDGER_WRITER,
  type LedgerWriter,
  ReleaseEntitlementCommand,
} from '../../billing/index.js';
import { AUDIT_WRITER, type AuditWriter } from '../../platform/index.js';
import { cancellationDecision } from '../domain/cancellation.js';
import { forbidden } from '../infra/access.js';
import { LessonActors } from '../infra/lesson-actors.js';
import { LessonViews } from '../infra/lesson-views.js';
import { lessons } from '../infra/schema.js';
import { SchoolFacts } from '../infra/school-facts.js';
import { CancelLessonCommand } from './cancel-lesson.command.js';

@CommandHandler(CancelLessonCommand)
export class CancelLessonHandler implements ICommandHandler<
  CancelLessonCommand,
  CancelLessonResponse
> {
  constructor(
    private readonly tenant: TenantContext,
    private readonly commandBus: CommandBus,
    private readonly actors: LessonActors,
    private readonly school: SchoolFacts,
    private readonly views: LessonViews,
    private readonly publisher: EventPublisher,
    @Inject(LEDGER_WRITER) private readonly ledger: LedgerWriter,
    @Inject(AUDIT_WRITER) private readonly audit: AuditWriter,
  ) {}

  async execute(command: CancelLessonCommand): Promise<CancelLessonResponse> {
    const { actor, body } = command;
    if (!actor.membershipId) throw forbidden();
    const lesson = await this.actors.lock(command.lessonId);
    const { role: byRole, scope } = await this.actors.resolve(actor, lesson, 'lessons.cancel');
    if (scope === 'own' && body.restoreCredit !== undefined) {
      throw invalidField(['restoreCredit'], 'only staff may decide about the credit');
    }
    if (lesson.status !== 'booked') {
      throw new ConflictError('lesson_not_booked', t('errors.lesson_not_booked'));
    }
    if (body.version !== undefined && body.version !== lesson.version) {
      const [serverVersion] = await this.views.toResponses([lesson]);
      throw new ConflictError('version_conflict', t('errors.version_conflict'), { serverVersion });
    }

    const now = new Date();
    const decision = cancellationDecision({
      now,
      lessonStart: lesson.period.start,
      windowHours: (await this.school.settings()).cancellationWindowHours,
      byRole,
      override: body.restoreCredit === false,
    });
    if ('refused' in decision) {
      throw invalidField(
        ['restoreCredit'],
        decision.refused === 'override_outside_window'
          ? 'the credit can only be kept inside the cancellation window'
          : 'only the owner or office may keep the credit',
      );
    }

    await this.ledger.lockStudent(lesson.studentId);
    const version = lesson.version + 1;
    await this.tenant.tx
      .update(lessons)
      .set({
        status: 'cancelled',
        cancelledAt: now,
        cancelledByMembershipId: actor.membershipId,
        cancelReason: body.reason ?? null,
        lateCancel: decision.late,
        version,
      })
      .where(eq(lessons.id, lesson.id));
    const minutesRestored = decision.restore ? lesson.creditMinutes : 0;
    if (minutesRestored > 0) {
      await this.ledger.restore({
        studentId: lesson.studentId,
        minutes: minutesRestored,
        lessonId: lesson.id,
        createdByMembershipId: actor.membershipId,
      });
    }
    if (decision.requiresAudit) {
      await this.audit.record({
        action: 'lesson.late_cancel_kept',
        targetType: 'lesson',
        targetId: lesson.id,
        reason: body.reason ?? null,
      });
    }
    if (lesson.requiresEntitlement) {
      await this.commandBus.execute(new ReleaseEntitlementCommand(lesson.id));
    }
    await this.publisher.append([
      newEvent(LessonCancelled, {
        aggregateType: 'lesson',
        aggregateId: lesson.id,
        aggregateVersion: version,
        payload: {
          lessonId: lesson.id,
          studentId: lesson.studentId,
          instructorMembershipId: lesson.instructorMembershipId,
          vehicleId: lesson.vehicleId,
          lessonTypeId: lesson.lessonTypeId,
          creditMinutes: lesson.creditMinutes,
          start: lesson.period.start.toISOString(),
          end: lesson.period.end.toISOString(),
          late: decision.late,
          byRole,
          minutesRestored,
          cancelledByMembershipId: actor.membershipId,
          ...(body.reason === undefined ? {} : { reason: body.reason }),
        },
      }),
    ]);
    return { id: lesson.id, version, late: decision.late, minutesRestored };
  }
}
