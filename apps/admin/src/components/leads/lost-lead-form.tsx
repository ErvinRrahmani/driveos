import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { z } from 'zod';
import { reportSubmitError, useAppForm } from '@/components/form';
import { Button } from '@/components/ui/button';
import { DialogFooter } from '@/components/ui/dialog';
import { useInvalidate } from '@/hooks/use-invalidate';
import { useServices } from '@/hooks/use-services';
import { optionalText } from '@/lib/form-schemas';

const lostSchema = z.object({ lostReason: optionalText(200) });

/** Closes a lead as lost, with an optional reason. */
export function LostLeadForm({ leadId, onDone }: { leadId: string; onDone: () => void }) {
  const { t } = useTranslation();
  const { api } = useServices();
  const invalidate = useInvalidate();
  const update = api.$api.useMutation('patch', '/v1/leads/{id}');
  const form = useAppForm({
    defaultValues: { lostReason: '' } as z.input<typeof lostSchema>,
    validators: { onChange: lostSchema, onSubmit: lostSchema },
    onSubmit: async ({ value }) => {
      const { lostReason } = lostSchema.parse(value);
      try {
        await update.mutateAsync({
          params: { path: { id: leadId } },
          body: { status: 'lost', ...(lostReason && { lostReason }) },
        });
        await invalidate('/v1/leads', '/v1/leads/{id}');
        toast.success(t('leads.updated'));
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
      <form.AppField name="lostReason">
        {(field) => <field.TextField label={t('leads.lostReason')} />}
      </form.AppField>
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onDone}>
          {t('common.cancel')}
        </Button>
        <form.AppForm>
          <form.SubmitButton label={t('leads.markLost')} />
        </form.AppForm>
      </DialogFooter>
    </form>
  );
}
