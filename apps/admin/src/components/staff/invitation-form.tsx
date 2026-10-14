import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { z } from 'zod';
import { reportSubmitError, useAppForm, type SelectOption } from '@/components/form';
import { Button } from '@/components/ui/button';
import { DialogFooter } from '@/components/ui/dialog';
import { useInvalidate } from '@/hooks/use-invalidate';
import { useServices } from '@/hooks/use-services';

const INVITABLE_ROLES = ['office', 'instructor', 'student', 'parent'] as const;
const STUDENT_ROLES: readonly string[] = ['student', 'parent'];

const invitationFormSchema = z
  .object({
    roles: z.array(z.enum(INVITABLE_ROLES)).min(1, 'validation.roles'),
    email: z.string().trim().max(254, 'validation.max'),
    phone: z.string().trim().max(32, 'validation.max'),
    studentId: z.string().nullable(),
  })
  .superRefine((value, ctx) => {
    if (!value.email && !value.phone) {
      ctx.addIssue({ code: 'custom', path: ['email'], message: 'validation.contact' });
    }
    if (value.email && !z.email().safeParse(value.email).success) {
      ctx.addIssue({ code: 'custom', path: ['email'], message: 'validation.email' });
    }
    if (value.roles.some((role) => STUDENT_ROLES.includes(role)) && !value.studentId) {
      ctx.addIssue({ code: 'custom', path: ['studentId'], message: 'validation.student' });
    }
  });
type InvitationFormValues = z.input<typeof invitationFormSchema>;

export function InvitationForm({ onDone }: { onDone: () => void }) {
  const { t } = useTranslation();
  const { api } = useServices();
  const invalidate = useInvalidate();
  const create = api.$api.useMutation('post', '/v1/invitations');
  const students = api.$api.useQuery('get', '/v1/students', {
    params: { query: { limit: 200 } },
  });
  const defaultValues: InvitationFormValues = { roles: [], email: '', phone: '', studentId: null };
  const form = useAppForm({
    defaultValues,
    validators: { onChange: invitationFormSchema, onSubmit: invitationFormSchema },
    onSubmit: async ({ value }) => {
      const parsed = invitationFormSchema.parse(value);
      const needsStudent = parsed.roles.some((role) => STUDENT_ROLES.includes(role));
      try {
        await create.mutateAsync({
          body: {
            roles: parsed.roles,
            email: parsed.email || undefined,
            phone: parsed.phone || undefined,
            studentId: needsStudent ? (parsed.studentId ?? undefined) : undefined,
          },
        });
        await invalidate('/v1/invitations');
        toast.success(t('staff.inviteSent'));
        onDone();
      } catch (error) {
        reportSubmitError(form, error, t('errors.generic'));
      }
    },
  });
  const roleOptions: SelectOption[] = INVITABLE_ROLES.map((role) => ({
    value: role,
    label: t(`roles.${role}`),
  }));
  const studentOptions: SelectOption[] = (students.data?.items ?? []).map((student) => ({
    value: student.id,
    label: student.fullName,
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
      <form.AppField name="roles">
        {(field) => <field.CheckboxGroupField label={t('staff.roles')} options={roleOptions} />}
      </form.AppField>
      <div className="grid grid-cols-2 gap-4">
        <form.AppField name="email">
          {(field) => <field.TextField label={t('staff.email')} type="email" autoComplete="off" />}
        </form.AppField>
        <form.AppField name="phone">
          {(field) => <field.TextField label={t('staff.phone')} type="tel" autoComplete="off" />}
        </form.AppField>
      </div>
      <form.Subscribe
        selector={(state) => state.values.roles.some((role) => STUDENT_ROLES.includes(role))}
      >
        {(needsStudent) =>
          needsStudent && (
            <form.AppField name="studentId">
              {(field) => (
                <field.SelectField
                  label={t('staff.student')}
                  options={studentOptions}
                  emptyLabel={t('staff.pickStudent')}
                />
              )}
            </form.AppField>
          )
        }
      </form.Subscribe>
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
