import { randomUUID } from 'node:crypto';
import {
  CreditNoteIssued,
  EntitlementGranted,
  FAKE_PAYMENT_SIGNATURE_HEADER,
  InvoiceIssued,
  LedgerEntryRecorded,
  PaymentFailed,
  PaymentSucceeded,
} from '@driveos/shared';
import { ConfigService } from '@nestjs/config';
import { sql } from 'drizzle-orm';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { signFakePaymentWebhook } from '../../src/adapters/payments/fake-payment-provider.js';
import { TenantContext } from '../../src/kernel/tenant/tenant-context.js';
import { createScratchDatabase, type ScratchDatabase } from '../db/scratch-database.js';
import { expectEvents, expectNoEvent } from '../support/events.js';
import { createKernelTestApp, type KernelTestApp } from '../support/kernel-app.js';
import {
  authHeaders,
  createTestTenants,
  type TestTenant,
  type TestTenants,
} from '../support/tenants.js';
import {
  createPriceItemRow,
  createStaffLogin,
  createStudentLogin,
  numericRow,
  single,
  type StudentLogin,
} from './support.js';
import { StatusCodes } from 'http-status-codes';

interface PaymentRow {
  id: string;
  student_id: string;
  payer_user_id: string | null;
  invoice_id: string | null;
  method: string;
  provider: string | null;
  provider_ref: string | null;
  amount_minor: number;
  currency: string;
  status: string;
  price_item_id: string | null;
  version: number;
}

interface InvoiceRow {
  id: string;
  student_id: string;
  kind: string;
  series: string;
  number: number;
  status: string;
  issued_at: Date | null;
  seller_snapshot: Record<string, unknown>;
  buyer_snapshot: Record<string, unknown>;
  subtotal_minor: number;
  tax_minor: number;
  total_minor: number;
  currency: string;
}

