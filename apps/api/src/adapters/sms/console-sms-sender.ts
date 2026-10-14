import { Injectable, Logger } from '@nestjs/common';
import type { SmsMessage, SmsSender } from './sms-sender.js';

@Injectable()
export class ConsoleSmsSender implements SmsSender {
  private readonly logger = new Logger(ConsoleSmsSender.name);

  constructor(private readonly revealContent: boolean) {}

  send(message: SmsMessage): Promise<void> {
    this.logger.log(
      this.revealContent
        ? { msg: 'sms (console adapter)', to: message.to, body: message.body }
        : { msg: 'sms (console adapter)', length: message.body.length },
    );
    return Promise.resolve();
  }
}
