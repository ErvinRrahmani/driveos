import type { PriceItem } from '@driveos/shared';
import { ApiError } from '../../../kernel/http/api-error.js';
import { t } from '../../../kernel/i18n/i18n.js';
import type { PriceItemIssue } from '../domain/price-item.js';
import type { priceItems } from './schema.js';
import { StatusCodes } from 'http-status-codes';

export function toPriceItem(row: typeof priceItems.$inferSelect): PriceItem {
  return {
    id: row.id,
    name: row.name,
    kind: row.kind,
    creditMinutes: row.creditMinutes,
    entitlementKind: row.entitlementKind,
    amountMinor: row.amountMinor,
    currency: row.currency,
    taxRateBp: row.taxRateBp,
    sortOrder: row.sortOrder,
    active: row.active,
    showOnPublicPage: row.showOnPublicPage,
  };
}

export function priceItemInvalid(issues: readonly PriceItemIssue[]): ApiError {
  return new ApiError(StatusCodes.BAD_REQUEST, 'validation_error', t('errors.validation'), {
    issues,
  });
}
