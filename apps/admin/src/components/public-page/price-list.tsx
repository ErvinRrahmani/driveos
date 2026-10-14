import type { PublicSchoolPage } from '@driveos/shared';
import { useId } from 'react';
import { useTranslation } from 'react-i18next';
import { formatMoney } from '@/lib/money';

export function PriceList({
  prices,
  locale,
}: {
  prices: PublicSchoolPage['prices'];
  locale: string;
}) {
  const { t } = useTranslation();
  const titleId = useId();
  if (prices.length === 0) return null;
  return (
    <section aria-labelledby={titleId} className="bg-card rounded-xl border p-5">
      <h2 id={titleId} className="text-lg font-semibold">
        {t('publicPage.site.prices.title')}
      </h2>
      <ul className="mt-3 divide-y">
        {prices.map((price) => (
          <li key={price.id} className="flex items-baseline justify-between gap-4 py-3">
            <div>
              <p className="font-medium">{price.name}</p>
              {price.creditMinutes !== null && (
                <p className="text-muted-foreground text-sm">
                  {t('publicPage.site.prices.creditMinutes', { count: price.creditMinutes })}
                </p>
              )}
            </div>
            <p className="font-semibold tabular-nums">
              {formatMoney(price.amountMinor, price.currency, locale)}
            </p>
          </li>
        ))}
      </ul>
    </section>
  );
}
