import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { z } from 'zod';
import { reportSubmitError, useAppForm } from '@/components/form';
import { Button } from '@/components/ui/button';
import { DialogFooter } from '@/components/ui/dialog';
import { useInvalidate } from '@/hooks/use-invalidate';
import { useServices } from '@/hooks/use-services';
import { optionalPhone, optionalText, requiredText } from '@/lib/form-schemas';

const optionalEmail = () =>
  z
    .string()
    .trim()
    .max(254, 'validation.max')
    .refine((value) => value === '' || z.email().safeParse(value).success, 'validation.email');

const optionalContact = () =>
  z
    .string()
    .trim()
    .max(254, 'validation.max')
    .refine(
      (value) =>
        value === '' ||
        optionalPhone().safeParse(value).success ||
        z.email().safeParse(value).success,
      'validation.contact',
    );

const leadSchema = z
  .object({
    fullName: requiredText(120),
    phone: optionalPhone(),
    email: optionalEmail(),
    licenceClass: requiredText(10),
    message: optionalText(1000),
    isMinor: z.boolean(),
    guardianName: optionalText(120),
    guardianContact: optionalContact(),
  })
  .superRefine((value, ctx) => {
    if (!value.phone && !value.email) {
      ctx.addIssue({ code: 'custom', path: ['phone'], message: 'validation.contact' });
    }
    if (value.isMinor && !value.guardianName) {
      ctx.addIssue({ code: 'custom', path: ['guardianName'], message: 'validation.required' });
    }
    if (value.isMinor && !value.guardianContact) {
      ctx.addIssue({ code: 'custom', path: ['guardianContact'], message: 'validation.required' });
    }
  });
type LeadValues = z.input<typeof leadSchema>;

/** A lead typed in by staff after a phone call or a walk-in (`source: manual`). */
export function CreateLeadForm({ onDone }: { onDone: () => void }) {
  const { t } = useTranslation();
  const { api } = useServices();
  const invalidate = useInvalidate();
  const create = api.$api.useMutation('post', '/v1/leads');
  const defaultValues: LeadValues = {
    fullName: '',
    phone: '',
    email: '',
    licenceClass: 'B',
    message: '',
    isMinor: false,
    guardianName: '',
    guardianContact: '',
  };
  const form = useAppForm({
    defaultValues,
    validators: { onChange: leadSchema, onSubmit: leadSchema },
    onSubmit: async ({ value }) => {
      const parsed = leadSchema.parse(value);
      try {
        await create.mutateAsync({
          body: {
            fullName: parsed.fullName,
            licenceClass: parsed.licenceClass,
            isMinor: parsed.isMinor,
            ...(parsed.phone && { phone: parsed.phone }),
            ...(parsed.email && { email: parsed.email }),
            ...(parsed.message && { message: parsed.message }),
            ...(parsed.isMinor && {
              guardianName: parsed.guardianName,
              guardianContact: parsed.guardianContact,
            }),
          },
        });
        await invalidate('/v1/leads');
        toast.success(t('leads.created'));
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
      <form.AppField name="fullName">
        {(field) => <field.TextField label={t('leads.form.fullName')} autoComplete="off" />}
      </form.AppField>
      <div className="grid grid-cols-2 gap-4">
        <form.AppField name="phone">
          {(field) => (
            <field.TextField label={t('leads.form.phone')} type="tel" autoComplete="off" />
          )}
        </form.AppField>
        <form.AppField name="email">
          {(field) => (
            <field.TextField label={t('leads.form.email')} type="email" autoComplete="off" />
          )}
        </form.AppField>
      </div>
      <form.AppField name="licenceClass">
        {(field) => <field.TextField label={t('leads.form.licenceClass')} />}
      </form.AppField>
      <form.AppField name="message">
        {(field) => <field.TextAreaField label={t('leads.form.message')} />}
      </form.AppField>
      <form.AppField name="isMinor">
        {(field) => <field.CheckboxField label={t('leads.form.isMinor')} />}
      </form.AppField>
      <form.Subscribe selector={(state) => state.values.isMinor}>
        {(isMinor) =>
          isMinor && (
            <div className="grid grid-cols-2 gap-4">
              <form.AppField name="guardianName">
                {(field) => <field.TextField label={t('leads.form.guardianName')} />}
              </form.AppField>
              <form.AppField name="guardianContact">
                {(field) => <field.TextField label={t('leads.form.guardianContact')} />}
              </form.AppField>
            </div>
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
