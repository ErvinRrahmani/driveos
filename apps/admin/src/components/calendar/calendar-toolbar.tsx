import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useId } from 'react';
import { useTranslation } from 'react-i18next';
import { SegmentedControl } from '@/components/segmented-control';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { NativeSelect } from '@/components/ui/native-select';
import { useInstructors, useStudentOptions, useVehicles } from '@/hooks/use-scheduling-options';
import {
  CALENDAR_GROUPS,
  CALENDAR_VIEWS,
  type CalendarGroup,
  type CalendarView,
} from '@/lib/calendar';
import { formatPlainDay } from '@/lib/format';
import { addDays } from '@/lib/zoned-time';

export interface CalendarSearch {
  view?: CalendarView;
  date?: string;
  by?: CalendarGroup;
  instructorId?: string;
  vehicleId?: string;
  studentId?: string;
}

function FilterSelect({
  label,
  allLabel,
  value,
  options,
  onChange,
}: {
  label: string;
  allLabel: string;
  value: string | undefined;
  options: readonly { value: string; label: string }[];
  onChange: (value: string | undefined) => void;
}) {
  const id = useId();
  return (
    <div className="grid gap-1">
      <Label htmlFor={id} className="text-muted-foreground text-xs">
        {label}
      </Label>
      <NativeSelect
        id={id}
        value={value ?? ''}
        onChange={(event) => onChange(event.target.value || undefined)}
      >
        <option value="">{allLabel}</option>
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </NativeSelect>
    </div>
  );
}

export function CalendarToolbar({
  search,
  view,
  by,
  date,
  days,
  today,
  onSearch,
}: {
  search: CalendarSearch;
  view: CalendarView;
  by: CalendarGroup;
  date: string;
  days: string[];
  today: string;
  onSearch: (patch: Partial<CalendarSearch>) => void;
}) {
  const { t } = useTranslation();
  const instructors = useInstructors();
  const vehicles = useVehicles();
  const students = useStudentOptions('');
  const step = view === 'week' ? 7 : 1;
  const first = days[0] ?? date;
  const last = days[days.length - 1] ?? date;
  return (
    <div className="flex flex-wrap items-end gap-3">
      <div className="flex items-center gap-1">
        <Button
          variant="outline"
          size="icon"
          aria-label={t('calendar.previous')}
          onClick={() => onSearch({ date: addDays(date, -step) })}
        >
          <ChevronLeft aria-hidden />
        </Button>
        <Button variant="outline" onClick={() => onSearch({ date: today })}>
          {t('calendar.today')}
        </Button>
        <Button
          variant="outline"
          size="icon"
          aria-label={t('calendar.next')}
          onClick={() => onSearch({ date: addDays(date, step) })}
        >
          <ChevronRight aria-hidden />
        </Button>
        <p className="ml-2 text-sm font-medium" aria-live="polite">
          {first === last
            ? formatPlainDay(first)
            : `${formatPlainDay(first)} – ${formatPlainDay(last)}`}
        </p>
      </div>
      <SegmentedControl
        label={t('calendar.view')}
        value={view}
        options={CALENDAR_VIEWS.map((value) => ({ value, label: t(`calendar.views.${value}`) }))}
        onChange={(value) => onSearch({ view: value })}
      />
      <SegmentedControl
        label={t('calendar.columns')}
        value={by}
        options={CALENDAR_GROUPS.map((value) => ({ value, label: t(`calendar.groups.${value}`) }))}
        onChange={(value) => onSearch({ by: value })}
      />
      <div className="flex flex-wrap gap-2">
        <FilterSelect
          label={t('calendar.instructor')}
          allLabel={t('calendar.allInstructors')}
          value={search.instructorId}
          options={instructors.options}
          onChange={(instructorId) => onSearch({ instructorId })}
        />
        <FilterSelect
          label={t('calendar.vehicle')}
          allLabel={t('calendar.allVehicles')}
          value={search.vehicleId}
          options={vehicles.options}
          onChange={(vehicleId) => onSearch({ vehicleId })}
        />
        <FilterSelect
          label={t('calendar.student')}
          allLabel={t('calendar.allStudents')}
          value={search.studentId}
          options={students.options}
          onChange={(studentId) => onSearch({ studentId })}
        />
      </div>
    </div>
  );
}
