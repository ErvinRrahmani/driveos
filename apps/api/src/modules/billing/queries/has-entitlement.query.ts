import type { EntitlementKind } from '@driveos/shared';
import { Query } from '../../../kernel/cqrs/index.js';

export class HasEntitlementQuery extends Query<boolean> {
  constructor(
    readonly studentId: string,
    readonly kind: EntitlementKind,
  ) {
    super();
  }
}
