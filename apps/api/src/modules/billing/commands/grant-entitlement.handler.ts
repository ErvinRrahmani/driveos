import { EntitlementGranted } from '@driveos/shared';
import {
  CommandHandler,
  type CommandResult,
  EventPublisher,
  type ICommandHandler,
  newEvent,
} from '../../../kernel/cqrs/index.js';
import { notFound } from '../../../kernel/http/errors.js';
import { TenantContext } from '../../../kernel/tenant/tenant-context.js';
import { entitlements } from '../infra/schema.js';
import { StudentLookup } from '../infra/student-lookup.js';
import { GrantEntitlementCommand } from './grant-entitlement.command.js';

export const ENTITLEMENT_AGGREGATE = 'entitlement';

@CommandHandler(GrantEntitlementCommand)
export class GrantEntitlementHandler implements ICommandHandler<
  GrantEntitlementCommand,
  CommandResult
> {
  constructor(
    private readonly tenant: TenantContext,
    private readonly students: StudentLookup,
    private readonly publisher: EventPublisher,
  ) {}

  async execute({ input }: GrantEntitlementCommand): Promise<CommandResult> {
    const schoolId = this.tenant.schoolId;
    if (!schoolId) throw new Error('Granting an entitlement needs a school scope');
    if (!(await this.students.exists(input.studentId))) throw notFound();
    const [row] = await this.tenant.tx
      .insert(entitlements)
      .values({
        schoolId,
        studentId: input.studentId,
        kind: input.kind,
        paymentId: input.paymentId ?? null,
        grantedAt: new Date(),
      })
      .returning();
    if (!row) throw new Error('Entitlement insert returned no row');
    await this.publisher.append([
      newEvent(EntitlementGranted, {
        aggregateType: ENTITLEMENT_AGGREGATE,
        aggregateId: row.id,
        aggregateVersion: row.version,
        payload: {
          entitlementId: row.id,
          studentId: row.studentId,
          kind: row.kind,
          paymentId: row.paymentId,
          grantedAt: row.grantedAt.toISOString(),
        },
      }),
    ]);
    return { id: row.id, version: row.version };
  }
}
