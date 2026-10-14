import { describe, expect, it } from 'vitest';
import { createPendingConsents } from '../../src/lib/pending-consent';
import { memoryStorage } from '../support/memory-storage';

const GUSTAV = 'user-gustav';
const LINK = '0192f000-000a-7000-8000-000000000001';

describe('pending consent links', () => {
  it('remembers a link opened from the invitation until consent is given', async () => {
    const pending = createPendingConsents(memoryStorage());
    expect(await pending.list(GUSTAV)).toEqual([]);
    await pending.remember(GUSTAV, LINK);
    await pending.remember(GUSTAV, LINK);
    expect(await pending.list(GUSTAV)).toEqual([LINK]);
    expect(await pending.list('someone-else')).toEqual([]);
    await pending.forget(GUSTAV, LINK);
    expect(await pending.list(GUSTAV)).toEqual([]);
  });

  it('ignores unreadable stored data', async () => {
    const pending = createPendingConsents(
      memoryStorage({ [`driveos.pendingConsent.${GUSTAV}`]: '{oops' }),
    );
    expect(await pending.list(GUSTAV)).toEqual([]);
  });
});
