import { TimeOffAdded } from '@driveos/shared';
import {
  CommandHandler,
  type CommandResult,
  EventPublisher,
  type ICommandHandler,
  newEvent,
} from '../../../kernel/cqrs/index.js';
import { mapExclusion } from '../../../kernel/http/errors.js';
import { TenantContext } from '../../../kernel/tenant/tenant-context.js';
import { SchedulingAccess } from '../infra/access.js';
import { timeOff } from '../infra/schema.js';
import { schoolIdOf } from '../infra/tenant.js';
import { AddTimeOffCommand } from './add-time-off.command.js';

const EXCLUSIONS = { time_off_no_overlap: 'time_off_overlap' } as const;

@CommandHandler(AddTimeOffCommand)
export class AddTimeOffHandler implements ICommandHandler<AddTimeOffCommand, CommandResult> {
  constructor(
    private readonly tenant: TenantContext,
    private readonly access: SchedulingAccess,
    private readonly publisher: EventPublisher,
  ) {}

  async execute({
    actor,
    instructorMembershipId,
    body,
  }: AddTimeOffCommand): Promise<CommandResult> {
    await this.access.requireInstructor(actor, instructorMembershipId, ['availability.manage']);
    const period = { start: new Date(body.start), end: new Date(body.end) };
    const [row] = await this.tenant.tx
      .insert(timeOff)
      .values({
        schoolId: schoolIdOf(this.tenant),
        instructorMembershipId,
        period,
        reason: body.reason,
      })
      .returning({ id: timeOff.id, version: timeOff.version })
      .catch((error: unknown) => mapExclusion(error, EXCLUSIONS));
    if (!row) throw new Error('Time off insert returned no row');
    await this.publisher.append([
      newEvent(TimeOffAdded, {
        aggregateType: 'time_off',
        aggregateId: row.id,
        aggregateVersion: row.version,
        payload: {
          timeOffId: row.id,
          instructorMembershipId,
          start: period.start.toISOString(),
          end: period.end.toISOString(),
        },
      }),
    ]);
    return row;
  }
}
