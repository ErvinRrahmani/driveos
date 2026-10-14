import { describe, expect, it } from 'vitest';
import { instantRange } from '../../src/lib/date-range';

describe('instantRange', () => {
  it('turns inclusive school-zone days into a half-open UTC range', () => {
    expect(instantRange('2026-10-01', '2026-10-31', 'Europe/Berlin')).toEqual({
      from: '2026-09-30T22:00:00.000Z',
      to: '2026-10-31T23:00:00.000Z',
    });
  });

  it('leaves open ends open and drops an inverted range', () => {
    expect(instantRange(undefined, '2026-10-01', 'UTC')).toEqual({
      from: undefined,
      to: '2026-10-02T00:00:00.000Z',
    });
    expect(instantRange('2026-10-02', '2026-10-01', 'UTC')).toEqual({});
  });
});
