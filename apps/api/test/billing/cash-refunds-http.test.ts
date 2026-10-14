import { randomUUID } from 'node:crypto';
import {
  CashPaymentRecorded,
  CreditNoteIssued,
  InvoiceIssued,
  RefundIssued,
} from '@driveos/shared';
import { ConfigService } from '@nestjs/config';
import { sql } from 'drizzle-orm';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { signFakePaymentWebhook } from '../../src/adapters/payments/fake-payment-provider.js';
import { findPgError } from '../../src/kernel/http/pg-error.js';
import { TenantContext } from '../../src/kernel/tenant/tenant-context.js';
import { LEDGER_WRITER, type LedgerWriter } from '../../src/modules/billing/index.js';
import { createScratchDatabase, type ScratchDatabase } from '../db/scratch-database.js';
import { expectEvents } from '../support/events.js';
import { createKernelTestApp, type KernelTestApp } from '../support/kernel-app.js';
import {
  authHeaders,
  createTestTenants,
  type TestTenant,
  type TestTenants,
} from '../support/tenants.js';
import {
  createLesson,
  createPriceItemRow,
  createStaffLogin,
  createStudentLogin,
  numericRow,
  single,
} from './support.js';
import { StatusCodes } from 'http-status-codes';

describe('billing HTTP: cash and bank-transfer payments, refunds, credit notes', () => {
  let db: ScratchDatabase;
  let kernel: KernelTestApp;
  let tenants: TestTenants;
  let A: TestTenant;
  let B: TestTenant;
  let http: ReturnType<typeof request>;
  let tenant: TenantContext;
  let ledger: LedgerWriter;
  let lessonItem: string;
  let packageItem: string;

  beforeAll(async () => {
    db = await createScratchDatabase();
    kernel = await createKernelTestApp(db);
    tenant = kernel.app.get(TenantContext);
    tenants = await createTestTenants(db, { context: tenant });
    ({ A, B } = tenants);
    http = request(kernel.app.getHttpServer());
    ledger = kernel.app.get<LedgerWriter>(LEDGER_WRITER);
    lessonItem = await createPriceItemRow(tenants, A, {
      name: 'Single lesson',
      kind: 'lesson',
      creditMinutes: 60,
      amountMinor: 6500,
    });
    packageItem = await createPriceItemRow(tenants, A, { amountMinor: 60_000 });
  }, 60_000);

  afterAll(async () => {
    await kernel?.close();
    await db?.drop();
  });

  const rowsIn = <T extends Record<string, unknown>>(
    t: TestTenant,
    query: ReturnType<typeof sql>,
  ) => tenants.asSchool(t, async (tx) => (await tx.execute<T>(query)).rows.map(numericRow));

  const balanceOf = async (studentId: string) =>
    single(
      await rowsIn<{ b: number }>(
        A,
        sql`select coalesce(sum(minutes), 0)::int as b
      from ledger_entries where student_id = ${studentId}`,
      ),
    ).b;

  function recordCash(
    body: Record<string, unknown>,
    headers: Record<string, string> = authHeaders(A),
    key = randomUUID(),
  ) {
    return http.post('/v1/payments/cash').set(headers).set('Idempotency-Key', key).send(body);
  }

  const cashFor = (studentId: string, priceItemId = packageItem, amountMinor = 60_000) => ({
    studentId,
    priceItemId,
    method: 'cash',
    amountMinor,
    currency: 'EUR',
  });

  async function paidInCash(studentId: string, priceItemId = packageItem, amountMinor = 60_000) {
    const res = await recordCash(cashFor(studentId, priceItemId, amountMinor));
    expect(res.status, JSON.stringify(res.body)).toBe(StatusCodes.CREATED);
    return res.body as { id: string; version: number; invoiceId: string };
  }

  function refund(body: Record<string, unknown>, headers: Record<string, string> = authHeaders(A)) {
    return http.post('/v1/refunds').set(headers).set('Idempotency-Key', randomUUID()).send(body);
  }

  const setNegativeBalance = (allow: boolean) =>
    http
      .patch('/v1/school/settings')
      .set(authHeaders(A))
      .send({ allowNegativeBalance: allow })
      .expect(StatusCodes.OK);

  describe('POST /v1/payments/cash', () => {
    it('records a cash payment: payment, ledger credit, paid invoice and events', async () => {
      const student = await createStudentLogin(tenants, A);
      const res = await recordCash({
        ...cashFor(student.studentId, lessonItem, 6500),
        reference: 'Receipt 17',
      });
      expect(res.status, JSON.stringify(res.body)).toBe(StatusCodes.CREATED);
      expect(res.body).toEqual({
        id: expect.any(String),
        version: 1,
        invoiceId: expect.any(String),
      });
      const [payment] = await rowsIn(A, sql`select * from payments where id = ${res.body.id}`);
      expect(payment).toMatchObject({
        student_id: student.studentId,
        method: 'cash',
        status: 'succeeded',
        amount_minor: 6500,
        reference: 'Receipt 17',
        invoice_id: res.body.invoiceId,
        recorded_by_membership_id: A.ownerMembershipId,
        price_item_id: lessonItem,
        provider: null,
        payer_user_id: null,
      });
      expect(await balanceOf(student.studentId)).toBe(60);
      const [invoice] = await rowsIn(
        A,
        sql`select * from invoices where id = ${res.body.invoiceId}`,
      );
      expect(invoice).toMatchObject({ status: 'paid', total_minor: 6500, tax_minor: 1038 });
      const [event] = await expectEvents(db, {
        type: CashPaymentRecorded,
        aggregateId: res.body.id,
      });
      expect(event?.payload).toMatchObject({
        paymentId: res.body.id,
        studentId: student.studentId,
        method: 'cash',
        recordedByMembershipId: A.ownerMembershipId,
        invoiceId: res.body.invoiceId,
        priceItemKind: 'lesson',
        creditMinutes: 60,
      });
      await expectEvents(db, { type: InvoiceIssued, aggregateId: res.body.invoiceId });
    });

    it('replays a duplicate request with the same Idempotency-Key', async () => {
      const student = await createStudentLogin(tenants, A);
      const key = randomUUID();
      const first = await recordCash(cashFor(student.studentId), authHeaders(A), key);
      const again = await recordCash(cashFor(student.studentId), authHeaders(A), key);
      expect(again.body).toEqual(first.body);
      expect(await balanceOf(student.studentId)).toBe(600);
    });

    it('lets office record bank transfers and instructors record cash only', async () => {
      const student = await createStudentLogin(tenants, A);
      const office = await createStaffLogin(tenants, A, ['office']);
      const instructor = await createStaffLogin(tenants, A, ['instructor']);
      const bank = { ...cashFor(student.studentId), method: 'bank_transfer', reference: 'SEPA-1' };
      expect((await recordCash(bank, office)).status).toBe(StatusCodes.CREATED);
      const denied = await recordCash(bank, instructor);
      expect(denied.status).toBe(StatusCodes.FORBIDDEN);
      expect((await recordCash(cashFor(student.studentId), instructor)).status).toBe(
        StatusCodes.CREATED,
      );
      const asStudent = await recordCash(cashFor(student.studentId), student.headers);
      expect(asStudent.status).toBe(StatusCodes.FORBIDDEN);
      expect(await balanceOf(student.studentId)).toBe(1200);
    });

    it('requires the price and currency of the price item', async () => {
      const student = await createStudentLogin(tenants, A);
      const wrongAmount = await recordCash(cashFor(student.studentId, packageItem, 59_999));
      expect(wrongAmount.status).toBe(StatusCodes.CONFLICT);
      expect(wrongAmount.body.error.code).toBe('amount_mismatch');
      const wrongCurrency = await recordCash({ ...cashFor(student.studentId), currency: 'USD' });
      expect(wrongCurrency.status).toBe(StatusCodes.CONFLICT);
      expect((await recordCash(cashFor(randomUUID()))).status).toBe(StatusCodes.NOT_FOUND);
      expect((await recordCash(cashFor(student.studentId, randomUUID()))).status).toBe(
        StatusCodes.NOT_FOUND,
      );
      expect(await balanceOf(student.studentId)).toBe(0);
    });

    it('numbers invoices without gaps or duplicates under concurrency', async () => {
      const fresh = await createTestTenants(db, { context: tenant });
      try {
        const item = await createPriceItemRow(tenants, fresh.A, { amountMinor: 1000 });
        const students = await Promise.all(
          Array.from({ length: 10 }, () => createStudentLogin(tenants, fresh.A)),
        );
        const results = await Promise.all(
          students.map((student) =>
            recordCash(cashFor(student.studentId, item, 1000), authHeaders(fresh.A)),
          ),
        );
        expect(results.map((res) => res.status)).toEqual(Array(10).fill(StatusCodes.CREATED));
        const numbers = await rowsIn<{ number: number }>(
          fresh.A,
          sql`select number from invoices order by number`,
        );
        expect(numbers.map((row) => row.number)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
        const counter = single(
          await rowsIn<{ next_number: string }>(
            fresh.A,
            sql`select next_number from invoice_counters`,
          ),
        );
        expect(Number(counter.next_number)).toBe(11);
      } finally {
        await fresh.close();
      }
    });
  });

  describe('issued invoices are immutable', () => {
    it('refuses any change to an issued invoice or its lines at the database', async () => {
      const student = await createStudentLogin(tenants, A);
      const { invoiceId } = await paidInCash(student.studentId);
      const failure = async (query: ReturnType<typeof sql>) => {
        try {
          await tenants.asSchool(A, (tx) => tx.execute(query));
        } catch (error) {
          return findPgError(error)?.message;
        }
        return 'no error';
      };
      const blocked = /cannot be changed/;
      expect(
        await failure(sql`update invoices set total_minor = 1 where id = ${invoiceId}`),
      ).toMatch(blocked);
      expect(
        await failure(sql`update invoices set status = 'issued' where id = ${invoiceId}`),
      ).toMatch(blocked);
      expect(await failure(sql`delete from invoices where id = ${invoiceId}`)).toMatch(blocked);
      expect(
        await failure(
          sql`update invoice_lines set total_minor = 1 where invoice_id = ${invoiceId}`,
        ),
      ).toMatch(blocked);
      expect(await failure(sql`delete from invoice_lines where invoice_id = ${invoiceId}`)).toMatch(
        blocked,
      );
      const [invoice] = await rowsIn(
        A,
        sql`select total_minor, status from invoices where id = ${invoiceId}`,
      );
      expect(invoice).toEqual({ total_minor: 60_000, status: 'paid' });
    });
  });

  describe('POST /v1/refunds', () => {
    it('refunds part of a cash payment with a credit note and removed minutes', async () => {
      const student = await createStudentLogin(tenants, A);
      const payment = await paidInCash(student.studentId);
      const res = await refund({
        paymentId: payment.id,
        amountMinor: 12_000,
        currency: 'EUR',
        minutesRemoved: 120,
        reason: 'Moved away',
      });
      expect(res.status, JSON.stringify(res.body)).toBe(StatusCodes.CREATED);
      expect(res.body).toEqual({
        id: expect.any(String),
        version: 1,
        status: 'succeeded',
        creditNoteId: expect.any(String),
      });
      expect(await balanceOf(student.studentId)).toBe(480);
      const [entry] = await rowsIn(
        A,
        sql`select entry_type, minutes, refund_id, payment_id, created_by_membership_id from ledger_entries
            where student_id = ${student.studentId} and entry_type = 'refund'`,
      );
      expect(entry).toEqual({
        entry_type: 'refund',
        minutes: -120,
        refund_id: res.body.id,
        payment_id: payment.id,
        created_by_membership_id: A.ownerMembershipId,
      });
      const [row] = await rowsIn(A, sql`select * from refunds where id = ${res.body.id}`);
      expect(row).toMatchObject({
        payment_id: payment.id,
        amount_minor: 12_000,
        minutes_removed: 120,
        reason: 'Moved away',
        credit_note_id: res.body.creditNoteId,
        status: 'succeeded',
        provider_ref: null,
      });
      const [paid] = await rowsIn(
        A,
        sql`select status, version from payments where id = ${payment.id}`,
      );
      expect(paid).toEqual({ status: 'partially_refunded', version: 2 });

      const original = single(
        await rowsIn<{ series: string; number: number }>(
          A,
          sql`select series, number from invoices where id = ${payment.invoiceId}`,
        ),
      );
      const [note] = await rowsIn(
        A,
        sql`select * from invoices where id = ${res.body.creditNoteId}`,
      );
      expect(note).toMatchObject({
        kind: 'credit_note',
        credit_note_for_id: payment.invoiceId,
        series: original.series,
        number: original.number + 1,
        total_minor: -12_000,
        tax_minor: -1916,
        subtotal_minor: -10_084,
        status: 'paid',
      });
      const lines = await rowsIn(
        A,
        sql`select description, quantity, unit_minor, tax_minor, total_minor from invoice_lines
            where invoice_id = ${res.body.creditNoteId}`,
      );
      expect(lines).toEqual([
        {
          description: 'Refund: 10-lesson package',
          quantity: 1,
          unit_minor: -12_000,
          tax_minor: -1916,
          total_minor: -12_000,
        },
      ]);
      const [refunded] = await expectEvents(db, { type: RefundIssued, aggregateId: res.body.id });
      expect(refunded?.payload).toEqual({
        refundId: res.body.id,
        paymentId: payment.id,
        studentId: student.studentId,
        amountMinor: 12_000,
        currency: 'EUR',
        minutesRemoved: 120,
        creditNoteId: res.body.creditNoteId,
        method: 'cash',
      });
      const [noted] = await expectEvents(db, {
        type: CreditNoteIssued,
        aggregateId: res.body.creditNoteId,
      });
      expect(noted?.payload).toMatchObject({
        creditNoteForId: payment.invoiceId,
        refundId: res.body.id,
        number: original.number + 1,
        totalMinor: -12_000,
      });
      const audit = await rowsIn(
        A,
        sql`select action, target_type, target_id, reason from audit_log where action = 'refund.issue'
            and target_id = ${payment.id}`,
      );
      expect(audit).toEqual([
        {
          action: 'refund.issue',
          target_type: 'payment',
          target_id: payment.id,
          reason: 'Moved away',
        },
      ]);

      const pdf = await http
        .get(`/v1/invoices/${res.body.creditNoteId}.pdf`)
        .set(authHeaders(A))
        .buffer(true)
        .parse((response, done) => {
          const chunks: Buffer[] = [];
          response.on('data', (chunk: Buffer) => chunks.push(chunk));
          response.on('end', () => done(null, Buffer.concat(chunks)));
        })
        .expect(StatusCodes.OK);
      expect((pdf.body as Buffer).toString('latin1')).toContain(
        `${original.series}-${String(original.number).padStart(6, '0')}`,
      );
    });

    it('caps refunds at the payment amount minus earlier refunds and marks a full refund', async () => {
      const student = await createStudentLogin(tenants, A);
      const payment = await paidInCash(student.studentId);
      const base = { paymentId: payment.id, currency: 'EUR', minutesRemoved: 0, reason: 'r' };
      expect((await refund({ ...base, amountMinor: 50_000 })).status).toBe(StatusCodes.CREATED);
      const tooMuch = await refund({ ...base, amountMinor: 10_001 });
      expect(tooMuch.status).toBe(StatusCodes.CONFLICT);
      expect(tooMuch.body.error.code).toBe('refund_exceeds_payment');
      expect((await refund({ ...base, amountMinor: 10_000 })).status).toBe(StatusCodes.CREATED);
      const [row] = await rowsIn(
        A,
        sql`select status, version from payments where id = ${payment.id}`,
      );
      expect(row).toEqual({ status: 'refunded', version: 3 });
      const again = await refund({ ...base, amountMinor: 1 });
      expect(again.status).toBe(StatusCodes.CONFLICT);
      expect(again.body.error.code).toBe('payment_not_refundable');
      expect(await balanceOf(student.studentId)).toBe(600);
      const wrongCurrency = await refund({ ...base, amountMinor: 1, currency: 'USD' });
      expect(wrongCurrency.status).toBe(StatusCodes.CONFLICT);
    });

    it('lists invoices with their payment and the amount already refunded', async () => {
      const student = await createStudentLogin(tenants, A);
      const payment = await paidInCash(student.studentId);
      const listed = async () =>
        (
          await http
            .get(`/v1/invoices?studentId=${student.studentId}`)
            .set(authHeaders(A))
            .expect(StatusCodes.OK)
        ).body.items as {
          id: string;
          kind: string;
          paymentId: string | null;
          refundedMinor: number;
        }[];

      expect(await listed()).toEqual([
        expect.objectContaining({ id: payment.invoiceId, paymentId: payment.id, refundedMinor: 0 }),
      ]);

      const base = { paymentId: payment.id, currency: 'EUR', minutesRemoved: 0, reason: 'r' };
      expect((await refund({ ...base, amountMinor: 1_500 })).status).toBe(StatusCodes.CREATED);
      expect((await refund({ ...base, amountMinor: 2_500 })).status).toBe(StatusCodes.CREATED);

      const items = await listed();
      expect(items.find((item) => item.id === payment.invoiceId)).toMatchObject({
        paymentId: payment.id,
        refundedMinor: 4_000,
      });
      const notes = items.filter((item) => item.kind === 'credit_note');
      expect(notes).toHaveLength(2);
      for (const note of notes) {
        expect(note).toMatchObject({ paymentId: payment.id, refundedMinor: 4_000 });
      }
    });

    it('caps removed minutes at the balance unless negative balances are allowed', async () => {
      const student = await createStudentLogin(tenants, A);
      const payment = await paidInCash(student.studentId);
      const lessonId = await createLesson(tenants, A, student.studentId);
      await tenants.context.runInTenant({ schoolId: A.schoolId, userId: A.ownerUserId }, () =>
        ledger.debit({ studentId: student.studentId, minutes: 500, lessonId }),
      );
      const body = {
        paymentId: payment.id,
        amountMinor: 1000,
        currency: 'EUR',
        minutesRemoved: 120,
        reason: 'r',
      };
      const denied = await refund(body);
      expect(denied.status).toBe(StatusCodes.CONFLICT);
      expect(denied.body.error.code).toBe('insufficient_balance');
      expect(await rowsIn(A, sql`select id from refunds where payment_id = ${payment.id}`)).toEqual(
        [],
      );
      await setNegativeBalance(true);
      try {
        expect((await refund(body)).status).toBe(StatusCodes.CREATED);
      } finally {
        await setNegativeBalance(false);
      }
      expect(await balanceOf(student.studentId)).toBe(-20);
    });

    it('refunds an in-app payment through the payment provider', async () => {
      await http
        .post('/v1/school/payment-account')
        .set(authHeaders(A))
        .send({ provider: 'fake' })
        .expect(StatusCodes.OK);
      const student = await createStudentLogin(tenants, A);
      const started = await http
        .post('/v1/checkout')
        .set(student.headers)
        .set('Idempotency-Key', randomUUID())
        .send({ priceItemId: lessonItem })
        .expect(StatusCodes.CREATED);
      const payment = single(
        await rowsIn<{ provider_ref: string }>(
          A,
          sql`select provider_ref from payments where id = ${started.body.paymentId}`,
        ),
      );
      const secret = kernel.app.get(ConfigService).getOrThrow<string>('FAKE_PAYMENT_SECRET');
      const raw = JSON.stringify({
        type: 'payment.succeeded',
        providerRef: payment.provider_ref,
        amountMinor: 6500,
        currency: 'EUR',
        occurredAt: new Date().toISOString(),
      });
      await http
        .post('/v1/webhooks/payments/fake')
        .set('Content-Type', 'application/json')
        .set('x-fake-signature', signFakePaymentWebhook(secret, Buffer.from(raw)))
        .send(raw)
        .expect(StatusCodes.OK);
      const res = await refund({
        paymentId: started.body.paymentId,
        amountMinor: 6500,
        currency: 'EUR',
        minutesRemoved: 60,
        reason: 'Cancelled course',
      });
      expect(res.status, JSON.stringify(res.body)).toBe(StatusCodes.CREATED);
      const [row] = await rowsIn<{ provider_ref: string | null; status: string }>(
        A,
        sql`select provider_ref, status from refunds where id = ${res.body.id}`,
      );
      expect(row?.provider_ref).toMatch(/^fake_refund_/);
      const [event] = await expectEvents(db, { type: RefundIssued, aggregateId: res.body.id });
      expect(event?.payload).toMatchObject({ method: 'in_app' });
      expect(await balanceOf(student.studentId)).toBe(0);
    });

    it('is for owner and office only, and hides other schools and unknown payments', async () => {
      const student = await createStudentLogin(tenants, A);
      const payment = await paidInCash(student.studentId);
      const body = {
        paymentId: payment.id,
        amountMinor: 100,
        currency: 'EUR',
        minutesRemoved: 0,
        reason: 'r',
      };
      const instructor = await createStaffLogin(tenants, A, ['instructor']);
      expect((await refund(body, instructor)).status).toBe(StatusCodes.FORBIDDEN);
      expect((await refund(body, student.headers)).status).toBe(StatusCodes.FORBIDDEN);
      expect((await refund(body, authHeaders(B))).status).toBe(StatusCodes.NOT_FOUND);
      expect((await refund({ ...body, paymentId: randomUUID() })).status).toBe(
        StatusCodes.NOT_FOUND,
      );
      const office = await createStaffLogin(tenants, A, ['office']);
      expect((await refund(body, office)).status).toBe(StatusCodes.CREATED);
    });
  });

  it('keeps the balance exact through purchase, debit, restore and refund', async () => {
    const student = await createStudentLogin(tenants, A);
    const payment = await paidInCash(student.studentId);
    const lessonId = await createLesson(tenants, A, student.studentId);
    const asA = <T>(fn: () => Promise<T>) =>
      tenants.context.runInTenant({ schoolId: A.schoolId, userId: A.ownerUserId }, fn);
    await asA(() => ledger.debit({ studentId: student.studentId, minutes: 90, lessonId }));
    expect(await balanceOf(student.studentId)).toBe(510);
    await asA(() => ledger.restore({ studentId: student.studentId, minutes: 90, lessonId }));
    expect(await balanceOf(student.studentId)).toBe(600);
    await asA(() => ledger.debit({ studentId: student.studentId, minutes: 60, lessonId }));
    const res = await refund({
      paymentId: payment.id,
      amountMinor: 30_000,
      currency: 'EUR',
      minutesRemoved: 300,
      reason: 'Half refund',
    });
    expect(res.status).toBe(StatusCodes.CREATED);
    const balance = await http
      .get(`/v1/students/${student.studentId}/balance`)
      .set(student.headers)
      .expect(StatusCodes.OK);
    expect(balance.body.balanceMinutes).toBe(240);
    const tooMany = await refund({
      paymentId: payment.id,
      amountMinor: 100,
      currency: 'EUR',
      minutesRemoved: 241,
      reason: 'r',
    });
    expect(tooMany.status).toBe(StatusCodes.CONFLICT);
    expect(await balanceOf(student.studentId)).toBe(240);
  });
});
