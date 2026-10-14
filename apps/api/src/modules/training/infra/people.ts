import { Inject, Injectable } from '@nestjs/common';
import { MembershipDirectory, type UserContact } from '../../identity/index.js';

@Injectable()
export class People {
  constructor(
    @Inject(MembershipDirectory)
    private readonly directory: MembershipDirectory,
  ) {}

  async staffNames(): Promise<Map<string, string>> {
    const staff = await this.directory.listStaff();
    return new Map(staff.map((member) => [member.membershipId, member.fullName]));
  }

  async contacts(userIds: readonly (string | null)[]): Promise<Map<string, UserContact>> {
    const ids = [...new Set(userIds.filter((id): id is string => id !== null))];
    const contacts = await this.directory.contactsOf(ids);
    return new Map(contacts.map((contact) => [contact.userId, contact]));
  }

  isInstructor(membershipId: string): Promise<boolean> {
    return this.directory.hasRole(membershipId, 'instructor');
  }
}
