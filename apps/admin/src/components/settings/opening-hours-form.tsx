import type { OpeningHoursEntry } from '@driveos/shared';
import { Plus, Trash2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { z } from 'zod';
import { reportSubmitError, useAppForm, type SelectOption } from '@/components/form';
import { EmptyState } from '@/components/states';
import { Button } from '@/components/ui/button';
import { useInvalidate } from '@/hooks/use-invalidate';
import { useServices } from '@/hooks/use-services';
import { timeOfDay } from '@/lib/form-schemas';

const WEEKDAYS = ['1', '2', '3', '4', '5', '6', '7'] as const;

const hoursSchema = z.object({
  items: z
    .array(
      z
        .object({
          branchId: z.string().nullable(),
          weekday: z.enum(WEEKDAYS),
          opens: timeOfDay(),
          closes: timeOfDay(),
        })
        .refine((row) => row.opens < row.closes, {
          path: ['closes'],
          message: 'validation.opensBeforeCloses',
        }),
    )
    .max(100, 'validation.max'),
});
type HoursValues = z.input<typeof hoursSchema>;

function toWeekday(value: number): (typeof WEEKDAYS)[number] {
  return WEEKDAYS[value - 1] ?? '1';
}

export function OpeningHoursForm({
  entries,
  branchOptions,
}: {
  entries: OpeningHoursEntry[];
  branchOptions: SelectOption[];
}) {
  const { t } = useTranslation();
  const { api } = useServices();
  const invalidate = useInvalidate();
  const replace = api.$api.useMutation('put', '/v1/school/opening-hours');
  const defaultValues: HoursValues = {
    items: entries.map((entry) => ({
      branchId: entry.branchId,
      weekday: toWeekday(entry.weekday),
      opens: entry.opens,
      closes: entry.closes,
    })),
  };
  const form = useAppForm({
    defaultValues,
    validators: { onChange: hoursSchema, onSubmit: hoursSchema },
    onSubmit: async ({ value }) => {
      const parsed = hoursSchema.parse(value);
      try {
        await replace.mutateAsync({
          body: { items: parsed.items.map((row) => ({ ...row, weekday: Number(row.weekday) })) },
        });
        await invalidate('/v1/school/opening-hours');
        toast.success(t('common.saved'));
      } catch (error) {
        reportSubmitError(form, error, t('errors.generic'));
      }
    },
  });
  const weekdays: SelectOption[] = WEEKDAYS.map((day) => ({
    value: day,
    label: t(`weekdays.${day}`),
  }));
  return (
    <form
      className="grid gap-4"
      noValidate
      onSubmit={(event) => {
        event.preventDefault();
        void form.handleSubmit();
      }}
    >
      <form.AppField name="items" mode="array">
        {(items) => (
          <>
            {items.state.value.length === 0 && <EmptyState title={t('settings.hours.empty')} />}
            {items.state.value.map((row, index) => (
              <div
                key={index}
                className="grid items-start gap-3 rounded-md border p-3 sm:grid-cols-[1fr_1fr_8rem_8rem_auto]"
              >
                <form.AppField name={`items[${index}].weekday`}>
                  {(field) => (
                    <field.SelectField label={t('settings.hours.weekday')} options={weekdays} />
                  )}
                </form.AppField>
                <form.AppField name={`items[${index}].branchId`}>
                  {(field) => (
                    <field.SelectField
                      label={t('settings.hours.branch')}
                      options={branchOptions}
                      emptyLabel={t('settings.hours.allBranches')}
                    />
                  )}
                </form.AppField>
                <form.AppField name={`items[${index}].opens`}>
                  {(field) => <field.TimeField label={t('settings.hours.opens')} />}
                </form.AppField>
                <form.AppField name={`items[${index}].closes`}>
                  {(field) => <field.TimeField label={t('settings.hours.closes')} />}
                </form.AppField>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="self-end"
                  aria-label={t('settings.hours.removeRow', { day: t(`weekdays.${row.weekday}`) })}
                  onClick={() => items.removeValue(index)}
                >
                  <Trash2 aria-hidden />
                </Button>
              </div>
            ))}
            <div className="flex justify-between gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() =>
                  items.pushValue({ branchId: null, weekday: '1', opens: '08:00', closes: '18:00' })
                }
              >
                <Plus aria-hidden />
                {t('settings.hours.addRow')}
              </Button>
              <form.AppForm>
                <form.SubmitButton label={t('common.save')} />
              </form.AppForm>
            </div>
          </>
        )}
      </form.AppField>
    </form>
  );
}
