import type { DocumentDownloadUrlResponse } from '@driveos/shared';
import { Inject } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import { OBJECT_STORAGE, type ObjectStorage } from '../../../adapters/storage/object-storage.js';
import { type IQueryHandler, QueryHandler } from '../../../kernel/cqrs/index.js';
import { notFound } from '../../../kernel/http/errors.js';
import { TenantContext } from '../../../kernel/tenant/tenant-context.js';
import { AUDIT_WRITER, type AuditWriter } from '../../platform/index.js';
import { canSeeDocument } from '../domain/document-access.js';
import { DocumentAccess } from '../infra/document-access.js';
import { documentNotReady } from '../infra/documents-errors.js';
import { documents } from '../infra/schema.js';
import { GetDocumentDownloadUrlQuery } from './get-document-download-url.query.js';

export const DOWNLOAD_URL_TTL_SECONDS = 5 * 60;

@QueryHandler(GetDocumentDownloadUrlQuery)
export class GetDocumentDownloadUrlHandler implements IQueryHandler<
  GetDocumentDownloadUrlQuery,
  DocumentDownloadUrlResponse
> {
  constructor(
    private readonly tenant: TenantContext,
    private readonly access: DocumentAccess,
    @Inject(OBJECT_STORAGE) private readonly storage: ObjectStorage,
    @Inject(AUDIT_WRITER) private readonly audit: AuditWriter,
  ) {}

  async execute({
    actor,
    documentId,
  }: GetDocumentDownloadUrlQuery): Promise<DocumentDownloadUrlResponse> {
    const [row] = await this.tenant.tx.select().from(documents).where(eq(documents.id, documentId));
    if (!row) throw notFound();
    const viewer = await this.access.documents(actor);
    if (!canSeeDocument(viewer.scope, row.ownerStudentId)) throw notFound();
    if (row.status !== 'ready') throw documentNotReady();
    if (viewer.staff) {
      await this.audit.record({
        action: 'document.download',
        targetType: 'document',
        targetId: row.id,
      });
    }
    const download = await this.storage.presignDownload({
      key: row.storageKey,
      expiresInSeconds: DOWNLOAD_URL_TTL_SECONDS,
    });
    return { url: download.url, expiresAt: download.expiresAt.toISOString() };
  }
}
