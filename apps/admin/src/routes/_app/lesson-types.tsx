import type { LessonType } from '@driveos/shared';
import { keepPreviousData } from '@tanstack/react-query';
import { createFileRoute } from '@tanstack/react-router';
import { Plus } from 'lucide-react';
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { columnHelperFor, DataTable } from '@/components/data-table';
import { FormDialog } from '@/components/form-dialog';
import { LessonTypeForm } from '@/components/lesson-types/lesson-type-form';
import { PageHeader } from '@/components/page-header';
import { RequirePermission } from '@/components/require-permission';
import { ActiveBadge, EditButton, YesNo } from '@/components/table-cells';
import { Button } from '@/components/ui/button';
import { useCursorPagination } from '@/hooks/use-cursor-pagination';
import { useDialogTarget } from '@/hooks/use-dialog-target';
import { useServices } from '@/hooks/use-services';
import { useCan } from '@/hooks/use-session';
import { pageQuery, parseListSearch } from '@/lib/search';

export const Route = createFileRoute('/_app/lesson-types')({
  validateSearch: parseListSearch,
  component: () => (
    <RequirePermission anyOf={['lesson_types.manage', 'calendar.read']}>
      <LessonTypesPage />
    </RequirePermission>
  ),
});

const helper = columnHelperFor<LessonType>();

function LessonTypesPage() {
  const { t } = useTranslation();
  const { api } = useServices();
  const canManage = useCan('lesson_types.manage');
  const search = Route.useSearch();
  const navigate = Route.useNavigate();
  const pagination = useCursorPagination(
    search.cursor,
    (cursor) => void navigate({ search: (prev) => ({ ...prev, cursor }) }),
  );
  const dialog = useDialogTarget<LessonType>();
  const { edit } = dialog;
  const list = api.$api.useQuery(
    'get',
    '/v1/lesson-types',
    { params: { query: pageQuery(search) } },
    { placeholderData: keepPreviousData },
  );

  const columns = useMemo(
    () =>
      helper.columns([
        helper.accessor('name', { header: t('lessonTypes.name') }),
        helper.accessor('kind', {
          header: t('lessonTypes.kind'),
          cell: ({ getValue }) => t(`lessonTypes.kindValue.${getValue()}`),
        }),
        helper.accessor('licenceClass', { header: t('lessonTypes.licenceClass') }),
        helper.accessor('minutes', { header: t('lessonTypes.minutes') }),
        helper.accessor('creditMinutes', { header: t('lessonTypes.creditMinutes') }),
        helper.accessor('requiresVehicle', {
          header: t('lessonTypes.requiresVehicle'),
          cell: ({ getValue }) => <YesNo value={getValue()} />,
        }),
        helper.accessor('requiresEntitlement', {
          header: t('lessonTypes.requiresEntitlement'),
          cell: ({ getValue }) => {
            const kind = getValue();
            return kind ? t(`entitlements.${kind}`) : t('common.none');
          },
        }),
        helper.accessor('active', {
          header: t('lessonTypes.status'),
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
    [t, canManage, edit],
  );

  return (
    <>
      <PageHeader
        title={t('lessonTypes.title')}
        actions={
          canManage ? (
            <Button onClick={dialog.create}>
              <Plus aria-hidden />
              {t('lessonTypes.add')}
            </Button>
          ) : undefined
        }
      />
      <DataTable
        label={t('lessonTypes.title')}
        columns={columns}
        items={list.data?.items}
        nextCursor={list.data?.nextCursor}
        status={list.status}
        error={list.error}
        onRetry={() => void list.refetch()}
        pagination={pagination}
        getRowId={(lessonType) => lessonType.id}
        emptyTitle={t('lessonTypes.empty')}
      />
      <FormDialog
        open={dialog.open}
        onOpenChange={(open) => !open && dialog.close()}
        title={
          dialog.target.mode === 'edit' ? t('lessonTypes.editTitle') : t('lessonTypes.addTitle')
        }
      >
        <LessonTypeForm
          key={dialog.target.mode === 'edit' ? dialog.target.item.id : 'new'}
          lessonType={dialog.target.mode === 'edit' ? dialog.target.item : undefined}
          onDone={dialog.close}
        />
      </FormDialog>
    </>
  );
}
