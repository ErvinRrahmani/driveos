import type { StudentResponse } from '@driveos/shared';
import type { Principal } from '../../../kernel/auth/principal.js';
import { Query } from '../../../kernel/cqrs/index.js';

export class GetStudentQuery extends Query<StudentResponse> {
  constructor(
    readonly actor: Principal,
    readonly studentId: string,
  ) {
    super();
  }
}
