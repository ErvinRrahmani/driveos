import { Inject, Injectable } from '@nestjs/common';
import { QueryBus } from '../../../kernel/cqrs/index.js';
import { MembershipDirectory } from '../../identity/index.js';
import { ListStudentNamesQuery } from '../../training/index.js';

@Injectable()
export class People {
  constructor(
    private readonly queryBus: QueryBus,
    @Inject(MembershipDirectory)
    private readonly directory: MembershipDirectory,
  ) {}

  async userNames(userIds: readonly string[]): Promise<Map<string, string>> {
    const unique = [...new Set(userIds)];
    if (unique.length === 0) return new Map();
    const contacts = await this.directory.contactsOf(unique);
    return new Map(contacts.map((contact) => [contact.userId, contact.fullName]));
  }

  async studentNames(studentIds: readonly string[]): Promise<Map<string, string>> {
    const unique = [...new Set(studentIds)];
    if (unique.length === 0) return new Map();
    const names = await this.queryBus.execute(new ListStudentNamesQuery(unique));
    return new Map(names.map((name) => [name.studentId, name.fullName]));
  }
}
