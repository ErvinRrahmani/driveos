import type { Lead } from '@driveos/shared';
import { Query } from '../../../kernel/cqrs/index.js';

/** One lead of the current school; 404 when it does not exist here. */
export class GetLeadQuery extends Query<Lead> {
  constructor(readonly id: string) {
    super();
  }
}
