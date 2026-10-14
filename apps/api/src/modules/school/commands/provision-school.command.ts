import type { CreateSchoolRequest } from '@driveos/shared';
import { Command, type CommandResult } from '../../../kernel/cqrs/index.js';

export type SchoolProfile = Omit<CreateSchoolRequest, 'planId' | 'owner'>;

export class ProvisionSchoolCommand extends Command<CommandResult> {
  constructor(
    readonly schoolId: string,
    readonly profile: SchoolProfile,
    readonly planId: string,
  ) {
    super();
  }
}
