import type { PriceItem } from '@driveos/shared';
import { useMutation } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { z } from 'zod';
import { reportSubmitError, useAppForm } from '@/components/form';
import { Button } from '@/components/ui/button';
import { DialogFooter } from '@/components/ui/dialog';
import { useIdempotencyKey } from '@/hooks/use-idempotency-key';
import { useInvalidate } from '@/hooks/use-invalidate';
import { useStudentOptions } from '@/hooks/use-scheduling-options';
import { useServices } from '@/hooks/use-services';
import { numberInput, optionalText, requiredId, requiredNumber } from '@/lib/form-schemas';
import { formatMoney, fromMinor, toMinor } from '@/lib/money';

const METHODS = ['cash', 'bank_transfer'] as const;

const paymentSchema = z.object({
  studentId: requiredId(),
  priceItemId: requiredId(),
  method: z.enum(METHODS),
  amount: numberInput(requiredNumber().positive('validation.positive')),
  reference: optionalText(100),
});
type PaymentValues = z.input<typeof paymentSchema>;

export function RecordPaymentForm({
  studentId,
  onDone,
}: {
  studentId: string | undefined;
  onDone: () => void;
}) {
  const { t } = useTranslation();
  const { api } = useServices();
  const invalidate = useInvalidate();
  const idempotency = useIdempotencyKey();
  const students = useStudentOptions('');
  const priceItems = api.$api.useQuery('get', '/v1/price-items', {
    params: { query: { limit: 200, active: 'true' } },
  });
  const school = api.$api.useQuery('get', '/v1/school');
  const items = priceItems.data?.items ?? [];
  const itemById = (id: string | null) => items.find((item) => item.id === id);
  const itemOptions = items.map((item) => ({
    value: item.id,
    label: `${item.name} · ${formatMoney(item.amountMinor, item.currency)}`,
  }));
  const record = useMutation({
    mutationFn: async (body: {
      studentId: string;
      priceItemId: string;
      method: (typeof METHODS)[number];
      amountMinor: number;
      currency: string;
      reference?: string;
    }) => {
      const { data, error, response } = await api.fetchClient.POST('/v1/payments/cash', {
        params: { header: { 'Idempotency-Key': idempotency.current() } },
        body,
      });
      idempotency.settle(response.status);
      if (error) throw error;
      return data;
    },
  });
  const defaultValues: PaymentValues = {
    studentId: studentId ?? null,
    priceItemId: null,
    method: 'cash',
    amount: null,
    reference: '',
  };
  const form = useAppForm({
    defaultValues,
    validators: { onChange: paymentSchema, onSubmit: paymentSchema },
    onSubmit: async ({ value }) => {
      const parsed = paymentSchema.parse(value);
      const item = itemById(parsed.priceItemId);
      if (!item || !parsed.studentId) return;
      try {
        await record.mutateAsync({
          studentId: parsed.studentId,
          priceItemId: item.id,
          method: parsed.method,
          amountMinor: toMinor(parsed.amount, item.currency),
          currency: item.currency,
          reference: parsed.reference || undefined,
        });
        await invalidate(
          '/v1/invoices',
          '/v1/students/{id}/balance',
          '/v1/students/{id}/ledger',
          '/v1/students',
        );
        toast.success(t('payments.recorded'));
        onDone();
      } catch (error) {
        reportSubmitError(form, error, t('errors.generic'));
      }
    },
  });
  const prefillAmount = (item: PriceItem | undefined) => {
    if (item) form.setFieldValue('amount', fromMinor(item.amountMinor, item.currency));
  };
  return (
    <form
      className="grid gap-4"
      noValidate
      onSubmit={(event) => {
        event.preventDefault();
        void form.handleSubmit();
      }}
    >
      <form.AppField name="studentId">
        {(field) => (
          <field.SelectField
            label={t('payments.student')}
            options={students.options}
            emptyLabel={t('payments.pickStudent')}
          />
        )}
      </form.AppField>
      <form.AppField
        name="priceItemId"
        listeners={{ onChange: ({ value }) => prefillAmount(itemById(value)) }}
      >
        {(field) => (
          <field.SelectField
            label={t('payments.priceItem')}
            options={itemOptions}
            emptyLabel={t('payments.pickPriceItem')}
          />
        )}
      </form.AppField>
      <form.Subscribe selector={(state) => itemById(state.values.priceItemId)?.currency}>
        {(currency) => (
          <form.AppField name="amount">
            {(field) => (
              <field.NumberField
                label={t('payments.amountLabel', {
                  currency: currency ?? school.data?.currency ?? '',
                })}
                description={t('payments.amountHint')}
                step={0.01}
                min={0}
              />
            )}
          </form.AppField>
        )}
      </form.Subscribe>
      <form.AppField name="method">
        {(field) => (
          <field.SelectField
            label={t('payments.method')}
            options={METHODS.map((method) => ({
              value: method,
              label: t(`payments.methods.${method}`),
            }))}
          />
        )}
      </form.AppField>
      <form.AppField name="reference">
        {(field) => (
          <field.TextField
            label={t('payments.reference')}
            description={t('payments.referenceHint')}
          />
        )}
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
