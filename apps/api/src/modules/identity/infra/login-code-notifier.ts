import { Inject, Injectable, Logger } from '@nestjs/common';
import { EMAIL_SENDER, type EmailSender } from '../../../adapters/email/email-sender.js';
import { SMS_SENDER, type SmsSender } from '../../../adapters/sms/sms-sender.js';
import { t } from '../../../kernel/i18n/i18n.js';
import type { Contact } from '../domain/contact.js';
import { LOGIN_CODE_TTL_MS } from '../domain/login-code.js';

@Injectable()
export class LoginCodeNotifier {
  private readonly logger = new Logger(LoginCodeNotifier.name);

  constructor(
    @Inject(SMS_SENDER) private readonly sms: SmsSender,
    @Inject(EMAIL_SENDER) private readonly email: EmailSender,
  ) {}

  dispatch(contact: Contact, code: string): void {
    this.send(contact, code).catch((error: unknown) => {
      this.logger.error({
        msg: 'login code delivery failed',
        channel: contact.kind,
        err: error instanceof Error ? error.message : String(error),
      });
    });
  }

  private send(contact: Contact, code: string): Promise<void> {
    const vars = { code, minutes: LOGIN_CODE_TTL_MS / 60_000 };
    if (contact.kind === 'phone') {
      return this.sms.send({ to: contact.value, body: t('notifications.login_code.sms', vars) });
    }
    return this.email.send({
      to: contact.value,
      subject: t('notifications.login_code.email_subject'),
      text: t('notifications.login_code.email_text', vars),
    });
  }
}
