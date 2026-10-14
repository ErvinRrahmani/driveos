import type {
  AuditLogListResponse,
  ListAuditLogQuery as ListAuditLogParams,
} from '@driveos/shared';
import { Query } from '../../../kernel/cqrs/index.js';

export class ListAuditLogQuery extends Query<AuditLogListResponse> {
  constructor(readonly params: ListAuditLogParams) {
    super();
  }
}
