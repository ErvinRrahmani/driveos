import { describe, expect, it } from 'vitest';
import { hasStarted } from '../../../src/modules/scheduling/domain/outcome.js';

describe('hasStarted', () => {
  const start = new Date('2030-03-01T10:00:00.000Z');

  it('is true exactly at the start and after it', () => {
    expect(hasStarted(start, start)).toBe(true);
    expect(hasStarted(start, new Date(start.getTime() + 1000))).toBe(true);
  });

  it('is false 1 s before the start', () => {
    expect(hasStarted(start, new Date(start.getTime() - 1000))).toBe(false);
  });
});
