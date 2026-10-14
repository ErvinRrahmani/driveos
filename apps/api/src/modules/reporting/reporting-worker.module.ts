import { Module } from '@nestjs/common';
import { IdentityWorkerModule } from '../identity/identity-worker.module.js';
import { GenerateGrowthReportHandler } from './commands/generate-growth-report.handler.js';
import { GrowthReportJob } from './infra/growth-report.job.js';
import { GrowthReports } from './infra/growth-reports.js';
import { MetricsStore } from './infra/metrics-store.js';
import { ReportRows } from './infra/report-rows.js';
import { SchoolProfiles } from './infra/school-profile.js';
import { SchoolMetricsProjection } from './projections/school-metrics.projection.js';

@Module({
  imports: [IdentityWorkerModule],
  providers: [
    MetricsStore,
    SchoolProfiles,
    SchoolMetricsProjection,
    ReportRows,
    GrowthReports,
    GenerateGrowthReportHandler,
    GrowthReportJob,
  ],
})
export class ReportingWorkerModule {}
