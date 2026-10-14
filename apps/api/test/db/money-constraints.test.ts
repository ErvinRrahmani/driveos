import type pg from 'pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createSchoolFixture, insertRow, type SchoolFixture } from './fixtures.js';
import { connect, createScratchDatabase, type ScratchDatabase } from './scratch-database.js';

async function errorCode(promise: Promise<unknown>) {
  try {
    await promise;
  } catch (error) {
    return (error as { code?: string; constraint?: string }).code;
  }
  return undefined;
}

describe('money constraints', () => {
  let db: ScratchDatabase;
  let client: pg.Client;
  let f: SchoolFixture;

  beforeAll(async () => {
    db = await createScratchDatabase();
    client = await connect(db.systemUrl);
  }, 60_000);

  afterAll(async () => {
    await client?.end();
    await db?.drop();
  });

  beforeEach(async () => {
    f = await createSchoolFixture(client);
  });

  describe('ledger_entries sign check', () => {
    const entry = (entry_type: string, minutes: number) =>
      insertRow(client, 'ledger_entries', {
        school_id: f.schoolId,
        student_id: f.studentIds[0],
        entry_type,
        minutes,
      });

    it.each([
      ['purchase', 600],
      ['restore', 60],
      ['debit', -60],
      ['refund', -120],
      ['adjustment', 30],
      ['adjustment', -30],
    ])('accepts %s of %i minutes', async (type, minutes) => {
      expect(await errorCode(entry(type, minutes))).toBeUndefined();
    });

    it.each([
      ['purchase', -600],
      ['purchase', 0],
      ['restore', -60],
      ['debit', 60],
      ['debit', 0],
      ['refund', 120],
      ['adjustment', 0],
    ])('rejects %s of %i minutes', async (type, minutes) => {
      expect(await errorCode(entry(type, minutes))).toBe('23514');
    });
  });

  describe('platform_charges student fee uniqueness', () => {
    const charge = (kind: string, studentId: string | null) =>
      insertRow(client, 'platform_charges', {
        school_id: f.schoolId,
        kind,
        student_id: studentId,
        period_month: '2026-03-01',
        amount_minor: kind === 'student_fee_reversal' ? -500 : 500,
        currency: 'GBP',
        status: 'pending',
      });

    it('allows one student_fee per student and school', async () => {
      expect(await errorCode(charge('student_fee', f.studentIds[0]))).toBeUndefined();
      expect(await errorCode(charge('student_fee', f.studentIds[0]))).toBe('23505');
      expect(await errorCode(charge('student_fee', f.studentIds[1]))).toBeUndefined();
    });

    it('allows one student_fee_reversal per student and school', async () => {
      expect(await errorCode(charge('student_fee_reversal', f.studentIds[0]))).toBeUndefined();
      expect(await errorCode(charge('student_fee_reversal', f.studentIds[0]))).toBe('23505');
      expect(await errorCode(charge('student_fee_reversal', f.studentIds[1]))).toBeUndefined();
    });

    it('does not restrict base subscription charges', async () => {
      for (let i = 0; i < 2; i += 1) {
        expect(await errorCode(charge('base_subscription', null))).toBeUndefined();
      }
    });
  });

  describe('platform_statements uniqueness', () => {
    const statement = (month: string) =>
      insertRow(client, 'platform_statements', {
        school_id: f.schoolId,
        month,
        total_minor: 4900,
        currency: 'GBP',
        status: 'issued',
        issued_at: new Date('2026-04-01T02:00:00Z'),
      });

    it('allows one statement per school and month', async () => {
      expect(await errorCode(statement('2026-03-01'))).toBeUndefined();
      expect(await errorCode(statement('2026-03-01'))).toBe('23505');
      expect(await errorCode(statement('2026-04-01'))).toBeUndefined();
    });
  });
});
