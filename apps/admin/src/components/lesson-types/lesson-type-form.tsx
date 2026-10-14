import type { LessonType } from '@driveos/shared';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { z } from 'zod';
import { reportSubmitError, useAppForm, type SelectOption } from '@/components/form';
import { Button } from '@/components/ui/button';
import { DialogFooter } from '@/components/ui/dialog';
import { useInvalidate } from '@/hooks/use-invalidate';
import { useServices } from '@/hooks/use-services';
import { integerIn, numberInput, requiredText } from '@/lib/form-schemas';

const lessonTypeFormSchema = z.object({
  name: requiredText(100),
  kind: z.enum(['lesson', 'exam']),
  licenceClass: requiredText(10),
  minutes: numberInput(integerIn(5, 600)),
  creditMinutes: numberInput(integerIn(0, 10_000)),
  requiresVehicle: z.boolean(),
  requiresEntitlement: z.enum(['exam_car']).nullable(),
  active: z.boolean(),
});
type LessonTypeFormValues = z.input<typeof lessonTypeFormSchema>;

export function LessonTypeForm({
  lessonType,
  onDone,
}: {
  lessonType?: LessonType;
  onDone: () => void;
}) {
  const { t } = useTranslation();
  const { api } = useServices();
  const invalidate = useInvalidate();
  const create = api.$api.useMutation('post', '/v1/lesson-types');
  const update = api.$api.useMutation('patch', '/v1/lesson-types/{id}');
  const defaultValues: LessonTypeFormValues = {
    name: lessonType?.name ?? '',
    kind: lessonType?.kind ?? 'lesson',
    licenceClass: lessonType?.licenceClass ?? 'B',
    minutes: lessonType?.minutes ?? 45,
    creditMinutes: lessonType?.creditMinutes ?? 45,
    requiresVehicle: lessonType?.requiresVehicle ?? true,
    requiresEntitlement: lessonType?.requiresEntitlement ?? null,
    active: lessonType?.active ?? true,
  };
  const form = useAppForm({
    defaultValues,
    validators: { onChange: lessonTypeFormSchema, onSubmit: lessonTypeFormSchema },
    onSubmit: async ({ value }) => {
      const body = lessonTypeFormSchema.parse(value);
      try {
        if (lessonType) {
          await update.mutateAsync({ params: { path: { id: lessonType.id } }, body });
        } else {
          await create.mutateAsync({ body });
        }
        await invalidate('/v1/lesson-types');
        toast.success(t('common.saved'));
        onDone();
      } catch (error) {
        reportSubmitError(form, error, t('errors.generic'));
      }
    },
  });
  const kinds: SelectOption[] = [
    { value: 'lesson', label: t('lessonTypes.kindValue.lesson') },
    { value: 'exam', label: t('lessonTypes.kindValue.exam') },
  ];
  const entitlements: SelectOption[] = [{ value: 'exam_car', label: t('entitlements.exam_car') }];
  return (
    <form
      className="grid gap-4"
      noValidate
      onSubmit={(event) => {
        event.preventDefault();
        void form.handleSubmit();
      }}
    >
      <form.AppField name="name">
        {(field) => <field.TextField label={t('lessonTypes.name')} />}
      </form.AppField>
      <div className="grid grid-cols-2 gap-4">
        <form.AppField name="kind">
          {(field) => <field.SelectField label={t('lessonTypes.kind')} options={kinds} />}
        </form.AppField>
        <form.AppField name="licenceClass">
          {(field) => <field.TextField label={t('lessonTypes.licenceClass')} />}
        </form.AppField>
        <form.AppField name="minutes">
          {(field) => <field.NumberField label={t('lessonTypes.minutes')} step={5} min={5} />}
        </form.AppField>
        <form.AppField name="creditMinutes">
          {(field) => <field.NumberField label={t('lessonTypes.creditMinutes')} step={5} min={0} />}
        </form.AppField>
      </div>
      <form.AppField name="requiresEntitlement">
        {(field) => (
          <field.SelectField
            label={t('lessonTypes.requiresEntitlement')}
            options={entitlements}
            emptyLabel={t('common.none')}
          />
        )}
      </form.AppField>
      <form.AppField name="requiresVehicle">
        {(field) => <field.SwitchField label={t('lessonTypes.requiresVehicle')} />}
      </form.AppField>
      <form.AppField name="active">
        {(field) => <field.SwitchField label={t('common.active')} />}
      </form.AppField>
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onDone}>
          {t('common.cancel')}
        </Button>
        <form.AppForm>
          <form.SubmitButton label={t('common.save')} />
        </form.AppForm>
      </DialogFooter>
    </form>
  );
}
