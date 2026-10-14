import { PlatformStatementIssued } from '@driveos/shared';
import { Inject, Logger } from '@nestjs/common';
import { and, eq, inArray, lte, sql } from 'drizzle-orm';
import {
  CommandHandler,
  type CommandResult,
  EventPublisher,
  type ICommandHandler,
  newEvent,
  QueryBus,
} from '../../../kernel/cqrs/index.js';
import { newId } from '../../../kernel/db/columns.js';
import { TenantContext } from '../../../kernel/tenant/tenant-context.js';
import { MembershipDirectory } from '../../identity/index.js';
import { GetCurrentSubscriptionQuery } from '../../platform/index.js';
import { nextMonthStart, proratedBaseMinor, statementTotalMinor } from '../domain/platform-fees.js';
import { PlatformChargeRecords } from '../infra/platform-charges.js';
import { platformCharges, platformStatements } from '../infra/schema.js';
import { IssuePlatformStatementCommand } from './issue-platform-statement.command.js';

const PLATFORM_STATEMENT_AGGREGATE = 'platform_statement';

@CommandHandler(IssuePlatformStatementCommand)
export class IssuePlatformStatementHandler implements ICommandHandler<
  IssuePlatformStatementCommand,
  CommandResult | null
> {
  private readonly logger = new Logger(IssuePlatformStatementHandler.name);

  constructor(
    private readonly tenant: TenantContext,
    private readonly queryBus: QueryBus,
    @Inject(MembershipDirectory)
    private readonly directory: MembershipDirectory,
    private readonly charges: PlatformChargeRecords,
    private readonly events: EventPublisher,
  ) {}

  async execute({ month, issuedAt }: IssuePlatformStatementCommand): Promise<CommandResult | null> {
    const schoolId = this.tenant.schoolId;
    if (!schoolId) throw new Error('A platform statement needs a school scope');
    const periodMonth = `${month}-01`;
    const plan = await this.queryBus.execute(new GetCurrentSubscriptionQuery());
    if (!plan) {
      this.logger.warn({ msg: 'statement skipped: no current subscription', schoolId, month });
      return null;
    }
    if (plan.startedAt.getTime() >= nextMonthStart(month).getTime()) return null;
    if (await this.statementExists(periodMonth)) return null;

    const pending = await this.tenant.tx
      .select({
        id: platformCharges.id,
        amountMinor: platformCharges.amountMinor,
        currency: platformCharges.currency,
      })
      .from(platformCharges)
      .where(
        and(eq(platformCharges.status, 'pending'), lte(platformCharges.periodMonth, periodMonth)),
      )
      .for('update');
    const foreign = pending.filter((charge) => charge.currency !== plan.currency);
    if (foreign.length > 0) {
      throw new Error(
        `Pending platform charges ${foreign.map((c) => c.id).join(', ')} are not in the plan currency ${plan.currency}`,
      );
    }
    const baseMinor = proratedBaseMinor({
      baseAmountMinor: plan.baseAmountMinor,
      month,
      startedAt: plan.startedAt,
    });
    const totalMinor = statementTotalMinor([baseMinor, ...pending.map((c) => c.amountMinor)]);

    const statementId = newId();
    const inserted = await this.tenant.tx
      .insert(platformStatements)
      .values({
        id: statementId,
        schoolId,
        month: periodMonth,
        totalMinor,
        currency: plan.currency,
        status: 'issued',
        issuedAt,
      })
      .onConflictDoNothing({ target: [platformStatements.schoolId, platformStatements.month] })
      .returning({ id: platformStatements.id });
    if (inserted.length === 0) return null;

    const base = {
      id: newId(),
      kind: 'base_subscription' as const,
      studentId: null,
      periodMonth,
      amountMinor: baseMinor,
      currency: plan.currency,
    };
    await this.tenant.tx
      .insert(platformCharges)
      .values({ ...base, schoolId, status: 'statemented', statementId });
    if (pending.length > 0) {
      await this.tenant.tx
        .update(platformCharges)
        .set({ status: 'statemented', statementId, updatedAt: sql`now()` })
        .where(
          inArray(
            platformCharges.id,
            pending.map((c) => c.id),
          ),
        );
    }

    const owners = await this.directory.listByRole('owner');
    await this.charges.announce([base]);
    await this.events.append([
      newEvent(PlatformStatementIssued, {
        aggregateType: PLATFORM_STATEMENT_AGGREGATE,
        aggregateId: statementId,
        aggregateVersion: 1,
        payload: {
          statementId,
          schoolId,
          month,
          totalMinor,
          currency: plan.currency,
          issuedAt: issuedAt.toISOString(),
          ownerUserIds: owners.filter((o) => o.status === 'active').map((o) => o.userId),
        },
      }),
    ]);
    return { id: statementId, version: 1 };
  }

  private async statementExists(periodMonth: string): Promise<boolean> {
    const rows = await this.tenant.tx
      .select({ id: platformStatements.id })
      .from(platformStatements)
      .where(eq(platformStatements.month, periodMonth));
    return rows.length > 0;
  }
}
