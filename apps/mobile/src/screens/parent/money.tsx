import type { Invoice } from '@driveos/shared';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { errorMessage } from '../../components/error-message';
import { formatDate, formatDuration, formatMoney } from '../../lib/format';
import { openPdf } from '../../lib/open-pdf';
import { useParentStudents } from '../../lib/parent-context';
import { fetchInvoicePdf } from '../../lib/parent-flows';
import { useServices } from '../../lib/session';
import { useBalance, useDisplayZone, useInvoices } from '../../lib/student-data';
import { useStudentScope } from '../../lib/student-scope';
import { Banner, Button, Card, ListItem, Screen, Text } from '../../ui';
import { Loadable, Section } from '../student/common';
import { NoLinkedStudent, StudentSwitcher } from './switcher';

function Invoices({ studentId }: { studentId: string }) {
  const { t, i18n } = useTranslation();
  const services = useServices();
  const zone = useDisplayZone();
  const invoices = useInvoices(studentId);
  const [opening, setOpening] = useState<string | null>(null);
  const [problem, setProblem] = useState<string | null>(null);

  const download = async (invoice: Invoice) => {
    setOpening(invoice.id);
    setProblem(null);
    const result = await fetchInvoicePdf(services, invoice.id);
    setOpening(null);
    if (!result.ok) {
      setProblem(errorMessage(t, result));
      return;
    }
    await openPdf(result.bytes);
  };

  return (
    <Section title={t('balance.invoices')}>
      {problem ? <Banner tone="danger" message={problem} /> : null}
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
                  (invoice.issuedAt ? formatDate(invoice.issuedAt, zone) : '') +
                  (opening === invoice.id ? ` · ${t('parent.openingPdf')}` : '')
                }
                accessory={<Text tone="muted">{t('parent.pdf')}</Text>}
                onPress={invoice.issuedAt ? () => void download(invoice) : undefined}
              />
            ))
          )
        }
      </Loadable>
    </Section>
  );
}

export function ParentMoneyScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const { links } = useStudentScope();
  const { query, selected } = useParentStudents();
  const balance = useBalance(selected?.id);

  return (
    <Screen title={t('parent.moneyTitle')}>
      <Loadable query={query}>
        {() =>
          selected ? (
            <>
              <StudentSwitcher />
              <Card>
                <Text variant="label" tone="muted">
                  {t('balance.current')}
                </Text>
                <Text variant="title">
                  {balance.data ? formatDuration(t, balance.data.balanceMinutes) : '…'}
                </Text>
                <Button title={t('parent.buy')} onPress={() => router.push(links.shop)} />
              </Card>
              <Invoices studentId={selected.id} />
            </>
          ) : (
            <NoLinkedStudent />
          )
        }
      </Loadable>
    </Screen>
  );
}
