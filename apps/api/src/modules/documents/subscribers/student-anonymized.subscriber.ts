import { type EventPayload, StudentAnonymized } from '@driveos/shared';
import { Inject, Injectable } from '@nestjs/common';
import { eq, inArray } from 'drizzle-orm';
import { OBJECT_STORAGE, type ObjectStorage } from '../../../adapters/storage/object-storage.js';
import type { DomainEvent } from '../../../kernel/cqrs/index.js';
import { type EventHandler, EventSubscriber } from '../../../kernel/subscribers/index.js';
import { TenantContext } from '../../../kernel/tenant/tenant-context.js';
import { documents } from '../infra/schema.js';

type Payload = EventPayload<typeof StudentAnonymized>;

@Injectable()
@EventSubscriber({ name: 'documents.student-anonymized', events: [StudentAnonymized] })
export class StudentAnonymizedSubscriber implements EventHandler<Payload> {
  constructor(
    private readonly tenant: TenantContext,
    @Inject(OBJECT_STORAGE) private readonly storage: ObjectStorage,
  ) {}

  async handle(event: DomainEvent<Payload>): Promise<void> {
    const rows = await this.tenant.tx
      .select({ id: documents.id, storageKey: documents.storageKey })
      .from(documents)
      .where(eq(documents.ownerStudentId, event.payload.studentId))
      .for('update');
    if (rows.length === 0) return;
    await this.storage.delete(rows.map((row) => row.storageKey));
    await this.tenant.tx.delete(documents).where(
      inArray(
        documents.id,
        rows.map((row) => row.id),
      ),
    );
  }
}
