import { Injectable, Logger } from '@nestjs/common';
import type { PushMessage, PushResult, PushSender } from './push-sender.js';

@Injectable()
export class ConsolePushSender implements PushSender {
  private readonly logger = new Logger(ConsolePushSender.name);

  send(message: PushMessage): Promise<PushResult> {
    this.logger.log({
      msg: 'push (console adapter)',
      token: message.token,
      title: message.title,
      body: message.body,
      data: message.data,
    });
    return Promise.resolve({ status: 'sent' });
  }
}
