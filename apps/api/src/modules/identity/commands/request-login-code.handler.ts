import { Logger } from '@nestjs/common';
import { CommandHandler, type ICommandHandler } from '../../../kernel/cqrs/index.js';
import { TenantContext } from '../../../kernel/tenant/tenant-context.js';
import { loginCodeExpiry, loginCodeLimitReason } from '../domain/login-code.js';
import { generateLoginCode, hashSecret } from '../domain/secrets.js';
import { contactOrThrow } from './auth-errors.js';
import { AuthDirectory } from '../infra/auth-directory.js';
import { IdentitySettings } from '../infra/identity-settings.js';
import { LoginCodeNotifier } from '../infra/login-code-notifier.js';
import { LoginRateLimiter } from '../infra/login-rate-limiter.js';
import { OtpCodesRepository } from '../infra/otp-codes.repository.js';
import { RequestLoginCodeCommand } from './request-login-code.command.js';

@CommandHandler(RequestLoginCodeCommand)
export class RequestLoginCodeHandler implements ICommandHandler<RequestLoginCodeCommand, void> {
  private readonly logger = new Logger(RequestLoginCodeHandler.name);

  constructor(
    private readonly tenant: TenantContext,
    private readonly directory: AuthDirectory,
    private readonly codes: OtpCodesRepository,
    private readonly limiter: LoginRateLimiter,
    private readonly notifier: LoginCodeNotifier,
    private readonly settings: IdentitySettings,
  ) {}

  async execute(command: RequestLoginCodeCommand): Promise<void> {
    const contact = contactOrThrow(command.contact);
    const now = new Date();
    const counts = await this.limiter.count(contact, command.ip, now);
    const limited = loginCodeLimitReason(counts, this.settings.limits);
    const code = generateLoginCode();
    const stored = await this.tenant.runInTenant({ schoolId: null, userId: null }, async () => {
      const allowed = await this.directory.loginAllowed(contact.value);
      if (!allowed || limited) return false;
      const codeHash = hashSecret(this.settings.pepper, `${contact.value}:${code}`);
      await this.codes.replace(contact.value, codeHash, loginCodeExpiry(now), now);
      return true;
    });
    if (limited) {
      this.logger.warn({
        msg: 'login code rate limited',
        limit: limited,
        channel: contact.kind,
        contactRef: hashSecret(this.settings.pepper, contact.value).slice(0, 16),
      });
    }
    if (!stored) return;
    await this.limiter.recordSend(contact, now);
    this.notifier.dispatch(contact, code);
  }
}
