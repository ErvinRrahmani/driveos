import { GrowthReportGenerated, monthSchema } from '@driveos/shared';
import { Inject } from '@nestjs/common';
import {
  CommandHandler,
  type CommandResult,
  EventPublisher,
  type ICommandHandler,
  newEvent,
} from '../../../kernel/cqrs/index.js';
import { newId } from '../../../kernel/db/columns.js';
import { TenantContext } from '../../../kernel/tenant/tenant-context.js';
import { MembershipDirectory } from '../../identity/index.js';
import { growthMetrics, monthBounds, NO_SHOW_TREND_MONTHS, shiftMonth } from '../domain/growth.js';
import { GrowthReports } from '../infra/growth-reports.js';
import { ReportRows } from '../infra/report-rows.js';
import { SchoolProfiles } from '../infra/school-profile.js';
import { GenerateGrowthReportCommand } from './generate-growth-report.command.js';

const GROWTH_REPORT_AGGREGATE = 'growth_report';
const VERSION = 1;

@CommandHandler(GenerateGrowthReportCommand)
export class GenerateGrowthReportHandler implements ICommandHandler<
  GenerateGrowthReportCommand,
  CommandResult
> {
  constructor(
    private readonly tenant: TenantContext,
    private readonly reports: GrowthReports,
    private readonly rows: ReportRows,
    private readonly schools: SchoolProfiles,
    @Inject(MembershipDirectory)
    private readonly directory: MembershipDirectory,
    private readonly events: EventPublisher,
  ) {}

  async execute({ month }: GenerateGrowthReportCommand): Promise<CommandResult> {
    if (!monthSchema.safeParse(month).success) {
      throw new RangeError(`"${month}" is not a YYYY-MM month`);
    }
    const schoolId = this.tenant.schoolId;
    if (!schoolId) throw new Error('A growth report needs a school scope');
    const existing = await this.reports.byMonth(month);
    if (existing) return { id: existing.id, version: VERSION };

    const { currency } = await this.schools.current();
    const { from, to } = monthBounds(month);
    const metrics = growthMetrics({
      currency,
      month: await this.rows.daily(from, to),
      previous: await this.rows.daily(
        monthBounds(shiftMonth(month, -NO_SHOW_TREND_MONTHS)).from,
        monthBounds(shiftMonth(month, -1)).to,
      ),
    });
    const reportId = newId();
    const generatedAt = new Date();
    const inserted = await this.reports.insertIfAbsent({
      id: reportId,
      schoolId,
      month,
      metrics,
      generatedAt,
    });
    if (!inserted) {
      const winner = await this.reports.byMonth(month);
      if (!winner) throw new Error(`Growth report ${month} vanished after a conflict`);
      return { id: winner.id, version: VERSION };
    }

    const owners = await this.directory.listByRole('owner');
    await this.events.append([
      newEvent(GrowthReportGenerated, {
        aggregateType: GROWTH_REPORT_AGGREGATE,
        aggregateId: reportId,
        aggregateVersion: VERSION,
        payload: {
          reportId,
          month,
          ownerUserIds: owners.filter((o) => o.status === 'active').map((o) => o.userId),
          ...metrics,
          generatedAt: generatedAt.toISOString(),
        },
      }),
    ]);
    return { id: reportId, version: VERSION };
  }
}
