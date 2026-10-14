import { describe, expect, it } from 'vitest';
import type { AuditWriter } from '../../src/modules/platform/index.js';
import { InMemoryAuditWriter } from './in-memory-audit-writer.js';

const targetId = '0192f000-0007-7000-8000-000000000001';

describe('InMemoryAuditWriter', () => {
  it('implements AuditWriter and records entries in order', async () => {
    const fake = new InMemoryAuditWriter();
    const writer: AuditWriter = fake;
    await writer.record({ action: 'students.read', targetType: 'student', targetId });
    await writer.record({
      action: 'ledger.adjust',
      targetType: 'student',
      targetId,
      reason: 'Late cancellation waived',
    });
    expect(fake.entries).toEqual([
      { action: 'students.read', targetType: 'student', targetId, reason: null },
      {
        action: 'ledger.adjust',
        targetType: 'student',
        targetId,
        reason: 'Late cancellation waived',
      },
    ]);
  });

  it('finds entries by action and can be cleared', async () => {
    const fake = new InMemoryAuditWriter();
    await fake.record({ action: 'documents.download', targetType: 'document', targetId });
    await fake.record({ action: 'students.read', targetType: 'student', targetId });
    expect(fake.byAction('students.read')).toHaveLength(1);
    fake.clear();
    expect(fake.entries).toEqual([]);
  });

  it('keeps a snapshot so later changes to the input do not alter the record', async () => {
    const fake = new InMemoryAuditWriter();
    const entry = { action: 'students.read', targetType: 'student', targetId, reason: 'x' };
    await fake.record(entry);
    entry.reason = 'changed';
    expect(fake.entries[0]?.reason).toBe('x');
  });
});
