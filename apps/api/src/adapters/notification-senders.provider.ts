import type { Provider } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Env } from '../kernel/config/env.js';
import { EMAIL_SENDER } from './email/email-sender.js';
import { SmtpEmailSender } from './email/smtp-email-sender.js';
import { ConsolePushSender } from './push/console-push-sender.js';
import { PUSH_SENDER } from './push/push-sender.js';
import { ConsoleSmsSender } from './sms/console-sms-sender.js';
import { SMS_SENDER } from './sms/sms-sender.js';

export const notificationSenderProviders: Provider[] = [
  {
    provide: SMS_SENDER,
    inject: [ConfigService],
    useFactory: (config: ConfigService<Env, true>) =>
      new ConsoleSmsSender(config.get('NODE_ENV', { infer: true }) !== 'production'),
  },
  { provide: EMAIL_SENDER, useClass: SmtpEmailSender },
  { provide: PUSH_SENDER, useClass: ConsolePushSender },
];
