import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { z } from 'zod';
import { reportSubmitError, useAppForm } from '@/components/form';
import { Button } from '@/components/ui/button';
import { DialogFooter } from '@/components/ui/dialog';
import { useInvalidate } from '@/hooks/use-invalidate';
import { useSchoolClock } from '@/hooks/use-school-clock';
import { useServices } from '@/hooks/use-services';
import { optionalDate, requiredText } from '@/lib/form-schemas';
import { zonedToUtc } from '@/lib/zoned-time';

const enrolmentSchema = z.object({
  courseName: requiredText(200),
  licenceClass: requiredText(10),
  startedOn: optionalDate(),
});
type EnrolmentValues = z.input<typeof enrolmentSchema>;

export function EnrolmentForm({ studentId, onDone }: { studentId: string; onDone: () => void }) {
  const { t } = useTranslation();
  const { api } = useServices();
  const { timeZone } = useSchoolClock();
  const invalidate = useInvalidate();
  const create = api.$api.useMutation('post', '/v1/students/{id}/enrolments');
  const defaultValues: EnrolmentValues = { courseName: '', licenceClass: 'B', startedOn: '' };
  const form = useAppForm({
    defaultValues,
    validators: { onChange: enrolmentSchema, onSubmit: enrolmentSchema },
    onSubmit: async ({ value }) => {
      const { startedOn, ...body } = enrolmentSchema.parse(value);
      try {
        await create.mutateAsync({
          params: { path: { id: studentId } },
          body: {
            ...body,
            ...(startedOn && { startedAt: zonedToUtc(startedOn, 0, timeZone ?? 'UTC') }),
          },
        });
        await invalidate('/v1/students/{id}');
        toast.success(t('enrolments.added'));
        onDone();
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
      <form.AppField name="courseName">
        {(field) => <field.TextField label={t('enrolments.course')} />}
      </form.AppField>
      <div className="grid grid-cols-2 gap-4">
        <form.AppField name="licenceClass">
          {(field) => <field.TextField label={t('students.licenceClass')} />}
        </form.AppField>
        <form.AppField name="startedOn">
          {(field) => (
            <field.DateField
              label={t('enrolments.startedOn')}
              description={t('enrolments.startedOnHint')}
            />
          )}
        </form.AppField>
      </div>
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
