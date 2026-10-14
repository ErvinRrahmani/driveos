import type { SchoolResponse } from '@driveos/shared';
import { eq } from 'drizzle-orm';
import { type IQueryHandler, QueryHandler } from '../../../kernel/cqrs/index.js';
import { notFound } from '../../../kernel/http/errors.js';
import { TenantContext } from '../../../kernel/tenant/tenant-context.js';
import { SchoolRecords } from '../infra/school-records.js';
import { schoolPaymentAccounts, schools } from '../infra/schema.js';
import { GetSchoolQuery } from './get-school.query.js';

@QueryHandler(GetSchoolQuery)
export class GetSchoolHandler implements IQueryHandler<GetSchoolQuery, SchoolResponse> {
  constructor(
    private readonly tenant: TenantContext,
    private readonly records: SchoolRecords,
  ) {}

  async execute(): Promise<SchoolResponse> {
    const [school] = await this.tenant.tx
      .select()
      .from(schools)
      .where(eq(schools.id, this.records.schoolId));
    if (!school) throw notFound();
    const [account] = await this.tenant.tx
      .select({
        id: schoolPaymentAccounts.id,
        provider: schoolPaymentAccounts.provider,
        status: schoolPaymentAccounts.status,
      })
      .from(schoolPaymentAccounts)
      .orderBy(schoolPaymentAccounts.createdAt)
      .limit(1);
    return {
      id: school.id,
      name: school.name,
      legalName: school.legalName,
      taxId: school.taxId,
      address: school.address,
      countryCode: school.countryCode,
      timeZone: school.timeZone,
      currency: school.currency,
      locale: school.locale,
      status: school.status,
      paymentAccount: account ?? null,
    };
  }
}
