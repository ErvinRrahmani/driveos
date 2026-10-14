import { Plus, Trash2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { z } from 'zod';
import { reportSubmitError, type SelectOption, useAppForm } from '@/components/form';
import { Button } from '@/components/ui/button';
import { DialogFooter } from '@/components/ui/dialog';
import { useInvalidate } from '@/hooks/use-invalidate';
import { useLessonTypes, useStudentOptions } from '@/hooks/use-scheduling-options';
import { useServices } from '@/hooks/use-services';
import { requiredId, requiredText, timeOfDay } from '@/lib/form-schemas';

const WEEKDAYS = ['1', '2', '3', '4', '5', '6', '7'] as const;

const waitingListSchema = z.object({
  studentId: requiredId(),
  lessonTypeId: requiredId(),
  area: requiredText(100),
  preferredWindows: z
    .array(
      z
        .object({ weekday: z.enum(WEEKDAYS), start: timeOfDay(), end: timeOfDay() })
        .refine((window) => window.start < window.end, {
          path: ['end'],
          message: 'validation.startBeforeEnd',
        }),
    )
    .min(1, 'validation.windows')
    .max(21, 'validation.max'),
});
type WaitingListValues = z.input<typeof waitingListSchema>;

export function WaitingListForm({ onDone }: { onDone: () => void }) {
  const { t } = useTranslation();
  const { api } = useServices();
  const invalidate = useInvalidate();
  const students = useStudentOptions('');
  const lessonTypes = useLessonTypes();
  const join = api.$api.useMutation('post', '/v1/waiting-list');
  const defaultValues: WaitingListValues = {
    studentId: null,
    lessonTypeId: null,
    area: '',
    preferredWindows: [],
  };
  const form = useAppForm({
    defaultValues,
    validators: { onChange: waitingListSchema, onSubmit: waitingListSchema },
    onSubmit: async ({ value }) => {
      const parsed = waitingListSchema.parse(value);
      try {
        await join.mutateAsync({
          body: {
            studentId: parsed.studentId ?? '',
            lessonTypeId: parsed.lessonTypeId ?? '',
            area: parsed.area,
            preferredWindows: parsed.preferredWindows.map((window) => ({
              ...window,
              weekday: Number(window.weekday),
            })),
          },
        });
        await invalidate('/v1/waiting-list');
        toast.success(t('waitingList.added'));
        onDone();
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
      <form.AppField name="studentId">
        {(field) => (
          <field.SelectField
            label={t('waitingList.student')}
            options={students.options}
            emptyLabel={t('booking.pickStudent')}
          />
        )}
      </form.AppField>
      <form.AppField name="lessonTypeId">
        {(field) => (
          <field.SelectField
            label={t('waitingList.lessonType')}
            options={lessonTypes.options}
            emptyLabel={t('booking.pickLessonType')}
          />
        )}
      </form.AppField>
      <form.AppField name="area">
        {(field) => <field.TextField label={t('waitingList.area')} />}
      </form.AppField>
      <form.AppField name="preferredWindows" mode="array">
        {(list) => (
          <fieldset className="grid gap-2">
            <legend className="mb-2 text-sm font-medium">{t('waitingList.windows')}</legend>
            {list.state.value.map((window, index) => (
              <div key={index} className="grid grid-cols-[1fr_7rem_7rem_auto] items-start gap-2">
                <form.AppField name={`preferredWindows[${index}].weekday`}>
                  {(field) => (
                    <field.SelectField label={t('waitingList.weekday')} options={weekdays} />
                  )}
                </form.AppField>
                <form.AppField name={`preferredWindows[${index}].start`}>
                  {(field) => <field.TimeField label={t('waitingList.from')} />}
                </form.AppField>
                <form.AppField name={`preferredWindows[${index}].end`}>
                  {(field) => <field.TimeField label={t('waitingList.to')} />}
                </form.AppField>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="mt-6"
                  aria-label={t('waitingList.removeWindow', {
                    day: t(`weekdays.${window.weekday}`),
                    start: window.start,
                    end: window.end,
                  })}
                  onClick={() => list.removeValue(index)}
                >
                  <Trash2 aria-hidden />
                </Button>
              </div>
            ))}
            <list.ErrorList />
            <Button
              type="button"
              variant="outline"
              className="justify-self-start"
              onClick={() => list.pushValue({ weekday: '1', start: '15:00', end: '18:00' })}
            >
              <Plus aria-hidden />
              {t('waitingList.addWindow')}
            </Button>
          </fieldset>
        )}
      </form.AppField>
      <DialogFooter>
        <form.AppForm>
          <form.SubmitButton label={t('common.save')} />
        </form.AppForm>
      </DialogFooter>
    </form>
  );
}
