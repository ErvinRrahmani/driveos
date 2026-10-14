import type { EntitlementKind } from '@driveos/shared';

export interface EntitlementState {
  id: string;
  kind: EntitlementKind;
  grantedAt: Date;
  consumedAt: Date | null;
  revokedAt: Date | null;
}

export function isActiveEntitlement(entitlement: EntitlementState): boolean {
  return entitlement.consumedAt === null && entitlement.revokedAt === null;
}

export function pickEntitlementToConsume<T extends EntitlementState>(
  entitlements: readonly T[],
  kind: EntitlementKind,
): T | null {
  const candidates = entitlements
    .filter((entitlement) => entitlement.kind === kind && isActiveEntitlement(entitlement))
    .sort(
      (a, b) =>
        a.grantedAt.getTime() - b.grantedAt.getTime() || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0),
    );
  return candidates[0] ?? null;
}
