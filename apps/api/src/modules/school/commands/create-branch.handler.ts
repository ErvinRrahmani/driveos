import {
  CommandHandler,
  type CommandResult,
  EventPublisher,
  type ICommandHandler,
} from '../../../kernel/cqrs/index.js';
import { TenantContext } from '../../../kernel/tenant/tenant-context.js';
import { branchChanged } from '../events/branch-changed.js';
import { SchoolRecords } from '../infra/school-records.js';
import { branches } from '../infra/schema.js';
import { CreateBranchCommand } from './create-branch.command.js';

@CommandHandler(CreateBranchCommand)
export class CreateBranchHandler implements ICommandHandler<CreateBranchCommand, CommandResult> {
  constructor(
    private readonly tenant: TenantContext,
    private readonly records: SchoolRecords,
    private readonly publisher: EventPublisher,
  ) {}

  async execute({ body }: CreateBranchCommand): Promise<CommandResult> {
    const [row] = await this.tenant.tx
      .insert(branches)
      .values({ ...body, schoolId: this.records.schoolId })
      .returning();
    if (!row) throw new Error('Branch insert returned no row');
    await this.publisher.append([branchChanged(row, 'created')]);
    return { id: row.id, version: row.version };
  }
}
