import type { FreeSlot } from '@driveos/shared';
import { X } from 'lucide-react';
import { useId, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { EmptyState, ErrorState, LoadingState } from '@/components/states';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { NativeSelect } from '@/components/ui/native-select';
import { useLessonTypes } from '@/hooks/use-scheduling-options';
import { useServices } from '@/hooks/use-services';
import { zonedRange } from '@/lib/calendar';
import { formatPlainDay } from '@/lib/format';

export function FreeSlotsPanel({
  from,
  to,
  instructorId,
  timeZone,
  onPick,
  onClose,
}: {
  from: string;
  to: string;
  instructorId?: string;
  timeZone: string;
  onPick: (slot: FreeSlot, lessonTypeId: string) => void;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const { api } = useServices();
  const headingId = useId();
  const selectId = useId();
  const lessonTypes = useLessonTypes();
  const [lessonTypeId, setLessonTypeId] = useState('');
  const slots = api.$api.useQuery(
    'get',
    '/v1/calendar/free-slots',
    { params: { query: { lessonTypeId, from, to, instructorId } } },
    { enabled: lessonTypeId !== '' },
  );

  return (
    <aside
      aria-labelledby={headingId}
      className="bg-background grid content-start gap-3 rounded-lg border p-3 lg:w-72"
    >
      <div className="flex items-center justify-between gap-2">
        <h2 id={headingId} className="font-medium">
          {t('freeSlots.title')}
        </h2>
        <Button variant="ghost" size="icon" aria-label={t('freeSlots.close')} onClick={onClose}>
          <X aria-hidden />
        </Button>
      </div>
      <div className="grid gap-2">
        <Label htmlFor={selectId}>{t('freeSlots.lessonType')}</Label>
        <NativeSelect
          id={selectId}
          value={lessonTypeId}
          onChange={(event) => setLessonTypeId(event.target.value)}
        >
          <option value="">{t('freeSlots.pickLessonType')}</option>
          {lessonTypes.options.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </NativeSelect>
      </div>
      {lessonTypeId === '' ? (
        <p className="text-muted-foreground text-sm">{t('freeSlots.hint')}</p>
      ) : slots.isPending ? (
        <LoadingState className="py-6" />
      ) : slots.isError ? (
        <ErrorState error={slots.error} onRetry={() => void slots.refetch()} />
      ) : slots.data.items.length === 0 ? (
        <EmptyState title={t('freeSlots.empty')} />
      ) : (
        <ul className="grid gap-2">
          {slots.data.items.map((slot) => {
            const range = zonedRange(slot.start, slot.end, timeZone);
            const day = formatPlainDay(range.day);
            return (
              <li
                key={`${slot.instructorMembershipId}-${slot.start}`}
                className="flex items-center justify-between gap-2 rounded-md border px-2 py-1.5 text-sm"
              >
                <span>
                  <span className="block font-medium">
                    {day} {range.label}
                  </span>
                  <span className="text-muted-foreground block text-xs">{slot.instructorName}</span>
                </span>
                <Button
                  size="sm"
                  variant="outline"
                  aria-label={t('freeSlots.bookSlot', {
                    day,
                    range: range.label,
                    instructor: slot.instructorName,
                  })}
                  onClick={() => onPick(slot, lessonTypeId)}
                >
                  {t('freeSlots.book')}
                </Button>
              </li>
            );
          })}
        </ul>
      )}
    </aside>
  );
}
