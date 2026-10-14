import { Injectable } from '@nestjs/common';
import { eq, getTableColumns } from 'drizzle-orm';
import type { Principal } from '../../../kernel/auth/principal.js';
import { notFound } from '../../../kernel/http/errors.js';
import { TenantContext } from '../../../kernel/tenant/tenant-context.js';
import type { Permission } from '../../identity/index.js';
import type { ActingRole } from '../domain/cancellation.js';
import { forbidden, SchedulingAccess } from './access.js';
import type { CalendarRow } from './lesson-records.js';
import { lessons, lessonTypes } from './schema.js';
import { ViewerScope } from './viewer-scope.js';

export type LockedLesson = CalendarRow & { requiresEntitlement: string | null };

export interface LessonActor {
  role: ActingRole;
  scope: 'staff' | 'instructor' | 'own';
}

function staffRole(actor: Principal): ActingRole {
  if (actor.roles.includes('owner')) return 'owner';
  if (actor.roles.includes('office')) return 'office';
  return actor.roles.includes('instructor') ? 'instructor' : 'office';
}

@Injectable()
export class LessonActors {
  constructor(
    private readonly tenant: TenantContext,
    private readonly access: SchedulingAccess,
    private readonly viewer: ViewerScope,
  ) {}

  async lock(id: string): Promise<LockedLesson> {
    const [row] = await this.tenant.tx
      .select({
        ...getTableColumns(lessons),
        lessonTypeName: lessonTypes.name,
        lessonTypeKind: lessonTypes.kind,
        requiresEntitlement: lessonTypes.requiresEntitlement,
      })
      .from(lessons)
      .innerJoin(lessonTypes, eq(lessonTypes.id, lessons.lessonTypeId))
      .where(eq(lessons.id, id))
      .for('update', { of: lessons });
    if (!row) throw notFound();
    return row;
  }

  async resolve(
    actor: Principal,
    lesson: LockedLesson,
    staffPermission: Permission,
  ): Promise<LessonActor> {
    if (await this.access.holdsAny(actor, [staffPermission])) {
      return { role: staffRole(actor), scope: 'staff' };
    }
    if (
      actor.roles.includes('instructor') &&
      actor.membershipId === lesson.instructorMembershipId
    ) {
      return { role: 'instructor', scope: 'instructor' };
    }
    const relation = await this.viewer.relationTo(actor, lesson.studentId);
    if (relation) return { role: relation, scope: 'own' };
    throw (await this.access.holdsAny(actor, ['calendar.read'])) ? forbidden() : notFound();
  }
}
