import { eq, sql } from 'drizzle-orm';
import {
  CommandHandler,
  type CommandResult,
  type ICommandHandler,
} from '../../../kernel/cqrs/index.js';
import { notFound } from '../../../kernel/http/errors.js';
import { TenantContext } from '../../../kernel/tenant/tenant-context.js';
import { plans } from '../infra/schema.js';
import { UpdatePlanCommand } from './update-plan.command.js';

@CommandHandler(UpdatePlanCommand)
export class UpdatePlanHandler implements ICommandHandler<UpdatePlanCommand, CommandResult> {
  constructor(private readonly tenant: TenantContext) {}

  async execute({ planId, patch }: UpdatePlanCommand): Promise<CommandResult> {
    const [row] = await this.tenant.tx
      .update(plans)
      .set({ ...patch, version: sql`${plans.version} + 1` })
      .where(eq(plans.id, planId))
      .returning({ id: plans.id, version: plans.version });
    if (!row) throw notFound();
    return row;
  }
}
