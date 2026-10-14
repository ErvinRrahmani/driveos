import { useDraggable } from '@dnd-kit/core';
import { CSS } from '@dnd-kit/utilities';
import type { LessonResponse, LessonStatus } from '@driveos/shared';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { SLOT_MINUTES, snapToSlot, zonedRange } from '@/lib/calendar';
import { formatPlainDay } from '@/lib/format';
import { cn } from '@/lib/utils';
import { formatMinutes } from '@/lib/zoned-time';

export const PX_PER_MINUTE = 1;

export interface DragData {
  kind: 'move' | 'resize';
  lesson: LessonResponse;
  columnKey: string;
}

const STATUS_STYLES: Record<LessonStatus, string> = {
  booked: 'border-sky-600 bg-sky-50 text-sky-950',
  completed: 'border-emerald-600 bg-emerald-50 text-emerald-950',
  cancelled: 'border-zinc-400 bg-zinc-100 text-zinc-500 line-through decoration-zinc-400',
  no_show: 'border-amber-600 bg-amber-50 text-amber-950',
};

export function LessonBlock({
  lesson,
  columnKey,
  top,
  minutes,
  startMinutes,
  lane,
  lanes,
  timeZone,
  movable,
  cancellable,
  onCancel,
}: {
  lesson: LessonResponse;
  columnKey: string;
  top: number;
  minutes: number;
  startMinutes: number;
  lane: number;
  lanes: number;
  timeZone: string;
  movable: boolean;
  cancellable: boolean;
  onCancel: (lesson: LessonResponse) => void;
}) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: lesson.id,
    data: { kind: 'move', lesson, columnKey } satisfies DragData,
    disabled: !movable,
    attributes: { roleDescription: t('calendar.draggable') },
  });
  const {
    attributes: resizeAttributes,
    listeners: resizeListeners,
    setNodeRef: setResizeRef,
    transform: resizeTransform,
    isDragging: isResizing,
  } = useDraggable({
    id: `resize:${lesson.id}`,
    data: { kind: 'resize', lesson, columnKey } satisfies DragData,
    disabled: !movable,
  });
  const shift = isDragging && transform ? snapToSlot(transform.y / PX_PER_MINUTE) : 0;
  const stretch = isResizing && resizeTransform ? snapToSlot(resizeTransform.y / PX_PER_MINUTE) : 0;
  const length = Math.max(SLOT_MINUTES, minutes + stretch);
  const label = `${formatMinutes(startMinutes + shift)}–${formatMinutes(startMinutes + shift + length)}`;
  const statusLabel = t(`calendar.status.${lesson.status}`);

  return (
    <div
      ref={setNodeRef}
      className={cn('absolute p-0.5', (isDragging || isResizing) && 'z-40')}
      style={{
        top,
        height: length * PX_PER_MINUTE,
        left: `${(lane / lanes) * 100}%`,
        width: `${100 / lanes}%`,
        transform: CSS.Translate.toString(transform),
      }}
    >
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <button
            type="button"
            data-status={lesson.status}
            className={cn(
              'flex h-full w-full flex-col items-start overflow-hidden rounded-md border-l-4 px-1.5 py-0.5 text-left text-xs leading-tight shadow-xs',
              STATUS_STYLES[lesson.status],
              movable && 'cursor-grab active:cursor-grabbing',
              isDragging && 'opacity-80 shadow-lg',
            )}
            {...attributes}
            {...listeners}
          >
            <span className="font-medium tabular-nums">{label}</span>
            <span className="truncate font-medium">{lesson.studentName}</span>
            <span className="truncate">{lesson.lessonTypeName}</span>
            <span className="truncate opacity-80">{lesson.pickupAddress}</span>
            {lesson.status !== 'booked' && <span className="truncate">{statusLabel}</span>}
          </button>
        </PopoverTrigger>
        <PopoverContent align="start" className="w-80">
          <LessonDetails
            lesson={lesson}
            timeZone={timeZone}
            statusLabel={statusLabel}
            onCancel={
              cancellable
                ? () => {
                    setOpen(false);
                    onCancel(lesson);
                  }
                : undefined
            }
          />
        </PopoverContent>
      </Popover>
      {movable && (
        <div
          ref={setResizeRef}
          aria-label={t('calendar.resize')}
          className="absolute inset-x-1 bottom-0 h-2 cursor-ns-resize rounded-b-md hover:bg-sky-600/30"
          {...resizeAttributes}
          {...resizeListeners}
        />
      )}
    </div>
  );
}

function LessonDetails({
  lesson,
  timeZone,
  statusLabel,
  onCancel,
}: {
  lesson: LessonResponse;
  timeZone: string;
  statusLabel: string;
  onCancel?: () => void;
}) {
  const { t } = useTranslation();
  const range = zonedRange(lesson.start, lesson.end, timeZone);
  const rows: [string, string][] = [
    [t('calendar.details.student'), lesson.studentName],
    [t('calendar.details.lessonType'), lesson.lessonTypeName],
    [t('calendar.details.when'), `${formatPlainDay(range.day)}, ${range.label}`],
    [t('calendar.details.instructor'), lesson.instructorName],
    [t('calendar.details.vehicle'), lesson.vehiclePlate ?? t('calendar.noVehicle')],
    [t('calendar.details.pickup'), lesson.pickupAddress],
  ];
  return (
    <div className="grid gap-3 text-sm">
      <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1">
        {rows.map(([term, value]) => (
          <div key={term} className="contents">
            <dt className="text-muted-foreground">{term}</dt>
            <dd>{value}</dd>
          </div>
        ))}
        <dt className="text-muted-foreground">{t('calendar.details.status')}</dt>
        <dd className="flex flex-wrap gap-1">
          <Badge variant="secondary">{statusLabel}</Badge>
          {lesson.lateCancel && <Badge variant="outline">{t('calendar.lateCancel')}</Badge>}
        </dd>
      </dl>
      {onCancel && (
        <Button variant="destructive" size="sm" onClick={onCancel}>
          {t('calendar.details.cancelLesson')}
        </Button>
      )}
    </div>
  );
}
