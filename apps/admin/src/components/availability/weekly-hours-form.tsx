import type { AvailabilityWindow } from '@driveos/shared';
import { Plus, Trash2 } from 'lucide-react';
import { useId } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { z } from 'zod';
import { reportSubmitError, useAppForm } from '@/components/form';
import { Button } from '@/components/ui/button';
import { useInvalidate } from '@/hooks/use-invalidate';
import { useServices } from '@/hooks/use-services';
import { timeOfDay } from '@/lib/form-schemas';

const WEEKDAYS = [1, 2, 3, 4, 5, 6, 7] as const;

const windowSchema = z.object({
  weekday: z.number().int().min(1).max(7),
  startTime: timeOfDay(),
  endTime: timeOfDay(),
});

const weeklySchema = z
  .object({
    effectiveFrom: z.iso.date({ error: 'validation.date' }),
    windows: z.array(windowSchema).max(70, 'validation.max'),
  })
  .superRefine((value, ctx) => {
    value.windows.forEach((window, index) => {
      if (window.startTime >= window.endTime) {
        ctx.addIssue({
          code: 'custom',
          path: ['windows', index, 'endTime'],
          message: 'validation.startBeforeEnd',
        });
        return;
      }
      const clash = value.windows.some(
        (other, otherIndex) =>
          otherIndex < index &&
          other.weekday === window.weekday &&
          other.startTime < other.endTime &&
          other.startTime < window.endTime &&
          window.startTime < other.endTime,
      );
      if (clash) {
        ctx.addIssue({
          code: 'custom',
          path: ['windows', index, 'startTime'],
          message: 'validation.overlap',
        });
      }
    });
  });
type WeeklyValues = z.input<typeof weeklySchema>;

export function WeeklyHoursForm({
  instructorId,
  windows,
  today,
  timeZone,
}: {
  instructorId: string;
  windows: AvailabilityWindow[];
  today: string;
  timeZone: string;
}) {
  const { t } = useTranslation();
  const { api } = useServices();
  const invalidate = useInvalidate();
  const headingId = useId();
  const replace = api.$api.useMutation('put', '/v1/instructors/{id}/availability');
  const defaultValues: WeeklyValues = {
    effectiveFrom: today,
    windows: windows
      .filter((window) => window.validTo === null)
      .map(({ weekday, startTime, endTime }) => ({ weekday, startTime, endTime })),
  };
  const form = useAppForm({
    defaultValues,
    validators: { onChange: weeklySchema, onSubmit: weeklySchema },
    onSubmit: async ({ value }) => {
      const parsed = weeklySchema.parse(value);
      try {
        await replace.mutateAsync({
          params: { path: { id: instructorId } },
          body: {
            effectiveFrom: parsed.effectiveFrom,
            windows: [...parsed.windows].sort(
              (a, b) => a.weekday - b.weekday || a.startTime.localeCompare(b.startTime),
            ),
          },
        });
        await invalidate('/v1/instructors/{id}/availability');
        toast.success(t('availability.saved'));
      } catch (error) {
        reportSubmitError(form, error, t('errors.generic'));
      }
    },
  });

  return (
    <form
      aria-labelledby={headingId}
      className="grid gap-4"
      noValidate
      onSubmit={(event) => {
        event.preventDefault();
        void form.handleSubmit();
      }}
    >
      <div>
        <h2 id={headingId} className="text-lg font-medium">
          {t('availability.weekly')}
        </h2>
        <p className="text-muted-foreground text-sm">
          {t('availability.weeklyHint', { timeZone })}
        </p>
      </div>
      <form.AppField name="effectiveFrom">
        {(field) => (
          <field.DateField
            label={t('availability.effectiveFrom')}
            description={t('availability.effectiveHint')}
            className="max-w-xs"
          />
        )}
      </form.AppField>
      <form.AppField name="windows" mode="array">
        {(list) => (
          <div className="grid gap-3">
            {WEEKDAYS.map((weekday) => {
              const day = t(`weekdays.${weekday}`);
              const rows = list.state.value
                .map((window, index) => ({ window, index }))
                .filter(({ window }) => window.weekday === weekday);
              return (
                <fieldset
                  key={weekday}
                  className="grid gap-2 rounded-md border p-3 sm:grid-cols-[8rem_1fr_auto] sm:items-start"
                >
                  <legend className="sr-only">{day}</legend>
                  <span aria-hidden className="pt-2 text-sm font-medium">
                    {day}
                  </span>
                  <div className="grid gap-2">
                    {rows.length === 0 && (
                      <p className="text-muted-foreground pt-2 text-sm">
                        {t('availability.unavailable')}
                      </p>
                    )}
                    {rows.map(({ window, index }) => (
                      <div key={index} className="grid grid-cols-[1fr_1fr_auto] items-start gap-2">
                        <form.AppField name={`windows[${index}].startTime`}>
                          {(field) => <field.TimeField label={t('availability.from')} />}
                        </form.AppField>
                        <form.AppField name={`windows[${index}].endTime`}>
                          {(field) => <field.TimeField label={t('availability.to')} />}
                        </form.AppField>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="mt-6"
                          aria-label={t('availability.removeRange', {
                            day,
                            start: window.startTime,
                            end: window.endTime,
                          })}
                          onClick={() => list.removeValue(index)}
                        >
                          <Trash2 aria-hidden />
                        </Button>
                      </div>
                    ))}
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() =>
                      list.pushValue({ weekday, startTime: '09:00', endTime: '17:00' })
                    }
                  >
                    <Plus aria-hidden />
                    <span className="sr-only">{t('availability.addRange', { day })}</span>
                  </Button>
                </fieldset>
              );
            })}
          </div>
        )}
      </form.AppField>
      <div className="flex justify-end">
        <form.AppForm>
          <form.SubmitButton label={t('common.save')} />
        </form.AppForm>
      </div>
    </form>
  );
}
