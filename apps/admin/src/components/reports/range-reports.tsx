import type {
  NoShowBucket,
  PassRateBucket,
  RevenueBucket,
  UtilisationBucket,
} from '@driveos/shared';
import { type ReactNode, useMemo } from 'react';
import { type TFunction } from 'i18next';
import { useTranslation } from 'react-i18next';
import { columnHelperFor, DataTable } from '@/components/data-table';
import { ErrorState, LoadingState } from '@/components/states';
import { useServices } from '@/hooks/use-services';
import { formatNumber, formatPercentFromBasisPoints, formatPlainDate } from '@/lib/format';
import { formatMoney } from '@/lib/money';
import type { ReportRange } from '@/lib/reports';
import { BarChart } from './bar-chart';
import { periodLabel, SummaryRegion, TotalsRegion } from './report-parts';

const percent = formatPercentFromBasisPoints;
const count = (value: number) => formatNumber(value, 0);
const hours = (t: TFunction, minutes: number) =>
  t('reports.utilisation.hours', { value: formatNumber(minutes / 60) });

function ReportFrame({
  query,
  children,
}: {
  query: { status: 'pending' | 'error' | 'success'; error: unknown; refetch: () => unknown };
  children: () => ReactNode;
}) {
  if (query.status === 'pending') return <LoadingState />;
  if (query.status === 'error')
    return <ErrorState error={query.error} onRetry={() => void query.refetch()} />;
  return <div className="space-y-6">{children()}</div>;
}

function usePeriodColumn<T extends { period: string }>() {
  const { t } = useTranslation();
  return useMemo(() => {
    const helper = columnHelperFor<T>();
    return helper.display({
      id: 'period',
      header: t('reports.period'),
      cell: ({ row }) => formatPlainDate(row.original.period),
    });
  }, [t]);
}

const noShowHelper = columnHelperFor<NoShowBucket>();

export function NoShowsReport({ range }: { range: ReportRange }) {
  const { t } = useTranslation();
  const { api } = useServices();
  const report = api.$api.useQuery('get', '/v1/reports/no-shows', { params: { query: range } });
  const period = usePeriodColumn<NoShowBucket>();
  const columns = useMemo(
    () =>
      noShowHelper.columns([
        period,
        noShowHelper.accessor('lessonsDue', {
          header: t('reports.noShows.lessonsDue'),
          cell: ({ getValue }) => count(getValue()),
        }),
        noShowHelper.accessor('noShows', {
          header: t('reports.noShows.noShows'),
          cell: ({ getValue }) => count(getValue()),
        }),
        noShowHelper.accessor('noShowRateBp', {
          header: t('reports.noShows.rate'),
          cell: ({ getValue }) => percent(getValue()),
        }),
      ]),
    [t, period],
  );
  return (
    <ReportFrame query={report}>
      {() =>
        report.data && (
          <>
            <TotalsRegion
              items={[
                {
                  label: t('reports.noShows.rate'),
                  value: percent(report.data.totals.noShowRateBp),
                },
                { label: t('reports.noShows.noShows'), value: count(report.data.totals.noShows) },
                {
                  label: t('reports.noShows.lessonsDue'),
                  value: count(report.data.totals.lessonsDue),
                },
              ]}
            />
            <BarChart
              title={t('reports.noShows.chart', {
                bucket: t(`reports.buckets.${report.data.bucket}`),
              })}
              data={report.data.items.map((item) => ({
                label: periodLabel(item.period, report.data.bucket),
                value: item.noShowRateBp,
              }))}
              formatValue={percent}
              xLabel={t('reports.period')}
              yLabel={t('reports.noShows.rate')}
            />
            <DataTable
              label={t('reports.tabs.no-shows')}
              columns={columns}
              items={report.data.items}
              nextCursor={null}
              status="success"
              getRowId={(item) => item.period}
              emptyTitle={t('reports.noData')}
            />
          </>
        )
      }
    </ReportFrame>
  );
}

const revenueHelper = columnHelperFor<RevenueBucket>();

