import {
  CommandHandler,
  type CommandResult,
  type ICommandHandler,
} from '../../../kernel/cqrs/index.js';
import { TenantContext } from '../../../kernel/tenant/tenant-context.js';
import { priceItemIssues } from '../domain/price-item.js';
import { priceItemInvalid } from '../infra/price-item-records.js';
import { SchoolFacts } from '../infra/school-facts.js';
import { priceItems } from '../infra/schema.js';
import { CreatePriceItemCommand } from './create-price-item.command.js';

@CommandHandler(CreatePriceItemCommand)
export class CreatePriceItemHandler implements ICommandHandler<
  CreatePriceItemCommand,
  CommandResult
> {
  constructor(
    private readonly tenant: TenantContext,
    private readonly school: SchoolFacts,
  ) {}

  async execute({ body }: CreatePriceItemCommand): Promise<CommandResult> {
    const schoolId = this.tenant.schoolId;
    if (!schoolId) throw new Error('Creating a price item needs a school scope');
    const issues = priceItemIssues(body, await this.school.currency());
    if (issues.length > 0) throw priceItemInvalid(issues);
    const [row] = await this.tenant.tx
      .insert(priceItems)
      .values({ ...body, schoolId })
      .returning({ id: priceItems.id, version: priceItems.version });
    if (!row) throw new Error('Price item insert returned no row');
    return row;
  }
}
