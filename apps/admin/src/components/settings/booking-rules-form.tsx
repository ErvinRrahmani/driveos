import type { SchoolSettings } from '@driveos/shared';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { z } from 'zod';
import { reportSubmitError, useAppForm } from '@/components/form';
import { useInvalidate } from '@/hooks/use-invalidate';
import { useServices } from '@/hooks/use-services';
import { integerIn, numberInput, timeOfDay } from '@/lib/form-schemas';

const rulesSchema = z.object({
  cancellationWindowHours: numberInput(integerIn(0, 168)),
  allowNegativeBalance: z.boolean(),
  minGapMinutes: numberInput(integerIn(0, 240)),
  ageOfMajority: numberInput(integerIn(14, 21)),
  quietHoursStart: timeOfDay(),
  quietHoursEnd: timeOfDay(),
  slotOfferTtlMinutes: numberInput(integerIn(5, 1440)),
  theoryPremiumFree: z.boolean(),
  chatRetentionMonths: numberInput(integerIn(1, 120)),
});
type RulesValues = z.input<typeof rulesSchema>;

export function BookingRulesForm({ settings }: { settings: SchoolSettings }) {
  const { t } = useTranslation();
  const { api } = useServices();
  const invalidate = useInvalidate();
  const update = api.$api.useMutation('patch', '/v1/school/settings');
  const defaultValues: RulesValues = settings;
  const form = useAppForm({
    defaultValues,
    validators: { onChange: rulesSchema, onSubmit: rulesSchema },
    onSubmit: async ({ value }) => {
      try {
        await update.mutateAsync({ body: rulesSchema.parse(value) });
        await invalidate('/v1/school/settings');
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
      <form.AppField name="cancellationWindowHours">
        {(field) => (
          <field.NumberField
            label={t('settings.rules.cancellationWindowHours')}
            min={0}
            max={168}
          />
        )}
      </form.AppField>
      <form.AppField name="minGapMinutes">
        {(field) => (
          <field.NumberField label={t('settings.rules.minGapMinutes')} min={0} max={240} />
        )}
      </form.AppField>
      <form.AppField name="ageOfMajority">
        {(field) => (
          <field.NumberField label={t('settings.rules.ageOfMajority')} min={14} max={21} />
        )}
      </form.AppField>
      <form.AppField name="slotOfferTtlMinutes">
        {(field) => (
          <field.NumberField label={t('settings.rules.slotOfferTtlMinutes')} min={5} max={1440} />
        )}
      </form.AppField>
      <form.AppField name="quietHoursStart">
        {(field) => <field.TimeField label={t('settings.rules.quietHoursStart')} />}
      </form.AppField>
      <form.AppField name="quietHoursEnd">
        {(field) => <field.TimeField label={t('settings.rules.quietHoursEnd')} />}
      </form.AppField>
      <form.AppField name="chatRetentionMonths">
        {(field) => (
          <field.NumberField label={t('settings.rules.chatRetentionMonths')} min={1} max={120} />
        )}
      </form.AppField>
      <div className="grid gap-4 sm:col-span-2">
        <form.AppField name="allowNegativeBalance">
          {(field) => <field.SwitchField label={t('settings.rules.allowNegativeBalance')} />}
        </form.AppField>
        <form.AppField name="theoryPremiumFree">
          {(field) => <field.SwitchField label={t('settings.rules.theoryPremiumFree')} />}
        </form.AppField>
      </div>
      <div className="flex justify-end sm:col-span-2">
        <form.AppForm>
          <form.SubmitButton label={t('common.save')} />
        </form.AppForm>
      </div>
    </form>
  );
}
