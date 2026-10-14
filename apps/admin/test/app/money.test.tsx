import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { renderApp, server, startServer } from '../support/app';
import { invoiceList, MONEY, STUDENTS, stellaLedger, UUID } from '../support/money';
import { capture } from '../support/students';
import { StatusCodes } from 'http-status-codes';

beforeAll(startServer);
afterEach(() => vi.restoreAllMocks());
afterAll(() => server.close());

const original = { create: URL.createObjectURL, revoke: URL.revokeObjectURL };
afterEach(() => {
  URL.createObjectURL = original.create;
  URL.revokeObjectURL = original.revoke;
});

async function invoiceRow(number: string) {
  const table = await screen.findByRole('table', { name: 'Invoices' });
  return within(table).findByRole('row', { name: new RegExp(number) });
}

describe('invoices', () => {
  it('lists invoices and credit notes with a kind badge and totals', async () => {
    renderApp({ path: '/invoices', as: 'office' });
    const invoice = await invoiceRow('2026-000042');
    expect(within(invoice).getByText('Invoice')).toBeTruthy();
    expect(within(invoice).getByText('€600.00')).toBeTruthy();
    expect(within(invoice).getByText('Refunded €60.00')).toBeTruthy();
    expect(within(invoice).getByRole('button', { name: 'Refund' })).toBeTruthy();
    const creditNote = await invoiceRow('2026-000043');
    expect(within(creditNote).getByText('Credit note')).toBeTruthy();
    expect(within(creditNote).getByText('-€60.00')).toBeTruthy();
    expect(within(creditNote).queryByRole('button', { name: 'Refund' })).toBeNull();
    expect(within(creditNote).queryByText(/Refunded/)).toBeNull();
  });

  it('puts the filters in the URL and sends them to the API', async () => {
    const view = renderApp({ path: '/invoices', as: 'office' });
    const calls: URL[] = [];
    server.events.on('request:start', ({ request }) => {
      const url = new URL(request.url);
      if (url.pathname === '/v1/invoices') calls.push(url);
    });
    await invoiceRow('2026-000042');
    await userEvent.selectOptions(screen.getByLabelText('Kind'), 'credit_note');
    await userEvent.type(screen.getByLabelText('From'), '2026-10-01');
    await waitFor(() => {
      expect(view.router.state.location.search).toMatchObject({
        kind: 'credit_note',
        from: '2026-10-01',
      });
    });
    await waitFor(() => {
      const last = calls.at(-1);
      expect(last?.searchParams.get('kind')).toBe('credit_note');
      expect(last?.searchParams.get('from')).toBe('2026-09-30T22:00:00.000Z');
    });
    server.events.removeAllListeners();
  });

  it('downloads the PDF as a blob with the bearer token', async () => {
    const view = renderApp({ path: '/invoices', as: 'office' });
    const requests: Request[] = [];
    server.use(
      http.get('*/v1/invoices/:file', ({ request }) => {
        requests.push(request.clone());
        return new HttpResponse('%PDF-1.4 test %%EOF', {
          headers: { 'content-type': 'application/pdf' },
        });
      }),
    );
    const blobs: Blob[] = [];
    URL.createObjectURL = vi.fn((blob: Blob) => {
      blobs.push(blob);
      return 'blob:invoice';
    });
    URL.revokeObjectURL = vi.fn();
    const downloads: string[] = [];
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (
      this: HTMLAnchorElement,
    ) {
      downloads.push(this.download);
    });
    const row = await invoiceRow('2026-000042');
    await userEvent.click(within(row).getByRole('button', { name: 'PDF' }));
    await waitFor(() => expect(downloads).toEqual(['2026-000042.pdf']));
    const [request] = requests;
    expect(new URL(request?.url ?? 'http://x').pathname).toBe(`/v1/invoices/${MONEY.invoice}.pdf`);
    expect(request?.headers.get('authorization')).toBe(
      `Bearer ${view.services.auth.getState().accessToken}`,
    );
    expect(await blobs[0]?.text()).toContain('%PDF-1.4');
  });

  it('disables Refund once the invoice is fully refunded', async () => {
    renderApp({ path: '/invoices', as: 'office' });
    capture('get', '*/v1/invoices', invoiceList({ refundedMinor: 60000 }));
    const row = await invoiceRow('2026-000042');
    expect(within(row).getByText('Refunded €600.00')).toBeTruthy();
    const refund = within(row).getByRole('button', { name: 'Refund' }) as HTMLButtonElement;
    expect(refund.disabled).toBe(true);
    expect(refund.title).toBe('2026-000042 is fully refunded');
  });

  it('shows no refunded amount before any refund', async () => {
    renderApp({ path: '/payments', as: 'office' });
    capture('get', '*/v1/invoices', invoiceList({ refundedMinor: 0 }));
    const table = await screen.findByRole('table', { name: 'Payments' });
    const row = await within(table).findByRole('row', { name: /2026-000042/ });
    expect(within(row).queryByText(/Refunded/)).toBeNull();
    expect(
      (within(row).getByRole('button', { name: 'Refund' }) as HTMLButtonElement).disabled,
    ).toBe(false);
  });
});

