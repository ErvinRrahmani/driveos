import { type EntitlementKind, type PriceItemKind, TAX_RATE_BP_MAX } from '@driveos/shared';

export interface PriceItemShape {
  kind: PriceItemKind;
  creditMinutes: number | null;
  entitlementKind: EntitlementKind | null;
  currency: string;
  taxRateBp: number;
}

export interface PriceItemIssue {
  path: string[];
  message: string;
}

const CARRIES_MINUTES: ReadonlySet<PriceItemKind> = new Set(['lesson', 'package']);

export function priceItemIssues(item: PriceItemShape, schoolCurrency: string): PriceItemIssue[] {
  const issues: PriceItemIssue[] = [];
  const issue = (field: string, message: string) => issues.push({ path: [field], message });

  if (item.currency !== schoolCurrency) {
    issue('currency', `Price items must be in the school currency (${schoolCurrency})`);
  }
  if (!Number.isInteger(item.taxRateBp) || item.taxRateBp < 0 || item.taxRateBp > TAX_RATE_BP_MAX) {
    issue(
      'taxRateBp',
      `Tax rate must be a whole number of basis points from 0 to ${TAX_RATE_BP_MAX}`,
    );
  }
  const hasMinutes = item.creditMinutes !== null;
  if (hasMinutes && !(Number.isInteger(item.creditMinutes) && (item.creditMinutes ?? 0) > 0)) {
    issue('creditMinutes', 'Credit minutes must be a positive whole number');
  } else if (CARRIES_MINUTES.has(item.kind) && !hasMinutes) {
    issue('creditMinutes', 'Lessons and packages need credit minutes');
  } else if (item.kind === 'fee' && hasMinutes) {
    issue('creditMinutes', 'Fees carry no credit minutes');
  }
  if (item.kind === 'upsell' && item.entitlementKind === null) {
    issue('entitlementKind', 'Upsells need an entitlement kind');
  } else if (item.kind !== 'upsell' && item.entitlementKind !== null) {
    issue('entitlementKind', 'Only upsells grant an entitlement');
  }
  return issues;
}
