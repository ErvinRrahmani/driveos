import {
  type LessonResponse,
  type SyncOp,
  type SyncOpResult,
  syncOpResultSchema,
  type SyncPushResponse,
} from '@driveos/shared';
import type { Principal } from '../../../kernel/auth/principal.js';
import {
  CommandBus,
  CommandHandler,
  type ICommandHandler,
  QueryBus,
} from '../../../kernel/cqrs/index.js';
import { renderError } from '../../../kernel/http/api-exception.filter.js';
import { notFound } from '../../../kernel/http/errors.js';
import { t } from '../../../kernel/i18n/i18n.js';
import { TenantContext } from '../../../kernel/tenant/tenant-context.js';
import { RecordCashPaymentCommand } from '../../billing/index.js';
import {
  GetStudentBookingProfileQuery,
  RecordProgressCommand,
  UpsertPrivateNoteCommand,
} from '../../training/index.js';
import {
  appliedResult,
  isStale,
  rejectedResult,
  SYNC_OP_PERMISSIONS,
  type SyncOpError,
  serverStateLessonId,
} from '../domain/sync-ops.js';
import { forbidden, SchedulingAccess } from '../infra/access.js';
import { SyncOperationRecords } from '../infra/sync-operation-records.js';
import { GetLessonQuery } from '../queries/get-lesson.query.js';
import { ApplySyncOperationsCommand } from './apply-sync-operations.command.js';
import { BookLessonCommand } from './book-lesson.command.js';
import { CancelLessonCommand } from './cancel-lesson.command.js';
import { CompleteLessonCommand } from './complete-lesson.command.js';
import { MarkNoShowCommand } from './mark-no-show.command.js';
import { MoveLessonCommand } from './move-lesson.command.js';
import { StatusCodes } from 'http-status-codes';

interface Applied {
  id: string;
  version: number;
}

@CommandHandler(ApplySyncOperationsCommand)
export class ApplySyncOperationsHandler implements ICommandHandler<
  ApplySyncOperationsCommand,
  SyncPushResponse
> {
  constructor(
    private readonly tenant: TenantContext,
    private readonly commandBus: CommandBus,
    private readonly queryBus: QueryBus,
    private readonly access: SchedulingAccess,
    private readonly records: SyncOperationRecords,
  ) {}

  async execute({ actor, body }: ApplySyncOperationsCommand): Promise<SyncPushResponse> {
    const membershipId = actor.membershipId;
    if (!membershipId) throw forbidden();
    await this.records.lockMember(membershipId);
    const results: SyncOpResult[] = [];
    for (const op of body.ops) results.push(await this.applyOnce(actor, membershipId, op));
    return { results };
  }

  private async applyOnce(
    actor: Principal,
    membershipId: string,
    op: SyncOp,
  ): Promise<SyncOpResult> {
    const stored = await this.records.find(op.opId);
    if (stored) {
      if (stored.membershipId === membershipId) return syncOpResultSchema.parse(stored.result);
      return rejectedResult(
        op.opId,
        { code: 'op_id_reused', message: t('errors.op_id_reused') },
        null,
      );
    }
    let result: SyncOpResult;
    try {
      result = await this.tenant.savepoint(async () => {
        const { id, version } = await this.apply(actor, membershipId, op);
        const applied = appliedResult(op.opId, id, version);
        await this.records.save(membershipId, op, applied);
        return applied;
      });
    } catch (exception) {
      const { status, body } = renderError(exception);
      if (status >= StatusCodes.INTERNAL_SERVER_ERROR) throw exception;
      result = await this.rejection(actor, op, body.error);
      await this.records.save(membershipId, op, result);
    }
    return result;
  }

  private async rejection(actor: Principal, op: SyncOp, error: SyncOpError): Promise<SyncOpResult> {
    const lessonId = serverStateLessonId(op, error);
    const serverState = lessonId ? await this.visibleLesson(actor, lessonId) : null;
    const reported = isStale(op, serverState)
      ? { code: 'version_conflict', message: t('errors.version_conflict') }
      : error;
    return rejectedResult(op.opId, reported, serverState);
  }

  private async visibleLesson(actor: Principal, lessonId: string): Promise<LessonResponse | null> {
    const lesson = await this.queryBus.execute(new GetLessonQuery(lessonId));
    if (!lesson) return null;
    if (lesson.instructorMembershipId === actor.membershipId) return lesson;
    if (await this.access.holdsAny(actor, ['calendar.read'])) return lesson;
    const profile = await this.queryBus.execute(
      new GetStudentBookingProfileQuery(lesson.studentId),
    );
    const assigned = profile?.allowedInstructorMembershipIds ?? [];
    return actor.membershipId && assigned.includes(actor.membershipId) ? lesson : null;
  }

  private async apply(actor: Principal, membershipId: string, op: SyncOp): Promise<Applied> {
    if (!(await this.access.holdsAny(actor, SYNC_OP_PERMISSIONS[op.type]))) throw forbidden();
    switch (op.type) {
      case 'lesson.create': {
        const { lessonId, ...booking } = op.payload;
        return this.commandBus.execute(
          new BookLessonCommand(
            actor,
            { ...booking, instructorMembershipId: membershipId },
            lessonId,
            'sync',
          ),
        );
      }
      case 'lesson.move': {
        const { lessonId, ...changes } = op.payload;
        return this.commandBus.execute(
          new MoveLessonCommand(actor, lessonId, { ...changes, version: op.baseVersion }),
        );
      }
      case 'lesson.cancel': {
        const { lessonId, ...cancel } = op.payload;
        return this.commandBus.execute(
          new CancelLessonCommand(actor, lessonId, { ...cancel, version: op.baseVersion }),
        );
      }
      case 'lesson.complete':
        return this.commandBus.execute(
          new CompleteLessonCommand(actor, op.payload.lessonId, {
            progress: [],
            version: op.baseVersion,
          }),
        );
      case 'lesson.no_show':
        return this.commandBus.execute(
          new MarkNoShowCommand(actor, op.payload.lessonId, { version: op.baseVersion }),
        );
      case 'progress.upsert': {
        const { progressEntryId, lessonId, ...entry } = op.payload;
        const studentId = await this.studentOf(lessonId);
        const { entries } = await this.commandBus.execute(
          new RecordProgressCommand(actor, {
            lessonId,
            studentId,
            entries: [{ id: progressEntryId, ...entry }],
          }),
        );
        const [saved] = entries;
        if (!saved) throw new Error('Recording progress returned no entry');
        return saved;
      }
      case 'private_note.upsert': {
        const { privateNoteId, lessonId, body } = op.payload;
        const studentId = await this.studentOf(lessonId);
        return this.commandBus.execute(
          new UpsertPrivateNoteCommand(actor, { noteId: privateNoteId, lessonId, studentId, body }),
        );
      }
      case 'payment.cash': {
        const { paymentId, ...payment } = op.payload;
        return this.commandBus.execute(
          new RecordCashPaymentCommand(actor, { ...payment, method: 'cash' }, paymentId),
        );
      }
    }
  }

  private async studentOf(lessonId: string): Promise<string> {
    const lesson = await this.queryBus.execute(new GetLessonQuery(lessonId));
    if (!lesson) throw notFound();
    return lesson.studentId;
  }
}
