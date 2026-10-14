import { Inject, Injectable } from '@nestjs/common';
import { QueryBus } from '../../../kernel/cqrs/index.js';
import { LEDGER_WRITER, type LedgerWriter } from '../../billing/index.js';
import {
  ListStudentBookingProfilesQuery,
  type StudentBookingProfile,
  type StudentBookingProfileFilter,
} from '../../training/index.js';
import type { Period } from '../domain/period.js';
import {
  type Audience,
  type AudienceCandidate,
  matchesPreferredWindows,
  selectAudience,
  type SlotForAudience,
} from '../domain/slot-offers.js';
import { addDays, localDateOf, localToUtcOrTransition } from '../domain/time-zone.js';
import { LessonRecords } from './lesson-records.js';
import { WaitingListRecords } from './waiting-list-records.js';

export interface AudienceRequest {
  slot: Omit<SlotForAudience, 'area'>;
  zone: string;
  studentIds?: readonly string[];
  excludeStudentIds?: readonly string[];
}

@Injectable()
export class SlotOfferAudience {
  constructor(
    private readonly queryBus: QueryBus,
    private readonly lessons: LessonRecords,
    private readonly waitingList: WaitingListRecords,
    @Inject(LEDGER_WRITER) private readonly ledger: LedgerWriter,
  ) {}

  async resolve(request: AudienceRequest): Promise<Audience> {
    const { zone } = request;
    const area = request.studentIds ? null : await this.slotArea(request.slot, zone);
    const slot: SlotForAudience = { ...request.slot, area };
    const waitingList = request.studentIds
      ? []
      : (await this.waitingList.activeFor(slot.lessonTypeId)).filter((entry) =>
          matchesPreferredWindows(slot.period, entry.preferredWindows, zone),
        );
    const eligibleBy = { licenceClass: slot.licenceClass, activeOnly: true };
    const profiles: StudentBookingProfile[] = [];
    if (request.studentIds) {
      profiles.push(...(await this.profiles({ ...eligibleBy, studentIds: request.studentIds })));
    } else {
      const waitingIds = waitingList.map((entry) => entry.studentId);
      if (waitingIds.length > 0) {
        profiles.push(...(await this.profiles({ ...eligibleBy, studentIds: waitingIds })));
      }
      if (area) profiles.push(...(await this.profiles({ ...eligibleBy, area })));
    }
    return selectAudience({
      slot,
      zone,
      waitingList,
      candidates: await this.candidates(profiles),
      studentIds: request.studentIds,
      excludeStudentIds: request.excludeStudentIds,
    });
  }

  private profiles(filter: StudentBookingProfileFilter): Promise<StudentBookingProfile[]> {
    return this.queryBus.execute(new ListStudentBookingProfilesQuery(filter));
  }

  private async candidates(
    profiles: readonly StudentBookingProfile[],
  ): Promise<AudienceCandidate[]> {
    const unique = new Map(profiles.map((profile) => [profile.studentId, profile]));
    const candidates: AudienceCandidate[] = [];
    for (const profile of unique.values()) {
      candidates.push({
        studentId: profile.studentId,
        status: profile.status,
        licenceClass: profile.licenceClass,
        area: profile.area,
        allowedInstructorMembershipIds: profile.allowedInstructorMembershipIds,
        balance: await this.ledger.balance(profile.studentId),
      });
    }
    return candidates;
  }

  private async slotArea(
    slot: Omit<SlotForAudience, 'area'>,
    zone: string,
  ): Promise<string | null> {
    const date = localDateOf(slot.period.start, zone);
    const day: Period = {
      start: localToUtcOrTransition(date, '00:00', zone),
      end: localToUtcOrTransition(addDays(date, 1), '00:00', zone),
    };
    const neighbours = await this.lessons.adjacentStudentIds(
      slot.instructorMembershipId,
      slot.period,
      day,
    );
    if (neighbours.length === 0) return null;
    const profiles = await this.profiles({ studentIds: neighbours });
    for (const studentId of neighbours) {
      const area = profiles.find((profile) => profile.studentId === studentId)?.area?.trim();
      if (area) return area;
    }
    return null;
  }
}
