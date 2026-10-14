import { Module } from '@nestjs/common';
import { IdentityWorkerModule } from '../identity/identity-worker.module.js';
import { IssuePlatformStatementHandler } from './commands/issue-platform-statement.handler.js';
import { LEDGER_WRITER } from './infra/ledger-writer.js';
import { PgLedgerWriter } from './infra/ledger-writer.impl.js';
import { MonthlyStatementsJob } from './infra/monthly-statements.job.js';
import { PaymentWebhookFailures } from './infra/payment-webhook-failures.js';
import { PlatformChargeRecords } from './infra/platform-charges.js';
import { WebhookFailuresAlert } from './infra/webhook-failures.alert.js';
import { StudentFeeReversalSubscriber } from './subscribers/student-archived.subscriber.js';
import { StudentFeeSubscriber } from './subscribers/student-enrolled.subscriber.js';

@Module({
  imports: [IdentityWorkerModule],
  providers: [
    PgLedgerWriter,
    { provide: LEDGER_WRITER, useExisting: PgLedgerWriter },
    PlatformChargeRecords,
    StudentFeeSubscriber,
    StudentFeeReversalSubscriber,
    IssuePlatformStatementHandler,
    MonthlyStatementsJob,
    PaymentWebhookFailures,
    WebhookFailuresAlert,
  ],
  exports: [LEDGER_WRITER],
})
export class BillingWorkerModule {}
