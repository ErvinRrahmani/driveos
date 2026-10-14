import { describe, expect, it } from 'vitest';
import {
  type EntitlementState,
  isActiveEntitlement,
  pickEntitlementToConsume,
} from '../../../src/modules/billing/domain/entitlement-selection.js';

const at = (iso: string) => new Date(iso);

const entitlement = (overrides: Partial<EntitlementState>): EntitlementState => ({
  id: '00000000-0000-7000-8000-000000000001',
  kind: 'exam_car',
  grantedAt: at('2026-01-01T10:00:00Z'),
  consumedAt: null,
  revokedAt: null,
  ...overrides,
});

describe('isActiveEntitlement', () => {
  it('is active when granted and neither consumed nor revoked', () => {
    expect(isActiveEntitlement(entitlement({}))).toBe(true);
    expect(isActiveEntitlement(entitlement({ consumedAt: at('2026-02-01T00:00:00Z') }))).toBe(
      false,
    );
    expect(isActiveEntitlement(entitlement({ revokedAt: at('2026-02-01T00:00:00Z') }))).toBe(false);
  });
});

describe('pickEntitlementToConsume', () => {
  it('takes the oldest active entitlement of the kind', () => {
    const newer = entitlement({
      id: '00000000-0000-7000-8000-000000000003',
      grantedAt: at('2026-03-01T00:00:00Z'),
    });
    const older = entitlement({
      id: '00000000-0000-7000-8000-000000000002',
      grantedAt: at('2026-02-01T00:00:00Z'),
    });
    const consumed = entitlement({
      id: '00000000-0000-7000-8000-000000000004',
      grantedAt: at('2026-01-01T00:00:00Z'),
      consumedAt: at('2026-01-05T00:00:00Z'),
    });
    const otherKind = entitlement({
      id: '00000000-0000-7000-8000-000000000005',
      kind: 'premium_theory',
      grantedAt: at('2025-01-01T00:00:00Z'),
    });
    expect(pickEntitlementToConsume([newer, consumed, otherKind, older], 'exam_car')?.id).toBe(
      older.id,
    );
  });

  it('breaks a tie on the grant time by id', () => {
    const b = entitlement({ id: '00000000-0000-7000-8000-00000000000b' });
    const a = entitlement({ id: '00000000-0000-7000-8000-00000000000a' });
    expect(pickEntitlementToConsume([b, a], 'exam_car')?.id).toBe(a.id);
  });

  it('returns null when nothing of that kind is active', () => {
    expect(
      pickEntitlementToConsume(
        [entitlement({ revokedAt: at('2026-01-02T00:00:00Z') })],
        'exam_car',
      ),
    ).toBeNull();
    expect(pickEntitlementToConsume([], 'premium_theory')).toBeNull();
  });
});
