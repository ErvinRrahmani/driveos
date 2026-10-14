import {
  type Announcements,
  type CollisionDetection,
  DndContext,
  type DragEndEvent,
  KeyboardSensor,
  type KeyboardCoordinateGetter,
  type Modifier,
  PointerSensor,
  pointerWithin,
  rectIntersection,
  useDroppable,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import type { LessonResponse } from '@driveos/shared';
import { X } from 'lucide-react';
import { type MouseEvent, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { layoutLanes, type Period, SLOT_MINUTES, snapToSlot, zonedRange } from '@/lib/calendar';
import { formatPlainDay } from '@/lib/format';
import { formatMinutes, zonedParts } from '@/lib/zoned-time';
import { type DragData, LessonBlock, PX_PER_MINUTE } from './lesson-block';

export interface CalendarColumn {
  key: string;
  day: string;
  resourceId: string;
  label: string;
}

export interface CalendarConflict {
  period: Period;
  columnKey: string;
}

const SLOT_PX = SLOT_MINUTES * PX_PER_MINUTE;

const snapModifier: Modifier = ({ transform, active }) => {
  const kind = (active?.data.current as DragData | undefined)?.kind;
  const y = Math.round(transform.y / SLOT_PX) * SLOT_PX;
  return { ...transform, x: kind === 'resize' ? 0 : transform.x, y };
};

const collisionDetection: CollisionDetection = (args) =>
  args.pointerCoordinates ? pointerWithin(args) : rectIntersection(args);

const coordinateGetter: KeyboardCoordinateGetter = (event, { currentCoordinates, context }) => {
  const width = context.collisionRect?.width ?? 0;
  const moves: Record<string, { x: number; y: number }> = {
    ArrowDown: { x: 0, y: SLOT_PX },
    ArrowUp: { x: 0, y: -SLOT_PX },
    ArrowRight: { x: width, y: 0 },
    ArrowLeft: { x: -width, y: 0 },
  };
  const move = moves[event.code];
  if (!move) return undefined;
  event.preventDefault();
  return { x: currentCoordinates.x + move.x, y: currentCoordinates.y + move.y };
};

export function CalendarGrid({
  days,
  columns,
  lessons,
  timeZone,
  bounds,
  columnKeyOf,
  conflict,
  canMove,
  canCancel,
  onMove,
  onResize,
  onCreateAt,
  onCancel,
  onDismissConflict,
}: {
  days: string[];
  columns: CalendarColumn[];
  lessons: LessonResponse[];
  timeZone: string;
  bounds: { start: number; end: number };
  columnKeyOf: (lesson: LessonResponse) => string;
  conflict: CalendarConflict | null;
  canMove: boolean;
  canCancel: boolean;
  onMove: (lesson: LessonResponse, target: CalendarColumn, minutes: number) => void;
  onResize: (lesson: LessonResponse, minutes: number) => void;
  onCreateAt: ((column: CalendarColumn, minutes: number) => void) | null;
  onCancel: (lesson: LessonResponse) => void;
  onDismissConflict: () => void;
}) {
  const { t } = useTranslation();
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, {
      coordinateGetter,
      keyboardCodes: { start: ['Space'], cancel: ['Escape'], end: ['Space', 'Enter'] },
    }),
  );
  const columnsByKey = useMemo(
    () => new Map(columns.map((column) => [column.key, column])),
    [columns],
  );
  const placed = useMemo(() => {
    const byColumn = new Map<
      string,
      { lesson: LessonResponse; start: number; end: number; label: string }[]
    >();
    for (const lesson of lessons) {
      const range = zonedRange(lesson.start, lesson.end, timeZone);
      const key = columnKeyOf(lesson);
      byColumn.set(key, [...(byColumn.get(key) ?? []), { lesson, ...range }]);
    }
    return byColumn;
  }, [lessons, timeZone, columnKeyOf]);

  const studentOf = (data: unknown) => (data as DragData | undefined)?.lesson.studentName ?? '';
  const announcements: Announcements = {
    onDragStart: ({ active }) =>
      t('calendar.dnd.pickedUp', { student: studentOf(active.data.current) }),
    onDragMove: ({ active }) =>
      t('calendar.dnd.moved', { student: studentOf(active.data.current) }),
    onDragOver: ({ active }) =>
      t('calendar.dnd.moved', { student: studentOf(active.data.current) }),
    onDragEnd: ({ active }) =>
      t('calendar.dnd.dropped', { student: studentOf(active.data.current) }),
    onDragCancel: ({ active }) =>
      t('calendar.dnd.cancelled', { student: studentOf(active.data.current) }),
  };

  const handleDragEnd = ({ active, delta, over }: DragEndEvent) => {
    const data = active.data.current as DragData | undefined;
    if (!data) return;
    const minutes = snapToSlot(delta.y / PX_PER_MINUTE);
    const { lesson } = data;
    if (data.kind === 'resize') {
      if (minutes !== 0) {
        const length = (Date.parse(lesson.end) - Date.parse(lesson.start)) / 60_000;
        onResize(lesson, length + minutes);
      }
      return;
    }
    const target = columnsByKey.get(String(over?.id ?? data.columnKey));
    if (!target || (minutes === 0 && target.key === data.columnKey)) return;
    const local = zonedParts(lesson.start, timeZone);
    onMove(lesson, target, local.minutes + minutes);
  };

  const resourcesPerDay = days.length ? columns.length / days.length : 0;
  const height = (bounds.end - bounds.start) * PX_PER_MINUTE;
  const hours = Array.from(
    { length: (bounds.end - bounds.start) / 60 },
    (_, index) => bounds.start + index * 60,
  );
  const template = `4rem repeat(${columns.length}, minmax(9rem, 1fr))`;

  return (
    <div className="grid min-w-0 gap-3">
      {conflict && (
        <Alert variant="destructive">
          <AlertTitle>{t('calendar.conflictTitle')}</AlertTitle>
          <AlertDescription className="flex items-center justify-between gap-2">
            <span>
              {t('calendar.conflictBody', {
                day: formatPlainDay(
                  zonedRange(conflict.period.start, conflict.period.end, timeZone).day,
                ),
                range: zonedRange(conflict.period.start, conflict.period.end, timeZone).label,
              })}
            </span>
            <Button variant="ghost" size="sm" onClick={onDismissConflict}>
              <X aria-hidden />
              {t('calendar.dismiss')}
            </Button>
          </AlertDescription>
        </Alert>
      )}
      <DndContext
        sensors={sensors}
        modifiers={[snapModifier]}
        collisionDetection={collisionDetection}
        onDragEnd={handleDragEnd}
        accessibility={{
          announcements,
          screenReaderInstructions: { draggable: t('calendar.dragHelp') },
        }}
      >
        <section
          aria-label={t('calendar.grid')}
          className="bg-background max-h-[75vh] overflow-auto rounded-lg border"
        >
          <div className="grid" style={{ gridTemplateColumns: template }}>
            <div className="bg-background sticky top-0 left-0 z-30 border-r border-b" />
            {days.map((day) => (
              <div
                key={day}
                className="bg-background sticky top-0 z-20 border-r border-b px-2 py-1 text-center text-sm font-medium"
                style={{ gridColumn: `span ${resourcesPerDay}` }}
              >
                {formatPlainDay(day)}
              </div>
            ))}
            <div className="bg-background sticky top-8 left-0 z-30 border-r border-b" />
            {columns.map((column) => (
              <div
                key={column.key}
                className="bg-background text-muted-foreground sticky top-8 z-20 truncate border-r border-b px-2 py-1 text-center text-xs"
              >
                {column.label}
              </div>
            ))}
            <div className="bg-background sticky left-0 z-10 border-r" style={{ height }}>
              {hours.map((minutes) => (
                <div
                  key={minutes}
                  className="text-muted-foreground absolute right-1 -translate-y-1/2 text-xs first:translate-y-0"
                  style={{ top: (minutes - bounds.start) * PX_PER_MINUTE }}
                >
                  {formatMinutes(minutes)}
                </div>
              ))}
            </div>
            {columns.map((column) => (
              <DayColumn
                key={column.key}
                column={column}
                height={height}
                bounds={bounds}
                items={placed.get(column.key) ?? []}
                conflict={conflict?.columnKey === column.key ? conflict.period : null}
                timeZone={timeZone}
                canMove={canMove}
                canCancel={canCancel}
                onCreateAt={onCreateAt}
                onCancel={onCancel}
              />
            ))}
          </div>
        </section>
      </DndContext>
    </div>
  );
}