export function RevenueReport({ range }: { range: ReportRange }) {
  const { t } = useTranslation();
  const { api } = useServices();
  const report = api.$api.useQuery('get', '/v1/reports/revenue', { params: { query: range } });
  const period = usePeriodColumn<RevenueBucket>();
  const columns = useMemo(() => {
    const money = (
      key: 'revenueRecordedMinor' | 'revenueInAppMinor' | 'refundsMinor' | 'upsellRevenueMinor',
      header: string,
    ) =>
      revenueHelper.accessor(key, {
        header,
        cell: ({ row, getValue }) => formatMoney(getValue(), row.original.currency),
      });
    return revenueHelper.columns([
      period,
      money('revenueRecordedMinor', t('reports.revenue.recorded')),
      money('revenueInAppMinor', t('reports.revenue.inApp')),
      money('refundsMinor', t('reports.revenue.refunds')),
      revenueHelper.accessor('upsellsSold', {
        header: t('reports.revenue.upsellsSold'),
        cell: ({ getValue }) => count(getValue()),
      }),
      money('upsellRevenueMinor', t('reports.revenue.upsellRevenue')),
      revenueHelper.accessor('packageMinutesSold', {
        header: t('reports.revenue.packageMinutes'),
        cell: ({ getValue }) => count(getValue()),
      }),
    ]);
  }, [t, period]);
  return (
    <ReportFrame query={report}>
      {() => {
        if (!report.data) return null;
        const { totals, bucket } = report.data;
        const money = (minor: number) => formatMoney(minor, totals.currency);
        return (
          <>
            <TotalsRegion
              items={[
                { label: t('reports.revenue.recorded'), value: money(totals.revenueRecordedMinor) },
                { label: t('reports.revenue.inApp'), value: money(totals.revenueInAppMinor) },
                { label: t('reports.revenue.refunds'), value: money(totals.refundsMinor) },
                {
                  label: t('reports.revenue.upsellRevenue'),
                  value: money(totals.upsellRevenueMinor),
                },
              ]}
            />
            <p className="text-muted-foreground text-xs">{t('reports.revenue.recordedHint')}</p>
            <BarChart
              title={t('reports.revenue.chart', { bucket: t(`reports.buckets.${bucket}`) })}
              data={report.data.items.map((item) => ({
                label: periodLabel(item.period, bucket),
                value: item.revenueRecordedMinor,
              }))}
              formatValue={(value) => formatMoney(value, totals.currency)}
              xLabel={t('reports.period')}
              yLabel={t('reports.revenue.recorded')}
            />
            <DataTable
              label={t('reports.tabs.revenue')}
              columns={columns}
              items={report.data.items}
              nextCursor={null}
              status="success"
              getRowId={(item) => `${item.period}-${item.currency}`}
              emptyTitle={t('reports.noData')}
            />
          </>
        );
      }}
    </ReportFrame>
  );
}

const passHelper = columnHelperFor<PassRateBucket>();

