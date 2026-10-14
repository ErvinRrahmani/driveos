import { SubscriptionChanged } from '@driveos/shared';
import { eq } from 'drizzle-orm';
import {
  CommandBus,
  CommandHandler,
  EventPublisher,
  type ICommandHandler,
  newEvent,
} from '../../../kernel/cqrs/index.js';
import { newId } from '../../../kernel/db/columns.js';
import { ConflictError, notFound } from '../../../kernel/http/errors.js';
import { t } from '../../../kernel/i18n/i18n.js';
import { TenantContext } from '../../../kernel/tenant/tenant-context.js';
import { InviteOwnerCommand } from '../../identity/index.js';
import { ProvisionSchoolCommand } from '../../school/index.js';
import { plans, subscriptions } from '../infra/schema.js';
import { type CreatedSchool, CreateSchoolCommand } from './create-school.command.js';

@CommandHandler(CreateSchoolCommand)
export class CreateSchoolHandler implements ICommandHandler<CreateSchoolCommand, CreatedSchool> {
  constructor(
    private readonly tenant: TenantContext,
    private readonly commandBus: CommandBus,
    private readonly publisher: EventPublisher,
  ) {}

  async execute({ actor, body }: CreateSchoolCommand): Promise<CreatedSchool> {
    const { planId, owner, ...profile } = body;
    const [plan] = await this.tenant.tx.select().from(plans).where(eq(plans.id, planId));
    if (!plan) throw notFound();
    if (!plan.active) throw new ConflictError('plan_inactive', t('errors.plan_inactive'));
    const schoolId = newId();
    return this.tenant.enterSchool(schoolId, async () => {
      await this.commandBus.execute(new ProvisionSchoolCommand(schoolId, profile, planId));
      const startedAt = new Date();
      const [subscription] = await this.tenant.tx
        .insert(subscriptions)
        .values({ schoolId, planId, startedAt })
        .returning({ id: subscriptions.id });
      if (!subscription) throw new Error('Subscription insert returned no row');
      await this.publisher.append([
        newEvent(SubscriptionChanged, {
          aggregateType: 'subscription',
          aggregateId: subscription.id,
          aggregateVersion: 1,
          payload: {
            subscriptionId: subscription.id,
            schoolId,
            planId,
            planCode: plan.code,
            previousPlanId: null,
            startedAt: startedAt.toISOString(),
            baseAmountMinor: plan.baseAmountMinor,
            studentFeeMinor: plan.studentFeeMinor,
            currency: plan.currency,
          },
        }),
      ]);
      const invitation = await this.commandBus.execute(
        new InviteOwnerCommand(actor, { phone: owner.phone, email: owner.email }),
      );
      return {
        id: schoolId,
        version: 1,
        schoolId,
        invitationId: invitation.id,
        acceptToken: invitation.acceptToken,
      };
    });
  }
}
