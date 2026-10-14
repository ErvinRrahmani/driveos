import type { StudentInstructor } from '@driveos/shared';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { z } from 'zod';
import { reportSubmitError, useAppForm, type SelectOption } from '@/components/form';
import { ErrorState, LoadingState } from '@/components/states';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useInvalidate } from '@/hooks/use-invalidate';
import { useInstructors } from '@/hooks/use-scheduling-options';
import { useServices } from '@/hooks/use-services';
import { useCan } from '@/hooks/use-session';

const assignmentSchema = z
  .object({ assigned: z.array(z.string()), primary: z.string().nullable() })
  .superRefine((value, ctx) => {
    if (value.primary && !value.assigned.includes(value.primary)) {
      ctx.addIssue({ code: 'custom', path: ['primary'], message: 'validation.primaryAssigned' });
    }
  });
type AssignmentValues = z.input<typeof assignmentSchema>;

export function InstructorAssignment({ studentId }: { studentId: string }) {
  const { t } = useTranslation();
  const { api } = useServices();
  const assignment = api.$api.useQuery('get', '/v1/students/{id}/instructors', {
    params: { path: { id: studentId } },
  });
  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('assignment.title')}</CardTitle>
      </CardHeader>
      <CardContent>
        {assignment.status === 'pending' ? (
          <LoadingState />
        ) : assignment.status === 'error' ? (
          <ErrorState error={assignment.error} onRetry={() => void assignment.refetch()} />
        ) : (
          <AssignmentForm studentId={studentId} current={assignment.data.items} />
        )}
      </CardContent>
    </Card>
  );
}

function AssignmentForm({
  studentId,
  current,
}: {
  studentId: string;
  current: StudentInstructor[];
}) {
  const { t } = useTranslation();
  const { api } = useServices();
  const invalidate = useInvalidate();
  const canManage = useCan('students.manage');
  const instructors = useInstructors();
  const replace = api.$api.useMutation('put', '/v1/students/{id}/instructors');
  const options: SelectOption[] = [
    ...instructors.options,
    ...current
      .filter((row) => !instructors.options.some((o) => o.value === row.instructorMembershipId))
      .map((row) => ({ value: row.instructorMembershipId, label: row.instructorName })),
  ];
  const defaultValues: AssignmentValues = {
    assigned: current.map((row) => row.instructorMembershipId),
    primary: current.find((row) => row.isPrimary)?.instructorMembershipId ?? null,
  };
  const form = useAppForm({
    defaultValues,
    validators: { onChange: assignmentSchema, onSubmit: assignmentSchema },
    onSubmit: async ({ value }) => {
      const parsed = assignmentSchema.parse(value);
      try {
        await replace.mutateAsync({
          params: { path: { id: studentId } },
          body: {
            instructors: parsed.assigned.map((id) => ({
              instructorMembershipId: id,
              isPrimary: id === parsed.primary,
            })),
          },
        });
        await invalidate('/v1/students/{id}/instructors', '/v1/students/{id}', '/v1/students');
        toast.success(t('assignment.saved'));
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
      <form.AppField name="assigned">
        {(field) => (
          <field.CheckboxGroupField
            label={t('assignment.assigned')}
            options={options}
            disabled={!canManage}
          />
        )}
      </form.AppField>
      <form.Subscribe selector={(state) => state.values.assigned}>
        {(assigned) => (
          <form.AppField name="primary">
            {(field) => (
              <field.SelectField
                label={t('assignment.primary')}
                options={options.filter((option) => assigned.includes(option.value))}
                emptyLabel={t('assignment.noPrimary')}
                disabled={!canManage}
              />
            )}
          </form.AppField>
        )}
      </form.Subscribe>
      {canManage && (
        <div className="flex justify-end">
          <form.AppForm>
            <form.SubmitButton label={t('assignment.save')} />
          </form.AppForm>
        </div>
      )}
    </form>
  );
}
