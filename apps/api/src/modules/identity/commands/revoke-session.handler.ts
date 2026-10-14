import { CommandHandler, type ICommandHandler } from '../../../kernel/cqrs/index.js';
import { TenantContext } from '../../../kernel/tenant/tenant-context.js';
import { hashSecret } from '../domain/secrets.js';
import { IdentitySettings } from '../infra/identity-settings.js';
import { RefreshTokensRepository } from '../infra/refresh-tokens.repository.js';
import { RevokeSessionCommand } from './revoke-session.command.js';

@CommandHandler(RevokeSessionCommand)
export class RevokeSessionHandler implements ICommandHandler<RevokeSessionCommand, void> {
  constructor(
    private readonly tenant: TenantContext,
    private readonly refreshTokens: RefreshTokensRepository,
    private readonly settings: IdentitySettings,
  ) {}

  async execute(command: RevokeSessionCommand): Promise<void> {
    const tokenHash = hashSecret(this.settings.pepper, command.refreshToken);
    await this.tenant.runInTenant({ schoolId: null, userId: null }, async () => {
      const row = await this.refreshTokens.findByHash(tokenHash);
      if (!row) return;
      await this.refreshTokens.lockFamily(row.familyId);
      await this.refreshTokens.revokeFamily(row.familyId, new Date());
    });
  }
}
