export type LedgerWriteKind = 'purchase' | 'debit' | 'restore' | 'adjustment' | 'refund';

export interface BalanceChange {
  balance: number;
  delta: number;
  allowNegative: boolean;
}

export function keepsBalanceAllowed({ balance, delta, allowNegative }: BalanceChange): boolean {
  return delta >= 0 || balance + delta >= 0 || allowNegative;
}

export function assertLedgerMinutes(kind: LedgerWriteKind, minutes: number): void {
  if (!Number.isInteger(minutes)) {
    throw new RangeError(`Ledger minutes must be whole minutes, got ${minutes}`);
  }
  if (kind === 'adjustment' ? minutes === 0 : minutes <= 0) {
    throw new RangeError(
      kind === 'adjustment'
        ? 'An adjustment needs non-zero minutes'
        : `A ${kind} needs positive minutes, got ${minutes}`,
    );
  }
}
