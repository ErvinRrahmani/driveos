import type { PrivateNoteListResponse } from '@driveos/shared';
import { Inject } from '@nestjs/common';
import { asc, eq } from 'drizzle-orm';
import { type IQueryHandler, QueryHandler } from '../../../kernel/cqrs/index.js';
import { notFound } from '../../../kernel/http/errors.js';
import { TenantContext } from '../../../kernel/tenant/tenant-context.js';
import { AUDIT_WRITER, type AuditWriter } from '../../platform/index.js';
import { People } from '../infra/people.js';
import { privateNotes } from '../infra/schema.js';
import { StudentAccess } from '../infra/student-access.js';
import { StudentRecords } from '../infra/student-records.js';
import { ListPrivateNotesQuery } from './list-private-notes.query.js';

@QueryHandler(ListPrivateNotesQuery)
export class ListPrivateNotesHandler implements IQueryHandler<
  ListPrivateNotesQuery,
  PrivateNoteListResponse
> {
  constructor(
    private readonly tenant: TenantContext,
    private readonly access: StudentAccess,
    private readonly records: StudentRecords,
    private readonly people: People,
    @Inject(AUDIT_WRITER) private readonly audit: AuditWriter,
  ) {}

  async execute({ actor, studentId }: ListPrivateNotesQuery): Promise<PrivateNoteListResponse> {
    await this.access.requireTeaching(actor, studentId);
    if (!(await this.records.find(studentId))) throw notFound();
    const rows = await this.tenant.tx
      .select()
      .from(privateNotes)
      .where(eq(privateNotes.studentId, studentId))
      .orderBy(asc(privateNotes.createdAt), asc(privateNotes.id));
    await this.audit.record({
      action: 'private_notes.read',
      targetType: 'student',
      targetId: studentId,
    });
    const names = await this.people.staffNames();
    return {
      items: rows.map((row) => ({
        id: row.id,
        lessonId: row.lessonId,
        authorMembershipId: row.authorMembershipId,
        authorName: names.get(row.authorMembershipId) ?? '',
        body: row.body,
        version: row.version,
        createdAt: row.createdAt.toISOString(),
        updatedAt: row.updatedAt.toISOString(),
      })),
    };
  }
}
