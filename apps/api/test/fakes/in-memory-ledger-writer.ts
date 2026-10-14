import type { LedgerEntryType } from '@driveos/shared';
import { newId } from '../../src/kernel/db/columns.js';
import { ConflictError } from '../../src/kernel/http/errors.js';
import type {
  LedgerAdjustment,
  LedgerCredit,
  LedgerDebit,
  LedgerRefund,
  LedgerRestore,
  LedgerWriter,
  LedgerWriteResult,
} from '../../src/modules/billing/index.js';

export interface InMemoryLedgerEntry {
  id: string;
  studentId: string;
  entryType: LedgerEntryType;
  minutes: number;
  balanceAfter: number;
  lessonId: string | null;
  paymentId: string | null;
  refundId: string | null;
  priceItemId: string | null;
  note: string | null;
  createdByMembershipId: string | null;
}

export interface LedgerWriterCall {
  method: keyof LedgerWriter;
  input: unknown;
}

export interface InMemoryLedgerWriterOptions {
  allowNegative?: boolean;
  balances?: Readonly<Record<string, number>>;
}

type EntryFields = Pick<InMemoryLedgerEntry, 'studentId' | 'entryType' | 'minutes'> &
  Partial<Omit<InMemoryLedgerEntry, 'id' | 'balanceAfter'>>;

export class InMemoryLedgerWriter implements LedgerWriter {
  readonly entries: InMemoryLedgerEntry[] = [];
  readonly calls: LedgerWriterCall[] = [];
  readonly lockedStudents: string[] = [];
  private readonly balances = new Map<string, number>();
  private readonly allowNegative: boolean;

  constructor(options: InMemoryLedgerWriterOptions = {}) {
    this.allowNegative = options.allowNegative ?? false;
    for (const [studentId, minutes] of Object.entries(options.balances ?? {})) {
      this.balances.set(studentId, minutes);
    }
  }

  async lockStudent(studentId: string): Promise<void> {
    this.calls.push({ method: 'lockStudent', input: { studentId } });
    if (!this.lockedStudents.includes(studentId)) this.lockedStudents.push(studentId);
  }

  async balance(studentId: string): Promise<number> {
    this.calls.push({ method: 'balance', input: { studentId } });
    return this.balances.get(studentId) ?? 0;
  }

  async debit(input: LedgerDebit): Promise<LedgerWriteResult> {
    this.calls.push({ method: 'debit', input });
    requirePositive(input.minutes);
    return this.append({
      studentId: input.studentId,
      entryType: 'debit',
      minutes: -input.minutes,
      lessonId: input.lessonId,
      note: input.note ?? null,
      createdByMembershipId: input.createdByMembershipId ?? null,
    });
  }

  async restore(input: LedgerRestore): Promise<LedgerWriteResult> {
    this.calls.push({ method: 'restore', input });
    requirePositive(input.minutes);
    return this.append({
      studentId: input.studentId,
      entryType: 'restore',
      minutes: input.minutes,
      lessonId: input.lessonId,
      createdByMembershipId: input.createdByMembershipId ?? null,
    });
  }

  async credit(input: LedgerCredit): Promise<LedgerWriteResult> {
    this.calls.push({ method: 'credit', input });
    requirePositive(input.minutes);
    return this.append({
      studentId: input.studentId,
      entryType: 'purchase',
      minutes: input.minutes,
      paymentId: input.paymentId,
      priceItemId: input.priceItemId,
    });
  }

  async adjust(input: LedgerAdjustment): Promise<LedgerWriteResult> {
    this.calls.push({ method: 'adjust', input });
    if (!Number.isInteger(input.minutes) || input.minutes === 0) {
      throw new RangeError('An adjustment needs a non-zero whole number of minutes');
    }
    return this.append({
      studentId: input.studentId,
      entryType: 'adjustment',
      minutes: input.minutes,
      note: input.note,
      createdByMembershipId: input.createdByMembershipId,
    });
  }

  async refund(input: LedgerRefund): Promise<LedgerWriteResult> {
    this.calls.push({ method: 'refund', input });
    requirePositive(input.minutes);
    return this.append({
      studentId: input.studentId,
      entryType: 'refund',
      minutes: -input.minutes,
      refundId: input.refundId,
      paymentId: input.paymentId ?? null,
      createdByMembershipId: input.createdByMembershipId ?? null,
    });
  }

  private append(fields: EntryFields): LedgerWriteResult {
    const balanceAfter = (this.balances.get(fields.studentId) ?? 0) + fields.minutes;
    if (balanceAfter < 0 && !this.allowNegative) {
      throw new ConflictError('insufficient_balance', 'Insufficient balance', {
        studentId: fields.studentId,
        balanceAfter,
      });
    }
    const entry: InMemoryLedgerEntry = {
      id: newId(),
      lessonId: null,
      paymentId: null,
      refundId: null,
      priceItemId: null,
      note: null,
      createdByMembershipId: null,
      ...fields,
      balanceAfter,
    };
    this.balances.set(fields.studentId, balanceAfter);
    this.entries.push(entry);
    return { entryId: entry.id, balanceAfter };
  }
}

function requirePositive(minutes: number): void {
  if (!Number.isInteger(minutes) || minutes <= 0) {
    throw new RangeError('minutes must be a positive whole number');
  }
}
