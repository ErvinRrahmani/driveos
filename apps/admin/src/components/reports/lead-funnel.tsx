import type { GrowthReport } from '@driveos/shared';
import { useId } from 'react';
import { useTranslation } from 'react-i18next';
import { Card, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { formatMonth, formatNumber, formatPercentFromBasisPoints } from '@/lib/format';
import { formatMoney } from '@/lib/money';

const BASIS_POINTS = 10_000;

/** "Leads → enrolments → revenue" for one month of the growth report. */
export function LeadFunnel({ report }: { report: GrowthReport }) {
  const { t } = useTranslation();
  const titleId = useId();
  const conversionBp =
    report.leadsCaptured > 0
      ? Math.round((report.leadsConverted / report.leadsCaptured) * BASIS_POINTS)
      : null;
  const steps = [
    { label: t('reports.growth.leadsCaptured'), value: formatNumber(report.leadsCaptured, 0) },
    {
      label: t('reports.growth.leadsConverted'),
      value: formatNumber(report.leadsConverted, 0),
      detail:
        conversionBp === null
          ? undefined
          : t('reports.growth.leadsConversion', {
              percent: formatPercentFromBasisPoints(conversionBp),
            }),
    },
    {
      label: t('reports.growth.leadRevenue'),
      value: formatMoney(report.leadRevenueMinor, report.currency),
    },
  ];
  return (
    <section aria-labelledby={titleId} className="space-y-3">
      <div className="space-y-1">
        <h2 id={titleId} className="text-lg font-semibold">
          {t('reports.growth.leadsFunnel')}
        </h2>
        <p className="text-muted-foreground text-sm">
          {t('reports.growth.leadsFunnelMonth', { month: formatMonth(report.month) })}
        </p>
      </div>
      <div className="grid gap-4 sm:grid-cols-3">
        {steps.map((step) => (
          <Card key={step.label} className="gap-2">
            <CardHeader>
              <CardDescription>{step.label}</CardDescription>
              <CardTitle className="text-2xl tabular-nums">{step.value}</CardTitle>
              {step.detail && <p className="text-muted-foreground text-sm">{step.detail}</p>}
            </CardHeader>
          </Card>
        ))}
      </div>
      <p className="text-muted-foreground text-sm">{t('reports.growth.leadsUpsell')}</p>
    </section>
  );
}
