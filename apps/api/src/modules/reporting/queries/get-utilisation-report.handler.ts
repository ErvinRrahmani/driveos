import type { UtilisationReportResponse } from '@driveos/shared';
import { type IQueryHandler, QueryHandler } from '../../../kernel/cqrs/index.js';
import { availableMinutesByDay } from '../domain/availability.js';
import { basisPoints, sumByPeriod, totalOf } from '../domain/reports.js';
import { ReportRows } from '../infra/report-rows.js';
import { SchoolProfiles } from '../infra/school-profile.js';
import { GetUtilisationReportQuery } from './get-utilisation-report.query.js';

const KEYS = [
  'instructorMinutesAvailable',
  'instructorMinutesBooked',
  'slotsOffered',
  'slotsFilled',
  'slotFillMinutes',
] as const;

type Sums = Record<(typeof KEYS)[number], number>;

const withRate = (sums: Sums) => ({
  instructorMinutesAvailable: sums.instructorMinutesAvailable,
  instructorMinutesBooked: sums.instructorMinutesBooked,
  utilisationBp: basisPoints(sums.instructorMinutesBooked, sums.instructorMinutesAvailable),
  slotsOffered: sums.slotsOffered,
  slotsFilled: sums.slotsFilled,
  slotFillMinutes: sums.slotFillMinutes,
});

@QueryHandler(GetUtilisationReportQuery)
export class GetUtilisationReportHandler implements IQueryHandler<
  GetUtilisationReportQuery,
  UtilisationReportResponse
> {
  constructor(
    private readonly rows: ReportRows,
    private readonly schools: SchoolProfiles,
  ) {}

  async execute({ params }: GetUtilisationReportQuery): Promise<UtilisationReportResponse> {
    const { from, to, bucket } = params;
    const { timeZone } = await this.schools.current();
    const daily = await this.rows.daily(from, to);
    const layers = await this.rows.availabilityLayers(from, to);
    const timeOff = await this.rows.timeOff(from, to);
    const available = availableMinutesByDay({ layers, timeOff, from, to, zone: timeZone });
    const booked = new Map(daily.map((row) => [row.day, row]));
    const days = [...available.entries()].map(([day, minutes]) => {
      const row = booked.get(day);
      return {
        day,
        instructorMinutesAvailable: minutes,
        instructorMinutesBooked: row?.instructorMinutesBooked ?? 0,
        slotsOffered: row?.slotsOffered ?? 0,
        slotsFilled: row?.slotsFilled ?? 0,
        slotFillMinutes: row?.slotFillMinutes ?? 0,
      };
    });
    const sums = sumByPeriod(days, from, to, bucket, KEYS);
    return {
      from,
      to,
      bucket,
      items: sums.map((sum) => ({ period: sum.period, ...withRate(sum) })),
      totals: withRate(totalOf(sums, KEYS)),
    };
  }
}
