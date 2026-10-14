import { SupportSessionEnded } from '@driveos/shared';
import {
  CommandHandler,
  type CommandResult,
  EventPublisher,
  type ICommandHandler,
  newEvent,
} from '../../../kernel/cqrs/index.js';
import { ConflictError, notFound } from '../../../kernel/http/errors.js';
import { t } from '../../../kernel/i18n/i18n.js';
import { TenantContext } from '../../../kernel/tenant/tenant-context.js';
import { PlatformAuditWriter } from '../infra/audit-writer.js';
import { SupportSessionsRepository } from '../infra/support-sessions.repository.js';
import { EndSupportSessionCommand } from './end-support-session.command.js';

@CommandHandler(EndSupportSessionCommand)
export class EndSupportSessionHandler implements ICommandHandler<
  EndSupportSessionCommand,
  CommandResult
> {
  constructor(
    private readonly tenant: TenantContext,
    private readonly sessions: SupportSessionsRepository,
    private readonly audit: PlatformAuditWriter,
    private readonly publisher: EventPublisher,
  ) {}

  async execute({ actor, sessionId }: EndSupportSessionCommand): Promise<CommandResult> {
    const session = await this.sessions.find(sessionId);
    if (!session || session.platformAdminUserId !== actor.userId) throw notFound();
    const endedAt = new Date();
    const ended = await this.sessions.end(sessionId, endedAt);
    if (!ended) throw new ConflictError('support_session_ended', t('errors.support_session_ended'));
    await this.tenant.enterSchool(session.schoolId, async () => {
      await this.audit.recordInSession(sessionId, {
        action: 'support_session.ended',
        targetType: 'support_session',
        targetId: sessionId,
      });
      await this.publisher.append([
        newEvent(SupportSessionEnded, {
          aggregateType: 'support_session',
          aggregateId: sessionId,
          aggregateVersion: 2,
          payload: {
            sessionId,
            platformAdminUserId: session.platformAdminUserId,
            schoolId: session.schoolId,
            endedAt: endedAt.toISOString(),
            endedBy: 'admin',
          },
        }),
      ]);
    });
    return { id: sessionId, version: 2 };
  }
}