describe('billing HTTP: checkout, payment webhooks, fake pay page, invoices', () => {
  let db: ScratchDatabase;
  let kernel: KernelTestApp;
  let tenants: TestTenants;
  let A: TestTenant;
  let B: TestTenant;
  let http: ReturnType<typeof request>;
  let tenant: TenantContext;
  let secret: string;
  let stella: StudentLogin;
  let packageId: string;

  beforeAll(async () => {
    db = await createScratchDatabase();
    kernel = await createKernelTestApp(db);
    tenant = kernel.app.get(TenantContext);
    tenants = await createTestTenants(db, { context: tenant });
    ({ A, B } = tenants);
    http = request(kernel.app.getHttpServer());
    secret = kernel.app.get(ConfigService).getOrThrow<string>('FAKE_PAYMENT_SECRET');
    await http
      .post('/v1/school/payment-account')
      .set(authHeaders(A))
      .send({ provider: 'fake' })
      .expect(StatusCodes.OK);
    stella = await createStudentLogin(tenants, A);
    packageId = await createPriceItemRow(tenants, A, { amountMinor: 10_000 });
  }, 60_000);

  afterAll(async () => {
    await kernel?.close();
    await db?.drop();
  });

  const inSchool = <T extends Record<string, unknown>>(
    t: TestTenant,
    query: ReturnType<typeof sql>,
  ) => tenants.asSchool(t, async (tx) => (await tx.execute<T>(query)).rows.map(numericRow));

  const paymentRow = async (id: string) =>
    single(
      await inSchool<PaymentRow & Record<string, unknown>>(
        A,
        sql`select * from payments where id = ${id}`,
      ),
    );

  const invoiceRow = async (id: string) =>
    single(
      await inSchool<InvoiceRow & Record<string, unknown>>(
        A,
        sql`select * from invoices where id = ${id}`,
      ),
    );

  const ledgerOf = (studentId: string) =>
    inSchool<{ entry_type: string; minutes: number; payment_id: string | null }>(
      A,
      sql`select entry_type, minutes, payment_id from ledger_entries where student_id = ${studentId} order by id`,
    );

  async function checkout(student: StudentLogin, priceItemId: string, key = randomUUID()) {
    return http
      .post('/v1/checkout')
      .set(student.headers)
      .set('Idempotency-Key', key)
      .send({ priceItemId });
  }

  async function startedPayment(student: StudentLogin, priceItemId: string) {
    const res = await checkout(student, priceItemId);
    expect(res.status, JSON.stringify(res.body)).toBe(StatusCodes.CREATED);
    const payment = await paymentRow(res.body.paymentId);
    return {
      paymentId: res.body.paymentId as string,
      providerRef: payment.provider_ref as string,
    };
  }

  function webhook(
    event: Record<string, unknown>,
    options: { signature?: string; provider?: string } = {},
  ) {
    const raw = JSON.stringify(event);
    return http
      .post(`/v1/webhooks/payments/${options.provider ?? 'fake'}`)
      .set('Content-Type', 'application/json')
      .set(
        FAKE_PAYMENT_SIGNATURE_HEADER,
        options.signature ?? signFakePaymentWebhook(secret, Buffer.from(raw)),
      )
      .send(raw);
  }

  const succeeded = (providerRef: string, amountMinor = 10_000, currency = 'EUR') => ({
    type: 'payment.succeeded',
    providerRef,
    amountMinor,
    currency,
    occurredAt: new Date().toISOString(),
  });

  describe('POST /v1/checkout', () => {
    it('creates a pending in-app payment on the school account and returns the pay page', async () => {
      const res = await checkout(stella, packageId);
      expect(res.status, JSON.stringify(res.body)).toBe(StatusCodes.CREATED);
      expect(res.body).toEqual({
        paymentId: expect.any(String),
        checkoutUrl: expect.stringMatching(/\/fake-pay\/fake_pay_[0-9a-f-]+$/),
        provider: 'fake',
      });
      const payment = await paymentRow(res.body.paymentId);
      expect(payment).toMatchObject({
        student_id: stella.studentId,
        payer_user_id: stella.userId,
        method: 'in_app',
        provider: 'fake',
        provider_ref: res.body.checkoutUrl.split('/').at(-1),
        amount_minor: 10_000,
        currency: 'EUR',
        status: 'pending',
        price_item_id: packageId,
        invoice_id: null,
        version: 1,
      });
    });

    it('replays a duplicate checkout with the same Idempotency-Key', async () => {
      const student = await createStudentLogin(tenants, A);
      const key = randomUUID();
      const first = await checkout(student, packageId, key);
      const again = await checkout(student, packageId, key);
      expect(first.status).toBe(StatusCodes.CREATED);
      expect(again.status).toBe(StatusCodes.CREATED);
      expect(again.body).toEqual(first.body);
      const rows = await inSchool(
        A,
        sql`select id from payments where student_id = ${student.studentId}`,
      );
      expect(rows).toHaveLength(1);
    });

    it('is disabled while the school has no active payment account', async () => {
      const student = await createStudentLogin(tenants, B);
      const item = await createPriceItemRow(tenants, B);
      const res = await checkout(student, item);
      expect(res.status).toBe(StatusCodes.CONFLICT);
      expect(res.body.error.code).toBe('checkout_disabled');
      expect(await inSchool(B, sql`select id from payments`)).toHaveLength(0);
    });

    it('rejects unknown or inactive price items and other students', async () => {
      const inactive = await createPriceItemRow(tenants, A, { active: false });
      expect((await checkout(stella, inactive)).status).toBe(StatusCodes.NOT_FOUND);
      expect((await checkout(stella, randomUUID())).status).toBe(StatusCodes.NOT_FOUND);
      const other = await createStudentLogin(tenants, A);
      const res = await http
        .post('/v1/checkout')
        .set(stella.headers)
        .set('Idempotency-Key', randomUUID())
        .send({ priceItemId: packageId, studentId: other.studentId });
      expect(res.status).toBe(StatusCodes.NOT_FOUND);
    });

    it('needs a student of the school and the checkout permission', async () => {
      const owner = await http
        .post('/v1/checkout')
        .set(authHeaders(A))
        .set('Idempotency-Key', randomUUID())
        .send({ priceItemId: packageId });
      expect(owner.status).toBe(StatusCodes.NOT_FOUND);
      const instructor = await createStaffLogin(tenants, A, ['instructor']);
      const res = await http
        .post('/v1/checkout')
        .set(instructor)
        .set('Idempotency-Key', randomUUID())
        .send({ priceItemId: packageId });
      expect(res.status).toBe(StatusCodes.FORBIDDEN);
    });
  });

  describe('POST /v1/webhooks/payments/:provider', () => {
    it('settles a package purchase: credits minutes, issues a paid invoice with tax lines', async () => {
      const student = await createStudentLogin(tenants, A);
      const { paymentId, providerRef } = await startedPayment(student, packageId);
      const res = await webhook(succeeded(providerRef));
      expect(res.status, JSON.stringify(res.body)).toBe(StatusCodes.OK);
      expect(res.body).toEqual({ received: true });

      const payment = await paymentRow(paymentId);
      expect(payment).toMatchObject({ status: 'succeeded', version: 2 });
      expect(await ledgerOf(student.studentId)).toEqual([
        { entry_type: 'purchase', minutes: 600, payment_id: paymentId },
      ]);
      const invoice = await invoiceRow(payment.invoice_id as string);
      const year = new Intl.DateTimeFormat('en', {
        timeZone: 'Europe/Berlin',
        year: 'numeric',
      }).format(new Date());
      expect(invoice).toMatchObject({
        student_id: student.studentId,
        kind: 'invoice',
        series: year,
        status: 'paid',
        subtotal_minor: 8403,
        tax_minor: 1597,
        total_minor: 10_000,
        currency: 'EUR',
      });
      expect(invoice.issued_at).not.toBeNull();
      expect(invoice.seller_snapshot).toEqual({
        name: 'School A',
        legalName: 'School A Ltd',
        taxId: null,
        address: '1 A Street',
        countryCode: 'DE',
      });
      expect(invoice.buyer_snapshot).toMatchObject({ name: expect.stringMatching(/^User /) });
      const lines = await inSchool(
        A,
        sql`select description, quantity, unit_minor, tax_rate_bp, tax_minor, total_minor, currency, price_item_id
            from invoice_lines where invoice_id = ${invoice.id}`,
      );
      expect(lines).toEqual([
        {
          description: '10-lesson package',
          quantity: 1,
          unit_minor: 10_000,
          tax_rate_bp: 1900,
          tax_minor: 1597,
          total_minor: 10_000,
          currency: 'EUR',
          price_item_id: packageId,
        },
      ]);

      const [paid] = await expectEvents(db, { type: PaymentSucceeded, aggregateId: paymentId });
      expect(paid?.payload).toMatchObject({
        paymentId,
        studentId: student.studentId,
        payerUserId: student.userId,
        method: 'in_app',
        amountMinor: 10_000,
        priceItemId: packageId,
        priceItemKind: 'package',
        creditMinutes: 600,
        invoiceId: invoice.id,
      });
      expect(paid?.actorUserId).toBeNull();
      const [issued] = await expectEvents(db, { type: InvoiceIssued, aggregateId: invoice.id });
      expect(issued?.payload).toMatchObject({
        kind: 'invoice',
        series: year,
        number: invoice.number,
        totalMinor: 10_000,
        payerUserIds: [student.userId],
      });
      await expectEvents(db, { type: LedgerEntryRecorded, aggregateId: student.studentId });
    });

    it('is idempotent on (provider, provider_ref): a duplicate webhook changes nothing', async () => {
      const student = await createStudentLogin(tenants, A);
      const { paymentId, providerRef } = await startedPayment(student, packageId);
      expect((await webhook(succeeded(providerRef))).status).toBe(StatusCodes.OK);
      const again = await webhook(succeeded(providerRef));
      expect(again.status).toBe(StatusCodes.OK);
      expect(again.body).toEqual({ received: true });
      expect(await ledgerOf(student.studentId)).toHaveLength(1);
      expect(
        await inSchool(A, sql`select id from invoices where student_id = ${student.studentId}`),
      ).toHaveLength(1);
      expect(
        await expectEvents(db, { type: PaymentSucceeded, aggregateId: paymentId }),
      ).toHaveLength(1);
    });

    it('settles concurrent duplicate webhooks once', async () => {
      const student = await createStudentLogin(tenants, A);
      const { providerRef } = await startedPayment(student, packageId);
      const results = await Promise.all([1, 2, 3].map(() => webhook(succeeded(providerRef))));
      expect(results.map((res) => res.status)).toEqual([
        StatusCodes.OK,
        StatusCodes.OK,
        StatusCodes.OK,
      ]);
      expect(await ledgerOf(student.studentId)).toHaveLength(1);
    });

    it('grants the entitlement of an upsell without crediting minutes', async () => {
      const student = await createStudentLogin(tenants, A);
      const upsell = await createPriceItemRow(tenants, A, {
        name: 'Premium theory',
        kind: 'upsell',
        creditMinutes: null,
        entitlementKind: 'premium_theory',
        amountMinor: 2900,
      });
      const { paymentId, providerRef } = await startedPayment(student, upsell);
      expect((await webhook(succeeded(providerRef, 2900))).status).toBe(StatusCodes.OK);
      expect(await ledgerOf(student.studentId)).toEqual([]);
      const balance = await http
        .get(`/v1/students/${student.studentId}/balance`)
        .set(student.headers)
        .expect(StatusCodes.OK);
      expect(balance.body.entitlements).toEqual([
        {
          id: expect.any(String),
          kind: 'premium_theory',
          paymentId,
          grantedAt: expect.any(String),
        },
      ]);
      await expectEvents(db, {
        type: EntitlementGranted,
        aggregateId: balance.body.entitlements[0].id,
      });
    });

    it('marks a failed payment and ignores a later success for it', async () => {
      const student = await createStudentLogin(tenants, A);
      const { paymentId, providerRef } = await startedPayment(student, packageId);
      const failed = await webhook({ ...succeeded(providerRef), type: 'payment.failed' });
      expect(failed.status).toBe(StatusCodes.OK);
      expect(await paymentRow(paymentId)).toMatchObject({
        status: 'failed',
        version: 2,
        invoice_id: null,
      });
      const [event] = await expectEvents(db, { type: PaymentFailed, aggregateId: paymentId });
      expect(event?.payload).toMatchObject({ paymentId, method: 'in_app', priceItemId: packageId });
      expect((await webhook(succeeded(providerRef))).status).toBe(StatusCodes.OK);
      expect(await paymentRow(paymentId)).toMatchObject({ status: 'failed' });
      expect(await ledgerOf(student.studentId)).toEqual([]);
    });

    it('rejects a bad signature with 401 and writes nothing', async () => {
      const student = await createStudentLogin(tenants, A);
      const { paymentId, providerRef } = await startedPayment(student, packageId);
      const res = await webhook(succeeded(providerRef), { signature: 'f'.repeat(64) });
      expect(res.status).toBe(StatusCodes.UNAUTHORIZED);
      expect(res.body.error.code).toBe('invalid_signature');
      const unsigned = await http
        .post('/v1/webhooks/payments/fake')
        .set('Content-Type', 'application/json')
        .send(JSON.stringify(succeeded(providerRef)));
      expect(unsigned.status).toBe(StatusCodes.UNAUTHORIZED);
      expect(await paymentRow(paymentId)).toMatchObject({ status: 'pending' });
    });

    it('answers 404 unknown_payment for an unknown provider_ref and writes nothing', async () => {
      const count = async () =>
        single(
          await inSchool<{ n: number }>(
            A,
            sql`select
            (select count(*) from invoices)::int + (select count(*) from ledger_entries)::int as n`,
          ),
        ).n;
      const before = await count();
      const res = await webhook(succeeded('fake_pay_does_not_exist'));
      expect(res.status).toBe(StatusCodes.NOT_FOUND);
      expect(res.body.error.code).toBe('unknown_payment');
      expect(await count()).toBe(before);
    });

    it('answers 404 for a provider that is not configured', async () => {
      const res = await webhook(succeeded('fake_pay_x'), { provider: 'stripe' });
      expect(res.status).toBe(StatusCodes.NOT_FOUND);
    });

    it('rejects an amount or currency that does not match the payment', async () => {
      const student = await createStudentLogin(tenants, A);
      const { paymentId, providerRef } = await startedPayment(student, packageId);
      const wrongAmount = await webhook(succeeded(providerRef, 9999));
      expect(wrongAmount.status).toBe(StatusCodes.CONFLICT);
      expect(wrongAmount.body.error.code).toBe('amount_mismatch');
      const wrongCurrency = await webhook(succeeded(providerRef, 10_000, 'USD'));
      expect(wrongCurrency.status).toBe(StatusCodes.CONFLICT);
      expect(await paymentRow(paymentId)).toMatchObject({ status: 'pending', version: 1 });
      await expectNoEvent(db, { type: PaymentSucceeded, aggregateId: paymentId });
    });
  });

  describe('fake pay page', () => {
    it('shows the amount and settles the payment through the signed webhook route', async () => {
      const student = await createStudentLogin(tenants, A);
      const res = await checkout(student, packageId);
      const path = new URL(res.body.checkoutUrl as string).pathname;
      const page = await http.get(path).expect(StatusCodes.OK);
      expect(page.headers['content-type']).toMatch(/text\/html/);
      expect(page.text).toContain('100.00 EUR');
      expect(page.text).toContain(`action="${path}/succeed"`);
      expect(page.text).toContain(`action="${path}/fail"`);

      const paid = await http.post(`${path}/succeed`).expect(StatusCodes.OK);
      expect(paid.text).toContain('200');
      expect(await paymentRow(res.body.paymentId)).toMatchObject({ status: 'succeeded' });
      const balance = await http
        .get(`/v1/students/${student.studentId}/balance`)
        .set(student.headers)
        .expect(StatusCodes.OK);
      expect(balance.body.balanceMinutes).toBe(600);
    });

    it('can fail a payment', async () => {
      const student = await createStudentLogin(tenants, A);
      const res = await checkout(student, packageId);
      const path = new URL(res.body.checkoutUrl as string).pathname;
      await http.post(`${path}/fail`).expect(StatusCodes.OK);
      expect(await paymentRow(res.body.paymentId)).toMatchObject({ status: 'failed' });
    });

    it('answers 404 for an unknown checkout', async () => {
      await http.get('/fake-pay/fake_pay_unknown').expect(StatusCodes.NOT_FOUND);
      await http.post('/fake-pay/fake_pay_unknown/succeed').expect(StatusCodes.NOT_FOUND);
      await http.post(`/fake-pay/fake_pay_unknown/refund`).expect(StatusCodes.NOT_FOUND);
    });
  });

  describe('GET /v1/invoices and the PDF', () => {
    let buyer: StudentLogin;
    let invoiceId: string;

    beforeAll(async () => {
      buyer = await createStudentLogin(tenants, A);
      const { paymentId, providerRef } = await startedPayment(buyer, packageId);
      await webhook(succeeded(providerRef)).expect(StatusCodes.OK);
      invoiceId = (await paymentRow(paymentId)).invoice_id as string;
    });

    it('lists a student their own invoices with lines and the formatted number', async () => {
      const res = await http.get('/v1/invoices').set(buyer.headers).expect(StatusCodes.OK);
      const invoice = await invoiceRow(invoiceId);
      expect(res.body).toEqual({
        items: [
          {
            id: invoiceId,
            kind: 'invoice',
            creditNoteForId: null,
            studentId: buyer.studentId,
            buyerName: expect.stringMatching(/^User /),
            series: invoice.series,
            number: invoice.number,
            formattedNumber: `${invoice.series}-${String(invoice.number).padStart(6, '0')}`,
            status: 'paid',
            issuedAt: expect.any(String),
            subtotalMinor: 8403,
            taxMinor: 1597,
            totalMinor: 10_000,
            currency: 'EUR',
            paymentId: expect.any(String),
            refundedMinor: 0,
            lines: [
              {
                id: expect.any(String),
                priceItemId: packageId,
                description: '10-lesson package',
                quantity: 1,
                unitMinor: 10_000,
                taxRateBp: 1900,
                taxMinor: 1597,
                totalMinor: 10_000,
                currency: 'EUR',
              },
            ],
          },
        ],
        nextCursor: null,
      });
      const other = await http.get(`/v1/invoices?studentId=${stella.studentId}`).set(buyer.headers);
      expect(other.status).toBe(StatusCodes.NOT_FOUND);
    });

    it('lets staff list every invoice, filter and page', async () => {
      const all = await http.get('/v1/invoices?limit=2').set(authHeaders(A)).expect(StatusCodes.OK);
      expect(all.body.items).toHaveLength(2);
      expect(all.body.nextCursor).toEqual(expect.any(String));
      const next = await http
        .get(`/v1/invoices?limit=2&cursor=${all.body.nextCursor}`)
        .set(authHeaders(A))
        .expect(StatusCodes.OK);
      expect(next.body.items[0].id).not.toBe(all.body.items[0].id);
      const filtered = await http
        .get(`/v1/invoices?studentId=${buyer.studentId}&kind=invoice&status=paid`)
        .set(authHeaders(A))
        .expect(StatusCodes.OK);
      expect(filtered.body.items.map((item: { id: string }) => item.id)).toEqual([invoiceId]);
      const notes = await http
        .get('/v1/invoices?kind=credit_note')
        .set(authHeaders(A))
        .expect(StatusCodes.OK);
      expect(notes.body.items.every((item: { kind: string }) => item.kind === 'credit_note')).toBe(
        true,
      );
      await expectNoEvent(db, { type: CreditNoteIssued, aggregateId: invoiceId });
    });

    it('streams the invoice as a PDF', async () => {
      const invoice = await invoiceRow(invoiceId);
      const res = await http
        .get(`/v1/invoices/${invoiceId}.pdf`)
        .set(buyer.headers)
        .buffer(true)
        .parse((response, done) => {
          const chunks: Buffer[] = [];
          response.on('data', (chunk: Buffer) => chunks.push(chunk));
          response.on('end', () => done(null, Buffer.concat(chunks)));
        })
        .expect(StatusCodes.OK);
      expect(res.headers['content-type']).toMatch(/^application\/pdf/);
      const body = (res.body as Buffer).toString('latin1');
      expect(body.startsWith('%PDF-1.4')).toBe(true);
      expect(body).toContain(`${invoice.series}-${String(invoice.number).padStart(6, '0')}`);
      expect(body).toContain('School A Ltd');
      expect(res.headers['content-disposition']).toContain('.pdf');
    });

    it("hides another student's invoice PDF and other schools' invoices", async () => {
      const other = await createStudentLogin(tenants, A);
      expect((await http.get(`/v1/invoices/${invoiceId}.pdf`).set(other.headers)).status).toBe(
        StatusCodes.NOT_FOUND,
      );
      expect((await http.get(`/v1/invoices/${invoiceId}.pdf`).set(authHeaders(B))).status).toBe(
        StatusCodes.NOT_FOUND,
      );
      const list = await http.get('/v1/invoices').set(authHeaders(B)).expect(StatusCodes.OK);
      expect(list.body.items).toEqual([]);
    });
  });
});
