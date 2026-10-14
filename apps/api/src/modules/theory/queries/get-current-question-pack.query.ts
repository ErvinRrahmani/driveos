import type { CurrentQuestionPackQuery, QuestionPack } from '@driveos/shared';
import type { Principal } from '../../../kernel/auth/principal.js';
import { Query } from '../../../kernel/cqrs/index.js';

export class GetCurrentQuestionPackQuery extends Query<QuestionPack> {
  constructor(
    readonly actor: Principal,
    readonly params: CurrentQuestionPackQuery,
  ) {
    super();
  }
}
