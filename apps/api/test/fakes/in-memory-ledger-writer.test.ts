import { describe, expect, it } from 'vitest';
import { ConflictError } from '../../src/kernel/http/errors.js';
import type { LedgerWriter } from '../../src/modules/billing/index.js';
import { InMemoryLedgerWriter } from './in-memory-ledger-writer.js';
import { StatusCodes } from 'http-status-codes';

const student = '0192f000-0007-7000-8000-000000000001';
const other = '0192f000-0007-7000-8000-000000000002';
const lessonId = '0192f000-0101-7000-8000-000000000001';
const paymentId = '0192f000-010a-7000-8000-000000000001';
const priceItemId = '0192f000-000c-7000-8000-000000000002';
const membershipId = '0192f000-0003-7000-8000-000000000002';

describe('InMemoryLedgerWriter', () => {
  it('implements LedgerWriter and starts every student at 0', async () => {
    const writer: LedgerWriter = new InMemoryLedgerWriter();
    expect(await writer.balance(student)).toBe(0);
  });

  it('keeps a per-student balance and returns the entry id and balance after', async () => {
    const writer = new InMemoryLedgerWriter();
    const credit = await writer.credit({
      studentId: student,
      minutes: 600,
      paymentId,
      priceItemId,
    });
    expect(credit).toEqual({ entryId: expect.any(String), balanceAfter: 600 });
    const debit = await writer.debit({ studentId: student, minutes: 60, lessonId });
    expect(debit.balanceAfter).toBe(540);
    expect(debit.entryId).not.toBe(credit.entryId);
    expect((await writer.restore({ studentId: student, minutes: 60, lessonId })).balanceAfter).toBe(
      600,
    );
    const adjust = await writer.adjust({
      studentId: student,
      minutes: -45,
      note: 'correction',
      createdByMembershipId: membershipId,
    });
    expect(adjust.balanceAfter).toBe(555);
    expect(await writer.balance(student)).toBe(555);
    expect(await writer.balance(other)).toBe(0);
  });

  it('records the signed entries and every call in order', async () => {
    const writer = new InMemoryLedgerWriter();
    await writer.lockStudent(student);
    await writer.credit({ studentId: student, minutes: 120, paymentId, priceItemId });
    await writer.debit({ studentId: student, minutes: 60, lessonId, note: 'Lesson' });
    expect(
      writer.entries.map((entry) => [entry.entryType, entry.minutes, entry.balanceAfter]),
    ).toEqual([
      ['purchase', 120, 120],
      ['debit', -60, 60],
    ]);
    expect(writer.entries[1]).toMatchObject({ studentId: student, lessonId, note: 'Lesson' });
    expect(writer.calls.map((call) => call.method)).toEqual(['lockStudent', 'credit', 'debit']);
    expect(writer.calls[0]?.input).toEqual({ studentId: student });
    expect(writer.lockedStudents).toEqual([student]);
  });

  it('refuses to go negative unless allowNegative is set, and writes nothing then', async () => {
    const strict = new InMemoryLedgerWriter();
    await expect(strict.debit({ studentId: student, minutes: 60, lessonId })).rejects.toMatchObject(
      {
        status: StatusCodes.CONFLICT,
        code: 'insufficient_balance',
      },
    );
    await expect(
      strict.adjust({
        studentId: student,
        minutes: -1,
        note: 'x',
        createdByMembershipId: membershipId,
      }),
    ).rejects.toBeInstanceOf(ConflictError);
    expect(strict.entries).toEqual([]);
    expect(await strict.balance(student)).toBe(0);

    const payLater = new InMemoryLedgerWriter({ allowNegative: true });
    expect((await payLater.debit({ studentId: student, minutes: 60, lessonId })).balanceAfter).toBe(
      -60,
    );
  });

  it('rejects minutes that violate the ledger sign rules', async () => {
    const writer = new InMemoryLedgerWriter({ allowNegative: true });
    await expect(writer.debit({ studentId: student, minutes: 0, lessonId })).rejects.toThrow(
      RangeError,
    );
    await expect(writer.debit({ studentId: student, minutes: -60, lessonId })).rejects.toThrow(
      RangeError,
    );
    await expect(writer.restore({ studentId: student, minutes: 0, lessonId })).rejects.toThrow(
      RangeError,
    );
    await expect(
      writer.credit({ studentId: student, minutes: 1.5, paymentId, priceItemId }),
    ).rejects.toThrow(RangeError);
    await expect(
      writer.adjust({
        studentId: student,
        minutes: 0,
        note: 'x',
        createdByMembershipId: membershipId,
      }),
    ).rejects.toThrow(RangeError);
  });

  it('can be seeded with opening balances', async () => {
    const writer = new InMemoryLedgerWriter({ balances: { [student]: 300 } });
    expect(await writer.balance(student)).toBe(300);
    expect(writer.entries).toEqual([]);
  });
  it('records a refund as negative minutes linked to the refund', async () => {
    const writer = new InMemoryLedgerWriter({ balances: { [student]: 600 } });
    const refundId = '0192f000-010b-7000-8000-000000000001';
    const result = await writer.refund({ studentId: student, minutes: 120, refundId, paymentId });
    expect(result.balanceAfter).toBe(480);
    expect(writer.entries.at(-1)).toMatchObject({
      entryType: 'refund',
      minutes: -120,
      refundId,
      paymentId,
    });
    await expect(writer.refund({ studentId: student, minutes: 600, refundId })).rejects.toThrow(
      ConflictError,
    );
  });
});
