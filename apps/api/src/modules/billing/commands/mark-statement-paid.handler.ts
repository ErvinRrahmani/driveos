import { Inject } from '@nestjs/common';
import { eq, sql } from 'drizzle-orm';
import {
  CommandHandler,
  type CommandResult,
  type ICommandHandler,
} from '../../../kernel/cqrs/index.js';
import { ConflictError, invalidField, notFound } from '../../../kernel/http/errors.js';
import { t } from '../../../kernel/i18n/i18n.js';
import { TenantContext } from '../../../kernel/tenant/tenant-context.js';
import { AUDIT_WRITER, type AuditWriter } from '../../platform/index.js';
import { statementPaymentProblem } from '../domain/statement-payment.js';
import { platformStatements } from '../infra/schema.js';
import { MarkStatementPaidCommand } from './mark-statement-paid.command.js';

@CommandHandler(MarkStatementPaidCommand)
export class MarkStatementPaidHandler implements ICommandHandler<
  MarkStatementPaidCommand,
  CommandResult
> {
  constructor(
    private readonly tenant: TenantContext,
    @Inject(AUDIT_WRITER) private readonly audit: AuditWriter,
  ) {}

  async execute({ actor, statementId, body }: MarkStatementPaidCommand): Promise<CommandResult> {
    const { rows } = await this.tenant.tx.execute<{ school_id: string | null }>(
      sql`select platform_statement_school(${statementId}::uuid) as school_id`,
    );
    const schoolId = rows[0]?.school_id;
    if (!schoolId) throw notFound();
    return this.tenant.enterSchool(schoolId, async () => {
      const [statement] = await this.tenant.tx
        .select({ status: platformStatements.status })
        .from(platformStatements)
        .where(eq(platformStatements.id, statementId))
        .for('update');
      if (!statement) throw notFound();
      const problem = statementPaymentProblem(statement.status, body);
      if (problem === 'already_paid') {
        throw new ConflictError('statement_already_paid', t('errors.statement_already_paid'));
      }
      if (problem === 'reference_required') {
        throw invalidField(['reference'], 'A bank transfer needs a reference');
      }
      const reference = body.reference?.trim() ?? null;
      await this.tenant.tx
        .update(platformStatements)
        .set({
          status: 'paid',
          paidAt: new Date(body.paidAt),
          paidMethod: body.method,
          paidReference: reference,
          markedPaidByUserId: actor.userId,
        })
        .where(eq(platformStatements.id, statementId));
      await this.audit.record({
        action: 'platform_statement.marked_paid',
        targetType: 'platform_statement',
        targetId: statementId,
        reason: reference ? `${body.method} ${reference}` : body.method,
      });
      return { id: statementId, version: 2 };
    });
  }
}
