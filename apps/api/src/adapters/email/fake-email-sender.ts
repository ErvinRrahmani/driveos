import type { EmailMessage, EmailSender } from './email-sender.js';

export class FakeEmailSender implements EmailSender {
  readonly sent: EmailMessage[] = [];

  send(message: EmailMessage): Promise<void> {
    this.sent.push({ ...message });
    return Promise.resolve();
  }

  last(): EmailMessage | undefined {
    return this.sent.at(-1);
  }

  clear(): void {
    this.sent.length = 0;
  }
}
