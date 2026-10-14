import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { z } from 'zod';
import { reportSubmitError, useAppForm } from '@/components/form';
import { Button } from '@/components/ui/button';
import { DialogFooter } from '@/components/ui/dialog';
import { useInvalidate } from '@/hooks/use-invalidate';
import { useServices } from '@/hooks/use-services';
import { requiredText } from '@/lib/form-schemas';
import {
  STUDENT_DETAILS_DEFAULTS,
  STUDENT_DETAILS_FIELDS,
  StudentDetailsFields,
  studentDetailsBody,
  studentDetailsShape,
} from './student-fields';

const createStudentSchema = z.object({
  fullName: requiredText(200),
  licenceClass: requiredText(10),
  ...studentDetailsShape,
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
    licenceClass: 'B',
    ...STUDENT_DETAILS_DEFAULTS,
  };
  const form = useAppForm({
    defaultValues,
    validators: { onChange: createStudentSchema, onSubmit: createStudentSchema },
    onSubmit: async ({ value }) => {
      const { fullName, licenceClass, ...details } = createStudentSchema.parse(value);
      try {
        const result = await create.mutateAsync({
          body: { fullName, licenceClass, ...studentDetailsBody(details) },
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
      <form.AppField name="licenceClass">
        {(field) => <field.TextField label={t('students.licenceClass')} />}
      </form.AppField>
      <StudentDetailsFields form={form} fields={STUDENT_DETAILS_FIELDS} />
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
