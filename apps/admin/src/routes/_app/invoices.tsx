import { type Invoice, invoiceKindSchema } from '@driveos/shared';
import { createFileRoute } from '@tanstack/react-router';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { z } from 'zod';
import {
  InvoiceActions,
  InvoiceKindBadge,
  invoiceNumber,
  InvoiceTotal,
} from '@/components/billing/invoice-cells';
import { RefundDialog } from '@/components/billing/refund-dialog';
import { useInvoices } from '@/components/billing/use-invoices';
import { columnHelperFor, DataTable } from '@/components/data-table';
import { DateRangeFilter, FilterBar, SelectFilter, StudentFilter } from '@/components/list-filters';
import { PageHeader } from '@/components/page-header';
import { RequirePermission } from '@/components/require-permission';
import { useCursorPagination } from '@/hooks/use-cursor-pagination';
import { useCan } from '@/hooks/use-session';
import { dateParam } from '@/lib/date-range';
import { formatDate } from '@/lib/format';
import { listSearchSchema } from '@/lib/search';

const invoicesSearchSchema = listSearchSchema.extend({
  studentId: z.uuid().optional().catch(undefined),
  kind: invoiceKindSchema.optional().catch(undefined),
  from: dateParam(),
  to: dateParam(),
});

export const Route = createFileRoute('/_app/invoices')({
  validateSearch: (search) => invoicesSearchSchema.parse(search),
  component: () => (
    <RequirePermission anyOf={['invoices.read']}>
      <InvoicesPage />
    </RequirePermission>
  ),
});

const helper = columnHelperFor<Invoice>();

function InvoicesPage() {
  const { t } = useTranslation();
  const canRefund = useCan('refunds.create');
  const search = Route.useSearch();
  const navigate = Route.useNavigate();
  const [refunding, setRefunding] = useState<Invoice | null>(null);
  const pagination = useCursorPagination(
    search.cursor,
    (cursor) => void navigate({ search: (prev) => ({ ...prev, cursor }) }),
  );
  const filter = (patch: Partial<z.output<typeof invoicesSearchSchema>>) =>
    void navigate({ search: (prev) => ({ ...prev, ...patch, cursor: undefined }) });
  const list = useInvoices(search, search.kind);

  const columns = useMemo(
    () =>
      helper.columns([
        helper.display({
          id: 'number',
          header: t('invoices.number'),
          cell: ({ row }) => (
            <span className="font-medium tabular-nums">
              {invoiceNumber(row.original, t('invoices.draft'))}
            </span>
          ),
        }),
        helper.accessor('kind', {
          header: t('invoices.kind'),
          cell: ({ getValue }) => <InvoiceKindBadge kind={getValue()} />,
        }),
        helper.accessor('buyerName', { header: t('invoices.student') }),
        helper.accessor('issuedAt', {
          header: t('invoices.issued'),
          cell: ({ getValue }) => {
            const issued = getValue();
            return issued ? formatDate(issued) : '—';
          },
        }),
        helper.accessor('status', {
          header: t('invoices.status'),
          cell: ({ getValue }) => t(`invoices.statuses.${getValue()}`),
        }),
        helper.accessor('totalMinor', {
          header: () => <span className="block text-right">{t('invoices.total')}</span>,
          cell: ({ row }) => <InvoiceTotal invoice={row.original} />,
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

  return (
    <>
      <PageHeader title={t('invoices.title')} description={t('invoices.description')} />
      <FilterBar>
        <StudentFilter value={search.studentId} onChange={(studentId) => filter({ studentId })} />
        <SelectFilter
          label={t('invoices.kind')}
          allLabel={t('invoices.allKinds')}
          value={search.kind}
          options={invoiceKindSchema.options.map((kind) => ({
            value: kind,
            label: t(`invoices.kinds.${kind}`),
          }))}
          onChange={(kind) => filter({ kind: invoiceKindSchema.safeParse(kind).data })}
        />
        <DateRangeFilter from={search.from} to={search.to} onChange={filter} />
      </FilterBar>
      <DataTable
        label={t('invoices.title')}
        columns={columns}
        items={list.data?.items}
        nextCursor={list.data?.nextCursor}
        status={list.status}
        error={list.error}
        onRetry={() => void list.refetch()}
        pagination={pagination}
        getRowId={(invoice) => invoice.id}
        emptyTitle={t('invoices.empty')}
        emptyDescription={t('invoices.emptyBody')}
      />
      <RefundDialog invoice={refunding} onClose={() => setRefunding(null)} />
    </>
  );
}
