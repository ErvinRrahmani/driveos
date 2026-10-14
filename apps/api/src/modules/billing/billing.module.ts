import { Module } from '@nestjs/common';
import { IdentityModule } from '../identity/identity.module.js';
import { PlatformModule } from '../platform/platform.module.js';
import { AdjustLedgerHandler } from './commands/adjust-ledger.handler.js';
import { CreatePriceItemHandler } from './commands/create-price-item.handler.js';
import { UpdatePriceItemHandler } from './commands/update-price-item.handler.js';
import { SchoolFacts } from './infra/school-facts.js';
import { StudentAccess } from './infra/student-access.js';
import { GetBalanceHandler } from './queries/get-balance.handler.js';
import { GetShopHandler } from './queries/get-shop.handler.js';
import { ListLedgerEntriesHandler } from './queries/list-ledger-entries.handler.js';
import { ListPriceItemsHandler } from './queries/list-price-items.handler.js';
import { ListPublicPriceItemsHandler } from './queries/list-public-price-items.handler.js';
import { ConsumeEntitlementHandler } from './commands/consume-entitlement.handler.js';
import { GrantEntitlementHandler } from './commands/grant-entitlement.handler.js';
import { HandlePaymentWebhookHandler } from './commands/handle-payment-webhook.handler.js';
import { IssueRefundHandler } from './commands/issue-refund.handler.js';
import { RecordCashPaymentHandler } from './commands/record-cash-payment.handler.js';
import { MarkStatementPaidHandler } from './commands/mark-statement-paid.handler.js';
import { StartCheckoutHandler } from './commands/start-checkout.handler.js';
import { InvoiceIssuer } from './infra/invoice-issuer.js';
import { PaymentWebhookFailures } from './infra/payment-webhook-failures.js';
import { Purchases } from './infra/purchases.js';
import { GetInvoicePdfHandler } from './queries/get-invoice-pdf.handler.js';
import { ListInvoicesHandler } from './queries/list-invoices.handler.js';
import { CheckoutController } from './http/checkout.controller.js';
import { InvoicesController } from './http/invoices.controller.js';
import { LedgerController } from './http/ledger.controller.js';
import { PaymentWebhooksController } from './http/payment-webhooks.controller.js';
import { PaymentsController } from './http/payments.controller.js';
import { PlatformStatementsController } from './http/platform-statements.controller.js';
import { PriceItemsController } from './http/price-items.controller.js';
import { RefundsController } from './http/refunds.controller.js';
import { ReleaseEntitlementHandler } from './commands/release-entitlement.handler.js';
import { ShopController } from './http/shop.controller.js';
import { StudentAccountsController } from './http/student-accounts.controller.js';
import { EntitlementReader } from './infra/entitlement-records.js';
import { LEDGER_WRITER } from './infra/ledger-writer.js';
import { PgLedgerWriter } from './infra/ledger-writer.impl.js';
import { StudentLookup } from './infra/student-lookup.js';
import { GetStudentEntitlementsHandler } from './queries/get-student-entitlements.handler.js';
import { HasEntitlementHandler } from './queries/has-entitlement.handler.js';
import { ListPlatformStatementsHandler } from './queries/list-platform-statements.handler.js';
import { ListSchoolPlatformStatementsHandler } from './queries/list-school-platform-statements.handler.js';

@Module({
  imports: [PlatformModule, IdentityModule],
  controllers: [
    PriceItemsController,
    ShopController,
    StudentAccountsController,
    CheckoutController,
    InvoicesController,
    RefundsController,
    PaymentsController,
    LedgerController,
    PaymentWebhooksController,
    PlatformStatementsController,
  ],
  providers: [
    PgLedgerWriter,
    { provide: LEDGER_WRITER, useExisting: PgLedgerWriter },
    StudentLookup,
    StudentAccess,
    SchoolFacts,
    EntitlementReader,
    CreatePriceItemHandler,
    UpdatePriceItemHandler,
    ListPriceItemsHandler,
    ListPublicPriceItemsHandler,
    GetShopHandler,
    GetBalanceHandler,
    ListLedgerEntriesHandler,
    AdjustLedgerHandler,
    GrantEntitlementHandler,
    ConsumeEntitlementHandler,
    ReleaseEntitlementHandler,
    GetStudentEntitlementsHandler,
    HasEntitlementHandler,
    MarkStatementPaidHandler,
    ListPlatformStatementsHandler,
    ListSchoolPlatformStatementsHandler,
    InvoiceIssuer,
    Purchases,
    PaymentWebhookFailures,
    StartCheckoutHandler,
    HandlePaymentWebhookHandler,
    RecordCashPaymentHandler,
    IssueRefundHandler,
    ListInvoicesHandler,
    GetInvoicePdfHandler,
  ],
  exports: [LEDGER_WRITER],
})
export class BillingModule {}
