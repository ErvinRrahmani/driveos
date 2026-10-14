import { DocumentUploaded } from '@driveos/shared';
import { Inject } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import { OBJECT_STORAGE, type ObjectStorage } from '../../../adapters/storage/object-storage.js';
import {
  CommandHandler,
  type CommandResult,
  EventPublisher,
  type ICommandHandler,
  newEvent,
} from '../../../kernel/cqrs/index.js';
import { notFound } from '../../../kernel/http/errors.js';
import { TenantContext } from '../../../kernel/tenant/tenant-context.js';
import { canSeeDocument } from '../domain/document-access.js';
import { DocumentAccess } from '../infra/document-access.js';
import { uploadIncomplete } from '../infra/documents-errors.js';
import { documents } from '../infra/schema.js';
import { CompleteDocumentUploadCommand } from './complete-document-upload.command.js';

export const DOCUMENT_AGGREGATE = 'document';
const UPLOADED_VERSION = 1;

@CommandHandler(CompleteDocumentUploadCommand)
export class CompleteDocumentUploadHandler implements ICommandHandler<
  CompleteDocumentUploadCommand,
  CommandResult
> {
  constructor(
    private readonly tenant: TenantContext,
    private readonly access: DocumentAccess,
    private readonly publisher: EventPublisher,
    @Inject(OBJECT_STORAGE) private readonly storage: ObjectStorage,
  ) {}

  async execute({ actor, documentId }: CompleteDocumentUploadCommand): Promise<CommandResult> {
    const [row] = await this.tenant.tx
      .select()
      .from(documents)
      .where(eq(documents.id, documentId))
      .for('update');
    if (!row) throw notFound();
    if (row.uploadedBy !== actor.userId) {
      const viewer = await this.access.documents(actor);
      if (!viewer.staff || !canSeeDocument(viewer.scope, row.ownerStudentId)) throw notFound();
    }
    if (row.status === 'ready') return { id: row.id, version: UPLOADED_VERSION };
    const stored = await this.storage.head(row.storageKey);
    if (!stored || stored.sizeBytes !== row.sizeBytes) throw uploadIncomplete();
    if (stored.mime !== null && stored.mime !== row.mime) throw uploadIncomplete();
    await this.tenant.tx.update(documents).set({ status: 'ready' }).where(eq(documents.id, row.id));
    await this.publisher.append([
      newEvent(DocumentUploaded, {
        aggregateType: DOCUMENT_AGGREGATE,
        aggregateId: row.id,
        aggregateVersion: UPLOADED_VERSION,
        payload: {
          documentId: row.id,
          ownerStudentId: row.ownerStudentId,
          kind: row.kind,
          mime: row.mime,
          sizeBytes: row.sizeBytes,
          uploadedBy: row.uploadedBy,
        },
      }),
    ]);
    return { id: row.id, version: UPLOADED_VERSION };
  }
}
