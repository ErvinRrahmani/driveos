import type { AvailabilityResponse } from '@driveos/shared';
import { type IQueryHandler, QueryHandler } from '../../../kernel/cqrs/index.js';
import { localDateOf } from '../domain/time-zone.js';
import { SchedulingAccess } from '../infra/access.js';
import { AvailabilityRecords } from '../infra/availability-records.js';
import { SchoolFacts } from '../infra/school-facts.js';
import { GetAvailabilityQuery } from './get-availability.query.js';

@QueryHandler(GetAvailabilityQuery)
export class GetAvailabilityHandler implements IQueryHandler<
  GetAvailabilityQuery,
  AvailabilityResponse
> {
  constructor(
    private readonly access: SchedulingAccess,
    private readonly records: AvailabilityRecords,
    private readonly school: SchoolFacts,
  ) {}

  async execute({
    actor,
    instructorMembershipId,
  }: GetAvailabilityQuery): Promise<AvailabilityResponse> {
    await this.access.requireInstructor(actor, instructorMembershipId, [
      'availability.manage',
      'calendar.read',
    ]);
    const now = new Date();
    return this.records.response(
      instructorMembershipId,
      localDateOf(now, await this.school.timeZone()),
      now,
    );
  }
}
