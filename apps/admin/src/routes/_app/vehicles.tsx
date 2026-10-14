import type { Vehicle } from '@driveos/shared';
import { keepPreviousData } from '@tanstack/react-query';
import { createFileRoute } from '@tanstack/react-router';
import { Plus } from 'lucide-react';
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { columnHelperFor, DataTable } from '@/components/data-table';
import { FormDialog } from '@/components/form-dialog';
import { PageHeader } from '@/components/page-header';
import { RequirePermission } from '@/components/require-permission';
import { ActiveBadge, EditButton } from '@/components/table-cells';
import { Button } from '@/components/ui/button';
import { VehicleForm } from '@/components/vehicles/vehicle-form';
import { useBranchOptions } from '@/hooks/use-branch-options';
import { useCursorPagination } from '@/hooks/use-cursor-pagination';
import { useDialogTarget } from '@/hooks/use-dialog-target';
import { useServices } from '@/hooks/use-services';
import { useCan } from '@/hooks/use-session';
import { pageQuery, parseListSearch } from '@/lib/search';

export const Route = createFileRoute('/_app/vehicles')({
  validateSearch: parseListSearch,
  component: () => (
    <RequirePermission anyOf={['school.read']}>
      <VehiclesPage />
    </RequirePermission>
  ),
});

const helper = columnHelperFor<Vehicle>();

function VehiclesPage() {
  const { t } = useTranslation();
  const { api } = useServices();
  const canManage = useCan('vehicles.manage');
  const search = Route.useSearch();
  const navigate = Route.useNavigate();
  const pagination = useCursorPagination(
    search.cursor,
    (cursor) => void navigate({ search: (prev) => ({ ...prev, cursor }) }),
  );
  const dialog = useDialogTarget<Vehicle>();
  const { edit } = dialog;
  const branches = useBranchOptions();
  const list = api.$api.useQuery(
    'get',
    '/v1/vehicles',
    { params: { query: pageQuery(search) } },
    { placeholderData: keepPreviousData },
  );

  const columns = useMemo(
    () =>
      helper.columns([
        helper.accessor('plate', { header: t('vehicles.plate') }),
        helper.accessor('makeModel', { header: t('vehicles.makeModel') }),
        helper.accessor('transmission', {
          header: t('vehicles.transmission'),
          cell: ({ getValue }) => t(`vehicles.transmissionValue.${getValue()}`),
        }),
        helper.accessor('licenceClass', { header: t('vehicles.licenceClass') }),
        helper.accessor('branchId', {
          header: t('vehicles.branch'),
          cell: ({ getValue }) => branches.nameOf(getValue()),
        }),
        helper.accessor('active', {
          header: t('vehicles.status'),
          cell: ({ getValue }) => <ActiveBadge active={getValue()} />,
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
    [t, canManage, edit, branches],
  );

  return (
    <>
      <PageHeader
        title={t('vehicles.title')}
        actions={
          canManage ? (
            <Button onClick={dialog.create}>
              <Plus aria-hidden />
              {t('vehicles.add')}
            </Button>
          ) : undefined
        }
      />
      <DataTable
        label={t('vehicles.title')}
        columns={columns}
        items={list.data?.items}
        nextCursor={list.data?.nextCursor}
        status={list.status}
        error={list.error}
        onRetry={() => void list.refetch()}
        pagination={pagination}
        getRowId={(vehicle) => vehicle.id}
        emptyTitle={t('vehicles.empty')}
        emptyDescription={t('vehicles.emptyBody')}
      />
      <FormDialog
        open={dialog.open}
        onOpenChange={(open) => !open && dialog.close()}
        title={dialog.target.mode === 'edit' ? t('vehicles.editTitle') : t('vehicles.addTitle')}
      >
        <VehicleForm
          key={dialog.target.mode === 'edit' ? dialog.target.item.id : 'new'}
          vehicle={dialog.target.mode === 'edit' ? dialog.target.item : undefined}
          branchOptions={branches.options}
          onDone={dialog.close}
        />
      </FormDialog>
    </>
  );
}
