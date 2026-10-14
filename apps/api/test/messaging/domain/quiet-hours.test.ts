import { describe, expect, it } from 'vitest';
import {
  isQuiet,
  planChannels,
  plannedMoment,
  type QuietHours,
  quietWindowAt,
} from '../../../src/modules/messaging/domain/quiet-hours.js';

const LONDON = 'Europe/London';
const NIGHT: QuietHours = { start: '21:00', end: '08:00' };
const at = (iso: string) => new Date(iso);

describe('quiet hours', () => {
  it('wraps midnight: 21:00 is quiet, 07:59 is quiet, 08:00 and 20:59 are not', () => {
    expect(isQuiet(at('2026-07-01T20:00:00Z'), NIGHT, LONDON)).toBe(true);
    expect(isQuiet(at('2026-07-02T06:59:00Z'), NIGHT, LONDON)).toBe(true);
    expect(isQuiet(at('2026-07-02T07:00:00Z'), NIGHT, LONDON)).toBe(false);
    expect(isQuiet(at('2026-07-01T19:59:00Z'), NIGHT, LONDON)).toBe(false);
  });

  it('handles a window inside one day and an empty window', () => {
    const lunch = { start: '12:00', end: '13:30' };
    expect(isQuiet(at('2026-01-10T12:00:00Z'), lunch, LONDON)).toBe(true);
    expect(isQuiet(at('2026-01-10T13:30:00Z'), lunch, LONDON)).toBe(false);
    expect(isQuiet(at('2026-01-10T03:00:00Z'), { start: '08:00', end: '08:00' }, LONDON)).toBe(
      false,
    );
  });

  it('finds the window around an instant before and after midnight', () => {
    expect(quietWindowAt(at('2026-07-01T22:30:00Z'), NIGHT, LONDON)).toEqual({
      start: at('2026-07-01T20:00:00Z'),
      end: at('2026-07-02T07:00:00Z'),
    });
    expect(quietWindowAt(at('2026-07-02T03:00:00Z'), NIGHT, LONDON)).toEqual({
      start: at('2026-07-01T20:00:00Z'),
      end: at('2026-07-02T07:00:00Z'),
    });
  });

  it('follows the clock across a DST change (spring forward in London)', () => {
    expect(quietWindowAt(at('2026-03-29T03:00:00Z'), NIGHT, LONDON)).toEqual({
      start: at('2026-03-28T21:00:00Z'),
      end: at('2026-03-29T07:00:00Z'),
    });
  });
});

describe('planChannels', () => {
  const base = { quiet: NIGHT, timeZone: LONDON };

  it('defers push to the end of quiet hours but never holds email', () => {
    const now = at('2026-07-01T21:00:00Z');
    expect(
      planChannels({ ...base, timing: 'deferred', channels: ['push', 'email'], sendAt: now, now }),
    ).toEqual([
      { channel: 'push', scheduledFor: at('2026-07-02T07:00:00Z'), skipped: false },
      { channel: 'email', scheduledFor: now, skipped: false },
    ]);
  });

  it('sends a deferred notification exactly at the end boundary at once', () => {
    const now = at('2026-07-02T07:00:00Z');
    expect(
      planChannels({ ...base, timing: 'deferred', channels: ['sms'], sendAt: now, now }),
    ).toEqual([{ channel: 'sms', scheduledFor: now, skipped: false }]);
  });

  it('advances a 2 h reminder for an 08:00 lesson to 20:59 the evening before', () => {
    const now = at('2026-07-01T12:00:00Z');
    expect(
      planChannels({
        ...base,
        timing: 'advanced',
        channels: ['push'],
        sendAt: at('2026-07-02T05:00:00Z'),
        skipAfter: at('2026-07-02T07:00:00Z'),
        now,
      }),
    ).toEqual([{ channel: 'push', scheduledFor: at('2026-07-01T19:59:00Z'), skipped: false }]);
  });

  it('sends an advanced notification now when the advanced moment has passed', () => {
    const now = at('2026-07-01T23:00:00Z');
    expect(
      planChannels({
        ...base,
        timing: 'advanced',
        channels: ['push'],
        sendAt: at('2026-07-02T05:00:00Z'),
        now,
      }),
    ).toEqual([{ channel: 'push', scheduledFor: now, skipped: false }]);
  });

  it('ignores quiet hours for immediate notifications', () => {
    const now = at('2026-07-01T21:30:00Z');
    expect(
      planChannels({ ...base, timing: 'immediate', channels: ['push', 'sms'], sendAt: now, now }),
    ).toEqual([
      { channel: 'push', scheduledFor: now, skipped: false },
      { channel: 'sms', scheduledFor: now, skipped: false },
    ]);
  });

  it('sends slot offers by email at night and by push in the day, never by SMS', () => {
    const night = at('2026-07-01T22:00:00Z');
    const day = at('2026-07-01T10:00:00Z');
    const channels = ['push', 'sms', 'email'] as const;
    expect(
      planChannels({ ...base, timing: 'email_only_at_night', channels, sendAt: night, now: night }),
    ).toEqual([{ channel: 'email', scheduledFor: night, skipped: false }]);
    expect(
      planChannels({ ...base, timing: 'email_only_at_night', channels, sendAt: day, now: day }),
    ).toEqual([{ channel: 'push', scheduledFor: day, skipped: false }]);
  });

  it('skips a notification whose moment passes before it could be sent', () => {
    const now = at('2026-07-01T22:00:00Z');
    expect(
      planChannels({
        ...base,
        timing: 'deferred',
        channels: ['push', 'email'],
        sendAt: now,
        skipAfter: at('2026-07-02T06:00:00Z'),
        now,
      }),
    ).toEqual([
      { channel: 'push', scheduledFor: at('2026-07-02T07:00:00Z'), skipped: true },
      { channel: 'email', scheduledFor: now, skipped: false },
    ]);
  });

  it('plans a send moment without clamping to now', () => {
    const plan = (timing: 'advanced' | 'deferred' | 'immediate', iso: string) =>
      plannedMoment({ timing, sendAt: at(iso), quiet: NIGHT, timeZone: LONDON });
    expect(plan('advanced', '2026-07-02T05:00:00Z')).toEqual(at('2026-07-01T19:59:00Z'));
    expect(plan('advanced', '2020-07-02T05:00:00Z')).toEqual(at('2020-07-01T19:59:00Z'));
    expect(plan('advanced', '2026-07-02T11:00:00Z')).toEqual(at('2026-07-02T11:00:00Z'));
    expect(plan('deferred', '2026-07-01T21:00:00Z')).toEqual(at('2026-07-02T07:00:00Z'));
    expect(plan('immediate', '2026-07-01T21:00:00Z')).toEqual(at('2026-07-01T21:00:00Z'));
  });
});
