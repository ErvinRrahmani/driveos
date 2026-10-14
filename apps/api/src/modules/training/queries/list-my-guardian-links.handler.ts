import type { GuardianLinkListResponse } from '@driveos/shared';
import { and, desc, eq, isNull, lt, ne } from 'drizzle-orm';
import { type IQueryHandler, QueryHandler } from '../../../kernel/cqrs/index.js';
import { idCursor, pageOf } from '../../../kernel/http/paging.js';
import { TenantContext } from '../../../kernel/tenant/tenant-context.js';
import { guardianLinkStatus } from '../domain/guardian-link-status.js';
import { isMinor, utcToday } from '../domain/minor.js';
import { MinorStatus } from '../infra/minor-status.js';
import { guardianLinks, students } from '../infra/schema.js';
import { ListMyGuardianLinksQuery } from './list-my-guardian-links.query.js';

@QueryHandler(ListMyGuardianLinksQuery)
export class ListMyGuardianLinksHandler implements IQueryHandler<
  ListMyGuardianLinksQuery,
  GuardianLinkListResponse
> {
  constructor(
    private readonly tenant: TenantContext,
    private readonly minors: MinorStatus,
  ) {}

  async execute({
    guardianUserId,
    params,
  }: ListMyGuardianLinksQuery): Promise<GuardianLinkListResponse> {
    const cursor = idCursor(params.cursor);
    const rows = await this.tenant.tx
      .select({
        id: guardianLinks.id,
        studentId: guardianLinks.studentId,
        studentName: students.fullName,
        dateOfBirth: students.dateOfBirth,
        consentAt: guardianLinks.consentAt,
        createdAt: guardianLinks.createdAt,
      })
      .from(guardianLinks)
      .innerJoin(students, eq(students.id, guardianLinks.studentId))
      .where(
        and(
          eq(guardianLinks.guardianUserId, guardianUserId),
          isNull(guardianLinks.revokedAt),
          ne(students.status, 'anonymized'),
          cursor ? lt(guardianLinks.id, cursor) : undefined,
        ),
      )
      .orderBy(desc(guardianLinks.id))
      .limit(params.limit + 1);
    const page = pageOf(rows, params.limit, (row) => row.id);
    const ageOfMajority = page.items.length > 0 ? await this.minors.ageOfMajority() : 0;
    const today = utcToday(new Date());
    return {
      items: page.items.map((row) => ({
        id: row.id,
        studentId: row.studentId,
        studentName: row.studentName,
        status: guardianLinkStatus({
          consentAt: row.consentAt,
          minor: isMinor(row.dateOfBirth, ageOfMajority, today),
        }),
        consentAt: row.consentAt?.toISOString() ?? null,
        createdAt: row.createdAt.toISOString(),
      })),
      nextCursor: page.nextCursor,
    };
  }
}
