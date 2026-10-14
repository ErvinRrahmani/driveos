import { describe, expect, it } from 'vitest';
import { conversationSchema, MESSAGE_BODY_MAX, sendMessageRequestSchema } from '../src/index.js';
import { DTO_SAMPLES } from '../src/dto/samples/index.js';

const ok = (schema: { safeParse: (v: unknown) => { success: boolean } }, value: unknown) =>
  schema.safeParse(value).success;

describe('messages', () => {
  it('needs a non-blank body within the limit', () => {
    expect(ok(sendMessageRequestSchema, { body: 'See you at 8' })).toBe(true);
    expect(ok(sendMessageRequestSchema, { body: '   ' })).toBe(false);
    expect(ok(sendMessageRequestSchema, { body: 'x'.repeat(MESSAGE_BODY_MAX + 1) })).toBe(false);
  });

  it('tells staff the conversation is read-only and participants that the school can read it', () => {
    const conversation = conversationSchema.parse(DTO_SAMPLES.messaging.conversation);
    expect(conversation).toHaveProperty('readOnly');
    expect(conversation).toHaveProperty('schoolCanRead');
    expect(conversation.unreadCount).toBeGreaterThanOrEqual(0);
  });
});
