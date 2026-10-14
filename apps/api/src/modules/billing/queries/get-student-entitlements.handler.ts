import type { Entitlement } from '@driveos/shared';
import { type IQueryHandler, QueryHandler } from '../../../kernel/cqrs/index.js';
import { EntitlementReader } from '../infra/entitlement-records.js';
import { GetStudentEntitlementsQuery } from './get-student-entitlements.query.js';

@QueryHandler(GetStudentEntitlementsQuery)
export class GetStudentEntitlementsHandler implements IQueryHandler<
  GetStudentEntitlementsQuery,
  Entitlement[]
> {
  constructor(private readonly reader: EntitlementReader) {}

  execute({ studentId }: GetStudentEntitlementsQuery): Promise<Entitlement[]> {
    return this.reader.active(studentId);
  }
}
