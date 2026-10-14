import {
  CommandHandler,
  type CommandResult,
  type ICommandHandler,
} from '../../../kernel/cqrs/index.js';
import { ConflictError, invalidField } from '../../../kernel/http/errors.js';
import { findPgError, PG_UNIQUE_VIOLATION } from '../../../kernel/http/pg-error.js';
import { t } from '../../../kernel/i18n/i18n.js';
import { TenantContext } from '../../../kernel/tenant/tenant-context.js';
import { isPlanCurrency } from '../domain/plan.js';
import { plans } from '../infra/schema.js';
import { CreatePlanCommand } from './create-plan.command.js';

@CommandHandler(CreatePlanCommand)
export class CreatePlanHandler implements ICommandHandler<CreatePlanCommand, CommandResult> {
  constructor(private readonly tenant: TenantContext) {}

  async execute({ body }: CreatePlanCommand): Promise<CommandResult> {
    if (!isPlanCurrency(body.currency)) {
      throw invalidField(['currency'], 'Expected an ISO 4217 currency code');
    }
    try {
      const [row] = await this.tenant.tx.insert(plans).values(body).returning();
      if (!row) throw new Error('Plan insert returned no row');
      return { id: row.id, version: row.version };
    } catch (error) {
      if (findPgError(error)?.code === PG_UNIQUE_VIOLATION) {
        throw new ConflictError('plan_code_taken', t('errors.plan_code_taken'));
      }
      throw error;
    }
  }
}
