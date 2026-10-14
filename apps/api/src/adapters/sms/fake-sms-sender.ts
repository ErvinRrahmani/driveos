import type { SmsMessage, SmsSender } from './sms-sender.js';

export class FakeSmsSender implements SmsSender {
  readonly sent: SmsMessage[] = [];

  send(message: SmsMessage): Promise<void> {
    this.sent.push({ ...message });
    return Promise.resolve();
  }

  last(): SmsMessage | undefined {
    return this.sent.at(-1);
  }

  clear(): void {
    this.sent.length = 0;
  }
}
