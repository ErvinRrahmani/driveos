import type {
  LessonResponse,
  SyncAvailability,
  SyncChange,
  SyncProgressEntry,
  SyncStudent,
  Vehicle,
} from '@driveos/shared';
import { Inject, Injectable } from '@nestjs/common';
import { QueryBus } from '../../../kernel/cqrs/index.js';
import { MembershipDirectory } from '../../identity/index.js';
import { AUDIT_WRITER, type AuditWriter } from '../../platform/index.js';
import {
  ListProgressEntriesQuery,
  ListStudentBookingProfilesQuery,
  ListStudentIdsForInstructorQuery,
} from '../../training/index.js';
import { localDateOf } from '../domain/time-zone.js';
import { AvailabilityRecords } from './availability-records.js';
import type { FeedRow } from './change-feed-records.js';
import { LessonRecords } from './lesson-records.js';
import { LessonViews } from './lesson-views.js';
import { SchoolFacts } from './school-facts.js';

type Upsert = Extract<SyncChange, { op: 'upsert' }>;
type State = Upsert['data'] | 'delete' | 'revoke';
type States = Map<string, State>;

const idsOf = (rows: readonly FeedRow[], entity: FeedRow['entity']) => [
  ...new Set(rows.filter((row) => row.entity === entity).map((row) => row.entityId)),
];

@Injectable()
export class SyncChanges {
  constructor(
    private readonly queryBus: QueryBus,
    private readonly lessons: LessonRecords,
    private readonly lessonViews: LessonViews,
    private readonly availability: AvailabilityRecords,
    private readonly school: SchoolFacts,
    @Inject(MembershipDirectory)
    private readonly directory: MembershipDirectory,
    @Inject(AUDIT_WRITER) private readonly audit: AuditWriter,
  ) {}

  async resolve(rows: readonly FeedRow[], audience: string): Promise<SyncChange[]> {
    const upserts = rows.filter((row) => row.op === 'upsert');
    const assigned = new Set(
      upserts.some((row) => row.entity !== 'vehicle' && row.entity !== 'availability')
        ? await this.queryBus.execute(new ListStudentIdsForInstructorQuery(audience))
        : [],
    );
    const states: Record<FeedRow['entity'], States> = {
      lesson: await this.lessonStates(idsOf(upserts, 'lesson'), audience, assigned),
      student: await this.studentStates(idsOf(upserts, 'student'), audience),
      progress_entry: await this.progressStates(
        idsOf(upserts, 'progress_entry'),
        audience,
        assigned,
      ),
      vehicle: await this.vehicleStates(idsOf(upserts, 'vehicle')),
      availability: await this.availabilityStates(idsOf(upserts, 'availability'), audience),
    };
    return rows.map((row) => {
      const base = { seq: row.seq, entityId: row.entityId, at: row.at.toISOString() };
      const state =
        row.op === 'upsert' ? (states[row.entity].get(row.entityId) ?? 'delete') : row.op;
      if (state === 'delete' || state === 'revoke') {
        return { ...base, op: state, entity: row.entity, data: null };
      }
      return { ...base, op: 'upsert', entity: row.entity, data: state } as Upsert;
    });
  }

  private async lessonStates(
    ids: string[],
    audience: string,
    assigned: ReadonlySet<string>,
  ): Promise<States> {
    const views = await this.lessonViews.toResponses(await this.lessons.byIds(ids));
    return new Map(
      views.map((lesson): [string, LessonResponse | 'revoke'] => [
        lesson.id,
        lesson.instructorMembershipId === audience || assigned.has(lesson.studentId)
          ? lesson
          : 'revoke',
      ]),
    );
  }

  private async studentStates(ids: string[], audience: string): Promise<States> {
    if (ids.length === 0) return new Map();
    const profiles = await this.queryBus.execute(
      new ListStudentBookingProfilesQuery({ studentIds: ids }),
    );
    const visible = profiles.filter(
      (profile) =>
        profile.status === 'active' && profile.allowedInstructorMembershipIds.includes(audience),
    );
    const contacts = new Map(
      (
        await this.directory.contactsOf(
          visible.map((profile) => profile.userId).filter((id): id is string => id !== null),
        )
      ).map((contact) => [contact.userId, contact]),
    );
    for (const profile of visible) {
      await this.audit.record({
        action: 'student.read',
        targetType: 'student',
        targetId: profile.studentId,
      });
    }
    return new Map(
      profiles.map((profile): [string, SyncStudent | 'delete' | 'revoke'] => {
        if (profile.status !== 'active') return [profile.studentId, 'delete'];
        if (!profile.allowedInstructorMembershipIds.includes(audience)) {
          return [profile.studentId, 'revoke'];
        }
        return [
          profile.studentId,
          {
            id: profile.studentId,
            fullName: profile.fullName,
            phone: profile.userId ? (contacts.get(profile.userId)?.phone ?? null) : null,
            licenceClass: profile.licenceClass,
            area: profile.area,
            pickupAddress: profile.pickupAddress,
            pickupLat: profile.pickupLat,
            pickupLng: profile.pickupLng,
            isPrimary: profile.primaryInstructorMembershipId === audience,
          },
        ];
      }),
    );
  }

  private async progressStates(
    ids: string[],
    audience: string,
    assigned: ReadonlySet<string>,
  ): Promise<States> {
    if (ids.length === 0) return new Map();
    const entries = await this.queryBus.execute(new ListProgressEntriesQuery({ ids }));
    const instructors = await this.lessons.instructorsOf(entries.map((entry) => entry.lessonId));
    return new Map(
      entries.map((entry): [string, SyncProgressEntry | 'revoke'] => [
        entry.id,
        instructors.get(entry.lessonId) === audience || assigned.has(entry.studentId)
          ? entry
          : 'revoke',
      ]),
    );
  }

  private async vehicleStates(ids: string[]): Promise<States> {
    if (ids.length === 0) return new Map();
    const wanted = new Set(ids);
    const vehicles = (await this.school.vehicles()).filter((vehicle) => wanted.has(vehicle.id));
    return new Map(
      vehicles.map((vehicle): [string, Vehicle | 'delete'] => [
        vehicle.id,
        vehicle.active ? vehicle : 'delete',
      ]),
    );
  }

  private async availabilityStates(ids: string[], audience: string): Promise<States> {
    const states: States = new Map();
    for (const id of ids) {
      if (id !== audience) {
        states.set(id, 'revoke');
        continue;
      }
      const now = new Date();
      const today = localDateOf(now, await this.school.timeZone());
      const { timeOff: _timeOff, ...pattern } = await this.availability.response(id, today, now);
      states.set(id, pattern satisfies SyncAvailability);
    }
    return states;
  }
}
