import { and, eq, max } from 'drizzle-orm';
import {
  CommandHandler,
  type CommandResult,
  type ICommandHandler,
} from '../../../kernel/cqrs/index.js';
import { newId } from '../../../kernel/db/columns.js';
import { TenantContext } from '../../../kernel/tenant/tenant-context.js';
import { contractTemplates } from '../infra/schema.js';
import { CreateContractTemplateCommand } from './create-contract-template.command.js';

@CommandHandler(CreateContractTemplateCommand)
export class CreateContractTemplateHandler implements ICommandHandler<
  CreateContractTemplateCommand,
  CommandResult
> {
  constructor(private readonly tenant: TenantContext) {}

  async execute({ body }: CreateContractTemplateCommand): Promise<CommandResult> {
    const schoolId = this.tenant.schoolId;
    if (!schoolId) throw new Error('Contract templates need a school scope');
    const [latest] = await this.tenant.tx
      .select({ version: max(contractTemplates.version) })
      .from(contractTemplates)
      .where(and(eq(contractTemplates.schoolId, schoolId), eq(contractTemplates.name, body.name)));
    const id = newId();
    const version = (latest?.version ?? 0) + 1;
    await this.tenant.tx.insert(contractTemplates).values({
      id,
      schoolId,
      name: body.name,
      version,
      body: body.body,
      active: body.active,
    });
    return { id, version };
  }
}
