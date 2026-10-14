import type { Invoice } from '@driveos/shared';
import { useMutation } from '@tanstack/react-query';
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { z } from 'zod';
import { reportSubmitError, useAppForm } from '@/components/form';
import { ErrorState, LoadingState } from '@/components/states';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { DialogFooter } from '@/components/ui/dialog';
import { useIdempotencyKey } from '@/hooks/use-idempotency-key';
import { useInvalidate } from '@/hooks/use-invalidate';
import { useServices } from '@/hooks/use-services';
import {
  maxMinutesRemoved,
  refundablePayments,
  refundPaymentChoices,
  type RefundPaymentChoice,
  remainingRefundableMinor,
  suggestedPaymentId,
} from '@/lib/billing';
import { formatDate } from '@/lib/format';
import { numberInput, requiredId, requiredNumber, requiredText } from '@/lib/form-schemas';
import { formatMoney, fromMinor, toMinor } from '@/lib/money';

const ALL = { limit: 200 } as const;

export function RefundForm({ invoice, onDone }: { invoice: Invoice; onDone: () => void }) {
  const { api } = useServices();
  const studentPath = { path: { id: invoice.studentId } };
  const ledger = api.$api.useQuery('get', '/v1/students/{id}/ledger', {
    params: { ...studentPath, query: ALL },
  });
  const balance = api.$api.useQuery('get', '/v1/students/{id}/balance', { params: studentPath });
  const settings = api.$api.useQuery('get', '/v1/school/settings');
  const queries = [ledger, balance, settings];
  const failed = queries.find((query) => query.isError);
  if (failed) return <ErrorState error={failed.error} onRetry={() => void failed.refetch()} />;
  if (!ledger.data || !balance.data || !settings.data) return <LoadingState />;
  const payments = refundablePayments(ledger.data.items);
  return (
    <RefundFields
      invoice={invoice}
      choices={refundPaymentChoices(invoice, payments)}
      suggestedId={suggestedPaymentId(invoice, payments)}
      remainingMinor={remainingRefundableMinor(invoice)}
      balanceMinutes={balance.data.balanceMinutes}
      maxMinutes={maxMinutesRemoved(
        balance.data.balanceMinutes,
        settings.data.allowNegativeBalance,
      )}
      onDone={onDone}
    />
  );
}

function refundSchema(currency: string, remainingMinor: number, maxMinutes: number | null) {
  return z.object({
    paymentId: requiredId(),
    amount: numberInput(
      requiredNumber()
        .positive('validation.positive')
        .refine((value) => toMinor(value, currency) <= remainingMinor, 'validation.refundCap'),
    ),
    minutesRemoved: numberInput(
      requiredNumber()
        .int('validation.integer')
        .min(0, 'validation.min')
        .refine((value) => maxMinutes === null || value <= maxMinutes, 'validation.balanceCap'),
    ),
    reason: requiredText(500),
  });
}

function RefundFields({
  invoice,
  choices,
  suggestedId,
  remainingMinor,
  balanceMinutes,
  maxMinutes,
  onDone,
}: {
  invoice: Invoice;
  choices: RefundPaymentChoice[];
  suggestedId: string | undefined;
  remainingMinor: number;
  balanceMinutes: number;
  maxMinutes: number | null;
  onDone: () => void;
}) {
  const { t } = useTranslation();
  const { api } = useServices();
  const invalidate = useInvalidate();
  const idempotency = useIdempotencyKey();
  const { currency } = invoice;
  const schema = useMemo(
    () => refundSchema(currency, remainingMinor, maxMinutes),
    [currency, remainingMinor, maxMinutes],
  );
  const paymentOptions = choices.map(({ paymentId, purchase }) => ({
    value: paymentId,
    label: purchase
      ? t('refund.paymentOption', {
          date: formatDate(purchase.createdAt),
          minutes: purchase.minutes,
        })
      : t('refund.invoicePayment', { number: invoice.formattedNumber ?? t('invoices.draft') }),
  }));
  const refund = useMutation({
    mutationFn: async (body: {
      paymentId: string;
      amountMinor: number;
      minutesRemoved: number;
      reason: string;
    }) => {
      const { data, error, response } = await api.fetchClient.POST('/v1/refunds', {
        params: { header: { 'Idempotency-Key': idempotency.current() } },
        body: { ...body, currency },
      });
      idempotency.settle(response.status);
      if (error) throw error;
      return data;
    },
  });
  const form = useAppForm({
    defaultValues: {
      paymentId: suggestedId ?? choices[0]?.paymentId ?? null,
      amount: remainingMinor > 0 ? fromMinor(remainingMinor, currency) : null,
      minutesRemoved: 0,
      reason: '',
    } as z.input<typeof schema>,
    validators: { onChange: schema, onSubmit: schema },
    onSubmit: async ({ value }) => {
      const parsed = schema.parse(value);
      try {
        await refund.mutateAsync({
          paymentId: parsed.paymentId ?? '',
          amountMinor: toMinor(parsed.amount, currency),
          minutesRemoved: parsed.minutesRemoved,
          reason: parsed.reason,
        });
        await invalidate(
          '/v1/invoices',
          '/v1/students/{id}/balance',
          '/v1/students/{id}/ledger',
          '/v1/students',
        );
        toast.success(t('refund.done'));
        onDone();
      } catch (error) {
        reportSubmitError(form, error, t('errors.generic'));
      }
    },
  });
  const money = (minor: number) => formatMoney(minor, currency);
  const noPayment = choices.length === 0;
  return (
    <form
      className="grid gap-4"
      noValidate
      onSubmit={(event) => {
        event.preventDefault();
        void form.handleSubmit();
      }}
    >
      {noPayment && (
        <Alert variant="destructive">
          <AlertTitle>{t('refund.noPayment')}</AlertTitle>
          <AlertDescription>{t('refund.noPaymentBody')}</AlertDescription>
        </Alert>
      )}
      <form.AppField name="paymentId">
        {(field) => (
          <field.SelectField
            label={t('refund.payment')}
            options={paymentOptions}
            emptyLabel={t('refund.pickPayment')}
            description={t('refund.inAppHint')}
            disabled={noPayment}
          />
        )}
      </form.AppField>
      <form.AppField name="amount">
        {(field) => (
          <field.NumberField
            label={t('refund.amount', { currency })}
            description={t('refund.amountCap', {
              remaining: money(remainingMinor),
              total: money(invoice.totalMinor),
              refunded: money(invoice.refundedMinor),
            })}
            step={0.01}
            min={0}
          />
        )}
      </form.AppField>
      <form.AppField name="minutesRemoved">
        {(field) => (
          <field.NumberField
            label={t('refund.minutes')}
            description={
              maxMinutes === null
                ? t('refund.minutesUncapped', { balance: balanceMinutes })
                : t('refund.minutesCap', { max: maxMinutes })
            }
            step={1}
            min={0}
          />
        )}
      </form.AppField>
      <form.AppField name="reason">
        {(field) => <field.TextField label={t('refund.reason')} />}
      </form.AppField>
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onDone}>
          {t('common.cancel')}
        </Button>
        {noPayment ? (
          <Button type="submit" disabled>
            {t('refund.submit')}
          </Button>
        ) : (
          <form.AppForm>
            <form.SubmitButton label={t('refund.submit')} />
          </form.AppForm>
        )}
      </DialogFooter>
    </form>
  );
}
