export const LEDGER_WRITER = Symbol('billing.LedgerWriter');

export interface LedgerWriteResult {
  entryId: string;
  balanceAfter: number;
}

export interface LedgerDebit {
  studentId: string;
  minutes: number;
  lessonId: string;
  note?: string;
  createdByMembershipId?: string | null;
}

export interface LedgerRestore {
  studentId: string;
  minutes: number;
  lessonId: string;
  createdByMembershipId?: string | null;
}

export interface LedgerCredit {
  studentId: string;
  minutes: number;
  paymentId: string;
  priceItemId: string;
}

export interface LedgerRefund {
  studentId: string;
  minutes: number;
  refundId: string;
  paymentId?: string | null;
  createdByMembershipId?: string | null;
}

export interface LedgerAdjustment {
  studentId: string;
  minutes: number;
  note: string;
  createdByMembershipId: string;
  lessonId?: string | null;
}

/**
 * Same-transaction service (SPEC §3.4). Every call joins the caller's tenant transaction.
 * `debit`, `restore`, `credit` and `refund` take positive minutes and write the signed entry;
 * `adjust` takes signed, non-zero minutes. Each write appends `LedgerEntryRecorded`.
 */
export interface LedgerWriter {
  lockStudent(studentId: string): Promise<void>;
  balance(studentId: string): Promise<number>;
  debit(input: LedgerDebit): Promise<LedgerWriteResult>;
  restore(input: LedgerRestore): Promise<LedgerWriteResult>;
  credit(input: LedgerCredit): Promise<LedgerWriteResult>;
  adjust(input: LedgerAdjustment): Promise<LedgerWriteResult>;
  refund(input: LedgerRefund): Promise<LedgerWriteResult>;
}
