import type { GrowthReport } from '@driveos/shared';
import { useQueries } from '@tanstack/react-query';
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { columnHelperFor, DataTable } from '@/components/data-table';
import { useServices } from '@/hooks/use-services';
import { formatMonth, formatNumber, formatPercentFromBasisPoints } from '@/lib/format';
import { formatMoney } from '@/lib/money';
import { isGrowthReportMissing, lastMonths } from '@/lib/reports';
import { BarChart } from './bar-chart';

const HISTORY_MONTHS = 12;

interface GrowthRow {
  month: string;
  report?: GrowthReport;
  placeholder: 'common.loading' | 'reports.growth.noReport' | 'errors.title';
}

const helper = columnHelperFor<GrowthRow>();

export function GrowthHistory({ month }: { month: string }) {
  const { t } = useTranslation();
  const { api } = useServices();
  const months = lastMonths(month, HISTORY_MONTHS);
  const results = useQueries({
    queries: months.map((item) =>
      api.$api.queryOptions('get', '/v1/reports/growth', { params: { query: { month: item } } }),
    ),
  });
  const rows: GrowthRow[] = months.map((item, index) => {
    const result = results[index];
    if (!result || result.isPending) return { month: item, placeholder: 'common.loading' };
    if (result.isError)
      return {
        month: item,
        placeholder: isGrowthReportMissing(result.error)
          ? 'reports.growth.noReport'
          : 'errors.title',
      };
    return { month: item, report: result.data, placeholder: 'reports.growth.noReport' };
  });

  const columns = useMemo(() => {
    const metric = (id: string, header: string, render: (report: GrowthReport) => string) =>
      helper.display({
        id,
        header,
        cell: ({ row }) => (row.original.report ? render(row.original.report) : '—'),
      });
    return helper.columns([
      helper.accessor('month', {
        header: t('reports.growth.monthCol'),
        cell: ({ getValue }) => <span className="font-medium">{formatMonth(getValue())}</span>,
      }),
      helper.display({
        id: 'revenue',
        header: t('reports.growth.revenue'),
        cell: ({ row }) => {
          const { report, placeholder } = row.original;
          return report
            ? formatMoney(report.revenueRecordedMinor, report.currency)
            : t(placeholder);
        },
      }),
      metric('inApp', t('reports.growth.inAppShare'), (report) =>
        formatPercentFromBasisPoints(report.inappShareBp),
      ),
      metric('noShows', t('reports.growth.noShowRate'), (report) =>
        formatPercentFromBasisPoints(report.noShowRateBp),
      ),
      metric('upsells', t('reports.growth.upsells'), (report) =>
        formatNumber(report.upsellsSold, 0),
      ),
      metric('slots', t('reports.growth.slotsFilled'), (report) =>
        formatNumber(report.slotsFilled, 0),
      ),
      metric('late', t('reports.growth.lateKept'), (report) =>
        formatNumber(report.lateCancellationsKept, 0),
      ),
    ]);
  }, [t]);

  const chartData = [...rows].reverse().map((row) => ({
    label: formatMonth(row.month).replace(/ \d{4}$/, ''),
    value: row.report?.revenueRecordedMinor ?? 0,
  }));
  const currency = rows.find((row) => row.report)?.report?.currency ?? 'EUR';

  return (
    <div className="space-y-6">
      <p className="text-muted-foreground text-sm">{t('reports.growth.hint')}</p>
      <BarChart
        title={t('reports.growth.chart')}
        data={chartData}
        formatValue={(amount) => formatMoney(amount, currency)}
        xLabel={t('reports.growth.monthCol')}
        yLabel={t('reports.growth.revenue')}
      />
      <DataTable
        label={t('reports.growth.title')}
        columns={columns}
        items={rows}
        nextCursor={null}
        status="success"
        getRowId={(row) => row.month}
        emptyTitle={t('reports.noData')}
      />
    </div>
  );
}
