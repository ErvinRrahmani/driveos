import type { PriceItem } from '@driveos/shared';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { z } from 'zod';
import { reportSubmitError, useAppForm, type SelectOption } from '@/components/form';
import { Button } from '@/components/ui/button';
import { DialogFooter } from '@/components/ui/dialog';
import { useInvalidate } from '@/hooks/use-invalidate';
import { useServices } from '@/hooks/use-services';
import { integerIn, numberInput, requiredNumber, requiredText } from '@/lib/form-schemas';
import {
  basisPointsToPercent,
  fromMinor,
  minorUnitDigits,
  percentToBasisPoints,
  toMinor,
} from '@/lib/money';

const KINDS = ['lesson', 'package', 'upsell', 'fee'] as const;
const ENTITLEMENTS = ['premium_theory', 'exam_car'] as const;

const priceItemFormSchema = z
  .object({
    name: requiredText(200),
    kind: z.enum(KINDS),
    amount: numberInput(requiredNumber().min(0, 'validation.min')),
    taxRate: numberInput(requiredNumber().min(0, 'validation.min').max(100, 'validation.max')),
    creditMinutes: z.number().int('validation.integer').positive('validation.min').nullable(),
    entitlementKind: z.enum(ENTITLEMENTS).nullable(),
    sortOrder: numberInput(integerIn(0, 10_000)),
    active: z.boolean(),
  })
  .refine(
    (item) => !(item.kind === 'lesson' || item.kind === 'package') || item.creditMinutes !== null,
    { path: ['creditMinutes'], message: 'validation.creditMinutes' },
  );
type PriceItemFormValues = z.input<typeof priceItemFormSchema>;

export function PriceItemForm({
  priceItem,
  currency,
  onDone,
}: {
  priceItem?: PriceItem;
  currency: string;
  onDone: () => void;
}) {
  const { t } = useTranslation();
  const { api } = useServices();
  const invalidate = useInvalidate();
  const create = api.$api.useMutation('post', '/v1/price-items');
  const update = api.$api.useMutation('patch', '/v1/price-items/{id}');
  const itemCurrency = priceItem?.currency ?? currency;
  const defaultValues: PriceItemFormValues = {
    name: priceItem?.name ?? '',
    kind: priceItem?.kind ?? 'lesson',
    amount: priceItem ? fromMinor(priceItem.amountMinor, priceItem.currency) : null,
    taxRate: priceItem ? basisPointsToPercent(priceItem.taxRateBp) : 0,
    creditMinutes: priceItem?.creditMinutes ?? null,
    entitlementKind: priceItem?.entitlementKind ?? null,
    sortOrder: priceItem?.sortOrder ?? 0,
    active: priceItem?.active ?? true,
  };
  const form = useAppForm({
    defaultValues,
    validators: { onChange: priceItemFormSchema, onSubmit: priceItemFormSchema },
    onSubmit: async ({ value }) => {
      const parsed = priceItemFormSchema.parse(value);
      const fields = {
        name: parsed.name,
        amountMinor: toMinor(parsed.amount, itemCurrency),
        taxRateBp: percentToBasisPoints(parsed.taxRate),
        creditMinutes: parsed.creditMinutes,
        entitlementKind: parsed.entitlementKind,
        sortOrder: parsed.sortOrder,
        active: parsed.active,
      };
      try {
        if (priceItem) {
          await update.mutateAsync({ params: { path: { id: priceItem.id } }, body: fields });
        } else {
          await create.mutateAsync({
            body: {
              ...fields,
              kind: parsed.kind,
              currency: itemCurrency,
              showOnPublicPage: false,
            },
          });
        }
        await invalidate('/v1/price-items');
        toast.success(t('common.saved'));
        onDone();
      } catch (error) {
        reportSubmitError(form, error, t('errors.generic'));
      }
    },
  });
  const kinds: SelectOption[] = KINDS.map((kind) => ({
    value: kind,
    label: t(`priceItems.kindValue.${kind}`),
  }));
  const entitlements: SelectOption[] = ENTITLEMENTS.map((kind) => ({
    value: kind,
    label: t(`entitlements.${kind}`),
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
      <form.AppField name="name">
        {(field) => <field.TextField label={t('priceItems.name')} />}
      </form.AppField>
      <form.AppField name="kind">
        {(field) => (
          <field.SelectField label={t('priceItems.kind')} options={kinds} disabled={!!priceItem} />
        )}
      </form.AppField>
      <div className="grid grid-cols-2 gap-4">
        <form.AppField name="amount">
          {(field) => (
            <field.NumberField
              label={t('priceItems.amount', { currency: itemCurrency })}
              min={0}
              step={10 ** -minorUnitDigits(itemCurrency)}
            />
          )}
        </form.AppField>
        <form.AppField name="taxRate">
          {(field) => (
            <field.NumberField label={t('priceItems.taxRate')} min={0} max={100} step={0.01} />
          )}
        </form.AppField>
        <form.AppField name="creditMinutes">
          {(field) => <field.NumberField label={t('priceItems.creditMinutes')} min={1} step={15} />}
        </form.AppField>
        <form.AppField name="sortOrder">
          {(field) => <field.NumberField label={t('priceItems.sortOrder')} min={0} step={1} />}
        </form.AppField>
      </div>
      <form.AppField name="entitlementKind">
        {(field) => (
          <field.SelectField
            label={t('priceItems.entitlementKind')}
            options={entitlements}
            emptyLabel={t('common.none')}
          />
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
