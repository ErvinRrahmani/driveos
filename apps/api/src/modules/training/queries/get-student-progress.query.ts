import type { StudentProgressResponse } from '@driveos/shared';
import type { Principal } from '../../../kernel/auth/principal.js';
import { Query } from '../../../kernel/cqrs/index.js';

export class GetStudentProgressQuery extends Query<StudentProgressResponse> {
  constructor(
    readonly actor: Principal,
    readonly studentId: string,
  ) {
    super();
  }
}
