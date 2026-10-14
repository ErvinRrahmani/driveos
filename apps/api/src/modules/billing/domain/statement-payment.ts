import type { PlatformStatementStatus, StatementPaidMethod } from '@driveos/shared';

export interface StatementPayment {
  method: StatementPaidMethod;
  reference?: string;
}

export function statementPaymentProblem(
  status: PlatformStatementStatus,
  payment: StatementPayment,
): 'already_paid' | 'reference_required' | null {
  if (status === 'paid') return 'already_paid';
  if (payment.method === 'bank_transfer' && !payment.reference?.trim()) {
    return 'reference_required';
  }
  return null;
}
