import type { DocumentDownloadUrlResponse } from '@driveos/shared';
import type { Principal } from '../../../kernel/auth/principal.js';
import { Query } from '../../../kernel/cqrs/index.js';

export class GetDocumentDownloadUrlQuery extends Query<DocumentDownloadUrlResponse> {
  constructor(
    readonly actor: Principal,
    readonly documentId: string,
  ) {
    super();
  }
}
