import type { PaymentMethod } from '@driveos/shared';
import type { PriceItemRow } from './purchases.js';
import type { payments } from './schema.js';

export const PAYMENT_AGGREGATE = 'payment';
export const REFUND_AGGREGATE = 'refund';

export type PaymentRow = typeof payments.$inferSelect;

export function purchasePayload<M extends PaymentMethod>(
  payment: Pick<PaymentRow, 'id' | 'studentId' | 'payerUserId' | 'amountMinor' | 'currency'>,
  item: Pick<PriceItemRow, 'id' | 'kind' | 'creditMinutes' | 'entitlementKind'>,
  method: M,
) {
  return {
    paymentId: payment.id,
    studentId: payment.studentId,
    payerUserId: payment.payerUserId,
    amountMinor: payment.amountMinor,
    currency: payment.currency,
    priceItemId: item.id,
    priceItemKind: item.kind,
    method,
    ...(item.creditMinutes ? { creditMinutes: item.creditMinutes } : {}),
    ...(item.entitlementKind ? { entitlementKind: item.entitlementKind } : {}),
  };
}
