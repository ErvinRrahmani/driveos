import type { CreateSchoolRequest, CreateSchoolResponse } from '@driveos/shared';
import type { Principal } from '../../../kernel/auth/principal.js';
import { Command } from '../../../kernel/cqrs/index.js';

export type CreatedSchool = Required<Pick<CreateSchoolResponse, 'acceptToken'>> &
  CreateSchoolResponse;

export class CreateSchoolCommand extends Command<CreatedSchool> {
  constructor(
    readonly actor: Principal,
    readonly body: CreateSchoolRequest,
  ) {
    super();
  }
}
