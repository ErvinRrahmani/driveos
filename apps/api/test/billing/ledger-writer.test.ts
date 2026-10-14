import { LedgerEntryRecorded } from '@driveos/shared';
import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { TenantContext } from '../../src/kernel/tenant/tenant-context.js';
import { LEDGER_WRITER, type LedgerWriter } from '../../src/modules/billing/index.js';
import { createScratchDatabase, type ScratchDatabase } from '../db/scratch-database.js';
import { createStudent } from '../identity/support.js';
import { expectEvents } from '../support/events.js';
import { createKernelTestApp, type KernelTestApp } from '../support/kernel-app.js';
import { createTestTenants, type TestTenant, type TestTenants } from '../support/tenants.js';
import { createLesson, createPaymentRow, createPriceItemRow, createRefundRow } from './support.js';

describe('LedgerWriter (LEDGER_WRITER)', () => {
  let db: ScratchDatabase;
  let kernel: KernelTestApp;
  let tenants: TestTenants;
  let A: TestTenant;
  let B: TestTenant;
  let tenant: TenantContext;
  let ledger: LedgerWriter;

  beforeAll(async () => {
    db = await createScratchDatabase();
    kernel = await createKernelTestApp(db);
    tenant = kernel.app.get(TenantContext);
    tenants = await createTestTenants(db, { context: tenant });
    ({ A, B } = tenants);
    ledger = kernel.app.get<LedgerWriter>(LEDGER_WRITER);
  }, 60_000);

  afterAll(async () => {
    await kernel?.close();
    await db?.drop();
  });

  const inA = <T>(fn: () => Promise<T>) =>
    tenant.runInTenant({ schoolId: A.schoolId, userId: A.ownerUserId }, fn);
  const inB = <T>(fn: () => Promise<T>) =>
    tenant.runInTenant({ schoolId: B.schoolId, userId: B.ownerUserId }, fn);
  const newStudent = () => createStudent(tenants, A, { dateOfBirth: '2000-01-01' });

  it('starts every student at a zero balance', async () => {
    const studentId = await newStudent();
    expect(await inA(() => ledger.balance(studentId))).toBe(0);
  });

  it('writes signed entries for purchase, debit, restore and adjustment and sums them', async () => {
    const studentId = await newStudent();
    const priceItemId = await createPriceItemRow(tenants, A);
    const paymentId = await createPaymentRow(tenants, A, studentId);
    const lessonId = await createLesson(tenants, A, studentId);

    const results = await inA(async () => {
      await ledger.lockStudent(studentId);
      return [
        await ledger.credit({ studentId, minutes: 600, paymentId, priceItemId }),
        await ledger.debit({ studentId, minutes: 60, lessonId }),
        await ledger.restore({ studentId, minutes: 60, lessonId }),
        await ledger.debit({ studentId, minutes: 90, lessonId, note: 'double lesson' }),
        await ledger.adjust({
          studentId,
          minutes: -30,
          note: 'goodwill',
          createdByMembershipId: A.ownerMembershipId,
        }),
      ];
    });

    expect(results.map((result) => result.balanceAfter)).toEqual([600, 540, 600, 510, 480]);
    expect(await inA(() => ledger.balance(studentId))).toBe(480);

    const rows = await inA(() =>
      tenant.tx.execute<{
        id: string;
        entry_type: string;
        minutes: number;
        lesson_id: string | null;
        payment_id: string | null;
        price_item_id: string | null;
        note: string | null;
        created_by_membership_id: string | null;
      }>(
        sql`select id, entry_type, minutes, lesson_id, payment_id, price_item_id, note, created_by_membership_id
            from ledger_entries where student_id = ${studentId} order by id`,
      ),
    );
    expect(rows.rows.map((row) => row.id)).toEqual(results.map((result) => result.entryId));
    expect(rows.rows).toEqual([
      expect.objectContaining({
        entry_type: 'purchase',
        minutes: 600,
        payment_id: paymentId,
        price_item_id: priceItemId,
      }),
      expect.objectContaining({ entry_type: 'debit', minutes: -60, lesson_id: lessonId }),
      expect.objectContaining({ entry_type: 'restore', minutes: 60, lesson_id: lessonId }),
      expect.objectContaining({ entry_type: 'debit', minutes: -90, note: 'double lesson' }),
      expect.objectContaining({
        entry_type: 'adjustment',
        minutes: -30,
        note: 'goodwill',
        created_by_membership_id: A.ownerMembershipId,
      }),
    ]);
  });

  it('appends one LedgerEntryRecorded per write with the balance after it', async () => {
    const studentId = await newStudent();
    const lessonId = await createLesson(tenants, A, studentId);
    await inA(async () => {
      await ledger.lockStudent(studentId);
      await ledger.adjust({
        studentId,
        minutes: 120,
        note: 'opening balance',
        createdByMembershipId: A.ownerMembershipId,
      });
      await ledger.debit({ studentId, minutes: 45, lessonId });
    });
    const events = await expectEvents(db, {
      type: LedgerEntryRecorded,
      aggregateId: studentId,
    });
    expect(events.map((event) => event.payload)).toEqual([
      expect.objectContaining({
        studentId,
        entryType: 'adjustment',
        minutes: 120,
        balanceAfter: 120,
      }),
      expect.objectContaining({
        studentId,
        entryType: 'debit',
        minutes: -45,
        balanceAfter: 75,
        lessonId,
      }),
    ]);
    expect(events.map((event) => [event.aggregateType, event.aggregateVersion])).toEqual([
      ['student_ledger', 1],
      ['student_ledger', 2],
    ]);
    expect(events.every((event) => event.schoolId === A.schoolId)).toBe(true);
  });

  it('refuses minutes with the wrong shape and writes nothing', async () => {
    const studentId = await newStudent();
    const lessonId = await createLesson(tenants, A, studentId);
    await expect(inA(() => ledger.debit({ studentId, minutes: -60, lessonId }))).rejects.toThrow(
      RangeError,
    );
    await expect(
      inA(() =>
        ledger.adjust({
          studentId,
          minutes: 0,
          note: 'nothing',
          createdByMembershipId: A.ownerMembershipId,
        }),
      ),
    ).rejects.toThrow(RangeError);
    await expect(inA(() => ledger.restore({ studentId, minutes: 1.5, lessonId }))).rejects.toThrow(
      RangeError,
    );
    expect(await inA(() => ledger.balance(studentId))).toBe(0);
  });

  it('rolls the entry and its event back with the caller transaction', async () => {
    const studentId = await newStudent();
    await expect(
      inA(async () => {
        await ledger.adjust({
          studentId,
          minutes: 60,
          note: 'rolled back',
          createdByMembershipId: A.ownerMembershipId,
        });
        throw new Error('caller failed');
      }),
    ).rejects.toThrow('caller failed');
    expect(await inA(() => ledger.balance(studentId))).toBe(0);
    expect(await expectEvents(db, { type: LedgerEntryRecorded, aggregateId: studentId })).toEqual(
      [],
    );
  });

  it("never sees another school's entries", async () => {
    const studentId = await newStudent();
    await inA(() =>
      ledger.adjust({
        studentId,
        minutes: 60,
        note: 'A only',
        createdByMembershipId: A.ownerMembershipId,
      }),
    );
    expect(await inB(() => ledger.balance(studentId))).toBe(0);
  });

  it('serialises two transactions on the same student with lockStudent', async () => {
    const studentId = await newStudent();
    const lessonId = await createLesson(tenants, A, studentId);
    await inA(() =>
      ledger.adjust({
        studentId,
        minutes: 60,
        note: 'one lesson',
        createdByMembershipId: A.ownerMembershipId,
      }),
    );

    let releaseA!: () => void;
    const aMayCommit = new Promise<void>((resolve) => (releaseA = resolve));
    let aLocked!: () => void;
    const aHasLock = new Promise<void>((resolve) => (aLocked = resolve));

    const txA = inA(async () => {
      await ledger.lockStudent(studentId);
      const seen = await ledger.balance(studentId);
      aLocked();
      await aMayCommit;
      if (seen >= 60) await ledger.debit({ studentId, minutes: 60, lessonId });
      return seen;
    });
    await aHasLock;

    let bGotLock = false;
    const txB = inA(async () => {
      await ledger.lockStudent(studentId);
      bGotLock = true;
      return ledger.balance(studentId);
    });

    await new Promise((resolve) => setTimeout(resolve, 300));
    expect(bGotLock).toBe(false);

    releaseA();
    expect(await txA).toBe(60);
    expect(await txB).toBe(0);
    expect(bGotLock).toBe(true);
  });

  it('does not block a different student', async () => {
    const first = await newStudent();
    const second = await newStudent();
    let release!: () => void;
    const hold = new Promise<void>((resolve) => (release = resolve));
    let locked!: () => void;
    const hasLock = new Promise<void>((resolve) => (locked = resolve));
    const holder = inA(async () => {
      await ledger.lockStudent(first);
      locked();
      await hold;
    });
    await hasLock;
    const other = await inA(async () => {
      await ledger.lockStudent(second);
      return ledger.balance(second);
    });
    expect(other).toBe(0);
    release();
    await holder;
  });
  it('writes a refund as a negative entry linked to the refund and payment', async () => {
    const studentId = await newStudent();
    const priceItemId = await createPriceItemRow(tenants, A);
    const paymentId = await createPaymentRow(tenants, A, studentId);
    const refundId = await createRefundRow(tenants, A, paymentId);
    const result = await inA(async () => {
      await ledger.credit({ studentId, minutes: 600, paymentId, priceItemId });
      return ledger.refund({
        studentId,
        minutes: 120,
        refundId,
        paymentId,
        createdByMembershipId: A.ownerMembershipId,
      });
    });
    expect(result.balanceAfter).toBe(480);
    const rows = await inA(() =>
      tenant.tx.execute<{
        entry_type: string;
        minutes: number;
        refund_id: string;
        payment_id: string;
      }>(
        sql`select entry_type, minutes, refund_id, payment_id from ledger_entries where id = ${result.entryId}`,
      ),
    );
    expect(rows.rows).toEqual([
      { entry_type: 'refund', minutes: -120, refund_id: refundId, payment_id: paymentId },
    ]);
    const events = await expectEvents(db, { type: LedgerEntryRecorded, aggregateId: studentId });
    expect(events.at(-1)?.payload).toMatchObject({
      entryType: 'refund',
      minutes: -120,
      balanceAfter: 480,
      refundId,
      paymentId,
    });
    await expect(inA(() => ledger.refund({ studentId, minutes: 0, refundId }))).rejects.toThrow(
      RangeError,
    );
  });
});
