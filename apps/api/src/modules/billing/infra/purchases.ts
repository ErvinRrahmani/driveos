import { Inject, Injectable } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import { CommandBus } from '../../../kernel/cqrs/index.js';
import { TenantContext } from '../../../kernel/tenant/tenant-context.js';
import { GrantEntitlementCommand } from '../commands/grant-entitlement.command.js';
import { LEDGER_WRITER, type LedgerWriter } from './ledger-writer.js';
import { priceItems } from './schema.js';

export type PriceItemRow = typeof priceItems.$inferSelect;

export interface Delivery {
  studentId: string;
  paymentId: string;
  priceItem: Pick<PriceItemRow, 'id' | 'creditMinutes' | 'entitlementKind'>;
}

@Injectable()
export class Purchases {
  constructor(
    private readonly tenant: TenantContext,
    private readonly commandBus: CommandBus,
    @Inject(LEDGER_WRITER) private readonly ledger: LedgerWriter,
  ) {}

  async priceItem(id: string): Promise<PriceItemRow | null> {
    const [row] = await this.tenant.tx.select().from(priceItems).where(eq(priceItems.id, id));
    return row ?? null;
  }

  async deliver({ studentId, paymentId, priceItem }: Delivery): Promise<void> {
    if (priceItem.creditMinutes) {
      await this.ledger.credit({
        studentId,
        minutes: priceItem.creditMinutes,
        paymentId,
        priceItemId: priceItem.id,
      });
    }
    if (priceItem.entitlementKind) {
      await this.commandBus.execute(
        new GrantEntitlementCommand({ studentId, kind: priceItem.entitlementKind, paymentId }),
      );
    }
  }
}
