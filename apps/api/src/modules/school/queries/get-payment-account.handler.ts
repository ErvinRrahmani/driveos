import { asc } from 'drizzle-orm';
import { type IQueryHandler, QueryHandler } from '../../../kernel/cqrs/index.js';
import { TenantContext } from '../../../kernel/tenant/tenant-context.js';
import { schoolPaymentAccounts } from '../infra/schema.js';
import { GetPaymentAccountQuery, type SchoolPaymentAccount } from './get-payment-account.query.js';

@QueryHandler(GetPaymentAccountQuery)
export class GetPaymentAccountHandler implements IQueryHandler<
  GetPaymentAccountQuery,
  SchoolPaymentAccount | null
> {
  constructor(private readonly tenant: TenantContext) {}

  async execute(): Promise<SchoolPaymentAccount | null> {
    const [row] = await this.tenant.tx
      .select({
        id: schoolPaymentAccounts.id,
        provider: schoolPaymentAccounts.provider,
        accountRef: schoolPaymentAccounts.accountRef,
        status: schoolPaymentAccounts.status,
      })
      .from(schoolPaymentAccounts)
      .orderBy(asc(schoolPaymentAccounts.createdAt))
      .limit(1);
    return row ?? null;
  }
}
