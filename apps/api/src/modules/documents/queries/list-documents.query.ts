import type {
  DocumentListResponse,
  ListDocumentsQuery as ListDocumentsParams,
} from '@driveos/shared';
import type { Principal } from '../../../kernel/auth/principal.js';
import { Query } from '../../../kernel/cqrs/index.js';

export class ListDocumentsQuery extends Query<DocumentListResponse> {
  constructor(
    readonly actor: Principal,
    readonly params: ListDocumentsParams,
  ) {
    super();
  }
}
