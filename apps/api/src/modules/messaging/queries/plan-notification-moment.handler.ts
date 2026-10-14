import { type IQueryHandler, QueryHandler } from '../../../kernel/cqrs/index.js';
import { plannedMoment } from '../domain/quiet-hours.js';
import { SchoolTimingReader } from '../infra/school-timing.js';
import { PlanNotificationMomentQuery } from './plan-notification-moment.query.js';

@QueryHandler(PlanNotificationMomentQuery)
export class PlanNotificationMomentHandler implements IQueryHandler<
  PlanNotificationMomentQuery,
  Date
> {
  constructor(private readonly timing: SchoolTimingReader) {}

  async execute({ input }: PlanNotificationMomentQuery): Promise<Date> {
    const { quiet, timeZone } = await this.timing.read();
    return plannedMoment({ timing: input.timing, sendAt: input.sendAt, quiet, timeZone });
  }
}
