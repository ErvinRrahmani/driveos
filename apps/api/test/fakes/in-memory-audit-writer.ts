import type { AuditRecord, AuditWriter } from '../../src/modules/platform/index.js';

export type RecordedAudit = Required<AuditRecord>;

export class InMemoryAuditWriter implements AuditWriter {
  readonly entries: RecordedAudit[] = [];

  async record(entry: AuditRecord): Promise<void> {
    this.entries.push({
      action: entry.action,
      targetType: entry.targetType,
      targetId: entry.targetId,
      reason: entry.reason ?? null,
    });
  }

  byAction(action: string): RecordedAudit[] {
    return this.entries.filter((entry) => entry.action === action);
  }

  clear(): void {
    this.entries.length = 0;
  }
}
