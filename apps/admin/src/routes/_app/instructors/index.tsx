import type { StaffMember } from '@driveos/shared';
import { createFileRoute, Link } from '@tanstack/react-router';
import { CalendarClock } from 'lucide-react';
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { columnHelperFor, DataTable } from '@/components/data-table';
import { PageHeader } from '@/components/page-header';
import { RequirePermission } from '@/components/require-permission';
import { Button } from '@/components/ui/button';
import { useInstructors } from '@/hooks/use-scheduling-options';

export const Route = createFileRoute('/_app/instructors/')({
  component: () => (
    <RequirePermission anyOf={['availability.manage']}>
      <InstructorsPage />
    </RequirePermission>
  ),
});

const helper = columnHelperFor<StaffMember>();

function InstructorsPage() {
  const { t } = useTranslation();
  const instructors = useInstructors();
  const columns = useMemo(
    () =>
      helper.columns([
        helper.accessor('fullName', { header: t('availability.name') }),
        helper.display({
          id: 'contact',
          header: t('availability.contact'),
          cell: ({ row }) => row.original.email ?? row.original.phone ?? '',
        }),
        helper.display({
          id: 'actions',
          header: () => <span className="sr-only">{t('common.actions')}</span>,
          cell: ({ row }) => (
            <Button asChild variant="ghost" size="sm">
              <Link to="/instructors/$id/availability" params={{ id: row.original.membershipId }}>
                <CalendarClock aria-hidden />
                {t('availability.edit')}
              </Link>
            </Button>
          ),
        }),
      ]),
    [t],
  );
  return (
    <>
      <PageHeader title={t('availability.title')} description={t('availability.listDescription')} />
      <DataTable
        label={t('availability.instructors')}
        columns={columns}
        items={instructors.items}
        nextCursor={null}
        status={instructors.status}
        error={instructors.error}
        onRetry={() => void instructors.refetch()}
        getRowId={(member) => member.membershipId}
        emptyTitle={t('availability.empty')}
        emptyDescription={t('availability.emptyBody')}
      />
    </>
  );
}
