import { describe, expect, it } from 'vitest';
import { statementPaymentProblem } from '../../../src/modules/billing/domain/statement-payment.js';

describe('statementPaymentProblem', () => {
  it('accepts a bank transfer with a reference and cash with or without a receipt', () => {
    expect(statementPaymentProblem('issued', { method: 'bank_transfer', reference: 'TX-1' })).toBe(
      null,
    );
    expect(statementPaymentProblem('issued', { method: 'cash' })).toBe(null);
    expect(statementPaymentProblem('issued', { method: 'cash', reference: 'R-7' })).toBe(null);
  });

  it('needs a reference for a bank transfer', () => {
    expect(statementPaymentProblem('issued', { method: 'bank_transfer' })).toBe(
      'reference_required',
    );
    expect(statementPaymentProblem('issued', { method: 'bank_transfer', reference: '  ' })).toBe(
      'reference_required',
    );
  });

  it('refuses a statement that is already paid', () => {
    expect(statementPaymentProblem('paid', { method: 'cash' })).toBe('already_paid');
  });
});
