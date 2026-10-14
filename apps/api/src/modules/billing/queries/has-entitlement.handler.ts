import { type IQueryHandler, QueryHandler } from '../../../kernel/cqrs/index.js';
import { EntitlementReader } from '../infra/entitlement-records.js';
import { HasEntitlementQuery } from './has-entitlement.query.js';

@QueryHandler(HasEntitlementQuery)
export class HasEntitlementHandler implements IQueryHandler<HasEntitlementQuery, boolean> {
  constructor(private readonly reader: EntitlementReader) {}

  async execute({ studentId, kind }: HasEntitlementQuery): Promise<boolean> {
    return (await this.reader.active(studentId)).some((entitlement) => entitlement.kind === kind);
  }
}
