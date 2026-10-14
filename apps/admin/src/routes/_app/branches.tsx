import type { Branch } from '@driveos/shared';
import { keepPreviousData } from '@tanstack/react-query';
import { createFileRoute } from '@tanstack/react-router';
import { Plus } from 'lucide-react';
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { BranchForm } from '@/components/branches/branch-form';
import { columnHelperFor, DataTable } from '@/components/data-table';
import { FormDialog } from '@/components/form-dialog';
import { PageHeader } from '@/components/page-header';
import { RequirePermission } from '@/components/require-permission';
import { EditButton } from '@/components/table-cells';
import { Button } from '@/components/ui/button';
import { useCursorPagination } from '@/hooks/use-cursor-pagination';
import { useDialogTarget } from '@/hooks/use-dialog-target';
import { useServices } from '@/hooks/use-services';
import { useCan } from '@/hooks/use-session';
import { formatNumber } from '@/lib/format';
import { pageQuery, parseListSearch } from '@/lib/search';

export const Route = createFileRoute('/_app/branches')({
  validateSearch: parseListSearch,
  component: () => (
    <RequirePermission anyOf={['school.read']}>
      <BranchesPage />
    </RequirePermission>
  ),
});

const helper = columnHelperFor<Branch>();

function BranchesPage() {
  const { t } = useTranslation();
  const { api } = useServices();
  const canManage = useCan('branches.manage');
  const search = Route.useSearch();
  const navigate = Route.useNavigate();
  const pagination = useCursorPagination(
    search.cursor,
    (cursor) => void navigate({ search: (prev) => ({ ...prev, cursor }) }),
  );
  const dialog = useDialogTarget<Branch>();
  const { edit } = dialog;
  const list = api.$api.useQuery(
    'get',
    '/v1/branches',
    { params: { query: pageQuery(search) } },
    { placeholderData: keepPreviousData },
  );

  const columns = useMemo(
    () =>
      helper.columns([
        helper.accessor('name', { header: t('branches.name') }),
        helper.accessor('address', { header: t('branches.address') }),
        helper.display({
          id: 'location',
          header: t('branches.location'),
          cell: ({ row }) =>
            `${formatNumber(row.original.lat, 5)}, ${formatNumber(row.original.lng, 5)}`,
        }),
        ...(canManage
          ? [
              helper.display({
                id: 'actions',
                header: () => <span className="sr-only">{t('common.actions')}</span>,
                cell: ({ row }) => <EditButton onClick={() => edit(row.original)} />,
              }),
            ]
          : []),
      ]),
    [t, canManage, edit],
  );

  const addButton = canManage ? (
    <Button onClick={dialog.create}>
      <Plus aria-hidden />
      {t('branches.add')}
    </Button>
  ) : undefined;

  return (
    <>
      <PageHeader title={t('branches.title')} actions={addButton} />
      <DataTable
        label={t('branches.title')}
        columns={columns}
        items={list.data?.items}
        nextCursor={list.data?.nextCursor}
        status={list.status}
        error={list.error}
        onRetry={() => void list.refetch()}
        pagination={pagination}
        getRowId={(branch) => branch.id}
        emptyTitle={t('branches.empty')}
        emptyDescription={t('branches.emptyBody')}
      />
      <FormDialog
        open={dialog.open}
        onOpenChange={(open) => !open && dialog.close()}
        title={dialog.target.mode === 'edit' ? t('branches.editTitle') : t('branches.addTitle')}
      >
        <BranchForm
          key={dialog.target.mode === 'edit' ? dialog.target.item.id : 'new'}
          branch={dialog.target.mode === 'edit' ? dialog.target.item : undefined}
          onDone={dialog.close}
        />
      </FormDialog>
    </>
  );
}
