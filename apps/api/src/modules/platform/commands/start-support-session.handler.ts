import { type StartSupportSessionResponse, SupportSessionStarted } from '@driveos/shared';
import { AccessTokenService } from '../../../kernel/auth/access-token.js';
import {
  CommandHandler,
  EventPublisher,
  type ICommandHandler,
  newEvent,
  QueryBus,
} from '../../../kernel/cqrs/index.js';
import { TenantContext } from '../../../kernel/tenant/tenant-context.js';
import { GetSchoolQuery } from '../../school/index.js';
import { supportSessionExpiry, supportSessionSecondsLeft } from '../domain/support-session.js';
import { PlatformAuditWriter } from '../infra/audit-writer.js';
import { SupportSessionsRepository } from '../infra/support-sessions.repository.js';
import { StartSupportSessionCommand } from './start-support-session.command.js';

@CommandHandler(StartSupportSessionCommand)
export class StartSupportSessionHandler implements ICommandHandler<
  StartSupportSessionCommand,
  StartSupportSessionResponse
> {
  constructor(
    private readonly tenant: TenantContext,
    private readonly queryBus: QueryBus,
    private readonly sessions: SupportSessionsRepository,
    private readonly audit: PlatformAuditWriter,
    private readonly publisher: EventPublisher,
    private readonly tokens: AccessTokenService,
  ) {}

  async execute({ actor, body }: StartSupportSessionCommand): Promise<StartSupportSessionResponse> {
    const { schoolId, reason } = body;
    return this.tenant.enterSchool(schoolId, async () => {
      await this.queryBus.execute(new GetSchoolQuery());
      const startedAt = new Date();
      const session = await this.sessions.insert({
        platformAdminUserId: actor.userId,
        schoolId,
        reason,
        startedAt,
        expiresAt: supportSessionExpiry(startedAt, body.durationMinutes),
      });
      await this.audit.recordInSession(session.id, {
        action: 'support_session.started',
        targetType: 'support_session',
        targetId: session.id,
        reason,
      });
      await this.publisher.append([
        newEvent(SupportSessionStarted, {
          aggregateType: 'support_session',
          aggregateId: session.id,
          aggregateVersion: 1,
          payload: {
            sessionId: session.id,
            platformAdminUserId: actor.userId,
            schoolId,
            reason,
            startedAt: session.startedAt.toISOString(),
            expiresAt: session.expiresAt.toISOString(),
          },
        }),
      ]);
      const { token } = await this.tokens.sign(
        {
          userId: actor.userId,
          membershipId: null,
          schoolId,
          roles: [],
          tokenType: 'support',
          sessionId: session.id,
        },
        { ttlSeconds: supportSessionSecondsLeft(session.expiresAt, startedAt) },
      );
      return {
        id: session.id,
        version: 1,
        supportToken: token,
        expiresAt: session.expiresAt.toISOString(),
      };
    });
  }
}
