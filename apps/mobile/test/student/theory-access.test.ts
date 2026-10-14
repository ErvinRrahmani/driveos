import { describe, expect, it } from 'vitest';
import { theoryAccess } from '../../src/lib/theory-access';

const stats = { premium: false, mockExamsLeftThisWeek: 3 };

describe('theoryAccess', () => {
  it('lets a free student take mocks while some are left this week and blocks mistakes mode', () => {
    expect(theoryAccess({ ...stats, mockExamsLeftThisWeek: 1 })).toEqual({
      premium: false,
      mocksLeft: 1,
      canMock: true,
      canMistakes: false,
    });
  });

  it('blocks the fourth mock exam of the week for a free student', () => {
    expect(theoryAccess({ ...stats, mockExamsLeftThisWeek: 0 })).toMatchObject({
      canMock: false,
      mocksLeft: 0,
    });
  });

  it('assumes the weekly allowance of 3 when the server sends no count for a free student', () => {
    expect(theoryAccess({ ...stats, mockExamsLeftThisWeek: null })).toMatchObject({
      mocksLeft: 3,
      canMock: true,
    });
  });

  it('unlocks unlimited mocks and mistakes mode with premium', () => {
    expect(theoryAccess({ premium: true, mockExamsLeftThisWeek: 0 })).toEqual({
      premium: true,
      mocksLeft: null,
      canMock: true,
      canMistakes: true,
    });
  });

  it('unlocks premium when the school makes premium theory free', () => {
    expect(theoryAccess(stats, { theoryPremiumFree: true })).toMatchObject({
      premium: true,
      canMistakes: true,
      mocksLeft: null,
    });
  });
});
