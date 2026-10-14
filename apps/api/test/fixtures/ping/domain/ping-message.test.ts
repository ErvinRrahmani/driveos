import { describe, expect, it } from 'vitest';
import { normalizePingMessage } from './ping-message.js';

describe('normalizePingMessage', () => {
  it('trims and collapses whitespace', () => {
    expect(normalizePingMessage('  hello \n  world ')).toBe('hello world');
  });
});
