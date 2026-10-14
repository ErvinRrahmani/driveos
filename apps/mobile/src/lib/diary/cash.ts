import type { PriceItem } from '@driveos/shared';
import { v7 as uuidv7 } from 'uuid';
import type { OpInput } from './queue';

type CashOp = Extract<OpInput, { type: 'payment.cash' }>;

export function cashItems(items: readonly PriceItem[]): PriceItem[] {
  return items.filter((item) => item.active && item.amountMinor > 0);
}

export function cashOp(
  studentId: string,
  item: Pick<PriceItem, 'id' | 'amountMinor' | 'currency'>,
  newId: () => string = uuidv7,
): CashOp {
  return {
    type: 'payment.cash',
    payload: {
      paymentId: newId(),
      studentId,
      priceItemId: item.id,
      amountMinor: item.amountMinor,
      currency: item.currency,
    },
  };
}
