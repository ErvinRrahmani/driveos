import { Inject, Injectable } from '@nestjs/common';
import { MembershipDirectory } from '../../identity/index.js';
import {
  expandAvailability,
  type InstructorPeriod,
  openingHoursFor,
} from '../domain/availability.js';
import type { Period } from '../domain/period.js';
import { addDays, localDateOf } from '../domain/time-zone.js';
import { AvailabilityRecords } from './availability-records.js';
import { SchoolFacts } from './school-facts.js';

export interface ScheduleWindows {
  zone: string;
  availability: InstructorPeriod[];
  timeOff: (InstructorPeriod & { id: string })[];
}

@Injectable()
export class ScheduleWindowsReader {
  constructor(
    private readonly records: AvailabilityRecords,
    private readonly school: SchoolFacts,
    @Inject(MembershipDirectory)
    private readonly directory: MembershipDirectory,
  ) {}

  async instructorsWithAvailability(range: Period, zone: string): Promise<string[]> {
    return this.records.instructorsWithAvailability(...this.dates(range, zone));
  }

  async read(
    instructorIds: readonly string[],
    range: Period,
    zone: string,
  ): Promise<ScheduleWindows> {
    if (instructorIds.length === 0) return { zone, availability: [], timeOff: [] };
    const [rules, timeOff, openingRows] = await Promise.all([
      this.records.rules(instructorIds, ...this.dates(range, zone)),
      this.records.timeOff(instructorIds, range),
      this.school.openingHours(),
    ]);
    const branches = new Map<string, string[]>();
    for (const id of instructorIds) {
      branches.set(id, (await this.directory.getMembership(id))?.branchIds ?? []);
    }
    const availability = expandAvailability({
      rules,
      range,
      zone,
      timeOff,
      openingHours: (id) => openingHoursFor(openingRows, branches.get(id) ?? []),
    });
    return { zone, availability, timeOff };
  }

  private dates(range: Period, zone: string): [string, string] {
    return [addDays(localDateOf(range.start, zone), -1), addDays(localDateOf(range.end, zone), 1)];
  }
}
