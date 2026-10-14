import type { AvailabilityWindow } from '@driveos/shared';
import { Link } from '@tanstack/react-router';
import { ChevronLeft } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { columnHelperFor, DataTable } from '@/components/data-table';
import { PageHeader } from '@/components/page-header';
import { ErrorState, LoadingState } from '@/components/states';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { useInstructors } from '@/hooks/use-scheduling-options';
import { useSchoolClock } from '@/hooks/use-school-clock';
import { useServices } from '@/hooks/use-services';
import { formatPlainDate } from '@/lib/format';
import { todayIn } from '@/lib/zoned-time';
import { TimeOffSection } from './time-off-section';
import { WeeklyHoursForm } from './weekly-hours-form';

const helper = columnHelperFor<AvailabilityWindow>();

export function AvailabilityPage({ instructorId }: { instructorId: string }) {
  const { t } = useTranslation();
  const { api } = useServices();
  const clock = useSchoolClock();
  const instructors = useInstructors();
  const availability = api.$api.useQuery('get', '/v1/instructors/{id}/availability', {
    params: { path: { id: instructorId } },
  });
  const name = instructors.nameOf(instructorId) ?? '';
  const columns = useMemo(
    () =>
      helper.columns([
        helper.accessor('weekday', {
          header: t('availability.day'),
          cell: ({ getValue }) => t(`weekdays.${getValue()}` as 'weekdays.1'),
        }),
        helper.display({
          id: 'hours',
          header: t('availability.hours'),
          cell: ({ row }) => `${row.original.startTime}–${row.original.endTime}`,
        }),
        helper.accessor('validFrom', {
          header: t('availability.validFrom'),
          cell: ({ getValue }) => formatPlainDate(getValue()),
        }),
        helper.accessor('validTo', {
          header: t('availability.validTo'),
          cell: ({ getValue }) => {
            const value = getValue();
            return value ? formatPlainDate(value) : t('availability.openEnded');
          },
        }),
      ]),
    [t],
  );

  const back = (
    <Button asChild variant="outline">
      <Link to="/instructors">
        <ChevronLeft aria-hidden />
        {t('availability.back')}
      </Link>
    </Button>
  );

  return (
    <>
      <PageHeader title={t('availability.pageTitle', { name })} actions={back} />
      {(availability.isPending || clock.status === 'pending') && <LoadingState />}
      {availability.isError && (
        <ErrorState error={availability.error} onRetry={() => void availability.refetch()} />
      )}
      {availability.data && clock.timeZone && (
        <AvailabilityContent
          instructorId={instructorId}
          windows={availability.data.items}
          timeOff={availability.data.timeOff}
          timeZone={clock.timeZone}
          columns={columns}
        />
      )}
    </>
  );
}

function AvailabilityContent({
  instructorId,
  windows,
  timeOff,
  timeZone,
  columns,
}: {
  instructorId: string;
  windows: AvailabilityWindow[];
  timeOff: Parameters<typeof TimeOffSection>[0]['timeOff'];
  timeZone: string;
  columns: ReturnType<typeof helper.columns>;
}) {
  const { t } = useTranslation();
  const [today] = useState(() => todayIn(timeZone, new Date()));
  const sorted = [...windows].sort(
    (a, b) =>
      a.validFrom.localeCompare(b.validFrom) ||
      a.weekday - b.weekday ||
      a.startTime.localeCompare(b.startTime),
  );
  return (
    <div className="grid gap-6 xl:grid-cols-2 xl:items-start">
      <Card>
        <CardContent>
          <WeeklyHoursForm
            instructorId={instructorId}
            windows={windows}
            today={today}
            timeZone={timeZone}
          />
        </CardContent>
      </Card>
      <div className="grid gap-6">
        <section className="grid gap-3">
          <h2 className="text-lg font-medium">{t('availability.current')}</h2>
          <DataTable
            label={t('availability.current')}
            columns={columns}
            items={sorted}
            nextCursor={null}
            status="success"
            getRowId={(window) => window.id}
            emptyTitle={t('availability.noSchedule')}
          />
        </section>
        <Card>
          <CardContent>
            <TimeOffSection instructorId={instructorId} timeOff={timeOff} timeZone={timeZone} />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
