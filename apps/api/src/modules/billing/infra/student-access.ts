import { Inject, Injectable } from '@nestjs/common';
import type { Principal } from '../../../kernel/auth/principal.js';
import { invalidField, notFound } from '../../../kernel/http/errors.js';
import {
  MembershipDirectory,
  type Permission,
  ROLE_PERMISSIONS,
  SUPPORT_READ_PERMISSIONS,
} from '../../identity/index.js';
import { StudentLookup } from './student-lookup.js';

const READ_ANY: Permission = 'balance.read';

@Injectable()
export class StudentAccess {
  constructor(
    private readonly students: StudentLookup,
    @Inject(MembershipDirectory)
    private readonly memberships: MembershipDirectory,
  ) {}

  async resolve(actor: Principal, requested: string | undefined): Promise<string> {
    if (await this.readsAnyStudent(actor)) {
      if (!requested) throw invalidField(['studentId'], 'Choose a student');
      if (!(await this.students.exists(requested))) throw notFound();
      return requested;
    }
    return this.ownStudent(actor, requested);
  }

  async ownStudent(actor: Principal, requested: string | undefined): Promise<string> {
    const own = await this.students.studentIdOfUser(actor.userId);
    const linked = actor.roles.includes('parent')
      ? await this.students.linkedStudentIds(actor.userId)
      : [];
    const candidates = [...new Set([...(own ? [own] : []), ...linked])];
    if (requested !== undefined) {
      if (!candidates.includes(requested)) throw notFound();
      return requested;
    }
    const [only, ...more] = candidates;
    if (!only) throw notFound();
    if (more.length > 0) throw invalidField(['studentId'], 'Choose a student');
    return only;
  }

  async readsAnyStudent(actor: Principal, permission: Permission = READ_ANY): Promise<boolean> {
    if (actor.tokenType === 'support') return SUPPORT_READ_PERMISSIONS.has(permission);
    const byRole = actor.roles.some((role) =>
      (ROLE_PERMISSIONS as Readonly<Record<string, ReadonlySet<string>>>)[role]?.has(permission),
    );
    if (byRole || !actor.membershipId) return byRole;
    const membership = await this.memberships.getMembership(actor.membershipId);
    return membership?.grants.includes(permission) ?? false;
  }
}
