import type { PushMessage, PushResult, PushSender } from './push-sender.js';

export class FakePushSender implements PushSender {
  readonly sent: PushMessage[] = [];
  readonly invalidTokens = new Set<string>();

  send(message: PushMessage): Promise<PushResult> {
    if (this.invalidTokens.has(message.token)) return Promise.resolve({ status: 'invalid_token' });
    this.sent.push({ ...message });
    return Promise.resolve({ status: 'sent' });
  }

  last(): PushMessage | undefined {
    return this.sent.at(-1);
  }

  clear(): void {
    this.sent.length = 0;
    this.invalidTokens.clear();
  }
}
