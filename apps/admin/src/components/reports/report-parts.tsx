import type { ReportBucket } from '@driveos/shared';
import { useId, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Card, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

export function TotalsRegion({ items }: { items: readonly { label: string; value: string }[] }) {
  const { t } = useTranslation();
  const titleId = useId();
  return (
    <section aria-labelledby={titleId}>
      <h2 id={titleId} className="sr-only">
        {t('reports.totals')}
      </h2>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {items.map((item) => (
          <Card key={item.label} className="gap-2">
            <CardHeader>
              <CardDescription>{item.label}</CardDescription>
              <CardTitle className="text-xl tabular-nums">{item.value}</CardTitle>
            </CardHeader>
          </Card>
        ))}
      </div>
    </section>
  );
}

export function SummaryRegion({ children }: { children: ReactNode }) {
  const { t } = useTranslation();
  const titleId = useId();
  return (
    <section aria-labelledby={titleId} className="space-y-1">
      <h2 id={titleId} className="sr-only">
        {t('reports.totals')}
      </h2>
      {children}
    </section>
  );
}

const SHORT = new Intl.DateTimeFormat('en', { month: 'short', day: 'numeric', timeZone: 'UTC' });
const MONTH = new Intl.DateTimeFormat('en', { month: 'short', year: 'numeric', timeZone: 'UTC' });

export function periodLabel(period: string, bucket: ReportBucket): string {
  const date = new Date(`${period}T00:00:00Z`);
  return bucket === 'month' ? MONTH.format(date) : SHORT.format(date);
}