function DayColumn({
  column,
  height,
  bounds,
  items,
  conflict,
  timeZone,
  canMove,
  canCancel,
  onCreateAt,
  onCancel,
}: {
  column: CalendarColumn;
  height: number;
  bounds: { start: number; end: number };
  items: { lesson: LessonResponse; start: number; end: number; label: string }[];
  conflict: Period | null;
  timeZone: string;
  canMove: boolean;
  canCancel: boolean;
  onCreateAt: ((column: CalendarColumn, minutes: number) => void) | null;
  onCancel: (lesson: LessonResponse) => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: column.key, data: column });
  const lanes = layoutLanes(
    items.map((item) => ({ id: item.lesson.id, start: item.start, end: item.end })),
  );
  const conflictRange = conflict ? zonedRange(conflict.start, conflict.end, timeZone) : null;
  const handleClick = (event: MouseEvent<HTMLDivElement>) => {
    if (!onCreateAt || event.target !== event.currentTarget) return;
    const offset = event.clientY - event.currentTarget.getBoundingClientRect().top;
    const minutes = bounds.start + Math.floor(offset / PX_PER_MINUTE / SLOT_MINUTES) * SLOT_MINUTES;
    onCreateAt(column, Math.min(Math.max(minutes, bounds.start), bounds.end - SLOT_MINUTES));
  };
  return (
    <div
      ref={setNodeRef}
      data-over={isOver || undefined}
      onClick={handleClick}
      className="data-[over]:bg-accent/40 relative border-r"
      style={{
        height,
        cursor: onCreateAt ? 'cell' : undefined,
        backgroundImage: `repeating-linear-gradient(to bottom, transparent 0, transparent ${60 * PX_PER_MINUTE - 1}px, var(--border) ${60 * PX_PER_MINUTE - 1}px, var(--border) ${60 * PX_PER_MINUTE}px)`,
      }}
    >
      {conflictRange && (
        <div
          data-testid="conflict-highlight"
          aria-hidden
          className="border-destructive bg-destructive/15 pointer-events-none absolute inset-x-0 z-10 rounded-sm border-2 border-dashed"
          style={{
            top: (conflictRange.start - bounds.start) * PX_PER_MINUTE,
            height: (conflictRange.end - conflictRange.start) * PX_PER_MINUTE,
          }}
        />
      )}
      {items.map((item) => {
        const lane = lanes.get(item.lesson.id) ?? { lane: 0, lanes: 1 };
        const booked = item.lesson.status === 'booked';
        return (
          <LessonBlock
            key={item.lesson.id}
            lesson={item.lesson}
            columnKey={column.key}
            top={(item.start - bounds.start) * PX_PER_MINUTE}
            minutes={item.end - item.start}
            startMinutes={item.start}
            lane={lane.lane}
            lanes={lane.lanes}
            timeZone={timeZone}
            movable={canMove && booked}
            cancellable={canCancel && booked}
            onCancel={onCancel}
          />
        );
      })}
    </div>
  );
}
