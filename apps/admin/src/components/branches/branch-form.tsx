import type { Branch } from '@driveos/shared';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { z } from 'zod';
import { reportSubmitError, useAppForm } from '@/components/form';
import { Button } from '@/components/ui/button';
import { DialogFooter } from '@/components/ui/dialog';
import { useInvalidate } from '@/hooks/use-invalidate';
import { useServices } from '@/hooks/use-services';
import { numberInput, requiredNumber, requiredText } from '@/lib/form-schemas';

const coordinate = (limit: number) =>
  numberInput(requiredNumber().min(-limit, 'validation.min').max(limit, 'validation.max'));

const branchFormSchema = z.object({
  name: requiredText(200),
  address: requiredText(500),
  lat: coordinate(90),
  lng: coordinate(180),
});
type BranchFormValues = z.input<typeof branchFormSchema>;

export function BranchForm({ branch, onDone }: { branch?: Branch; onDone: () => void }) {
  const { t } = useTranslation();
  const { api } = useServices();
  const invalidate = useInvalidate();
  const create = api.$api.useMutation('post', '/v1/branches');
  const update = api.$api.useMutation('patch', '/v1/branches/{id}');
  const defaultValues: BranchFormValues = {
    name: branch?.name ?? '',
    address: branch?.address ?? '',
    lat: branch?.lat ?? null,
    lng: branch?.lng ?? null,
  };
  const form = useAppForm({
    defaultValues,
    validators: { onChange: branchFormSchema, onSubmit: branchFormSchema },
    onSubmit: async ({ value }) => {
      const body = branchFormSchema.parse(value);
      try {
        if (branch) await update.mutateAsync({ params: { path: { id: branch.id } }, body });
        else await create.mutateAsync({ body });
        await invalidate('/v1/branches');
        toast.success(t('common.saved'));
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
      <form.AppField name="name">
        {(field) => <field.TextField label={t('branches.name')} />}
      </form.AppField>
      <form.AppField name="address">
        {(field) => <field.TextField label={t('branches.address')} />}
      </form.AppField>
      <div className="grid grid-cols-2 gap-4">
        <form.AppField name="lat">
          {(field) => <field.NumberField label={t('branches.lat')} step={0.000001} />}
        </form.AppField>
        <form.AppField name="lng">
          {(field) => <field.NumberField label={t('branches.lng')} step={0.000001} />}
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
