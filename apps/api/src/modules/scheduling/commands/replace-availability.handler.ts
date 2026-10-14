import { type AvailabilityResponse, AvailabilityChanged } from '@driveos/shared';
import { eq, inArray, sql } from 'drizzle-orm';
import {
  CommandHandler,
  EventPublisher,
  type ICommandHandler,
  newEvent,
} from '../../../kernel/cqrs/index.js';
import { ApiError } from '../../../kernel/http/api-error.js';
import { t } from '../../../kernel/i18n/i18n.js';
import { TenantContext } from '../../../kernel/tenant/tenant-context.js';
import { overlappingWindows, planAvailabilityReplace } from '../domain/availability.js';
import { localDateOf } from '../domain/time-zone.js';
import { SchedulingAccess } from '../infra/access.js';
import { AvailabilityRecords } from '../infra/availability-records.js';
import { availability, availabilityVersions } from '../infra/schema.js';
import { SchoolFacts } from '../infra/school-facts.js';
import { schoolIdOf } from '../infra/tenant.js';
import { ReplaceAvailabilityCommand } from './replace-availability.command.js';
import { StatusCodes } from 'http-status-codes';

@CommandHandler(ReplaceAvailabilityCommand)
export class ReplaceAvailabilityHandler implements ICommandHandler<
  ReplaceAvailabilityCommand,
  AvailabilityResponse
> {
  constructor(
    private readonly tenant: TenantContext,
    private readonly access: SchedulingAccess,
    private readonly records: AvailabilityRecords,
    private readonly school: SchoolFacts,
    private readonly publisher: EventPublisher,
  ) {}

  async execute({
    actor,
    instructorMembershipId,
    body,
  }: ReplaceAvailabilityCommand): Promise<AvailabilityResponse> {
    await this.access.requireInstructor(actor, instructorMembershipId, ['availability.manage']);
    const overlapping = overlappingWindows(body.windows);
    if (overlapping.length > 0) {
      throw new ApiError(StatusCodes.BAD_REQUEST, 'validation_error', t('errors.validation'), {
        issues: overlapping.map((index) => ({
          path: ['windows', index],
          message: 'Windows on the same weekday must not overlap',
        })),
      });
    }

    const schoolId = schoolIdOf(this.tenant);
    const tx = this.tenant.tx;
    const [counter] = await tx
      .insert(availabilityVersions)
      .values({ schoolId, instructorMembershipId, version: 1 })
      .onConflictDoUpdate({
        target: availabilityVersions.instructorMembershipId,
        set: { version: sql`${availabilityVersions.version} + 1` },
      })
      .returning({ version: availabilityVersions.version });
    if (!counter) throw new Error('Availability version upsert returned no row');
    const version = counter.version;

    const existing = await tx
      .select()
      .from(availability)
      .where(eq(availability.instructorMembershipId, instructorMembershipId));
    const effectiveTo = body.effectiveTo ?? null;
    const plan = planAvailabilityReplace(existing, body.effectiveFrom, effectiveTo);
    if (plan.deleteIds.length > 0) {
      await tx.delete(availability).where(inArray(availability.id, plan.deleteIds));
    }
    for (const update of plan.updates) {
      await tx
        .update(availability)
        .set({ validFrom: update.validFrom, validTo: update.validTo, version })
        .where(eq(availability.id, update.id));
    }
    const byId = new Map(existing.map((row) => [row.id, row]));
    const copies = plan.copies.flatMap((copy) => {
      const source = byId.get(copy.sourceId);
      return source
        ? [
            {
              schoolId,
              instructorMembershipId,
              weekday: source.weekday,
              startTime: source.startTime,
              endTime: source.endTime,
              validFrom: copy.validFrom,
              validTo: copy.validTo,
              version,
            },
          ]
        : [];
    });
    const fresh = body.windows.map((window) => ({
      schoolId,
      instructorMembershipId,
      weekday: window.weekday,
      startTime: window.startTime,
      endTime: window.endTime,
      validFrom: body.effectiveFrom,
      validTo: effectiveTo,
      version,
    }));
    if (copies.length + fresh.length > 0) {
      await tx.insert(availability).values([...copies, ...fresh]);
    }

    await this.publisher.append([
      newEvent(AvailabilityChanged, {
        aggregateType: 'availability',
        aggregateId: instructorMembershipId,
        aggregateVersion: version,
        payload: {
          instructorMembershipId,
          effectiveFrom: body.effectiveFrom,
          ...(body.effectiveTo ? { effectiveTo: body.effectiveTo } : {}),
          windows: body.windows,
        },
      }),
    ]);
    const now = new Date();
    return this.records.response(
      instructorMembershipId,
      localDateOf(now, await this.school.timeZone()),
      now,
    );
  }
}
