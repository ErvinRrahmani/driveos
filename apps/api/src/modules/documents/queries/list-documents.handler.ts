import type { DocumentListResponse } from '@driveos/shared';
import { Inject } from '@nestjs/common';
import { and, desc, eq, inArray, lt, type SQL } from 'drizzle-orm';
import { type IQueryHandler, QueryHandler } from '../../../kernel/cqrs/index.js';
import { idCursor, pageOf } from '../../../kernel/http/paging.js';
import { notFound } from '../../../kernel/http/errors.js';
import { TenantContext } from '../../../kernel/tenant/tenant-context.js';
import { AUDIT_WRITER, type AuditWriter } from '../../platform/index.js';
import { canSeeDocument } from '../domain/document-access.js';
import { DocumentAccess } from '../infra/document-access.js';
import { toDocumentItem } from '../infra/document-views.js';
import { People } from '../infra/people.js';
import { documents } from '../infra/schema.js';
import { ListDocumentsQuery } from './list-documents.query.js';

@QueryHandler(ListDocumentsQuery)
export class ListDocumentsHandler implements IQueryHandler<
  ListDocumentsQuery,
  DocumentListResponse
> {
  constructor(
    private readonly tenant: TenantContext,
    private readonly access: DocumentAccess,
    private readonly people: People,
    @Inject(AUDIT_WRITER) private readonly audit: AuditWriter,
  ) {}

  async execute({ actor, params }: ListDocumentsQuery): Promise<DocumentListResponse> {
    const viewer = await this.access.documents(actor);
    if (params.ownerStudentId && !canSeeDocument(viewer.scope, params.ownerStudentId)) {
      throw notFound();
    }
    if (viewer.scope !== 'all' && viewer.scope.size === 0) return { items: [], nextCursor: null };
    const cursor = idCursor(params.cursor);
    const filters: (SQL | undefined)[] = [
      viewer.scope === 'all' ? undefined : inArray(documents.ownerStudentId, [...viewer.scope]),
      params.ownerStudentId ? eq(documents.ownerStudentId, params.ownerStudentId) : undefined,
      params.kind ? eq(documents.kind, params.kind) : undefined,
      params.status ? eq(documents.status, params.status) : undefined,
      cursor ? lt(documents.id, cursor) : undefined,
    ];
    const rows = await this.tenant.tx
      .select()
      .from(documents)
      .where(and(...filters))
      .orderBy(desc(documents.id))
      .limit(params.limit + 1);
    const page = pageOf(rows, params.limit, (row) => row.id);
    if (viewer.staff) {
      const students = new Set(page.items.flatMap((row) => row.ownerStudentId ?? []));
      for (const studentId of students) {
        await this.audit.record({
          action: 'student.documents.read',
          targetType: 'student',
          targetId: studentId,
        });
      }
    }
    const names = await this.people.userNames(page.items.map((row) => row.uploadedBy));
    return {
      items: page.items.map((row) => toDocumentItem(row, names.get(row.uploadedBy) ?? null)),
      nextCursor: page.nextCursor,
    };
  }
}
