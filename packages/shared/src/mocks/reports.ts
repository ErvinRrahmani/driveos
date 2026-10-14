import { reportRangeQuerySchema } from '../dto/index.js';
import { DTO_SAMPLES } from '../dto/samples/index.js';
import { fail, type MockResolver, requireSchool } from './context.js';
import { StatusCodes } from 'http-status-codes';

function rangeReport(sample: object): MockResolver {
  return (context) => {
    requireSchool(context);
    const parsed = reportRangeQuerySchema.safeParse(Object.fromEntries(context.url.searchParams));
    if (!parsed.success)
      fail(
        StatusCodes.BAD_REQUEST,
        'validation_error',
        'The request is invalid.',
        parsed.error.issues,
      );
    return { body: { ...structuredClone(sample), ...parsed.data } };
  };
}

export const reportResolvers: Record<string, MockResolver> = {
  'reports.noShows': rangeReport(DTO_SAMPLES.reporting.noShowReportResponse),
  'reports.revenue': rangeReport(DTO_SAMPLES.reporting.revenueReportResponse),
  'reports.passRate': rangeReport(DTO_SAMPLES.reporting.passRateReportResponse),
  'reports.utilisation': rangeReport(DTO_SAMPLES.reporting.utilisationReportResponse),
};
