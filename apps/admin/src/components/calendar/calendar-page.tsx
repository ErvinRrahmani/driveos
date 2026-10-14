import type { FreeSlot, LessonResponse, MoveLessonRequest } from '@driveos/shared';
import { CalendarPlus, ListChecks } from 'lucide-react';
import { useCallback, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { FormDialog } from '@/components/form-dialog';
import { PageHeader } from '@/components/page-header';
import { EmptyState, ErrorState, LoadingState } from '@/components/states';
import { Button } from '@/components/ui/button';
import { useInvalidate } from '@/hooks/use-invalidate';
import { useInstructors, useLessonTypes, useVehicles } from '@/hooks/use-scheduling-options';
import { useSchoolClock } from '@/hooks/use-school-clock';
import { useServices } from '@/hooks/use-services';
import { useCan } from '@/hooks/use-session';
import { apiErrorMessage } from '@/lib/api-errors';
import {
  calendarDays,
  conflictPeriod,
  gridBounds,
  nearestLessonType,
  visibleRange,
  zonedRange,
} from '@/lib/calendar';
import { formatMinutes, todayIn, zonedParts, zonedToUtc } from '@/lib/zoned-time';
import { BookingForm, type BookingPrefill } from './booking-form';
import { CalendarGrid, type CalendarColumn, type CalendarConflict } from './calendar-grid';
import { type CalendarSearch, CalendarToolbar } from './calendar-toolbar';
import { CancelLessonForm } from './cancel-lesson-form';
import { FreeSlotsPanel } from './free-slots-panel';
import { useCalendarLessons, useMoveLesson } from './use-calendar';

const NO_VEHICLE = 'none';

export type { CalendarSearch };

export function CalendarPage({
  search,
  onSearch,
}: {
  search: CalendarSearch;
  onSearch: (patch: Partial<CalendarSearch>) => void;
}) {
  const { t } = useTranslation();
  const clock = useSchoolClock();
  return (
    <>
      <PageHeader title={t('calendar.title')} />
      {clock.status === 'pending' && <LoadingState />}
      {clock.status === 'error' && (
        <ErrorState error={clock.error} onRetry={() => void clock.refetch()} />
      )}
      {clock.timeZone && (
        <CalendarBoard
          search={search}
          onSearch={onSearch}
          timeZone={clock.timeZone}
          windowHours={clock.cancellationWindowHours ?? 24}
        />
      )}
    </>
  );
}

function CalendarBoard({
  search,
  onSearch,
  timeZone,
  windowHours,
}: {
  search: CalendarSearch;
  onSearch: (patch: Partial<CalendarSearch>) => void;
  timeZone: string;
  windowHours: number;
}) {
  const { t } = useTranslation();
  const { api } = useServices();
  const invalidate = useInvalidate();
  const canBook = useCan('lessons.create');
  const canMove = useCan('lessons.move');
  const canCancel = useCan('lessons.cancel');
  const [today] = useState(() => todayIn(timeZone, new Date()));
  const view = search.view ?? 'week';
  const by = search.by ?? 'instructor';
  const date = search.date ?? today;
  const days = useMemo(() => calendarDays(view, date), [view, date]);
  const range = useMemo(() => visibleRange(days, timeZone), [days, timeZone]);
  const lessonsQuery = useCalendarLessons({
    ...range,
    instructorId: search.instructorId,
    vehicleId: search.vehicleId,
    studentId: search.studentId,
  });
  const openingHours = api.$api.useQuery('get', '/v1/school/opening-hours');
  const instructors = useInstructors();
  const vehicles = useVehicles();
  const lessonTypes = useLessonTypes();
  const [booking, setBooking] = useState<BookingPrefill | null>(null);
  const [cancelling, setCancelling] = useState<LessonResponse | null>(null);
  const [slotsOpen, setSlotsOpen] = useState(false);
  const [conflict, setConflict] = useState<CalendarConflict | null>(null);

  const lessons = useMemo(() => lessonsQuery.data?.items ?? [], [lessonsQuery.data]);

  const columnKeyOf = useCallback(
    (lesson: LessonResponse) =>
      `${zonedParts(lesson.start, timeZone).date}|${
        by === 'instructor' ? lesson.instructorMembershipId : (lesson.vehicleId ?? NO_VEHICLE)
      }`,
    [by, timeZone],
  );

  const columns = useMemo(() => {
    const resources = new Map<string, string>(
      by === 'instructor'
        ? instructors.items.map((member) => [member.membershipId, member.fullName])
        : vehicles.items.map((vehicle) => [vehicle.id, vehicle.plate]),
    );
    for (const lesson of lessons) {
      if (by === 'instructor') {
        if (!resources.has(lesson.instructorMembershipId))
          resources.set(lesson.instructorMembershipId, lesson.instructorName);
      } else {
        const id = lesson.vehicleId ?? NO_VEHICLE;
        if (!resources.has(id)) resources.set(id, lesson.vehiclePlate ?? t('calendar.noVehicle'));
      }
    }
    const only = by === 'instructor' ? search.instructorId : search.vehicleId;
    const entries = [...resources].filter(([id]) => !only || id === only);
    return days.flatMap((day) =>
      entries.map(([resourceId, label]): CalendarColumn => ({
        key: `${day}|${resourceId}`,
        day,
        resourceId,
        label,
      })),
    );
  }, [
    by,
    days,
    instructors.items,
    vehicles.items,
    lessons,
    search.instructorId,
    search.vehicleId,
    t,
  ]);

  const bounds = useMemo(
    () =>
      gridBounds(
        openingHours.data?.items ?? [],
        lessons
          .map((lesson) => zonedRange(lesson.start, lesson.end, timeZone))
          .filter((span) => days.includes(span.day)),
      ),
    [openingHours.data, lessons, timeZone, days],
  );

  const move = useMoveLesson({
    onSuccess: () => toast.success(t('calendar.moved')),
    onError: (error, input) => {
      const period = conflictPeriod(error, lessons);
      if (period) {
        setConflict({ period, columnKey: input.columnKey });
        toast.error(t('calendar.conflictToast'));
      } else {
        toast.error(apiErrorMessage(error, t('calendar.moveFailed')));
      }
    },
  });

  const handleMove = (lesson: LessonResponse, target: CalendarColumn, minutes: number) => {
    setConflict(null);
    const start = zonedToUtc(target.day, minutes, timeZone);
    const length = Date.parse(lesson.end) - Date.parse(lesson.start);
    const change: Omit<MoveLessonRequest, 'version'> = { start };
    let preview: LessonResponse = {
      ...lesson,
      start,
      end: new Date(Date.parse(start) + length).toISOString(),
    };
    if (by === 'instructor' && target.resourceId !== lesson.instructorMembershipId) {
      change.instructorMembershipId = target.resourceId;
      preview = {
        ...preview,
        instructorMembershipId: target.resourceId,
        instructorName: target.label,
      };
    }
    const vehicleId = target.resourceId === NO_VEHICLE ? null : target.resourceId;
    if (by === 'vehicle' && vehicleId !== lesson.vehicleId) {
      change.vehicleId = vehicleId;
      preview = { ...preview, vehicleId, vehiclePlate: vehicleId ? target.label : null };
    }
    move.mutate({ lesson, change, preview, columnKey: target.key });
  };

  const handleResize = (lesson: LessonResponse, minutes: number) => {
    setConflict(null);
    const type = nearestLessonType(lessonTypes.items, lesson.lessonTypeId, minutes);
    if (!type || type.id === lesson.lessonTypeId) {
      toast.error(t('calendar.noTypeForLength', { minutes }));
      return;
    }
    move.mutate({
      lesson,
      change: { lessonTypeId: type.id },
      preview: {
        ...lesson,
        lessonTypeId: type.id,
        lessonTypeName: type.name,
        lessonTypeKind: type.kind,
        creditMinutes: type.creditMinutes,
        end: new Date(Date.parse(lesson.start) + type.minutes * 60_000).toISOString(),
      },
      columnKey: columnKeyOf(lesson),
    });
  };

  const prefillFor = (patch: Partial<BookingPrefill>): BookingPrefill => ({
    date: days.includes(today) ? today : (days[0] ?? today),
    time: formatMinutes(bounds.start),
    studentId: search.studentId ?? null,
    instructorMembershipId: search.instructorId ?? null,
    vehicleId: search.vehicleId ?? null,
    ...patch,
  });

  const handleCreateAt = (column: CalendarColumn, minutes: number) =>
    setBooking(
      prefillFor({
        date: column.day,
        time: formatMinutes(minutes),
        ...(by === 'instructor'
          ? { instructorMembershipId: column.resourceId }
          : { vehicleId: column.resourceId === NO_VEHICLE ? null : column.resourceId }),
      }),
    );

  const handlePickSlot = (slot: FreeSlot, lessonTypeId: string) => {
    const local = zonedParts(slot.start, timeZone);
    setBooking(
      prefillFor({
        date: local.date,
        time: formatMinutes(local.minutes),
        lessonTypeId,
        instructorMembershipId: slot.instructorMembershipId,
        vehicleId: slot.vehicleId,
      }),
    );
  };

  const handleBooked = (lesson: LessonResponse) => {
    setBooking(null);
    toast.success(t('booking.booked'));
    void invalidate('/v1/calendar', '/v1/calendar/free-slots');
    onSearch({ date: zonedParts(lesson.start, timeZone).date });
  };

  const loadingResources = instructors.status === 'pending' || vehicles.status === 'pending';

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <CalendarToolbar
          search={search}
          view={view}
          by={by}
          date={date}
          days={days}
          today={today}
          onSearch={(patch) => {
            setConflict(null);
            onSearch(patch);
          }}
        />
        <div className="flex gap-2">
          <Button
            variant="outline"
            aria-pressed={slotsOpen}
            onClick={() => setSlotsOpen((open) => !open)}
          >
            <ListChecks aria-hidden />
            {t('calendar.freeSlots')}
          </Button>
          {canBook && (
            <Button onClick={() => setBooking(prefillFor({}))}>
              <CalendarPlus aria-hidden />
              {t('calendar.newBooking')}
            </Button>
          )}
        </div>
      </div>
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start">
        <div className="min-w-0 flex-1">
          {lessonsQuery.isPending || loadingResources ? (
            <LoadingState />
          ) : lessonsQuery.isError ? (
            <ErrorState error={lessonsQuery.error} onRetry={() => void lessonsQuery.refetch()} />
          ) : columns.length === 0 ? (
            <EmptyState title={t('calendar.noColumns')} description={t('calendar.noColumnsBody')} />
          ) : (
            <CalendarGrid
              days={days}
              columns={columns}
              lessons={lessons}
              timeZone={timeZone}
              bounds={bounds}
              columnKeyOf={columnKeyOf}
              conflict={conflict}
              canMove={canMove}
              canCancel={canCancel}
              onMove={handleMove}
              onResize={handleResize}
              onCreateAt={canBook ? handleCreateAt : null}
              onCancel={setCancelling}
              onDismissConflict={() => setConflict(null)}
            />
          )}
        </div>
        {slotsOpen && (
          <FreeSlotsPanel
            from={range.from}
            to={range.to}
            instructorId={search.instructorId}
            timeZone={timeZone}
            onPick={handlePickSlot}
            onClose={() => setSlotsOpen(false)}
          />
        )}
      </div>
      <FormDialog
        open={booking !== null}
        onOpenChange={(open) => !open && setBooking(null)}
        title={t('booking.title')}
      >
        {booking && (
          <BookingForm
            key={JSON.stringify(booking)}
            prefill={booking}
            timeZone={timeZone}
            knownLessons={lessons}
            onBooked={handleBooked}
          />
        )}
      </FormDialog>
      <FormDialog
        open={cancelling !== null}
        onOpenChange={(open) => !open && setCancelling(null)}
        title={t('cancelLesson.title')}
      >
        {cancelling && (
          <CancelLessonForm
            lesson={cancelling}
            timeZone={timeZone}
            windowHours={windowHours}
            canKeepCredit={canCancel}
            onKeep={() => setCancelling(null)}
            onDone={() => {
              setCancelling(null);
              void invalidate('/v1/calendar', '/v1/calendar/free-slots');
            }}
          />
        )}
      </FormDialog>
    </div>
  );
}
