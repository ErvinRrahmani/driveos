import type { OpeningHoursEntry, SchoolSettings, Vehicle } from '@driveos/shared';
import { Injectable } from '@nestjs/common';
import { QueryBus } from '../../../kernel/cqrs/index.js';
import {
  GetOpeningHoursQuery,
  GetSchoolQuery,
  GetSchoolSettingsQuery,
  ListVehiclesQuery,
} from '../../school/index.js';

const PAGE = 200;

@Injectable()
export class SchoolFacts {
  constructor(private readonly queryBus: QueryBus) {}

  async timeZone(): Promise<string> {
    return (await this.queryBus.execute(new GetSchoolQuery())).timeZone;
  }

  settings(): Promise<SchoolSettings> {
    return this.queryBus.execute(new GetSchoolSettingsQuery());
  }

  async openingHours(): Promise<OpeningHoursEntry[]> {
    return (await this.queryBus.execute(new GetOpeningHoursQuery(null))).items;
  }

  async vehicles(onlyActive = false): Promise<Vehicle[]> {
    const vehicles: Vehicle[] = [];
    let cursor: string | undefined;
    do {
      const page = await this.queryBus.execute(
        new ListVehiclesQuery({ ...(onlyActive ? { active: 'true' } : {}), limit: PAGE, cursor }),
      );
      vehicles.push(...page.items);
      cursor = page.nextCursor ?? undefined;
    } while (cursor);
    return vehicles;
  }
}
