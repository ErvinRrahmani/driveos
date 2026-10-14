import type { AdjustLedgerResponse } from '@driveos/shared';
import { Inject } from '@nestjs/common';
import { CommandHandler, type ICommandHandler, QueryBus } from '../../../kernel/cqrs/index.js';
import { ApiError } from '../../../kernel/http/api-error.js';
import { ConflictError, notFound } from '../../../kernel/http/errors.js';
import { t } from '../../../kernel/i18n/i18n.js';
import { AUDIT_WRITER, type AuditWriter } from '../../platform/index.js';
import { GetLessonQuery } from '../../scheduling/index.js';
import { keepsBalanceAllowed } from '../domain/ledger-rules.js';
import { LEDGER_WRITER, type LedgerWriter } from '../infra/ledger-writer.js';
import { SchoolFacts } from '../infra/school-facts.js';
import { StudentLookup } from '../infra/student-lookup.js';
import { AdjustLedgerCommand } from './adjust-ledger.command.js';
import { StatusCodes } from 'http-status-codes';

@CommandHandler(AdjustLedgerCommand)
export class AdjustLedgerHandler implements ICommandHandler<
  AdjustLedgerCommand,
  AdjustLedgerResponse
> {
  constructor(
    private readonly students: StudentLookup,
    private readonly school: SchoolFacts,
    private readonly queryBus: QueryBus,
    @Inject(LEDGER_WRITER) private readonly ledger: LedgerWriter,
    @Inject(AUDIT_WRITER) private readonly audit: AuditWriter,
  ) {}

  async execute({ actor, body }: AdjustLedgerCommand): Promise<AdjustLedgerResponse> {
    if (!actor.membershipId)
      throw new ApiError(StatusCodes.FORBIDDEN, 'forbidden', t('errors.forbidden'));
    if (!(await this.students.exists(body.studentId))) throw notFound();
    if (body.lessonId) {
      const lesson = await this.queryBus.execute(new GetLessonQuery(body.lessonId));
      if (lesson?.studentId !== body.studentId) throw notFound();
    }
    await this.ledger.lockStudent(body.studentId);
    const balance = await this.ledger.balance(body.studentId);
    const allowNegative = body.minutes < 0 && (await this.school.allowsNegativeBalance());
    if (!keepsBalanceAllowed({ balance, delta: body.minutes, allowNegative })) {
      throw new ConflictError('insufficient_balance', t('errors.insufficient_balance'));
    }
    const result = await this.ledger.adjust({
      studentId: body.studentId,
      minutes: body.minutes,
      note: body.note,
      createdByMembershipId: actor.membershipId,
      lessonId: body.lessonId ?? null,
    });
    await this.audit.record({
      action: 'ledger.adjust',
      targetType: 'student',
      targetId: body.studentId,
      reason: body.reason,
    });
    return { id: result.entryId, balanceAfter: result.balanceAfter };
  }
}
