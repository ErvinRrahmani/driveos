import { and, eq, isNull, sql } from 'drizzle-orm';
import { CommandHandler, type ICommandHandler } from '../../../kernel/cqrs/index.js';
import { TenantContext } from '../../../kernel/tenant/tenant-context.js';
import { entitlements } from '../infra/schema.js';
import { ReleaseEntitlementCommand } from './release-entitlement.command.js';

@CommandHandler(ReleaseEntitlementCommand)
export class ReleaseEntitlementHandler implements ICommandHandler<ReleaseEntitlementCommand, void> {
  constructor(private readonly tenant: TenantContext) {}

  async execute({ lessonId }: ReleaseEntitlementCommand): Promise<void> {
    await this.tenant.tx
      .update(entitlements)
      .set({
        consumedAt: null,
        consumedByLessonId: null,
        version: sql`${entitlements.version} + 1`,
      })
      .where(and(eq(entitlements.consumedByLessonId, lessonId), isNull(entitlements.revokedAt)));
  }
}
