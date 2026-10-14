import type { WaitingListEntry } from '@driveos/shared';
import { keepPreviousData } from '@tanstack/react-query';
import { Plus, Trash2 } from 'lucide-react';
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { columnHelperFor, DataTable } from '@/components/data-table';
import { FormDialog } from '@/components/form-dialog';
import { Button } from '@/components/ui/button';
import { WaitingListForm } from '@/components/waiting-list/waiting-list-form';
import { useCursorPagination } from '@/hooks/use-cursor-pagination';
import { useDialogTarget } from '@/hooks/use-dialog-target';
import { useInvalidate } from '@/hooks/use-invalidate';
import { useLessonTypes } from '@/hooks/use-scheduling-options';
import { useServices } from '@/hooks/use-services';
import { apiErrorMessage } from '@/lib/api-errors';
import { formatDate } from '@/lib/format';
import { pageQuery } from '@/lib/search';

const helper = columnHelperFor<WaitingListEntry>();

export function WaitingListSection({
  cursor,
  limit,
  onCursorChange,
}: {
  cursor: string | undefined;
  limit?: number;
  onCursorChange: (cursor: string | undefined) => void;
}) {
  const { t } = useTranslation();
  const { api } = useServices();
  const invalidate = useInvalidate();
  const pagination = useCursorPagination(cursor, onCursorChange);
  const dialog = useDialogTarget<WaitingListEntry>();
  const lessonTypes = useLessonTypes();
  const list = api.$api.useQuery(
    'get',
    '/v1/waiting-list',
    { params: { query: { ...pageQuery({ cursor, limit }), active: 'true' } } },
    { placeholderData: keepPreviousData },
  );
  const leave = api.$api.useMutation('delete', '/v1/waiting-list/{id}');
  const { mutateAsync: leaveAsync } = leave;

  const columns = useMemo(() => {
    const remove = async (entry: WaitingListEntry) => {
      try {
        await leaveAsync({ params: { path: { id: entry.id } } });
        await invalidate('/v1/waiting-list');
        toast.success(t('waitingList.removed'));
      } catch (error) {
        toast.error(apiErrorMessage(error, t('errors.generic')));
      }
    };
    return helper.columns([
      helper.accessor('studentName', { header: t('waitingList.student') }),
      helper.accessor('lessonTypeId', {
        header: t('waitingList.lessonType'),
        cell: ({ getValue }) => lessonTypes.byId(getValue())?.name ?? '',
      }),
      helper.accessor('preferredWindows', {
        header: t('waitingList.windows'),
        cell: ({ getValue }) => (
          <ul>
            {getValue().map((window) => (
              <li key={`${window.weekday}-${window.start}`}>
                {`${t(`weekdaysShort.${window.weekday}` as 'weekdaysShort.1')} ${window.start}–${window.end}`}
              </li>
            ))}
          </ul>
        ),
      }),
      helper.accessor('area', { header: t('waitingList.area') }),
      helper.accessor('createdAt', {
        header: t('waitingList.since'),
        cell: ({ getValue }) => formatDate(getValue()),
      }),
      helper.display({
        id: 'actions',
        header: () => <span className="sr-only">{t('common.actions')}</span>,
        cell: ({ row }) => (
          <Button
            variant="ghost"
            size="sm"
            aria-label={t('waitingList.removeEntry', { student: row.original.studentName })}
            onClick={() => void remove(row.original)}
          >
            <Trash2 aria-hidden />
            {t('waitingList.remove')}
          </Button>
        ),
      }),
    ]);
  }, [t, lessonTypes, leaveAsync, invalidate]);

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button onClick={dialog.create}>
          <Plus aria-hidden />
          {t('waitingList.add')}
        </Button>
      </div>
      <DataTable
        label={t('waitingList.title')}
        columns={columns}
        items={list.data?.items}
        nextCursor={list.data?.nextCursor}
        status={list.status}
        error={list.error}
        onRetry={() => void list.refetch()}
        pagination={pagination}
        getRowId={(entry) => entry.id}
        emptyTitle={t('waitingList.empty')}
        emptyDescription={t('waitingList.emptyBody')}
      />
      <FormDialog
        open={dialog.open}
        onOpenChange={(open) => !open && dialog.close()}
        title={t('waitingList.addTitle')}
      >
        <WaitingListForm onDone={dialog.close} />
      </FormDialog>
    </div>
  );
}
