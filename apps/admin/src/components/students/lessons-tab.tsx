import type { LessonResponse } from '@driveos/shared';
import { keepPreviousData } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { CalendarDays } from 'lucide-react';
import { useId, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { columnHelperFor, DataTable } from '@/components/data-table';
import { ErrorState, LoadingState } from '@/components/states';
import { Badge } from '@/components/ui/badge';
import { buttonVariants } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useCursorPagination } from '@/hooks/use-cursor-pagination';
import { useSchoolClock } from '@/hooks/use-school-clock';
import { useServices } from '@/hooks/use-services';
import { formatDateTimeIn } from '@/lib/format';
import { pageQuery } from '@/lib/search';
import { addDays, todayIn, zonedToUtc } from '@/lib/zoned-time';
import type { StudentSearch, StudentSearchPatch } from './student-profile';

const DAYS_BACK = 30;
const DAYS_AHEAD = 60;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

const helper = columnHelperFor<LessonResponse>();

export function LessonsTab({
  studentId,
  search,
  onSearch,
}: {
  studentId: string;
  search: StudentSearch;
  onSearch: (patch: StudentSearchPatch) => void;
}) {
  const clock = useSchoolClock();
  if (clock.status === 'pending' || !clock.timeZone) return <LoadingState />;
  if (clock.status === 'error')
    return <ErrorState error={clock.error} onRetry={() => void clock.refetch()} />;
  return (
    <LessonsInRange
      studentId={studentId}
      search={search}
      onSearch={onSearch}
      timeZone={clock.timeZone}
    />
  );
}

function LessonsInRange({
  studentId,
  search,
  onSearch,
  timeZone,
}: {
  studentId: string;
  search: StudentSearch;
  onSearch: (patch: StudentSearchPatch) => void;
  timeZone: string;
}) {
  const { t } = useTranslation();
  const { api } = useServices();
  const fromId = useId();
  const toId = useId();
  const today = todayIn(timeZone, new Date());
  const from = search.from ?? addDays(today, -DAYS_BACK);
  const to = search.to ?? addDays(today, DAYS_AHEAD);
  const validRange = from <= to;
  const pagination = useCursorPagination(search.cursor, (cursor) => onSearch({ cursor }));
  const lessons = api.$api.useQuery(
    'get',
    '/v1/calendar',
    {
      params: {
        query: {
          ...pageQuery(search),
          studentId,
          from: zonedToUtc(from, 0, timeZone),
          to: zonedToUtc(addDays(to, 1), 0, timeZone),
        },
      },
    },
    { placeholderData: keepPreviousData, enabled: validRange },
  );
  const columns = useMemo(
    () =>
      helper.columns([
        helper.accessor('start', {
          header: t('studentLessons.when'),
          cell: ({ getValue }) => formatDateTimeIn(getValue(), timeZone),
        }),
        helper.accessor('lessonTypeName', { header: t('studentLessons.type') }),
        helper.accessor('instructorName', { header: t('studentLessons.instructor') }),
        helper.accessor('vehiclePlate', {
          header: t('studentLessons.vehicle'),
          cell: ({ getValue }) => getValue() ?? '—',
        }),
        helper.accessor('creditMinutes', {
          header: t('studentLessons.credit'),
          cell: ({ getValue }) => t('students.minutes', { value: getValue() }),
        }),
        helper.accessor('status', {
          header: t('studentLessons.status'),
          cell: ({ row }) => (
            <Badge variant={row.original.status === 'booked' ? 'secondary' : 'outline'}>
              {t(`calendar.status.${row.original.status}`)}
              {row.original.lateCancel && ` · ${t('studentLessons.late')}`}
            </Badge>
          ),
        }),
      ]),
    [t, timeZone],
  );
  const setDate = (key: 'from' | 'to', value: string) => {
    if (ISO_DATE.test(value)) onSearch({ [key]: value, cursor: undefined });
  };
  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex flex-wrap items-end gap-4">
          <div className="grid gap-2">
            <Label htmlFor={fromId}>{t('studentLessons.from')}</Label>
            <Input
              id={fromId}
              type="date"
              defaultValue={from}
              onChange={(event) => setDate('from', event.target.value)}
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor={toId}>{t('studentLessons.to')}</Label>
            <Input
              id={toId}
              type="date"
              defaultValue={to}
              onChange={(event) => setDate('to', event.target.value)}
            />
          </div>
        </div>
        <Link
          to="/calendar"
          search={{ studentId, date: from > today || to < today ? from : today }}
          className={buttonVariants({ variant: 'outline' })}
        >
          <CalendarDays aria-hidden />
          {t('studentLessons.openCalendar')}
        </Link>
      </div>
      {validRange ? (
        <DataTable
          label={t('studentLessons.title')}
          columns={columns}
          items={lessons.data?.items}
          nextCursor={lessons.data?.nextCursor}
          status={lessons.status}
          error={lessons.error}
          onRetry={() => void lessons.refetch()}
          pagination={pagination}
          getRowId={(lesson) => lesson.id}
          emptyTitle={t('studentLessons.empty')}
        />
      ) : (
        <p role="alert" className="text-destructive text-sm">
          {t('validation.startBeforeEnd')}
        </p>
      )}
    </section>
  );
}
