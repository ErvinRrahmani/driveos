import type { Vehicle } from '@driveos/shared';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { z } from 'zod';
import { reportSubmitError, useAppForm, type SelectOption } from '@/components/form';
import { Button } from '@/components/ui/button';
import { DialogFooter } from '@/components/ui/dialog';
import { useInvalidate } from '@/hooks/use-invalidate';
import { useServices } from '@/hooks/use-services';
import { requiredText } from '@/lib/form-schemas';

const vehicleFormSchema = z.object({
  branchId: z.string().min(1, 'validation.required'),
  plate: requiredText(20),
  makeModel: requiredText(100),
  transmission: z.enum(['manual', 'automatic']),
  licenceClass: requiredText(10),
  active: z.boolean(),
});
type VehicleFormValues = z.input<typeof vehicleFormSchema>;

export function VehicleForm({
  vehicle,
  branchOptions,
  onDone,
}: {
  vehicle?: Vehicle;
  branchOptions: SelectOption[];
  onDone: () => void;
}) {
  const { t } = useTranslation();
  const { api } = useServices();
  const invalidate = useInvalidate();
  const create = api.$api.useMutation('post', '/v1/vehicles');
  const update = api.$api.useMutation('patch', '/v1/vehicles/{id}');
  const defaultValues: VehicleFormValues = {
    branchId: vehicle?.branchId ?? branchOptions[0]?.value ?? '',
    plate: vehicle?.plate ?? '',
    makeModel: vehicle?.makeModel ?? '',
    transmission: vehicle?.transmission ?? 'manual',
    licenceClass: vehicle?.licenceClass ?? 'B',
    active: vehicle?.active ?? true,
  };
  const form = useAppForm({
    defaultValues,
    validators: { onChange: vehicleFormSchema, onSubmit: vehicleFormSchema },
    onSubmit: async ({ value }) => {
      const body = vehicleFormSchema.parse(value);
      try {
        if (vehicle) await update.mutateAsync({ params: { path: { id: vehicle.id } }, body });
        else await create.mutateAsync({ body });
        await invalidate('/v1/vehicles');
        toast.success(t('common.saved'));
        onDone();
      } catch (error) {
        reportSubmitError(form, error, t('errors.generic'));
      }
    },
  });
  const transmissions: SelectOption[] = [
    { value: 'manual', label: t('vehicles.transmissionValue.manual') },
    { value: 'automatic', label: t('vehicles.transmissionValue.automatic') },
  ];
  return (
    <form
      className="grid gap-4"
      noValidate
      onSubmit={(event) => {
        event.preventDefault();
        void form.handleSubmit();
      }}
    >
      <form.AppField name="branchId">
        {(field) => (
          <field.SelectField
            label={t('vehicles.branch')}
            options={branchOptions}
            description={branchOptions.length === 0 ? t('vehicles.noBranches') : undefined}
          />
        )}
      </form.AppField>
      <div className="grid grid-cols-2 gap-4">
        <form.AppField name="plate">
          {(field) => <field.TextField label={t('vehicles.plate')} />}
        </form.AppField>
        <form.AppField name="licenceClass">
          {(field) => <field.TextField label={t('vehicles.licenceClass')} />}
        </form.AppField>
      </div>
      <form.AppField name="makeModel">
        {(field) => <field.TextField label={t('vehicles.makeModel')} />}
      </form.AppField>
      <form.AppField name="transmission">
        {(field) => (
          <field.SelectField label={t('vehicles.transmission')} options={transmissions} />
        )}
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
