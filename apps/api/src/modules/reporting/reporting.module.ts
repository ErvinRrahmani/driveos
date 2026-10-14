import { Module } from '@nestjs/common';
import { ReportsController } from './http/reports.controller.js';
import { GrowthReports } from './infra/growth-reports.js';
import { ReportRows } from './infra/report-rows.js';
import { SchoolProfiles } from './infra/school-profile.js';
import { GetGrowthReportHandler } from './queries/get-growth-report.handler.js';
import { GetNoShowReportHandler } from './queries/get-no-show-report.handler.js';
import { GetPassRateReportHandler } from './queries/get-pass-rate-report.handler.js';
import { GetRevenueReportHandler } from './queries/get-revenue-report.handler.js';
import { GetUtilisationReportHandler } from './queries/get-utilisation-report.handler.js';

@Module({
  controllers: [ReportsController],
  providers: [
    ReportRows,
    SchoolProfiles,
    GrowthReports,
    GetGrowthReportHandler,
    GetNoShowReportHandler,
    GetRevenueReportHandler,
    GetPassRateReportHandler,
    GetUtilisationReportHandler,
  ],
})
export class ReportingModule {}
