import type { SessionResponse } from '@driveos/shared';
import { CommandHandler, type ICommandHandler } from '../../../kernel/cqrs/index.js';
import { TenantContext } from '../../../kernel/tenant/tenant-context.js';
import type { AuthErrorCode } from '../domain/errors.js';
import { checkLoginCode } from '../domain/login-code.js';
import { secretMatches } from '../domain/secrets.js';
import { authError, contactOrThrow } from './auth-errors.js';
import { AuthDirectory } from '../infra/auth-directory.js';
import { IdentitySettings } from '../infra/identity-settings.js';
import { OtpCodesRepository } from '../infra/otp-codes.repository.js';
import { SessionIssuer } from '../infra/session-issuer.js';
import { VerifyLoginCodeCommand } from './verify-login-code.command.js';

type CodeOutcome = { error: AuthErrorCode } | { userId: string };

@CommandHandler(VerifyLoginCodeCommand)
export class VerifyLoginCodeHandler implements ICommandHandler<
  VerifyLoginCodeCommand,
  SessionResponse
> {
  constructor(
    private readonly tenant: TenantContext,
    private readonly directory: AuthDirectory,
    private readonly codes: OtpCodesRepository,
    private readonly issuer: SessionIssuer,
    private readonly settings: IdentitySettings,
  ) {}

  async execute(command: VerifyLoginCodeCommand): Promise<SessionResponse> {
    const contact = contactOrThrow(command.contact);
    const now = new Date();
    const outcome = await this.tenant.runInTenant(
      { schoolId: null, userId: null },
      async (): Promise<CodeOutcome> => {
        const stored = await this.codes.latestUnconsumedForUpdate(contact.value);
        const matches =
          stored !== null &&
          secretMatches(stored.codeHash, this.settings.pepper, `${contact.value}:${command.code}`);
        const check = checkLoginCode(stored, matches, now);
        if (!stored || check.outcome === 'invalid') return { error: 'invalid_code' };
        if (check.outcome === 'expired') return { error: 'code_expired' };
        if (check.outcome === 'wrong') {
          await this.codes.recordAttempt(stored.id, check.attempts);
          return { error: 'invalid_code' };
        }
        await this.codes.consume(stored.id, now);
        const userId = await this.directory.findUserByContact(contact.value);
        return userId ? { userId } : { error: 'no_account' };
      },
    );
    if ('error' in outcome) throw authError(outcome.error);
    const { userId } = outcome;
    return this.tenant.runInTenant({ schoolId: null, userId }, async () => {
      const resolved = await this.issuer.resolve(userId, { auto: true });
      return this.issuer.issue(resolved, command.client, now);
    });
  }
}
