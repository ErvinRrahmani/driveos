import { type PlatformStatement, platformStatementStatusSchema } from '@driveos/shared';
import { keepPreviousData } from '@tanstack/react-query';
import { createFileRoute } from '@tanstack/react-router';
import { useId, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { z } from 'zod';
import { Amount } from '@/components/billing/invoice-cells';
import { columnHelperFor, DataTable } from '@/components/data-table';
import { FilterBar, MonthFilter, SelectFilter } from '@/components/list-filters';
import { PageHeader } from '@/components/page-header';
import { RequirePermission } from '@/components/require-permission';
import { Badge } from '@/components/ui/badge';
import { Card, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useCursorPagination } from '@/hooks/use-cursor-pagination';
import { useServices } from '@/hooks/use-services';
import { formatDate, formatMonth } from '@/lib/format';
import { formatMoney } from '@/lib/money';
import { listSearchSchema, pageQuery } from '@/lib/search';

const statementsSearchSchema = listSearchSchema.extend({
  status: platformStatementStatusSchema.optional().catch(undefined),
  month: z
    .string()
    .regex(/^\d{4}-(0[1-9]|1[0-2])$/)
    .optional()
    .catch(undefined),
});

export const Route = createFileRoute('/_app/platform-statements')({
  validateSearch: (search) => statementsSearchSchema.parse(search),
  component: () => (
    <RequirePermission anyOf={['platform_statements.read']}>
      <StatementsPage />
    </RequirePermission>
  ),
});

const helper = columnHelperFor<PlatformStatement>();

function StatementsPage() {
  const { t } = useTranslation();
  const { api } = useServices();
  const search = Route.useSearch();
  const navigate = Route.useNavigate();
  const pagination = useCursorPagination(
    search.cursor,
    (cursor) => void navigate({ search: (prev) => ({ ...prev, cursor }) }),
  );
  const filter = (patch: Partial<z.output<typeof statementsSearchSchema>>) =>
    void navigate({ search: (prev) => ({ ...prev, ...patch, cursor: undefined }) });
  const list = api.$api.useQuery(
    'get',
    '/v1/platform-statements',
    { params: { query: { ...pageQuery(search), status: search.status, month: search.month } } },
    { placeholderData: keepPreviousData },
  );

  const columns = useMemo(
    () =>
      helper.columns([
        helper.accessor('month', {
          header: t('statements.month'),
          cell: ({ getValue }) => <span className="font-medium">{formatMonth(getValue())}</span>,
        }),
        helper.accessor('issuedAt', {
          header: t('statements.issued'),
          cell: ({ getValue }) => formatDate(getValue()),
        }),
        helper.accessor('status', {
          header: t('statements.status'),
          cell: ({ getValue }) => (
            <Badge variant={getValue() === 'paid' ? 'secondary' : 'outline'}>
              {t(`statements.statuses.${getValue()}`)}
            </Badge>
          ),
        }),
        helper.display({
          id: 'payment',
          header: t('statements.paid'),
          cell: ({ row }) => <PaymentDetail statement={row.original} />,
        }),
        helper.accessor('totalMinor', {
          header: () => <span className="block text-right">{t('statements.total')}</span>,
          cell: ({ row }) => (
            <span className="block text-right">
              <Amount minor={row.original.totalMinor} currency={row.original.currency} />
            </span>
          ),
        }),
      ]),
    [t],
  );

  return (
    <>
      <PageHeader title={t('statements.title')} description={t('statements.description')} />
      <FilterBar>
        <SelectFilter
          label={t('filters.status')}
          allLabel={t('filters.allStatuses')}
          value={search.status}
          options={platformStatementStatusSchema.options.map((status) => ({
            value: status,
            label: t(`statements.statuses.${status}`),
          }))}
          onChange={(status) =>
            filter({ status: platformStatementStatusSchema.safeParse(status).data })
          }
        />
        <MonthFilter
          label={t('filters.month')}
          value={search.month}
          onChange={(month) => filter({ month })}
        />
      </FilterBar>
      {list.data && <StatementTotals items={list.data.items} />}
      <DataTable
        label={t('statements.title')}
        columns={columns}
        items={list.data?.items}
        nextCursor={list.data?.nextCursor}
        status={list.status}
        error={list.error}
        onRetry={() => void list.refetch()}
        pagination={pagination}
        getRowId={(statement) => statement.id}
        emptyTitle={t('statements.empty')}
        emptyDescription={t('statements.emptyBody')}
      />
    </>
  );
}

function PaymentDetail({ statement }: { statement: PlatformStatement }) {
  const { t } = useTranslation();
  if (!statement.paidAt || !statement.paidMethod) {
    return <span className="text-muted-foreground">{t('statements.notPaid')}</span>;
  }
  const values = {
    date: formatDate(statement.paidAt),
    method: t(`statements.methods.${statement.paidMethod}`),
    reference: statement.paidReference,
  };
  return statement.paidReference
    ? t('statements.paidDetailRef', values)
    : t('statements.paidDetail', values);
}

function sumByCurrency(items: readonly PlatformStatement[], fallbackCurrency: string): string {
  const totals = new Map<string, number>();
  for (const item of items)
    totals.set(item.currency, (totals.get(item.currency) ?? 0) + item.totalMinor);
  if (totals.size === 0) return formatMoney(0, fallbackCurrency);
  return [...totals].map(([currency, minor]) => formatMoney(minor, currency)).join(' + ');
}

function StatementTotals({ items }: { items: readonly PlatformStatement[] }) {
  const { t } = useTranslation();
  const titleId = useId();
  const open = items.filter((item) => item.status === 'issued');
  const paid = items.filter((item) => item.status === 'paid');
  const currency = items[0]?.currency ?? 'EUR';
  const total = (list: readonly PlatformStatement[]) => sumByCurrency(list, currency);
  return (
    <section role="region" aria-labelledby={titleId} className="space-y-2">
      <h2 id={titleId} className="sr-only">
        {t('statements.totals')}
      </h2>
      <div className="grid gap-4 sm:grid-cols-2">
        <Card className="gap-2">
          <CardHeader>
            <CardDescription>{t('statements.outstanding')}</CardDescription>
            <CardTitle className="text-2xl tabular-nums">{total(open)}</CardTitle>
          </CardHeader>
        </Card>
        <Card className="gap-2">
          <CardHeader>
            <CardDescription>{t('statements.paidTotal')}</CardDescription>
            <CardTitle className="text-2xl tabular-nums">{total(paid)}</CardTitle>
          </CardHeader>
        </Card>
      </div>
      <p className="text-muted-foreground text-xs">{t('statements.totalsHint')}</p>
    </section>
  );
}
