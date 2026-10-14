import type { ShopResponse } from '@driveos/shared';
import { Inject } from '@nestjs/common';
import { asc, eq } from 'drizzle-orm';
import { type IQueryHandler, QueryHandler } from '../../../kernel/cqrs/index.js';
import { TenantContext } from '../../../kernel/tenant/tenant-context.js';
import { EntitlementReader } from '../infra/entitlement-records.js';
import { LEDGER_WRITER, type LedgerWriter } from '../infra/ledger-writer.js';
import { SchoolFacts } from '../infra/school-facts.js';
import { priceItems } from '../infra/schema.js';
import { StudentAccess } from '../infra/student-access.js';
import { GetShopQuery } from './get-shop.query.js';

@QueryHandler(GetShopQuery)
export class GetShopHandler implements IQueryHandler<GetShopQuery, ShopResponse> {
  constructor(
    private readonly tenant: TenantContext,
    private readonly access: StudentAccess,
    private readonly entitlements: EntitlementReader,
    private readonly school: SchoolFacts,
    @Inject(LEDGER_WRITER) private readonly ledger: LedgerWriter,
  ) {}

  async execute({ actor, params }: GetShopQuery): Promise<ShopResponse> {
    const studentId = await this.access.resolve(actor, params.studentId);
    const items = await this.tenant.tx
      .select()
      .from(priceItems)
      .where(eq(priceItems.active, true))
      .orderBy(asc(priceItems.sortOrder), asc(priceItems.id));
    const owned = new Set(
      (await this.entitlements.active(studentId)).map((entitlement) => entitlement.kind),
    );
    return {
      studentId,
      checkoutEnabled: await this.school.checkoutEnabled(),
      balanceMinutes: await this.ledger.balance(studentId),
      items: items.map((item) => ({
        id: item.id,
        name: item.name,
        kind: item.kind,
        creditMinutes: item.creditMinutes,
        entitlementKind: item.entitlementKind,
        amountMinor: item.amountMinor,
        currency: item.currency,
        owned: item.entitlementKind !== null && owned.has(item.entitlementKind),
      })),
    };
  }
}
