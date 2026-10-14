import { Injectable } from '@nestjs/common';
import { QueryBus } from '../../../kernel/cqrs/index.js';
import { GetSchoolQuery } from '../../school/index.js';

export interface SchoolProfile {
  timeZone: string;
  currency: string;
}

@Injectable()
export class SchoolProfiles {
  constructor(private readonly queryBus: QueryBus) {}

  async current(): Promise<SchoolProfile> {
    const school = await this.queryBus.execute(new GetSchoolQuery());
    return { timeZone: school.timeZone, currency: school.currency };
  }
}
