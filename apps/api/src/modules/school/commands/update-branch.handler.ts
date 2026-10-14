import { eq, sql } from 'drizzle-orm';
import {
  CommandHandler,
  type CommandResult,
  EventPublisher,
  type ICommandHandler,
} from '../../../kernel/cqrs/index.js';
import { notFound } from '../../../kernel/http/errors.js';
import { TenantContext } from '../../../kernel/tenant/tenant-context.js';
import { branchChanged } from '../events/branch-changed.js';
import { branches } from '../infra/schema.js';
import { UpdateBranchCommand } from './update-branch.command.js';

@CommandHandler(UpdateBranchCommand)
export class UpdateBranchHandler implements ICommandHandler<UpdateBranchCommand, CommandResult> {
  constructor(
    private readonly tenant: TenantContext,
    private readonly publisher: EventPublisher,
  ) {}

  async execute({ branchId, patch }: UpdateBranchCommand): Promise<CommandResult> {
    const [row] = await this.tenant.tx
      .update(branches)
      .set({ ...patch, version: sql`${branches.version} + 1` })
      .where(eq(branches.id, branchId))
      .returning();
    if (!row) throw notFound();
    await this.publisher.append([branchChanged(row, 'updated')]);
    return { id: row.id, version: row.version };
  }
}