describe('refund dialog', () => {
  async function openRefund() {
    renderApp({ path: '/invoices', as: 'office' });
    capture('get', '*/v1/students/:id/ledger', stellaLedger);
    const row = await invoiceRow('2026-000042');
    await userEvent.click(within(row).getByRole('button', { name: 'Refund' }));
    return screen.findByRole('dialog', { name: 'Refund invoice 2026-000042' });
  }

  it('explains the caps and rejects amounts and minutes beyond them', async () => {
    const dialog = await openRefund();
    expect(
      await within(dialog).findByText(
        'Up to €540.00 can still be refunded on this invoice (total €600.00, already refunded €60.00).',
      ),
    ).toBeTruthy();
    expect(
      await within(dialog).findByText(
        'Up to 540 min can be removed: the student’s current balance. Use 0 to keep the minutes.',
      ),
    ).toBeTruthy();
    const amount = within(dialog).getByLabelText('Amount (EUR)');
    await userEvent.clear(amount);
    await userEvent.type(amount, '600');
    const minutes = within(dialog).getByLabelText('Minutes removed');
    await userEvent.clear(minutes);
    await userEvent.type(minutes, '-5');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Issue refund' }));
    expect(
      await within(dialog).findByText('The amount is more than what is left to refund.'),
    ).toBeTruthy();
    expect(within(dialog).getByText('The value is too small.')).toBeTruthy();
    expect(within(dialog).getByText('This field is required.')).toBeTruthy();
    await userEvent.clear(minutes);
    await userEvent.type(minutes, '600');
    expect(
      await within(dialog).findByText('That is more than the student’s balance.'),
    ).toBeTruthy();
  });

  it('posts the refund with an Idempotency-Key', async () => {
    const dialog = await openRefund();
    const calls = capture(
      'post',
      '*/v1/refunds',
      { id: MONEY.payment, version: 1, status: 'succeeded', creditNoteId: MONEY.creditNote },
      StatusCodes.CREATED,
    );
    const payment = within(dialog).getByLabelText('Payment');
    await waitFor(() => expect((payment as HTMLSelectElement).value).toBe(MONEY.payment));
    const amount = within(dialog).getByLabelText('Amount (EUR)');
    await userEvent.clear(amount);
    await userEvent.type(amount, '60');
    const minutes = within(dialog).getByLabelText('Minutes removed');
    await userEvent.clear(minutes);
    await userEvent.type(minutes, '60');
    await userEvent.type(within(dialog).getByLabelText('Reason'), 'Student moved away');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Issue refund' }));
    await waitFor(() => expect(calls).toHaveLength(1));
    expect(calls[0]?.headers.get('idempotency-key')).toMatch(UUID);
    expect(calls[0]?.body).toEqual({
      paymentId: MONEY.payment,
      amountMinor: 6000,
      currency: 'EUR',
      minutesRemoved: 60,
      reason: 'Student moved away',
    });
    expect(await screen.findByText('Refund issued. A credit note was created.')).toBeTruthy();
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });

  it('preselects the invoice payment even without a ledger purchase for it', async () => {
    renderApp({ path: '/invoices', as: 'office' });
    const row = await invoiceRow('2026-000042');
    await userEvent.click(within(row).getByRole('button', { name: 'Refund' }));
    const dialog = await screen.findByRole('dialog', { name: 'Refund invoice 2026-000042' });
    const payment = (await within(dialog).findByLabelText('Payment')) as HTMLSelectElement;
    await waitFor(() => expect(payment.value).toBe(MONEY.payment));
    expect(
      within(dialog).getByRole('option', { name: 'Payment for invoice 2026-000042' }),
    ).toBeTruthy();
    expect(
      within(dialog).queryByText('No refundable payment was found for this student.'),
    ).toBeNull();
  });

  it('says so when the student has no refundable payment', async () => {
    renderApp({ path: '/invoices', as: 'office' });
    capture('get', '*/v1/invoices', invoiceList({ paymentId: null, refundedMinor: 0 }));
    const row = await invoiceRow('2026-000042');
    await userEvent.click(within(row).getByRole('button', { name: 'Refund' }));
    const dialog = await screen.findByRole('dialog', { name: 'Refund invoice 2026-000042' });
    expect(
      await within(dialog).findByText('No refundable payment was found for this student.'),
    ).toBeTruthy();
    expect(
      (within(dialog).getByRole('button', { name: 'Issue refund' }) as HTMLButtonElement).disabled,
    ).toBe(true);
  });
});