export function PassRateReport({ range }: { range: ReportRange }) {
  const { t } = useTranslation();
  const { api } = useServices();
  const report = api.$api.useQuery('get', '/v1/reports/pass-rate', { params: { query: range } });
  const period = usePeriodColumn<PassRateBucket>();
  const columns = useMemo(
    () =>
      passHelper.columns([
        period,
        passHelper.accessor('kind', {
          header: t('reports.passRate.kind'),
          cell: ({ getValue }) => t(`reports.testKinds.${getValue()}`),
        }),
        passHelper.accessor('attempts', {
          header: t('reports.passRate.attempts'),
          cell: ({ getValue }) => count(getValue()),
        }),
        passHelper.accessor('passed', {
          header: t('reports.passRate.passed'),
          cell: ({ getValue }) => count(getValue()),
        }),
        passHelper.accessor('passRateBp', {
          header: t('reports.passRate.rate'),
          cell: ({ getValue }) => percent(getValue()),
        }),
      ]),
    [t, period],
  );
  return (
    <ReportFrame query={report}>
      {() =>
        report.data && (
          <>
            <SummaryRegion>
              {report.data.totals.map((total) => (
                <p key={total.kind} className="text-lg font-medium">
                  {t('reports.passRate.summary', {
                    kind: t(`reports.testKinds.${total.kind}`),
                    rate: percent(total.passRateBp),
                    passed: total.passed,
                    attempts: total.attempts,
                  })}
                </p>
              ))}
            </SummaryRegion>
            <BarChart
              title={t('reports.passRate.chart', {
                bucket: t(`reports.buckets.${report.data.bucket}`),
              })}
              data={report.data.items.map((item) => ({
                label: `${periodLabel(item.period, report.data.bucket)} · ${t(`reports.testKinds.${item.kind}`)}`,
                value: item.passRateBp,
              }))}
              formatValue={percent}
              xLabel={t('reports.period')}
              yLabel={t('reports.passRate.rate')}
            />
            <DataTable
              label={t('reports.tabs.pass-rate')}
              columns={columns}
              items={report.data.items}
              nextCursor={null}
              status="success"
              getRowId={(item) => `${item.period}-${item.kind}`}
              emptyTitle={t('reports.noData')}
            />
          </>
        )
      }
    </ReportFrame>
  );
}

const utilisationHelper = columnHelperFor<UtilisationBucket>();

export function UtilisationReport({ range }: { range: ReportRange }) {
  const { t } = useTranslation();
  const { api } = useServices();
  const report = api.$api.useQuery('get', '/v1/reports/utilisation', {
    params: { query: range },
  });
  const period = usePeriodColumn<UtilisationBucket>();
  const columns = useMemo(() => {
    const asHours = (minutes: number) => hours(t, minutes);
    return utilisationHelper.columns([
      period,
      utilisationHelper.accessor('instructorMinutesAvailable', {
        header: t('reports.utilisation.available'),
        cell: ({ getValue }) => asHours(getValue()),
      }),
      utilisationHelper.accessor('instructorMinutesBooked', {
        header: t('reports.utilisation.booked'),
        cell: ({ getValue }) => asHours(getValue()),
      }),
      utilisationHelper.accessor('utilisationBp', {
        header: t('reports.utilisation.rate'),
        cell: ({ getValue }) => percent(getValue()),
      }),
      utilisationHelper.accessor('slotsOffered', {
        header: t('reports.utilisation.slotsOffered'),
        cell: ({ getValue }) => count(getValue()),
      }),
      utilisationHelper.accessor('slotsFilled', {
        header: t('reports.utilisation.slotsFilled'),
        cell: ({ getValue }) => count(getValue()),
      }),
    ]);
  }, [t, period]);
  return (
    <ReportFrame query={report}>
      {() =>
        report.data && (
          <>
            <TotalsRegion
              items={[
                {
                  label: t('reports.utilisation.rate'),
                  value: percent(report.data.totals.utilisationBp),
                },
                {
                  label: t('reports.utilisation.booked'),
                  value: hours(t, report.data.totals.instructorMinutesBooked),
                },
                {
                  label: t('reports.utilisation.available'),
                  value: hours(t, report.data.totals.instructorMinutesAvailable),
                },
                {
                  label: t('reports.utilisation.slotsFilled'),
                  value: `${count(report.data.totals.slotsFilled)} / ${count(report.data.totals.slotsOffered)}`,
                },
              ]}
            />
            <BarChart
              title={t('reports.utilisation.chart', {
                bucket: t(`reports.buckets.${report.data.bucket}`),
              })}
              data={report.data.items.map((item) => ({
                label: periodLabel(item.period, report.data.bucket),
                value: item.utilisationBp,
              }))}
              formatValue={percent}
              xLabel={t('reports.period')}
              yLabel={t('reports.utilisation.rate')}
            />
            <DataTable
              label={t('reports.tabs.utilisation')}
              columns={columns}
              items={report.data.items}
              nextCursor={null}
              status="success"
              getRowId={(item) => item.period}
              emptyTitle={t('reports.noData')}
            />
          </>
        )
      }
    </ReportFrame>
  );
}
