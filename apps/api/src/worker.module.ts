// Must stay the first import: it evaluates MembershipDirectory before the identity/index <-> school
// import cycle (entered by billing's and platform's imports) needs it under native ESM.
import { IdentityWorkerModule } from './modules/identity/identity-worker.module.js';
import { type DynamicModule, Module } from '@nestjs/common';
import { AlertsModule } from './kernel/alerts/alerts.module.js';
import { KernelCqrsModule } from './kernel/cqrs/kernel-cqrs.module.js';
import { AppConfigModule, type AppConfigOptions } from './kernel/config/config.module.js';
import { DatabaseModule } from './kernel/db/database.module.js';
import { LoggingModule } from './kernel/logging/logging.module.js';
import { TenantModule } from './kernel/tenant/tenant.module.js';
import { WorkerKernelModule } from './kernel/worker/worker-kernel.module.js';
import { WorkerLifecycle } from './kernel/worker/worker-lifecycle.js';
import { BillingWorkerModule } from './modules/billing/billing-worker.module.js';
import { DocumentsWorkerModule } from './modules/documents/documents-worker.module.js';
import { MessagingWorkerModule } from './modules/messaging/messaging-worker.module.js';
import { PlatformWorkerModule } from './modules/platform/platform-worker.module.js';
import { ReportingWorkerModule } from './modules/reporting/reporting-worker.module.js';
import { SchedulingWorkerModule } from './modules/scheduling/scheduling-worker.module.js';
import { SchoolWorkerModule } from './modules/school/school-worker.module.js';
import { TrainingWorkerModule } from './modules/training/training-worker.module.js';

@Module({})
export class WorkerModule {
  static forRoot(options: AppConfigOptions): DynamicModule {
    return {
      module: WorkerModule,
      imports: [
        AppConfigModule.forRoot(options),
        LoggingModule,
        KernelCqrsModule,
        DatabaseModule,
        TenantModule,
        WorkerKernelModule,
        AlertsModule,
        IdentityWorkerModule,
        PlatformWorkerModule,
        SchoolWorkerModule,
        BillingWorkerModule,
        TrainingWorkerModule,
        DocumentsWorkerModule,
        MessagingWorkerModule,
        SchedulingWorkerModule,
        ReportingWorkerModule,
      ],
      providers: [WorkerLifecycle],
    };
  }
}
