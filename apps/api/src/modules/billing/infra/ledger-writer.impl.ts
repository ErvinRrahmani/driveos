import { LedgerEntryRecorded, type LedgerEntryType } from '@driveos/shared';
import { Injectable } from '@nestjs/common';
import { eq, sql } from 'drizzle-orm';
import { EventPublisher, newEvent } from '../../../kernel/cqrs/index.js';
import { TenantContext } from '../../../kernel/tenant/tenant-context.js';
import { assertLedgerMinutes, type LedgerWriteKind } from '../domain/ledger-rules.js';
import type {
  LedgerAdjustment,
  LedgerCredit,
  LedgerDebit,
  LedgerRefund,
  LedgerRestore,
  LedgerWriter,
  LedgerWriteResult,
} from './ledger-writer.js';
import { ledgerEntries } from './schema.js';

interface EntryLinks {
  lessonId?: string | null;
  paymentId?: string | null;
  refundId?: string | null;
  priceItemId?: string | null;
  note?: string | null;
  createdByMembershipId?: string | null;
}

export const LEDGER_AGGREGATE = 'student_ledger';

@Injectable()
export class PgLedgerWriter implements LedgerWriter {
  constructor(
    private readonly tenant: TenantContext,
    private readonly publisher: EventPublisher,
  ) {}

  async lockStudent(studentId: string): Promise<void> {
    await this.tenant.tx.execute(
      sql`select pg_advisory_xact_lock(hashtext('ledger'), hashtext(${studentId}::text))`,
    );
  }

  async balance(studentId: string): Promise<number> {
    return (await this.totals(studentId)).balance;
  }

  debit({ studentId, minutes, lessonId, note, createdByMembershipId }: LedgerDebit) {
    return this.write('debit', studentId, minutes, { lessonId, note, createdByMembershipId });
  }

  restore({ studentId, minutes, lessonId, createdByMembershipId }: LedgerRestore) {
    return this.write('restore', studentId, minutes, { lessonId, createdByMembershipId });
  }

  credit({ studentId, minutes, paymentId, priceItemId }: LedgerCredit) {
    return this.write('purchase', studentId, minutes, { paymentId, priceItemId });
  }

  adjust({ studentId, minutes, note, createdByMembershipId, lessonId }: LedgerAdjustment) {
    return this.write('adjustment', studentId, minutes, {
      note,
      createdByMembershipId,
      lessonId,
    });
  }

  refund({ studentId, minutes, refundId, paymentId, createdByMembershipId }: LedgerRefund) {
    return this.write('refund', studentId, minutes, {
      refundId,
      paymentId,
      createdByMembershipId,
    });
  }

  private async write(
    kind: LedgerWriteKind,
    studentId: string,
    minutes: number,
    links: EntryLinks,
  ): Promise<LedgerWriteResult> {
    assertLedgerMinutes(kind, minutes);
    const schoolId = this.tenant.schoolId;
    if (!schoolId) throw new Error('Ledger writes need a school scope');
    await this.lockStudent(studentId);
    const signed = kind === 'debit' || kind === 'refund' ? -minutes : minutes;
    const [row] = await this.tenant.tx
      .insert(ledgerEntries)
      .values({
        schoolId,
        studentId,
        entryType: kind,
        minutes: signed,
        lessonId: links.lessonId ?? null,
        paymentId: links.paymentId ?? null,
        refundId: links.refundId ?? null,
        priceItemId: links.priceItemId ?? null,
        note: links.note ?? null,
        createdByMembershipId: links.createdByMembershipId ?? null,
      })
      .returning({ id: ledgerEntries.id });
    if (!row) throw new Error('Ledger insert returned no row');
    const { balance, entries } = await this.totals(studentId);
    await this.publisher.append([
      newEvent(LedgerEntryRecorded, {
        aggregateType: LEDGER_AGGREGATE,
        aggregateId: studentId,
        aggregateVersion: entries,
        payload: {
          entryId: row.id,
          studentId,
          entryType: kind satisfies LedgerEntryType,
          minutes: signed,
          balanceAfter: balance,
          ...(links.lessonId ? { lessonId: links.lessonId } : {}),
          ...(links.paymentId ? { paymentId: links.paymentId } : {}),
          ...(links.refundId ? { refundId: links.refundId } : {}),
          ...(links.priceItemId ? { priceItemId: links.priceItemId } : {}),
        },
      }),
    ]);
    return { entryId: row.id, balanceAfter: balance };
  }

  private async totals(studentId: string): Promise<{ balance: number; entries: number }> {
    const [row] = await this.tenant.tx
      .select({
        balance: sql<number>`coalesce(sum(${ledgerEntries.minutes}), 0)::int`,
        entries: sql<number>`count(*)::int`,
      })
      .from(ledgerEntries)
      .where(eq(ledgerEntries.studentId, studentId));
    return { balance: Number(row?.balance ?? 0), entries: Number(row?.entries ?? 0) };
  }
}
