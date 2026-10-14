import { lt } from 'drizzle-orm';
import { CommandHandler, type ICommandHandler, QueryBus } from '../../../kernel/cqrs/index.js';
import { TenantContext } from '../../../kernel/tenant/tenant-context.js';
import { GetSchoolSettingsQuery } from '../../school/index.js';
import { retentionCutoff } from '../domain/chat.js';
import { messages } from '../infra/schema.js';
import {
  PurgeExpiredMessagesCommand,
  type PurgedMessages,
} from './purge-expired-messages.command.js';

@CommandHandler(PurgeExpiredMessagesCommand)
export class PurgeExpiredMessagesHandler implements ICommandHandler<
  PurgeExpiredMessagesCommand,
  PurgedMessages
> {
  constructor(
    private readonly tenant: TenantContext,
    private readonly queryBus: QueryBus,
  ) {}

  async execute({ now }: PurgeExpiredMessagesCommand): Promise<PurgedMessages> {
    const settings = await this.queryBus.execute(new GetSchoolSettingsQuery());
    const cutoff = retentionCutoff(now, settings.chatRetentionMonths);
    const deleted = await this.tenant.tx
      .delete(messages)
      .where(lt(messages.sentAt, cutoff))
      .returning({ id: messages.id });
    return { deleted: deleted.length };
  }
}
