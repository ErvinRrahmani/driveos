import { Module } from '@nestjs/common';
import { APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { IdentityModule } from '../identity/identity.module.js';
import { CreatePlanHandler } from './commands/create-plan.handler.js';
import { CreateSchoolHandler } from './commands/create-school.handler.js';
import { EndSupportSessionHandler } from './commands/end-support-session.handler.js';
import { StartSupportSessionHandler } from './commands/start-support-session.handler.js';
import { UpdatePlanHandler } from './commands/update-plan.handler.js';
import { AuditLogController } from './http/audit-log.controller.js';
import { PlatformController } from './http/platform.controller.js';
import { SupportSessionGuard } from './http/support-session.guard.js';
import { SupportSessionInterceptor } from './http/support-session.interceptor.js';
import { AUDIT_WRITER, PlatformAuditWriter } from './infra/audit-writer.js';
import { SupportSessionsRepository } from './infra/support-sessions.repository.js';
import { GetCurrentSubscriptionHandler } from './queries/get-current-subscription.handler.js';
import { ListAuditLogHandler } from './queries/list-audit-log.handler.js';
import { AlertStore } from '../../kernel/alerts/alert-store.js';
import { GetPlatformAlertsHandler } from './queries/get-platform-alerts.handler.js';
import { ListPlansHandler } from './queries/list-plans.handler.js';
import { SchoolHasFeatureHandler } from './queries/school-has-feature.handler.js';

@Module({
  imports: [IdentityModule],
  controllers: [PlatformController, AuditLogController],
  providers: [
    { provide: APP_GUARD, useClass: SupportSessionGuard },
    { provide: APP_INTERCEPTOR, useClass: SupportSessionInterceptor },
    PlatformAuditWriter,
    { provide: AUDIT_WRITER, useExisting: PlatformAuditWriter },
    SupportSessionsRepository,
    CreateSchoolHandler,
    CreatePlanHandler,
    UpdatePlanHandler,
    StartSupportSessionHandler,
    EndSupportSessionHandler,
    ListPlansHandler,
    GetPlatformAlertsHandler,
    AlertStore,
    ListAuditLogHandler,
    GetCurrentSubscriptionHandler,
    SchoolHasFeatureHandler,
  ],
  exports: [AUDIT_WRITER],
})
export class PlatformModule {}
