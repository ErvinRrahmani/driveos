import { Injectable } from '@nestjs/common';
import { QueryBus } from '../../../kernel/cqrs/index.js';
import { GetSchoolSettingsQuery } from '../../school/index.js';
import { isMinor, utcToday } from '../domain/minor.js';

@Injectable()
export class MinorStatus {
  constructor(private readonly queryBus: QueryBus) {}

  async ageOfMajority(): Promise<number> {
    const settings = await this.queryBus.execute(new GetSchoolSettingsQuery());
    return settings.ageOfMajority;
  }

  async isMinor(dateOfBirth: string, now = new Date()): Promise<boolean> {
    return isMinor(dateOfBirth, await this.ageOfMajority(), utcToday(now));
  }
}
