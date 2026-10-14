import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { z } from 'zod';
import { reportSubmitError, useAppForm } from '@/components/form';
import { Button } from '@/components/ui/button';
import { DialogFooter } from '@/components/ui/dialog';
import { useInvalidate } from '@/hooks/use-invalidate';
import { useServices } from '@/hooks/use-services';

const contactSchema = z
  .object({
    email: z.string().trim().max(254, 'validation.max'),
    phone: z.string().trim().max(32, 'validation.max'),
  })
  .superRefine((value, ctx) => {
    if (!value.email && !value.phone) {
      ctx.addIssue({ code: 'custom', path: ['phone'], message: 'validation.contact' });
    }
    if (value.email && !z.email().safeParse(value.email).success) {
      ctx.addIssue({ code: 'custom', path: ['email'], message: 'validation.email' });
    }
  });
type ContactValues = z.input<typeof contactSchema>;

export function ContactInvitationForm({
  role,
  studentId,
  email,
  phone,
  onDone,
}: {
  role: 'student' | 'parent';
  studentId: string;
  email?: string | null;
  phone?: string | null;
  onDone: () => void;
}) {
  const { t } = useTranslation();
  const { api } = useServices();
  const invalidate = useInvalidate();
  const create = api.$api.useMutation('post', '/v1/invitations');
  const defaultValues: ContactValues = { email: email ?? '', phone: phone ?? '' };
  const form = useAppForm({
    defaultValues,
    validators: { onChange: contactSchema, onSubmit: contactSchema },
    onSubmit: async ({ value }) => {
      const parsed = contactSchema.parse(value);
      try {
        await create.mutateAsync({
          body: {
            roles: [role],
            studentId,
            ...(parsed.email && { email: parsed.email }),
            ...(parsed.phone && { phone: parsed.phone }),
          },
        });
        await invalidate('/v1/invitations');
        toast.success(t('studentProfile.invitationSent'));
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
      <div className="grid grid-cols-2 gap-4">
        <form.AppField name="email">
          {(field) => <field.TextField label={t('staff.email')} type="email" autoComplete="off" />}
        </form.AppField>
        <form.AppField name="phone">
          {(field) => <field.TextField label={t('staff.phone')} type="tel" autoComplete="off" />}
        </form.AppField>
      </div>
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onDone}>
          {t('common.cancel')}
        </Button>
        <form.AppForm>
          <form.SubmitButton label={t('studentProfile.sendInvitation')} />
        </form.AppForm>
      </DialogFooter>
    </form>
  );
}
