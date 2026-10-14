import type { Invoice } from '@driveos/shared';
import { createFileRoute } from '@tanstack/react-router';
import { Plus, SlidersHorizontal } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { z } from 'zod';
import { InvoiceActions, invoiceNumber, InvoiceTotal } from '@/components/billing/invoice-cells';
import { RecordPaymentForm } from '@/components/billing/record-payment-form';
import { RefundDialog } from '@/components/billing/refund-dialog';
import { useInvoices } from '@/components/billing/use-invoices';
import { columnHelperFor, DataTable } from '@/components/data-table';
import { FormDialog } from '@/components/form-dialog';
import { DateRangeFilter, FilterBar, StudentFilter } from '@/components/list-filters';
import { PageHeader } from '@/components/page-header';
import { RequirePermission } from '@/components/require-permission';
import { AdjustmentForm } from '@/components/students/balance-tab';
import { Button } from '@/components/ui/button';
import { useCursorPagination } from '@/hooks/use-cursor-pagination';
import { useCan } from '@/hooks/use-session';
import { dateParam } from '@/lib/date-range';
import { formatDate } from '@/lib/format';
import { listSearchSchema } from '@/lib/search';

const paymentsSearchSchema = listSearchSchema.extend({
  studentId: z.uuid().optional().catch(undefined),
  from: dateParam(),
  to: dateParam(),
});

export const Route = createFileRoute('/_app/payments')({
  validateSearch: (search) => paymentsSearchSchema.parse(search),
  component: () => (
    <RequirePermission anyOf={['payments.cash.record']}>
      <PaymentsPage />
    </RequirePermission>
  ),
});

const helper = columnHelperFor<Invoice>();

function PaymentsPage() {
  const { t } = useTranslation();
  const canRefund = useCan('refunds.create');
  const canAdjust = useCan('ledger.adjust');
  const search = Route.useSearch();
  const navigate = Route.useNavigate();
  const [dialog, setDialog] = useState<'record' | 'adjust' | null>(null);
  const [refunding, setRefunding] = useState<Invoice | null>(null);
  const pagination = useCursorPagination(
    search.cursor,
    (cursor) => void navigate({ search: (prev) => ({ ...prev, cursor }) }),
  );
  const filter = (patch: Partial<z.output<typeof paymentsSearchSchema>>) =>
    void navigate({ search: (prev) => ({ ...prev, ...patch, cursor: undefined }) });
  const list = useInvoices(search, 'invoice');
  const close = () => setDialog(null);

  const columns = useMemo(
    () =>
      helper.columns([
        helper.accessor('issuedAt', {
          header: t('payments.received'),
          cell: ({ getValue }) => {
            const issued = getValue();
            return issued ? formatDate(issued) : '—';
          },
        }),
        helper.accessor('buyerName', { header: t('payments.student') }),
        helper.display({
          id: 'items',
          header: t('payments.items'),
          cell: ({ row }) => row.original.lines.map((line) => line.description).join(', '),
        }),
        helper.accessor('totalMinor', {
          header: () => <span className="block text-right">{t('payments.amount')}</span>,
          cell: ({ row }) => <InvoiceTotal invoice={row.original} />,
        }),
        helper.display({
          id: 'invoice',
          header: t('payments.invoice'),
          cell: ({ row }) => invoiceNumber(row.original, t('invoices.draft')),
        }),
        helper.display({
          id: 'actions',
          header: () => <span className="sr-only">{t('common.actions')}</span>,
          cell: ({ row }) => (
            <InvoiceActions invoice={row.original} canRefund={canRefund} onRefund={setRefunding} />
          ),
        }),
      ]),
    [t, canRefund],
  );

  const actions = (
    <>
      {canAdjust && search.studentId && (
        <Button variant="outline" onClick={() => setDialog('adjust')}>
          <SlidersHorizontal aria-hidden />
          {t('ledger.adjust')}
        </Button>
      )}
      <Button onClick={() => setDialog('record')}>
        <Plus aria-hidden />
        {t('payments.record')}
      </Button>
    </>
  );

  return (
    <>
      <PageHeader
        title={t('payments.title')}
        description={t('payments.description')}
        actions={actions}
      />
      <FilterBar>
        <StudentFilter value={search.studentId} onChange={(studentId) => filter({ studentId })} />
        <DateRangeFilter from={search.from} to={search.to} onChange={filter} />
      </FilterBar>
      {canAdjust && !search.studentId && (
        <p className="text-muted-foreground text-sm">{t('payments.adjustHint')}</p>
      )}
      <DataTable
        label={t('payments.title')}
        columns={columns}
        items={list.data?.items}
        nextCursor={list.data?.nextCursor}
        status={list.status}
        error={list.error}
        onRetry={() => void list.refetch()}
        pagination={pagination}
        getRowId={(invoice) => invoice.id}
        emptyTitle={t('payments.empty')}
        emptyDescription={t('payments.emptyBody')}
      />
      <FormDialog
        open={dialog === 'record'}
        onOpenChange={(open) => !open && close()}
        title={t('payments.recordTitle')}
        description={t('payments.recordBody')}
      >
        <RecordPaymentForm studentId={search.studentId} onDone={close} />
      </FormDialog>
      <FormDialog
        open={dialog === 'adjust'}
        onOpenChange={(open) => !open && close()}
        title={t('ledger.adjustTitle')}
        description={t('ledger.adjustBody')}
      >
        {search.studentId && <AdjustmentForm studentId={search.studentId} onDone={close} />}
      </FormDialog>
      <RefundDialog invoice={refunding} onClose={() => setRefunding(null)} />
    </>
  );
}
