import type {
  ListTheoryMistakesQuery as ListTheoryMistakesParams,
  TheoryMistakeListResponse,
} from '@driveos/shared';
import type { Principal } from '../../../kernel/auth/principal.js';
import { Query } from '../../../kernel/cqrs/index.js';

export class ListTheoryMistakesQuery extends Query<TheoryMistakeListResponse> {
  constructor(
    readonly actor: Principal,
    readonly params: ListTheoryMistakesParams,
  ) {
    super();
  }
}
