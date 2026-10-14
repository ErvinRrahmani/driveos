export interface PushMessage {
  token: string;
  title: string;
  body: string;
  data?: Readonly<Record<string, string>>;
}

export type PushResult = { status: 'sent' } | { status: 'invalid_token' };

export interface PushSender {
  send(message: PushMessage): Promise<PushResult>;
}

export const PUSH_SENDER = Symbol('PUSH_SENDER');
