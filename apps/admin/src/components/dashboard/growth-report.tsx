import type { GrowthReport as GrowthReportData } from '@driveos/shared';
import { Ban, CalendarCheck, Coins, ShoppingBag, Undo2 } from 'lucide-react';
import { useId, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { ErrorState, LoadingState, NeutralState } from '@/components/states';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useServices } from '@/hooks/use-services';
import {
  formatDateTime,
  formatMonth,
  formatNumber,
  formatPercentFromBasisPoints,
  previousMonth,
} from '@/lib/format';
import { formatMoney } from '@/lib/money';
import { isGrowthReportMissing } from '@/lib/reports';

export function GrowthReport({
  month,
  onMonthChange,
}: {
  month: string | undefined;
  onMonthChange: (month: string | undefined) => void;
}) {
  const { t } = useTranslation();
  const { api } = useServices();
  const monthId = useId();
  const selected = month ?? previousMonth(new Date());
  const report = api.$api.useQuery('get', '/v1/reports/growth', {
    params: { query: { month: selected } },
  });

  return (
    <section aria-labelledby={`${monthId}-title`} className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="space-y-1">
          <h2 id={`${monthId}-title`} className="text-lg font-semibold">
            {t('dashboard.growthTitle')}
          </h2>
          <p className="text-muted-foreground text-sm">
            {t('dashboard.growthSubtitle', { month: formatMonth(selected) })}
          </p>
        </div>
        <div className="grid gap-2">
          <Label htmlFor={monthId}>{t('dashboard.month')}</Label>
          <Input
            id={monthId}
            type="month"
            className="w-44"
            value={selected}
            onChange={(event) => onMonthChange(event.target.value || undefined)}
          />
        </div>
      </div>
      {report.isPending ? (
        <LoadingState />
      ) : report.isError ? (
        isGrowthReportMissing(report.error) ? (
          <NeutralState title={t('dashboard.noReport')} description={t('dashboard.noReportBody')} />
        ) : (
          <ErrorState error={report.error} onRetry={() => void report.refetch()} />
        )
      ) : (
        <GrowthCards report={report.data} />
      )}
    </section>
  );
}

function Metric({
  icon,
  title,
  value,
  detail,
}: {
  icon: ReactNode;
  title: string;
  value: string;
  detail: string;
}) {
  return (
    <Card className="gap-3">
      <CardHeader>
        <CardDescription className="flex items-center gap-2">
          {icon}
          {title}
        </CardDescription>
        <CardTitle className="text-2xl tabular-nums">{value}</CardTitle>
      </CardHeader>
      <CardContent className="text-muted-foreground text-sm">{detail}</CardContent>
    </Card>
  );
}

function GrowthCards({ report }: { report: GrowthReportData }) {
  const { t } = useTranslation();
  const money = (minor: number) => formatMoney(minor, report.currency);
  return (
    <div className="space-y-3">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Metric
          icon={<Coins className="size-4" aria-hidden />}
          title={t('dashboard.revenue')}
          value={money(report.revenueRecordedMinor)}
          detail={`${t('dashboard.revenueDetail', {
            inApp: money(report.revenueInAppMinor),
            recorded: money(report.revenueRecordedMinor),
          })} · ${t('dashboard.inAppShare', {
            percent: formatPercentFromBasisPoints(report.inappShareBp),
          })}`}
        />
        <Metric
          icon={<Ban className="size-4" aria-hidden />}
          title={t('dashboard.noShows')}
          value={formatPercentFromBasisPoints(report.noShowRateBp)}
          detail={t('dashboard.noShowsDetail', {
            previous: formatPercentFromBasisPoints(report.noShowRatePrev3mBp),
          })}
        />
        <Metric
          icon={<ShoppingBag className="size-4" aria-hidden />}
          title={t('dashboard.upsells')}
          value={formatNumber(report.upsellsSold)}
          detail={t('dashboard.upsellsDetail', { revenue: money(report.upsellRevenueMinor) })}
        />
        <Metric
          icon={<CalendarCheck className="size-4" aria-hidden />}
          title={t('dashboard.slotsFilled')}
          value={formatNumber(report.slotsFilled)}
          detail={t('dashboard.slotsFilledDetail', {
            hours: formatNumber(report.slotFillMinutes / 60),
          })}
        />
        <Metric
          icon={<Undo2 className="size-4" aria-hidden />}
          title={t('dashboard.lateCancellations')}
          value={formatNumber(report.lateCancellationsKept)}
          detail={t('dashboard.lateCancellationsDetail', {
            minutes: formatNumber(report.lateCancelMinutesKept),
          })}
        />
      </div>
      <p className="text-muted-foreground text-xs">
        {t('dashboard.generatedAt', { date: formatDateTime(report.generatedAt) })}
      </p>
    </div>
  );
}
