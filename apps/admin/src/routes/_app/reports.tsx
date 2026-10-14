import { reportBucketSchema } from '@driveos/shared';
import { createFileRoute } from '@tanstack/react-router';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { z } from 'zod';
import { DateRangeFilter, FilterBar, MonthFilter, SelectFilter } from '@/components/list-filters';
import { PageHeader } from '@/components/page-header';
import { GrowthHistory } from '@/components/reports/growth-history';
import {
  NoShowsReport,
  PassRateReport,
  RevenueReport,
  UtilisationReport,
} from '@/components/reports/range-reports';
import { RequirePermission } from '@/components/require-permission';
import { EmptyState } from '@/components/states';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useSchoolClock } from '@/hooks/use-school-clock';
import { dateParam } from '@/lib/date-range';
import { previousMonth } from '@/lib/format';
import { bucketFor, buildReportRange, defaultReportRange, type ReportRange } from '@/lib/reports';
import { todayIn } from '@/lib/zoned-time';

const REPORT_TABS = ['no-shows', 'revenue', 'pass-rate', 'utilisation', 'growth'] as const;
type ReportTab = (typeof REPORT_TABS)[number];

const reportsSearchSchema = z.object({
  tab: z.enum(REPORT_TABS).optional().catch(undefined),
  from: dateParam(),
  to: dateParam(),
  bucket: reportBucketSchema.optional().catch(undefined),
  month: z
    .string()
    .regex(/^\d{4}-(0[1-9]|1[0-2])$/)
    .optional()
    .catch(undefined),
});

export const Route = createFileRoute('/_app/reports')({
  validateSearch: (search) => reportsSearchSchema.parse(search),
  component: () => (
    <RequirePermission anyOf={['reports.read']}>
      <ReportsPage />
    </RequirePermission>
  ),
});

function ReportsPage() {
  const { t } = useTranslation();
  const { timeZone } = useSchoolClock();
  const search = Route.useSearch();
  const navigate = Route.useNavigate();
  const tab: ReportTab = search.tab ?? 'no-shows';
  const fallback = defaultReportRange(todayIn(timeZone ?? 'UTC', new Date()));
  const from = search.from ?? fallback.from;
  const to = search.to ?? fallback.to;
  const built = buildReportRange({ from, to, bucket: search.bucket });
  const autoBucket = bucketFor(from, to);
  const month = search.month ?? previousMonth(new Date());

  const rangeReport = (report: (range: ReportRange) => ReactNode) =>
    timeZone === undefined && !search.from ? null : built.ok ? (
      report(built.range)
    ) : (
      <EmptyState title={t('reports.rangeInvalid')} />
    );

  return (
    <>
      <PageHeader title={t('reports.title')} description={t('reports.description')} />
      <Tabs
        value={tab}
        onValueChange={(value) => {
          const next = REPORT_TABS.find((candidate) => candidate === value);
          void navigate({
            search: (prev) => ({ ...prev, tab: next === 'no-shows' ? undefined : next }),
          });
        }}
      >
        <TabsList>
          {REPORT_TABS.map((value) => (
            <TabsTrigger key={value} value={value}>
              {t(`reports.tabs.${value}`)}
            </TabsTrigger>
          ))}
        </TabsList>
        <div className="mt-4 space-y-6">
          {tab === 'growth' ? (
            <FilterBar>
              <MonthFilter
                label={t('reports.growth.month')}
                value={month}
                onChange={(next) => void navigate({ search: (prev) => ({ ...prev, month: next }) })}
              />
            </FilterBar>
          ) : (
            <div className="space-y-2">
              <FilterBar>
                <DateRangeFilter
                  from={from}
                  to={to}
                  onChange={(patch) =>
                    void navigate({ search: (prev) => ({ ...prev, from, to, ...patch }) })
                  }
                />
                <SelectFilter
                  label={t('reports.groupBy')}
                  value={search.bucket}
                  allLabel={t('reports.bucketAuto', {
                    bucket: t(`reports.buckets.${autoBucket}`),
                  })}
                  options={reportBucketSchema.options.map((value) => ({
                    value,
                    label: t(`reports.bucketOptions.${value}`),
                  }))}
                  onChange={(next) =>
                    void navigate({
                      search: (prev) => ({
                        ...prev,
                        bucket: reportBucketSchema.safeParse(next).data,
                      }),
                    })
                  }
                />
              </FilterBar>
              <p className="text-muted-foreground text-xs">
                {t('reports.rangeHint', {
                  bucket: t(`reports.buckets.${search.bucket ?? autoBucket}`),
                })}
              </p>
            </div>
          )}
          <TabsContent value="no-shows">
            {rangeReport((range) => (
              <NoShowsReport range={range} />
            ))}
          </TabsContent>
          <TabsContent value="revenue">
            {rangeReport((range) => (
              <RevenueReport range={range} />
            ))}
          </TabsContent>
          <TabsContent value="pass-rate">
            {rangeReport((range) => (
              <PassRateReport range={range} />
            ))}
          </TabsContent>
          <TabsContent value="utilisation">
            {rangeReport((range) => (
              <UtilisationReport range={range} />
            ))}
          </TabsContent>
          <TabsContent value="growth">
            <GrowthHistory month={month} />
          </TabsContent>
        </div>
      </Tabs>
    </>
  );
}
