import { Controller, Get, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import {
  type GrowthReport,
  type GrowthReportQuery,
  growthReportQuerySchema,
  type NoShowReportResponse,
  type PassRateReportResponse,
  type ReportRangeQuery,
  reportRangeQuerySchema,
  type RevenueReportResponse,
  type UtilisationReportResponse,
} from '@driveos/shared';
import { QueryBus } from '../../../kernel/cqrs/index.js';
import { ZodValidationPipe } from '../../../kernel/http/validation.js';
import { ApiRoute } from '../../../kernel/openapi/api-route.decorator.js';
import { RequirePermission } from '../../identity/index.js';
import { GetGrowthReportQuery } from '../queries/get-growth-report.query.js';
import { GetNoShowReportQuery } from '../queries/get-no-show-report.query.js';
import { GetPassRateReportQuery } from '../queries/get-pass-rate-report.query.js';
import { GetRevenueReportQuery } from '../queries/get-revenue-report.query.js';
import { GetUtilisationReportQuery } from '../queries/get-utilisation-report.query.js';
import { StatusCodes } from 'http-status-codes';

const range = new ZodValidationPipe(reportRangeQuerySchema);

@ApiTags('reporting')
@RequirePermission('reports.read')
@Controller('reports')
export class ReportsController {
  constructor(private readonly queryBus: QueryBus) {}

  @Get('growth')
  @ApiRoute({
    operationId: 'reports.growth',
    summary: 'The monthly growth report (latest when no month is given)',
    status: StatusCodes.OK,
    query: 'GrowthReportQuery',
    response: 'GrowthReport',
  })
  growth(
    @Query(new ZodValidationPipe(growthReportQuerySchema)) query: GrowthReportQuery,
  ): Promise<GrowthReport> {
    return this.queryBus.execute(new GetGrowthReportQuery(query));
  }

  @Get('no-shows')
  @ApiRoute({
    operationId: 'reports.noShows',
    summary: 'No-shows per period',
    status: StatusCodes.OK,
    query: 'ReportRangeQuery',
    response: 'NoShowReportResponse',
  })
  noShows(@Query(range) query: ReportRangeQuery): Promise<NoShowReportResponse> {
    return this.queryBus.execute(new GetNoShowReportQuery(query));
  }

  @Get('revenue')
  @ApiRoute({
    operationId: 'reports.revenue',
    summary: 'Revenue per period',
    status: StatusCodes.OK,
    query: 'ReportRangeQuery',
    response: 'RevenueReportResponse',
  })
  revenue(@Query(range) query: ReportRangeQuery): Promise<RevenueReportResponse> {
    return this.queryBus.execute(new GetRevenueReportQuery(query));
  }

  @Get('pass-rate')
  @ApiRoute({
    operationId: 'reports.passRate',
    summary: 'Theory and practical pass rate per period',
    status: StatusCodes.OK,
    query: 'ReportRangeQuery',
    response: 'PassRateReportResponse',
  })
  passRate(@Query(range) query: ReportRangeQuery): Promise<PassRateReportResponse> {
    return this.queryBus.execute(new GetPassRateReportQuery(query));
  }

  @Get('utilisation')
  @ApiRoute({
    operationId: 'reports.utilisation',
    summary: 'Instructor utilisation per period',
    status: StatusCodes.OK,
    query: 'ReportRangeQuery',
    response: 'UtilisationReportResponse',
  })
  utilisation(@Query(range) query: ReportRangeQuery): Promise<UtilisationReportResponse> {
    return this.queryBus.execute(new GetUtilisationReportQuery(query));
  }
}
