import type { PriceItem } from '@driveos/shared';
import { keepPreviousData } from '@tanstack/react-query';
import { createFileRoute } from '@tanstack/react-router';
import { Plus } from 'lucide-react';
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { columnHelperFor, DataTable } from '@/components/data-table';
import { FormDialog } from '@/components/form-dialog';
import { PageHeader } from '@/components/page-header';
import { PriceItemForm } from '@/components/price-items/price-item-form';
import { RequirePermission } from '@/components/require-permission';
import { ActiveBadge, EditButton } from '@/components/table-cells';
import { Button } from '@/components/ui/button';
import { useCursorPagination } from '@/hooks/use-cursor-pagination';
import { useDialogTarget } from '@/hooks/use-dialog-target';
import { useServices } from '@/hooks/use-services';
import { formatPercentFromBasisPoints } from '@/lib/format';
import { formatMoney } from '@/lib/money';
import { pageQuery, parseListSearch } from '@/lib/search';

export const Route = createFileRoute('/_app/price-items')({
  validateSearch: parseListSearch,
  component: () => (
    <RequirePermission anyOf={['prices.manage']}>
      <PriceItemsPage />
    </RequirePermission>
  ),
});

const helper = columnHelperFor<PriceItem>();

function PriceItemsPage() {
  const { t } = useTranslation();
  const { api } = useServices();
  const search = Route.useSearch();
  const navigate = Route.useNavigate();
  const pagination = useCursorPagination(
    search.cursor,
    (cursor) => void navigate({ search: (prev) => ({ ...prev, cursor }) }),
  );
  const dialog = useDialogTarget<PriceItem>();
  const { edit } = dialog;
  const school = api.$api.useQuery('get', '/v1/school');
  const list = api.$api.useQuery(
    'get',
    '/v1/price-items',
    { params: { query: pageQuery(search) } },
    { placeholderData: keepPreviousData },
  );

  const columns = useMemo(
    () =>
      helper.columns([
        helper.accessor('name', { header: t('priceItems.name') }),
        helper.accessor('kind', {
          header: t('priceItems.kind'),
          cell: ({ getValue }) => t(`priceItems.kindValue.${getValue()}`),
        }),
        helper.accessor('amountMinor', {
          header: t('priceItems.price'),
          cell: ({ row }) => formatMoney(row.original.amountMinor, row.original.currency),
        }),
        helper.accessor('taxRateBp', {
          header: t('priceItems.tax'),
          cell: ({ getValue }) => formatPercentFromBasisPoints(getValue()),
        }),
        helper.accessor('creditMinutes', {
          header: t('priceItems.creditMinutes'),
          cell: ({ getValue }) => getValue() ?? '—',
        }),
        helper.accessor('entitlementKind', {
          header: t('priceItems.entitlementKind'),
          cell: ({ getValue }) => {
            const kind = getValue();
            return kind ? t(`entitlements.${kind}`) : '—';
          },
        }),
        helper.accessor('active', {
          header: t('priceItems.status'),
          cell: ({ getValue }) => <ActiveBadge active={getValue()} />,
        }),
        helper.display({
          id: 'actions',
          header: () => <span className="sr-only">{t('common.actions')}</span>,
          cell: ({ row }) => <EditButton onClick={() => edit(row.original)} />,
        }),
      ]),
    [t, edit],
  );

  const currency = school.data?.currency;

  return (
    <>
      <PageHeader
        title={t('priceItems.title')}
        actions={
          <Button onClick={dialog.create} disabled={!currency}>
            <Plus aria-hidden />
            {t('priceItems.add')}
          </Button>
        }
      />
      <DataTable
        label={t('priceItems.title')}
        columns={columns}
        items={list.data?.items}
        nextCursor={list.data?.nextCursor}
        status={list.status}
        error={list.error}
        onRetry={() => void list.refetch()}
        pagination={pagination}
        getRowId={(item) => item.id}
        emptyTitle={t('priceItems.empty')}
        emptyDescription={t('priceItems.emptyBody')}
      />
      <FormDialog
        open={dialog.open}
        onOpenChange={(open) => !open && dialog.close()}
        title={dialog.target.mode === 'edit' ? t('priceItems.editTitle') : t('priceItems.addTitle')}
      >
        {currency && (
          <PriceItemForm
            key={dialog.target.mode === 'edit' ? dialog.target.item.id : 'new'}
            priceItem={dialog.target.mode === 'edit' ? dialog.target.item : undefined}
            currency={currency}
            onDone={dialog.close}
          />
        )}
      </FormDialog>
    </>
  );
}
