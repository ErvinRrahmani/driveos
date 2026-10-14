import type { ShopItem } from '@driveos/shared';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { errorMessage } from '../../components/error-message';
import { formatDuration, formatMoney } from '../../lib/format';
import { useServices } from '../../lib/session';
import { MONEY_QUERIES, useAttempt, useInvalidate, useShop } from '../../lib/student-data';
import { startCheckout } from '../../lib/student-flows';
import { Banner, Button, Card, Screen, Text } from '../../ui';
import { Loadable, Section } from './common';

function describe(t: ReturnType<typeof useTranslation>['t'], item: ShopItem): string {
  if (item.creditMinutes !== null) {
    return t('shop.credit', { credit: formatDuration(t, item.creditMinutes) });
  }
  if (item.entitlementKind === 'premium_theory') return t('shop.premiumTheory');
  if (item.entitlementKind === 'exam_car') return t('shop.examCarBody');
  return '';
}

export function ShopScreen() {
  const { t, i18n } = useTranslation();
  const services = useServices();
  const invalidate = useInvalidate();
  const attempt = useAttempt();
  const shop = useShop();
  const [buying, setBuying] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ tone: 'success' | 'danger'; message: string } | null>(
    null,
  );

  const buy = async (item: ShopItem, studentId: string) => {
    setBuying(item.id);
    setNotice(null);
    const result = await startCheckout(services, attempt, { priceItemId: item.id, studentId });
    setBuying(null);
    if (!result.ok) {
      setNotice({ tone: 'danger', message: errorMessage(t, result) });
      return;
    }
    setNotice({ tone: 'success', message: t('shop.returned') });
    await invalidate(MONEY_QUERIES);
  };

  return (
    <Screen title={t('shop.title')}>
      <Loadable query={shop}>
        {(data) => {
          const credit = data.items.filter(
            (item) => item.kind === 'lesson' || item.kind === 'package',
          );
          const extras = data.items.filter((item) => item.kind === 'upsell' || item.kind === 'fee');
          const row = (item: ShopItem) => (
            <Card key={item.id}>
              <Text variant="heading">{item.name}</Text>
              <Text tone="muted">{describe(t, item)}</Text>
              <Text variant="label">
                {formatMoney(item.amountMinor, item.currency, i18n.language)}
              </Text>
              {item.owned ? (
                <Banner tone="success" message={t('shop.owned')} />
              ) : (
                <Button
                  title={t('shop.buy')}
                  loading={buying === item.id}
                  disabled={!data.checkoutEnabled || buying !== null}
                  onPress={() => void buy(item, data.studentId)}
                />
              )}
            </Card>
          );
          return (
            <>
              <Card accessibilityLabel={t('shop.balance')}>
                <Text variant="label" tone="muted">
                  {t('shop.balance')}
                </Text>
                <Text variant="heading">{formatDuration(t, data.balanceMinutes)}</Text>
              </Card>
              {data.checkoutEnabled ? null : (
                <Banner tone="warning" message={t('shop.checkoutDisabled')} />
              )}
              {notice ? <Banner tone={notice.tone} message={notice.message} /> : null}
              {credit.length > 0 ? (
                <Section title={t('shop.lessons')}>{credit.map(row)}</Section>
              ) : null}
              {extras.length > 0 ? (
                <Section title={t('shop.extras')}>{extras.map(row)}</Section>
              ) : null}
            </>
          );
        }}
      </Loadable>
    </Screen>
  );
}
