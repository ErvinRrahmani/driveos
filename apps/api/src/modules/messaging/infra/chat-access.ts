import { Inject, Injectable } from '@nestjs/common';
import { and, eq, or, type SQL } from 'drizzle-orm';
import type { Principal } from '../../../kernel/auth/principal.js';
import { QueryBus } from '../../../kernel/cqrs/index.js';
import { notFound } from '../../../kernel/http/errors.js';
import { TenantContext } from '../../../kernel/tenant/tenant-context.js';
import { MembershipDirectory, ROLE_PERMISSIONS } from '../../identity/index.js';
import { GetStudentBookingProfileQuery, GetStudentByUserQuery } from '../../training/index.js';
import { type ChatAccess, type ChatViewer, chatAccess } from '../domain/chat.js';
import { forbidden } from './chat-errors.js';
import { conversations } from './schema.js';

export type ConversationRow = typeof conversations.$inferSelect;

export interface ChatActor {
  userId: string;
  membershipId: string;
  viewer: ChatViewer;
}

export interface ConversationAccess {
  row: ConversationRow;
  access: ChatAccess;
}

@Injectable()
export class ChatAccessService {
  constructor(
    private readonly tenant: TenantContext,
    private readonly queryBus: QueryBus,
    @Inject(MembershipDirectory)
    private readonly directory: MembershipDirectory,
  ) {}

  async actor(principal: Principal): Promise<ChatActor> {
    const membershipId = principal.membershipId;
    if (principal.tokenType !== 'access' || !membershipId) throw forbidden();
    const roles = principal.roles;
    const readAll = await this.canReadAll(roles, membershipId);
    const own = roles.includes('student')
      ? await this.queryBus.execute(new GetStudentByUserQuery(principal.userId))
      : null;
    return {
      userId: principal.userId,
      membershipId,
      viewer: {
        readAll,
        membershipId,
        instructor: roles.includes('instructor'),
        ownStudentId: own?.studentId ?? null,
      },
    };
  }

  visibleWhere(viewer: ChatViewer): SQL | undefined | null {
    if (viewer.readAll) return undefined;
    const conditions: SQL[] = [];
    if (viewer.ownStudentId) conditions.push(eq(conversations.studentId, viewer.ownStudentId));
    if (viewer.instructor && viewer.membershipId) {
      const own = and(
        eq(conversations.kind, 'student_instructor'),
        eq(conversations.instructorMembershipId, viewer.membershipId),
      );
      if (own) conditions.push(own);
    }
    return conditions.length === 0 ? null : or(...conditions);
  }

  async decide(
    viewer: ChatViewer,
    rows: readonly ConversationRow[],
  ): Promise<Map<string, ChatAccess>> {
    const profiles = new Map(
      await Promise.all(
        [...new Set(rows.map((row) => row.studentId))].map(
          async (studentId) =>
            [
              studentId,
              await this.queryBus.execute(new GetStudentBookingProfileQuery(studentId)),
            ] as const,
        ),
      ),
    );
    return new Map(
      rows.map((row) => {
        const profile = profiles.get(row.studentId) ?? null;
        return [
          row.id,
          chatAccess(viewer, {
            kind: row.kind,
            studentId: row.studentId,
            instructorMembershipId: row.instructorMembershipId,
            studentActive: profile?.status === 'active',
            instructorAssigned:
              row.instructorMembershipId !== null &&
              (profile?.allowedInstructorMembershipIds.includes(row.instructorMembershipId) ??
                false),
          }),
        ];
      }),
    );
  }

  private async canReadAll(roles: readonly string[], membershipId: string): Promise<boolean> {
    const byRole = roles.some((role) =>
      (ROLE_PERMISSIONS as Readonly<Record<string, ReadonlySet<string>>>)[role]?.has(
        'chat.read_all',
      ),
    );
    if (byRole) return true;
    const membership = await this.directory.getMembership(membershipId);
    return membership?.grants.includes('chat.read_all') ?? false;
  }

  async require(
    actor: ChatActor,
    conversationId: string,
    options: { lock?: boolean } = {},
  ): Promise<ConversationAccess> {
    const query = this.tenant.tx
      .select()
      .from(conversations)
      .where(eq(conversations.id, conversationId));
    const [row] = options.lock ? await query.for('update') : await query;
    if (!row) throw notFound();
    const access = (await this.decide(actor.viewer, [row])).get(row.id);
    if (!access?.canRead) throw notFound();
    return { row, access };
  }
}
