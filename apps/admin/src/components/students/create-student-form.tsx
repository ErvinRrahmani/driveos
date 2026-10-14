import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { z } from 'zod';
import { reportSubmitError, useAppForm } from '@/components/form';
import { Button } from '@/components/ui/button';
import { DialogFooter } from '@/components/ui/dialog';
import { useInvalidate } from '@/hooks/use-invalidate';
import { useServices } from '@/hooks/use-services';
import { requiredDate, requiredText, optionalDate, optionalText } from '@/lib/form-schemas';

const createStudentSchema = z.object({
  fullName: requiredText(200),
  dateOfBirth: requiredDate(),
  licenceClass: requiredText(10),
  examLanguage: requiredText(35),
  testDate: optionalDate(),
  area: optionalText(100),
  pickupAddress: optionalText(500),
});
type CreateStudentValues = z.input<typeof createStudentSchema>;

export function CreateStudentForm({
  onCreated,
  onCancel,
}: {
  onCreated: (id: string) => void;
  onCancel: () => void;
}) {
  const { t } = useTranslation();
  const { api } = useServices();
  const invalidate = useInvalidate();
  const create = api.$api.useMutation('post', '/v1/students');
  const defaultValues: CreateStudentValues = {
    fullName: '',
    dateOfBirth: '',
    licenceClass: 'B',
    examLanguage: 'en',
    testDate: '',
    area: '',
    pickupAddress: '',
  };
  const form = useAppForm({
    defaultValues,
    validators: { onChange: createStudentSchema, onSubmit: createStudentSchema },
    onSubmit: async ({ value }) => {
      const { testDate, area, pickupAddress, ...required } = createStudentSchema.parse(value);
      try {
        const result = await create.mutateAsync({
          body: {
            ...required,
            ...(testDate && { testDate }),
            ...(area && { area }),
            ...(pickupAddress && { pickupAddress }),
          },
        });
        await invalidate('/v1/students');
        toast.success(t('students.created'));
        onCreated(result.id);
      } catch (error) {
        reportSubmitError(form, error, t('errors.generic'));
      }
    },
  });
  return (
    <form
      className="grid gap-4"
      noValidate
      onSubmit={(event) => {
        event.preventDefault();
        void form.handleSubmit();
      }}
    >
      <form.AppField name="fullName">
        {(field) => <field.TextField label={t('students.fullName')} autoComplete="off" />}
      </form.AppField>
      <div className="grid grid-cols-2 gap-4">
        <form.AppField name="dateOfBirth">
          {(field) => <field.DateField label={t('students.dateOfBirth')} />}
        </form.AppField>
        <form.AppField name="testDate">
          {(field) => <field.DateField label={t('students.testDate')} />}
        </form.AppField>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <form.AppField name="licenceClass">
          {(field) => <field.TextField label={t('students.licenceClass')} />}
        </form.AppField>
        <form.AppField name="examLanguage">
          {(field) => <field.TextField label={t('students.examLanguage')} />}
        </form.AppField>
      </div>
      <form.AppField name="area">
        {(field) => <field.TextField label={t('students.area')} />}
      </form.AppField>
      <form.AppField name="pickupAddress">
        {(field) => <field.TextField label={t('students.pickupAddress')} />}
      </form.AppField>
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onCancel}>
          {t('common.cancel')}
        </Button>
        <form.AppForm>
          <form.SubmitButton label={t('common.save')} />
        </form.AppForm>
      </DialogFooter>
    </form>
  );
}
