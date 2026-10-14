import type { Entitlement } from '@driveos/shared';
import { Query } from '../../../kernel/cqrs/index.js';

export class GetStudentEntitlementsQuery extends Query<Entitlement[]> {
  constructor(readonly studentId: string) {
    super();
  }
}
