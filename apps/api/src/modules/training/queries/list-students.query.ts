import type { ListStudentsQuery as ListStudentsParams, StudentListResponse } from '@driveos/shared';
import type { Principal } from '../../../kernel/auth/principal.js';
import { Query } from '../../../kernel/cqrs/index.js';

export class ListStudentsQuery extends Query<StudentListResponse> {
  constructor(
    readonly actor: Principal,
    readonly params: ListStudentsParams,
  ) {
    super();
  }
}
