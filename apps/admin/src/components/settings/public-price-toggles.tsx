import type { PriceItem } from '@driveos/shared';
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { columnHelperFor, DataTable } from '@/components/data-table';
import { Switch } from '@/components/ui/switch';
import { useInvalidate } from '@/hooks/use-invalidate';
import { useServices } from '@/hooks/use-services';
import { formatMoney } from '@/lib/money';

const helper = columnHelperFor<PriceItem>();
const ACTIVE_ITEMS = { active: 'true', limit: 200 } as const;

/** Which active price items the public page lists (`show_on_public_page`). */
export function PublicPriceToggles() {
  const { t } = useTranslation();
  const { api } = useServices();
  const items = api.$api.useQuery('get', '/v1/price-items', {
    params: { query: ACTIVE_ITEMS },
  });
  const columns = useMemo(
    () =>
      helper.columns([
        helper.accessor('name', { header: t('publicPage.prices.name') }),
        helper.accessor('amountMinor', {
          header: t('publicPage.prices.amount'),
          cell: ({ row }) => formatMoney(row.original.amountMinor, row.original.currency),
        }),
        helper.accessor('showOnPublicPage', {
          header: t('publicPage.prices.onPage'),
          cell: ({ row }) => <PriceToggle item={row.original} />,
        }),
      ]),
    [t],
  );
  return (
    <DataTable
      label={t('publicPage.prices.title')}
      columns={columns}
      items={items.data?.items}
      nextCursor={null}
      status={items.status}
      error={items.error}
      onRetry={() => void items.refetch()}
      getRowId={(item) => item.id}
      emptyTitle={t('publicPage.prices.empty')}
    />
  );
}

function PriceToggle({ item }: { item: PriceItem }) {
  const { t } = useTranslation();
  const { api } = useServices();
  const invalidate = useInvalidate();
  const update = api.$api.useMutation('patch', '/v1/price-items/{id}');
  return (
    <Switch
      checked={
        update.isPending
          ? (update.variables.body?.showOnPublicPage ?? false)
          : item.showOnPublicPage
      }
      disabled={update.isPending}
      aria-label={t('publicPage.prices.show', { name: item.name })}
      onCheckedChange={(checked) =>
        update.mutate(
          { params: { path: { id: item.id } }, body: { showOnPublicPage: checked } },
          {
            onSuccess: async () => {
              await invalidate('/v1/price-items');
              toast.success(t('publicPage.prices.saved'));
            },
            onError: () => toast.error(t('errors.generic')),
          },
        )
      }
    />
  );
}
