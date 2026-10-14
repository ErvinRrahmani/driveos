import type { SyllabusQuery, SyllabusResponse } from '@driveos/shared';
import { Query } from '../../../kernel/cqrs/index.js';

export class GetSyllabusQuery extends Query<SyllabusResponse> {
  constructor(readonly params: SyllabusQuery) {
    super();
  }
}