describe('payments', () => {
  it('lists payments from issued invoices and records a bank transfer', async () => {
    renderApp({ path: '/payments', as: 'office' });
    const calls = capture(
      'post',
      '*/v1/payments/cash',
      { id: MONEY.payment, version: 1, invoiceId: MONEY.invoice },
      StatusCodes.CREATED,
    );
    const table = await screen.findByRole('table', { name: 'Payments' });
    expect(await within(table).findByText('10-lesson package')).toBeTruthy();
    await userEvent.click(screen.getByRole('button', { name: 'Record payment' }));
    const dialog = await screen.findByRole('dialog', { name: 'Record a cash or bank payment' });
    await userEvent.click(within(dialog).getByRole('button', { name: 'Save' }));
    expect((await within(dialog).findAllByText('This field is required.')).length).toBe(3);
    await userEvent.selectOptions(
      await within(dialog).findByRole('combobox', { name: 'Student' }),
      await within(dialog).findByRole('option', { name: 'Stella Student' }),
    );
    await userEvent.selectOptions(
      within(dialog).getByRole('combobox', { name: 'Price item' }),
      await within(dialog).findByRole('option', { name: /Single lesson/ }),
    );
    expect((within(dialog).getByLabelText('Amount (EUR)') as HTMLInputElement).value).toBe('65');
    await userEvent.selectOptions(within(dialog).getByLabelText('Method'), 'bank_transfer');
    await userEvent.type(within(dialog).getByLabelText('Reference'), 'SEPA-1');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(calls).toHaveLength(1));
    expect(calls[0]?.headers.get('idempotency-key')).toMatch(UUID);
    expect(calls[0]?.body).toEqual({
      studentId: STUDENTS.stella,
      priceItemId: MONEY.singlePriceItem,
      method: 'bank_transfer',
      amountMinor: 6500,
      currency: 'EUR',
      reference: 'SEPA-1',
    });
    expect(await screen.findByText('Payment recorded. The invoice was issued.')).toBeTruthy();
  });

  it('adjusts the selected student’s balance with the shared dialog', async () => {
    renderApp({ path: `/payments?studentId=${STUDENTS.stella}`, as: 'office' });
    const calls = capture(
      'post',
      '*/v1/ledger/adjustments',
      { id: MONEY.payment, balanceAfter: 600 },
      StatusCodes.CREATED,
    );
    await userEvent.click(await screen.findByRole('button', { name: 'Adjust balance' }));
    const dialog = await screen.findByRole('dialog', { name: 'Adjust balance' });
    await userEvent.type(within(dialog).getByLabelText('Minutes'), '60');
    await userEvent.type(within(dialog).getByLabelText('Reason'), 'Goodwill');
    await userEvent.type(within(dialog).getByLabelText('Note'), 'Instructor was late');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(calls).toHaveLength(1));
    expect(calls[0]?.body).toEqual({
      studentId: STUDENTS.stella,
      minutes: 60,
      reason: 'Goodwill',
      note: 'Instructor was late',
    });
  });
});

describe('payment account', () => {
  it('shows an active account without a connect button', async () => {
    renderApp({ path: '/settings?tab=payments', as: 'owner' });
    expect(await screen.findByText('Active')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Connect payment account' })).toBeNull();
  });

  it('connects the fake provider and links to the provider onboarding', async () => {
    renderApp({
      path: '/settings?tab=payments',
      as: 'owner',
      configure: (mock) => {
        for (const school of mock.store.schools.values()) school.paymentAccount = null;
      },
    });
    const calls = capture(
      'post',
      '*/v1/school/payment-account',
      {
        id: MONEY.payment,
        version: 1,
        provider: 'fake',
        status: 'pending',
        onboardingUrl: 'http://localhost:3000/v1/fake-payments/onboarding/acct_fake_spree',
      },
      StatusCodes.OK,
    );
    await userEvent.click(await screen.findByRole('button', { name: 'Connect payment account' }));
    expect(await screen.findByText('Payment account connected')).toBeTruthy();
    expect(calls[0]?.body).toEqual({
      provider: 'fake',
      returnUrl: `${window.location.origin}/settings?tab=payments`,
    });
    const link = await screen.findByRole('link', { name: 'Finish the setup with fake' });
    expect(link.getAttribute('href')).toBe(
      'http://localhost:3000/v1/fake-payments/onboarding/acct_fake_spree',
    );
    expect(screen.getByText('Pending')).toBeTruthy();
  });
});
