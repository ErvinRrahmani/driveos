import type { GrowthReport } from '@driveos/shared';
import { Injectable } from '@nestjs/common';
import { desc, eq } from 'drizzle-orm';
import { TenantContext } from '../../../kernel/tenant/tenant-context.js';
import type { GrowthMetrics } from '../domain/growth.js';
import { growthReports } from './schema.js';

type GrowthReportRow = typeof growthReports.$inferSelect;

const monthDate = (month: string) => `${month}-01`;

export function toGrowthReport(row: GrowthReportRow): GrowthReport {
  return {
    id: row.id,
    month: row.month.slice(0, 7),
    currency: row.currency,
    revenueInAppMinor: row.revenueInAppMinor,
    revenueRecordedMinor: row.revenueRecordedMinor,
    inappShareBp: row.inappShareBp,
    lateCancellationsKept: row.lateCancellationsKept,
    lateCancelMinutesKept: row.lateCancelMinutesKept,
    noShowRateBp: row.noShowRateBp,
    noShowRatePrev3mBp: row.noShowRatePrev3mBp,
    upsellsSold: row.upsellsSold,
    upsellRevenueMinor: row.upsellRevenueMinor,
    slotsFilled: row.slotsFilled,
    slotFillMinutes: row.slotFillMinutes,
    leadsCaptured: row.leadsCaptured,
    leadsConverted: row.leadsConverted,
    leadRevenueMinor: row.leadRevenueMinor,
    generatedAt: row.generatedAt.toISOString(),
  };
}

@Injectable()
export class GrowthReports {
  constructor(private readonly tenant: TenantContext) {}

  async byMonth(month: string): Promise<GrowthReport | null> {
    const [row] = await this.tenant.tx
      .select()
      .from(growthReports)
      .where(eq(growthReports.month, monthDate(month)));
    return row ? toGrowthReport(row) : null;
  }

  async latest(): Promise<GrowthReport | null> {
    const [row] = await this.tenant.tx
      .select()
      .from(growthReports)
      .orderBy(desc(growthReports.month))
      .limit(1);
    return row ? toGrowthReport(row) : null;
  }

  async insertIfAbsent(report: {
    id: string;
    schoolId: string;
    month: string;
    metrics: GrowthMetrics;
    generatedAt: Date;
  }): Promise<boolean> {
    const inserted = await this.tenant.tx
      .insert(growthReports)
      .values({
        id: report.id,
        schoolId: report.schoolId,
        month: monthDate(report.month),
        generatedAt: report.generatedAt,
        ...report.metrics,
      })
      .onConflictDoNothing({ target: [growthReports.schoolId, growthReports.month] })
      .returning({ id: growthReports.id });
    return inserted.length > 0;
  }
}
