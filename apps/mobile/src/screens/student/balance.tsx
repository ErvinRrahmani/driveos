import { useTranslation } from 'react-i18next';
import { formatDate, formatDateTime, formatDuration, formatMoney } from '../../lib/format';
import {
  useBalance,
  useDisplayZone,
  useInvoices,
  useLedger,
  useStudentId,
} from '../../lib/student-data';
import { Card, ListItem, Screen, Text } from '../../ui';
import { ledgerEntryLabel } from './labels';
import { Loadable, Section } from './common';

export function BalanceScreen() {
  const { t, i18n } = useTranslation();
  const studentId = useStudentId();
  const balance = useBalance(studentId);
  const ledger = useLedger(studentId);
  const invoices = useInvoices(studentId);
  const zone = useDisplayZone();

  return (
    <Screen>
      <Loadable query={balance}>
        {(data) => (
          <Card accessibilityLabel={t('balance.title')}>
            <Text variant="label" tone="muted">
              {t('balance.current')}
            </Text>
            <Text variant="title">{formatDuration(t, data.balanceMinutes)}</Text>
            {data.entitlements.map((entitlement) => (
              <Text key={entitlement.id}>
                {entitlement.kind === 'exam_car' ? t('shop.examCar') : t('shop.premiumTheory')}
              </Text>
            ))}
          </Card>
        )}
      </Loadable>
      <Section title={t('balance.history')}>
        <Loadable query={ledger}>
          {(data) =>
            data.items.length === 0 ? (
              <Text tone="muted">{t('balance.noHistory')}</Text>
            ) : (
              data.items.map((entry) => (
                <ListItem
                  key={entry.id}
                  title={`${ledgerEntryLabel(t, entry.entryType)} · ${entry.minutes > 0 ? '+' : ''}${formatDuration(t, entry.minutes)}`}
                  subtitle={t('balance.entryDetails', {
                    date: formatDateTime(entry.createdAt, zone),
                    balance: formatDuration(t, entry.balanceAfter),
                  })}
                />
              ))
            )
          }
        </Loadable>
      </Section>
      <Section title={t('balance.invoices')}>
        <Loadable query={invoices}>
          {(data) =>
            data.items.length === 0 ? (
              <Text tone="muted">{t('balance.noInvoices')}</Text>
            ) : (
              data.items.map((invoice) => (
                <ListItem
                  key={invoice.id}
                  title={`${invoice.formattedNumber ?? t('balance.draftInvoice')} · ${formatMoney(invoice.totalMinor, invoice.currency, i18n.language)}`}
                  subtitle={
                    (invoice.kind === 'credit_note' ? `${t('balance.creditNote')} · ` : '') +
                    (invoice.issuedAt ? formatDate(invoice.issuedAt, zone) : '')
                  }
                />
              ))
            )
          }
        </Loadable>
      </Section>
    </Screen>
  );
}
