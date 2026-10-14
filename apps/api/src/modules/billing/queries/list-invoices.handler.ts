import type { InvoiceListResponse } from '@driveos/shared';
import { Inject } from '@nestjs/common';
import { and, asc, desc, eq, gte, inArray, lt, ne, type SQL, sql } from 'drizzle-orm';
import { INVOICE_POLICY, type InvoicePolicy } from '../../../adapters/invoices/invoice-policy.js';
import { type IQueryHandler, QueryHandler } from '../../../kernel/cqrs/index.js';
import { idCursor, pageOf } from '../../../kernel/http/paging.js';
import { TenantContext } from '../../../kernel/tenant/tenant-context.js';
import { type InvoicePayment, toInvoice } from '../infra/invoice-records.js';
import { invoiceLines, invoices, payments, refunds } from '../infra/schema.js';
import { StudentAccess } from '../infra/student-access.js';
import { ListInvoicesQuery } from './list-invoices.query.js';

@QueryHandler(ListInvoicesQuery)
export class ListInvoicesHandler implements IQueryHandler<ListInvoicesQuery, InvoiceListResponse> {
  constructor(
    private readonly tenant: TenantContext,
    private readonly access: StudentAccess,
    @Inject(INVOICE_POLICY) private readonly policy: InvoicePolicy,
  ) {}

  async execute({ actor, params }: ListInvoicesQuery): Promise<InvoiceListResponse> {
    const studentId = (await this.access.readsAnyStudent(actor, 'invoices.read'))
      ? params.studentId
      : await this.access.ownStudent(actor, params.studentId);
    const cursor = idCursor(params.cursor);
    const filters: (SQL | undefined)[] = [
      studentId ? eq(invoices.studentId, studentId) : undefined,
      params.kind ? eq(invoices.kind, params.kind) : undefined,
      params.status ? eq(invoices.status, params.status) : undefined,
      params.from ? gte(invoices.issuedAt, new Date(params.from)) : undefined,
      params.to ? lt(invoices.issuedAt, new Date(params.to)) : undefined,
      cursor ? lt(invoices.id, cursor) : undefined,
    ];
    const rows = await this.tenant.tx
      .select()
      .from(invoices)
      .where(and(...filters))
      .orderBy(desc(invoices.id))
      .limit(params.limit + 1);
    const page = pageOf(rows, params.limit, (row) => row.id);
    const lines =
      page.items.length === 0
        ? []
        : await this.tenant.tx
            .select()
            .from(invoiceLines)
            .where(
              inArray(
                invoiceLines.invoiceId,
                page.items.map((row) => row.id),
              ),
            )
            .orderBy(asc(invoiceLines.id));
    const paymentsOf = await this.paymentsOf(page.items.map((row) => row.id));
    return {
      items: page.items.map((row) =>
        toInvoice(
          row,
          lines.filter((line) => line.invoiceId === row.id),
          this.policy,
          paymentsOf.get(row.id) ?? { paymentId: null, refundedMinor: 0 },
        ),
      ),
      nextCursor: page.nextCursor,
    };
  }

  private async paymentsOf(invoiceIds: string[]): Promise<Map<string, InvoicePayment>> {
    if (invoiceIds.length === 0) return new Map();
    const paid = await this.tenant.tx
      .select({ invoiceId: payments.invoiceId, paymentId: payments.id })
      .from(payments)
      .where(inArray(payments.invoiceId, invoiceIds))
      .orderBy(asc(payments.id));
    const credited = await this.tenant.tx
      .select({ invoiceId: refunds.creditNoteId, paymentId: refunds.paymentId })
      .from(refunds)
      .where(inArray(refunds.creditNoteId, invoiceIds));
    const paymentByInvoice = new Map<string, string>();
    for (const row of [...paid, ...credited]) {
      if (row.invoiceId && !paymentByInvoice.has(row.invoiceId)) {
        paymentByInvoice.set(row.invoiceId, row.paymentId);
      }
    }
    const paymentIds = [...new Set(paymentByInvoice.values())];
    const totals =
      paymentIds.length === 0
        ? []
        : await this.tenant.tx
            .select({
              paymentId: refunds.paymentId,
              total: sql<string>`coalesce(sum(${refunds.amountMinor}), 0)`,
            })
            .from(refunds)
            .where(and(inArray(refunds.paymentId, paymentIds), ne(refunds.status, 'failed')))
            .groupBy(refunds.paymentId);
    const refunded = new Map(totals.map((row) => [row.paymentId, Number(row.total)]));
    return new Map(
      [...paymentByInvoice].map(([invoiceId, paymentId]) => [
        invoiceId,
        { paymentId, refundedMinor: refunded.get(paymentId) ?? 0 },
      ]),
    );
  }
}
