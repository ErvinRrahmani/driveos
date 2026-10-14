import { Inject, Injectable } from '@nestjs/common';
import type { Principal } from '../../../kernel/auth/principal.js';
import { QueryBus } from '../../../kernel/cqrs/index.js';
import { MembershipDirectory } from '../../identity/index.js';
import {
  GetStudentBookingProfileQuery,
  GetStudentByUserQuery,
  ListLinkedStudentIdsQuery,
  type StudentBookingProfile,
} from '../../training/index.js';

@Injectable()
export class ViewerScope {
  constructor(
    private readonly queryBus: QueryBus,
    @Inject(MembershipDirectory)
    private readonly directory: MembershipDirectory,
  ) {}

  async ownStudentIds(actor: Principal): Promise<string[]> {
    return (await this.ownProfiles(actor)).map((profile) => profile.studentId);
  }

  async relationTo(actor: Principal, studentId: string): Promise<'student' | 'parent' | null> {
    const profile = (await this.ownProfiles(actor)).find((own) => own.studentId === studentId);
    if (!profile) return null;
    return profile.userId === actor.userId ? 'student' : 'parent';
  }

  async activeInstructorIds(): Promise<string[]> {
    const instructors = await this.directory.listByRole('instructor');
    return instructors.filter((member) => member.status === 'active').map((member) => member.id);
  }

  async bookableInstructorIds(actor: Principal): Promise<string[]> {
    const active = await this.activeInstructorIds();
    const allowed = new Set<string>();
    if (actor.roles.includes('instructor') && actor.membershipId) allowed.add(actor.membershipId);
    for (const profile of await this.ownProfiles(actor)) {
      const ids =
        profile.allowedInstructorMembershipIds.length > 0
          ? profile.allowedInstructorMembershipIds
          : active;
      for (const id of ids) allowed.add(id);
    }
    return active.filter((id) => allowed.has(id));
  }

  private async ownProfiles(actor: Principal): Promise<StudentBookingProfile[]> {
    const profiles: StudentBookingProfile[] = [];
    if (actor.roles.includes('student')) {
      const own = await this.queryBus.execute(new GetStudentByUserQuery(actor.userId));
      if (own) profiles.push(own);
    }
    if (actor.roles.includes('parent')) {
      const linked = await this.queryBus.execute(new ListLinkedStudentIdsQuery(actor.userId));
      for (const studentId of linked) {
        const profile = await this.queryBus.execute(new GetStudentBookingProfileQuery(studentId));
        if (profile) profiles.push(profile);
      }
    }
    return profiles;
  }
}
