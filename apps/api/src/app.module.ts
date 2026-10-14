import { type DynamicModule, Module } from '@nestjs/common';
import { AdaptersModule } from './adapters/adapters.module.js';
import { FakePayModule } from './adapters/payments/fake-pay.module.js';
import { KernelCqrsModule } from './kernel/cqrs/kernel-cqrs.module.js';
import { AuthModule } from './kernel/auth/auth.module.js';
import { AppConfigModule, type AppConfigOptions } from './kernel/config/config.module.js';
import { DatabaseModule } from './kernel/db/database.module.js';
import { HealthModule } from './kernel/health/health.module.js';
import { RateLimitModule } from './kernel/http/rate-limit.module.js';
import { IdempotencyHttpModule } from './kernel/idempotency/idempotency-http.module.js';
import { LoggingModule } from './kernel/logging/logging.module.js';
import { TenantHttpModule } from './kernel/tenant/tenant-http.module.js';
import { RedisModule } from './kernel/redis/redis.module.js';
import { TenantModule } from './kernel/tenant/tenant.module.js';
import { IdentityModule } from './modules/identity/identity.module.js';
import { BillingModule } from './modules/billing/billing.module.js';
import { DocumentsModule } from './modules/documents/documents.module.js';
import { MessagingModule } from './modules/messaging/messaging.module.js';
import { PlatformModule } from './modules/platform/platform.module.js';
import { ReportingModule } from './modules/reporting/reporting.module.js';
import { SchedulingModule } from './modules/scheduling/scheduling.module.js';
import { SchoolModule } from './modules/school/school.module.js';
import { TheoryModule } from './modules/theory/theory.module.js';
import { TrainingModule } from './modules/training/training.module.js';

@Module({})
export class AppModule {
  static forRoot(options: AppConfigOptions): DynamicModule {
    return {
      module: AppModule,
      imports: [
        AppConfigModule.forRoot(options),
        LoggingModule,
        KernelCqrsModule,
        DatabaseModule,
        RedisModule,
        AdaptersModule,
        FakePayModule,
        TenantModule,
        RateLimitModule,
        AuthModule,
        TenantHttpModule,
        IdempotencyHttpModule,
        HealthModule,
        IdentityModule,
        BillingModule,
        DocumentsModule,
        MessagingModule,
        PlatformModule,
        ReportingModule,
        SchedulingModule,
        SchoolModule,
        TheoryModule,
        TrainingModule,
      ],
    };
  }
}
