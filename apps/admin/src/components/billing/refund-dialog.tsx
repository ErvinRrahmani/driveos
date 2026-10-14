import type { Invoice } from '@driveos/shared';
import { useTranslation } from 'react-i18next';
import { FormDialog } from '@/components/form-dialog';
import { RefundForm } from './refund-form';

export function RefundDialog({
  invoice,
  onClose,
}: {
  invoice: Invoice | null;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  return (
    <FormDialog
      open={invoice !== null}
      onOpenChange={(open) => !open && onClose()}
      title={t('refund.title', { number: invoice?.formattedNumber ?? t('invoices.draft') })}
      description={t('refund.body')}
    >
      {invoice && <RefundForm key={invoice.id} invoice={invoice} onDone={onClose} />}
    </FormDialog>
  );
}
