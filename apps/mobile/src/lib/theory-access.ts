import { FREE_MOCK_EXAMS_PER_WEEK } from '@driveos/shared';

export interface TheoryAccess {
  premium: boolean;
  mocksLeft: number | null;
  canMock: boolean;
  canMistakes: boolean;
}

export function theoryAccess(
  stats: { premium: boolean; mockExamsLeftThisWeek: number | null },
  settings?: { theoryPremiumFree: boolean },
): TheoryAccess {
  const premium = stats.premium || settings?.theoryPremiumFree === true;
  if (premium) return { premium, mocksLeft: null, canMock: true, canMistakes: true };
  const mocksLeft = stats.mockExamsLeftThisWeek ?? FREE_MOCK_EXAMS_PER_WEEK;
  return { premium, mocksLeft, canMock: mocksLeft > 0, canMistakes: false };
}
