import { Injectable } from '@nestjs/common';
import { QueryBus } from '../../../kernel/cqrs/index.js';
import { NotFoundError } from '../../../kernel/http/errors.js';
import { GetSchoolQuery, GetSchoolSettingsQuery } from '../../school/index.js';
import type { QuietHours } from '../domain/quiet-hours.js';

export interface SchoolTiming {
  name: string;
  timeZone: string;
  locale: string;
  quiet: QuietHours;
}

const DEFAULT_QUIET_HOURS: QuietHours = { start: '21:00', end: '08:00' };

@Injectable()
export class SchoolTimingReader {
  constructor(private readonly queryBus: QueryBus) {}

  async read(): Promise<SchoolTiming> {
    const school = await this.queryBus.execute(new GetSchoolQuery());
    return {
      name: school.name,
      timeZone: school.timeZone,
      locale: school.locale,
      quiet: await this.quietHours(),
    };
  }

  private async quietHours(): Promise<QuietHours> {
    try {
      const settings = await this.queryBus.execute(new GetSchoolSettingsQuery());
      return { start: settings.quietHoursStart, end: settings.quietHoursEnd };
    } catch (error) {
      if (error instanceof NotFoundError) return DEFAULT_QUIET_HOURS;
      throw error;
    }
  }
}
