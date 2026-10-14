import { and, asc, eq, isNull, sql } from 'drizzle-orm';
import { CommandHandler, type ICommandHandler } from '../../../kernel/cqrs/index.js';
import { ConflictError } from '../../../kernel/http/errors.js';
import { t } from '../../../kernel/i18n/i18n.js';
import { TenantContext } from '../../../kernel/tenant/tenant-context.js';
import { pickEntitlementToConsume } from '../domain/entitlement-selection.js';
import { entitlements } from '../infra/schema.js';
import {
  type ConsumedEntitlement,
  ConsumeEntitlementCommand,
} from './consume-entitlement.command.js';

@CommandHandler(ConsumeEntitlementCommand)
export class ConsumeEntitlementHandler implements ICommandHandler<
  ConsumeEntitlementCommand,
  ConsumedEntitlement
> {
  constructor(private readonly tenant: TenantContext) {}

  async execute({ input }: ConsumeEntitlementCommand): Promise<ConsumedEntitlement> {
    const candidates = await this.tenant.tx
      .select()
      .from(entitlements)
      .where(
        and(
          eq(entitlements.studentId, input.studentId),
          eq(entitlements.kind, input.kind),
          isNull(entitlements.consumedAt),
          isNull(entitlements.revokedAt),
        ),
      )
      .orderBy(asc(entitlements.grantedAt), asc(entitlements.id))
      .for('update');
    const chosen = pickEntitlementToConsume(candidates, input.kind);
    if (!chosen) throw new ConflictError('entitlement_missing', t('errors.entitlement_missing'));
    await this.tenant.tx
      .update(entitlements)
      .set({
        consumedAt: new Date(),
        consumedByLessonId: input.lessonId,
        version: sql`${entitlements.version} + 1`,
      })
      .where(eq(entitlements.id, chosen.id));
    return { entitlementId: chosen.id };
  }
}
