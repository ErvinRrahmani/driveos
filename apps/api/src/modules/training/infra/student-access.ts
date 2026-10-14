import { Inject, Injectable } from '@nestjs/common';
import type { Principal } from '../../../kernel/auth/principal.js';
import { notFound } from '../../../kernel/http/errors.js';
import {
  MembershipDirectory,
  type Permission,
  ROLE_PERMISSIONS,
  SUPPORT_READ_PERMISSIONS,
} from '../../identity/index.js';
import {
  lessonWindowStart,
  type StudentScope,
  studentScope,
  visibleStudentIds,
} from '../domain/visibility.js';
import { Relations } from './relations.js';
import { SchedulingFacts } from './scheduling-facts.js';

const READ_ALL: Permission = 'students.read';

export interface StudentRead {
  staffRead: boolean;
}

@Injectable()
export class StudentAccess {
  constructor(
    private readonly relations: Relations,
    private readonly scheduling: SchedulingFacts,
    @Inject(MembershipDirectory)
    private readonly directory: MembershipDirectory,
  ) {}

  async visibleIds(actor: Principal): Promise<'all' | ReadonlySet<string>> {
    return this.idsFor(actor, await this.scopeOf(actor));
  }

  async require(actor: Principal, studentId: string): Promise<StudentRead> {
    const scope = await this.scopeOf(actor);
    const visible = await this.idsFor(actor, scope);
    if (visible !== 'all' && !visible.has(studentId)) throw notFound();
    return { staffRead: scope.all || scope.asInstructor };
  }

  async requireTeaching(actor: Principal, studentId: string): Promise<void> {
    const scope = await this.scopeOf(actor);
    if (scope.all) return;
    if (!scope.asInstructor) throw notFound();
    const visible = await this.idsFor(actor, { ...scope, asStudent: false, asParent: false });
    if (visible !== 'all' && !visible.has(studentId)) throw notFound();
  }

  private async scopeOf(actor: Principal): Promise<StudentScope> {
    return studentScope({
      readsAll: await this.readsAll(actor),
      roles: actor.tokenType === 'support' ? [] : actor.roles,
      membershipId: actor.membershipId,
    });
  }

  private async idsFor(
    actor: Principal,
    scope: StudentScope,
  ): Promise<'all' | ReadonlySet<string>> {
    if (scope.all) return 'all';
    const instructor = scope.asInstructor ? actor.membershipId : null;
    return visibleStudentIds(scope, {
      assigned: instructor ? await this.relations.assignedTo(instructor) : [],
      withLessons: instructor
        ? await this.scheduling.studentIdsWithLessons(instructor, lessonWindowStart(new Date()))
        : [],
      self: scope.asStudent ? await this.relations.ownedBy(actor.userId) : [],
      linked: scope.asParent ? await this.relations.consentedFor(actor.userId) : [],
    });
  }

  private async readsAll(actor: Principal): Promise<boolean> {
    if (actor.tokenType === 'support') return SUPPORT_READ_PERMISSIONS.has(READ_ALL);
    const byRole = actor.roles.some((role) =>
      (ROLE_PERMISSIONS as Readonly<Record<string, ReadonlySet<string>>>)[role]?.has(READ_ALL),
    );
    if (byRole || !actor.membershipId) return byRole;
    const membership = await this.directory.getMembership(actor.membershipId);
    return membership?.grants.includes(READ_ALL) ?? false;
  }
}
