import type { AuditLogListResponse } from '@driveos/shared';
import { Inject } from '@nestjs/common';
import { and, desc, eq, gte, lt, lte } from 'drizzle-orm';
import { type IQueryHandler, QueryHandler } from '../../../kernel/cqrs/index.js';
import { idCursor, pageOf } from '../../../kernel/http/paging.js';
import { TenantContext } from '../../../kernel/tenant/tenant-context.js';
import { MembershipDirectory } from '../../identity/index.js';
import { auditLog } from '../infra/schema.js';
import { ListAuditLogQuery } from './list-audit-log.query.js';

@QueryHandler(ListAuditLogQuery)
export class ListAuditLogHandler implements IQueryHandler<ListAuditLogQuery, AuditLogListResponse> {
  constructor(
    private readonly tenant: TenantContext,
    @Inject(MembershipDirectory)
    private readonly directory: MembershipDirectory,
  ) {}

  async execute({ params }: ListAuditLogQuery): Promise<AuditLogListResponse> {
    const cursor = idCursor(params.cursor);
    const rows = await this.tenant.tx
      .select()
      .from(auditLog)
      .where(
        and(
          cursor ? lt(auditLog.id, cursor) : undefined,
          params.from ? gte(auditLog.at, new Date(params.from)) : undefined,
          params.to ? lte(auditLog.at, new Date(params.to)) : undefined,
          params.action ? eq(auditLog.action, params.action) : undefined,
          params.supportSessionId
            ? eq(auditLog.supportSessionId, params.supportSessionId)
            : undefined,
        ),
      )
      .orderBy(desc(auditLog.id))
      .limit(params.limit + 1);
    const names = new Map(
      (await this.directory.listStaff()).map((member) => [member.userId, member.fullName]),
    );
    const items = rows.map((row) => ({
      id: row.id,
      schoolId: row.schoolId,
      actorUserId: row.actorUserId,
      actorName: names.get(row.actorUserId) ?? null,
      supportSessionId: row.supportSessionId,
      action: row.action,
      targetType: row.targetType,
      targetId: row.targetId,
      reason: row.reason,
      at: row.at.toISOString(),
    }));
    return pageOf(items, params.limit, (item) => item.id);
  }
}
