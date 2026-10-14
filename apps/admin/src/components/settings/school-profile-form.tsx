import type { SchoolResponse } from '@driveos/shared';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { z } from 'zod';
import { reportSubmitError, useAppForm } from '@/components/form';
import { useInvalidate } from '@/hooks/use-invalidate';
import { useServices } from '@/hooks/use-services';
import { requiredText } from '@/lib/form-schemas';

const profileSchema = z.object({
  name: requiredText(200),
  legalName: requiredText(200),
  taxId: z.string().trim().max(50, 'validation.max'),
  address: requiredText(500),
  timeZone: requiredText(64),
  locale: z.string().trim().min(2, 'validation.min').max(35, 'validation.max'),
});
type ProfileValues = z.input<typeof profileSchema>;

export function SchoolProfileForm({ school }: { school: SchoolResponse }) {
  const { t } = useTranslation();
  const { api } = useServices();
  const invalidate = useInvalidate();
  const update = api.$api.useMutation('patch', '/v1/school');
  const defaultValues: ProfileValues = {
    name: school.name,
    legalName: school.legalName,
    taxId: school.taxId ?? '',
    address: school.address,
    timeZone: school.timeZone,
    locale: school.locale,
  };
  const form = useAppForm({
    defaultValues,
    validators: { onChange: profileSchema, onSubmit: profileSchema },
    onSubmit: async ({ value }) => {
      const parsed = profileSchema.parse(value);
      try {
        await update.mutateAsync({ body: { ...parsed, taxId: parsed.taxId || null } });
        await invalidate('/v1/school', '/v1/me');
        toast.success(t('common.saved'));
      } catch (error) {
        reportSubmitError(form, error, t('errors.generic'));
      }
    },
  });
  return (
    <form
      className="grid gap-4 sm:grid-cols-2"
      noValidate
      onSubmit={(event) => {
        event.preventDefault();
        void form.handleSubmit();
      }}
    >
      <form.AppField name="name">
        {(field) => <field.TextField label={t('settings.profile.name')} />}
      </form.AppField>
      <form.AppField name="legalName">
        {(field) => <field.TextField label={t('settings.profile.legalName')} />}
      </form.AppField>
      <form.AppField name="address">
        {(field) => (
          <field.TextField label={t('settings.profile.address')} className="sm:col-span-2" />
        )}
      </form.AppField>
      <form.AppField name="taxId">
        {(field) => <field.TextField label={t('settings.profile.taxId')} />}
      </form.AppField>
      <form.AppField name="timeZone">
        {(field) => <field.TextField label={t('settings.profile.timeZone')} />}
      </form.AppField>
      <form.AppField name="locale">
        {(field) => <field.TextField label={t('settings.profile.locale')} />}
      </form.AppField>
      <dl className="text-muted-foreground grid grid-cols-2 gap-2 self-end text-sm">
        <dt>{t('settings.profile.currency')}</dt>
        <dd className="text-foreground">{school.currency}</dd>
        <dt>{t('settings.profile.country')}</dt>
        <dd className="text-foreground">{school.countryCode}</dd>
      </dl>
      <div className="flex justify-end sm:col-span-2">
        <form.AppForm>
          <form.SubmitButton label={t('common.save')} />
        </form.AppForm>
      </div>
    </form>
  );
}
