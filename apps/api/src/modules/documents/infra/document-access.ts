import { Inject, Injectable } from '@nestjs/common';
import type { Principal } from '../../../kernel/auth/principal.js';
import { QueryBus } from '../../../kernel/cqrs/index.js';
import {
  MembershipDirectory,
  type Permission,
  ROLE_PERMISSIONS,
  SUPPORT_READ_PERMISSIONS,
} from '../../identity/index.js';
import {
  GetStudentBookingProfileQuery,
  GetStudentByUserQuery,
  ListLinkedStudentIdsQuery,
  ListStudentIdsForInstructorQuery,
} from '../../training/index.js';
import { ListStudentIdsWithLessonsQuery } from '../../scheduling/index.js';
import { instructorLessonWindowStart, type StudentScope } from '../domain/document-access.js';

export interface DocumentViewer {
  scope: StudentScope;
  staff: boolean;
  ownStudentId: string | null;
}

@Injectable()
export class DocumentAccess {
  constructor(
    private readonly queryBus: QueryBus,
    @Inject(MembershipDirectory)
    private readonly directory: MembershipDirectory,
  ) {}

  async documents(actor: Principal): Promise<DocumentViewer> {
    if (await this.has(actor, 'documents.read')) {
      return { scope: 'all', staff: true, ownStudentId: null };
    }
    const roles = this.rolesOf(actor);
    const instructor =
      roles.includes('instructor') && actor.membershipId
        ? await this.instructorStudents(actor.membershipId)
        : null;
    const ownStudentId = roles.includes('student') ? await this.ownStudent(actor) : null;
    const linked = roles.includes('parent') ? await this.linked(actor) : [];
    return {
      scope: new Set([...(instructor ?? []), ...(ownStudentId ? [ownStudentId] : []), ...linked]),
      staff: instructor !== null,
      ownStudentId,
    };
  }

  async contracts(actor: Principal): Promise<StudentScope> {
    if ((await this.has(actor, 'contracts.manage')) || (await this.has(actor, 'documents.read'))) {
      return 'all';
    }
    const roles = this.rolesOf(actor);
    const own = roles.includes('student') ? await this.ownStudent(actor) : null;
    const linked = roles.includes('parent') ? await this.linked(actor) : [];
    return new Set([...(own ? [own] : []), ...linked]);
  }

  async studentExists(studentId: string): Promise<boolean> {
    return (await this.queryBus.execute(new GetStudentBookingProfileQuery(studentId))) !== null;
  }

  private async has(actor: Principal, permission: Permission): Promise<boolean> {
    if (actor.tokenType === 'support') return SUPPORT_READ_PERMISSIONS.has(permission);
    const byRole = actor.roles.some((role) =>
      (ROLE_PERMISSIONS as Readonly<Record<string, ReadonlySet<string>>>)[role]?.has(permission),
    );
    if (byRole || !actor.membershipId) return byRole;
    const membership = await this.directory.getMembership(actor.membershipId);
    return membership?.grants.includes(permission) ?? false;
  }

  private async instructorStudents(membershipId: string): Promise<string[]> {
    const assigned = await this.queryBus.execute(
      new ListStudentIdsForInstructorQuery(membershipId),
    );
    const taught = await this.queryBus.execute(
      new ListStudentIdsWithLessonsQuery(membershipId, instructorLessonWindowStart(new Date())),
    );
    return [...assigned, ...taught];
  }

  private rolesOf(actor: Principal): readonly string[] {
    return actor.tokenType === 'support' ? [] : actor.roles;
  }

  private async ownStudent(actor: Principal): Promise<string | null> {
    const student = await this.queryBus.execute(new GetStudentByUserQuery(actor.userId));
    return student?.studentId ?? null;
  }

  private linked(actor: Principal): Promise<string[]> {
    return this.queryBus.execute(new ListLinkedStudentIdsQuery(actor.userId));
  }
}
