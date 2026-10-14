import { eq, sql } from 'drizzle-orm';
import {
  CommandHandler,
  type CommandResult,
  type ICommandHandler,
} from '../../../kernel/cqrs/index.js';
import { notFound } from '../../../kernel/http/errors.js';
import { TenantContext } from '../../../kernel/tenant/tenant-context.js';
import { priceItemIssues } from '../domain/price-item.js';
import { priceItemInvalid } from '../infra/price-item-records.js';
import { SchoolFacts } from '../infra/school-facts.js';
import { priceItems } from '../infra/schema.js';
import { UpdatePriceItemCommand } from './update-price-item.command.js';

@CommandHandler(UpdatePriceItemCommand)
export class UpdatePriceItemHandler implements ICommandHandler<
  UpdatePriceItemCommand,
  CommandResult
> {
  constructor(
    private readonly tenant: TenantContext,
    private readonly school: SchoolFacts,
  ) {}

  async execute({ priceItemId, patch }: UpdatePriceItemCommand): Promise<CommandResult> {
    const [current] = await this.tenant.tx
      .select()
      .from(priceItems)
      .where(eq(priceItems.id, priceItemId))
      .for('update');
    if (!current) throw notFound();
    const issues = priceItemIssues({ ...current, ...patch }, await this.school.currency());
    if (issues.length > 0) throw priceItemInvalid(issues);
    const [row] = await this.tenant.tx
      .update(priceItems)
      .set({ ...patch, version: sql`${priceItems.version} + 1` })
      .where(eq(priceItems.id, priceItemId))
      .returning({ id: priceItems.id, version: priceItems.version });
    if (!row) throw notFound();
    return row;
  }
}
