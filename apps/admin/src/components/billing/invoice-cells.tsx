import type { Invoice } from '@driveos/shared';
import { useMutation } from '@tanstack/react-query';
import { FileDown, Undo2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useServices } from '@/hooks/use-services';
import { apiErrorMessage } from '@/lib/api-errors';
import { remainingRefundableMinor } from '@/lib/billing';
import { saveBlob } from '@/lib/download';
import { formatMoney } from '@/lib/money';

export function InvoiceKindBadge({ kind }: { kind: Invoice['kind'] }) {
  const { t } = useTranslation();
  return (
    <Badge variant={kind === 'credit_note' ? 'outline' : 'secondary'}>
      {t(`invoices.kinds.${kind}`)}
    </Badge>
  );
}

export function Amount({ minor, currency }: { minor: number; currency: string }) {
  return <span className="tabular-nums">{formatMoney(minor, currency)}</span>;
}

export function InvoiceTotal({ invoice }: { invoice: Invoice }) {
  const { t } = useTranslation();
  const refunded = invoice.kind === 'invoice' && invoice.refundedMinor > 0;
  return (
    <span className="block text-right">
      <Amount minor={invoice.totalMinor} currency={invoice.currency} />
      {refunded && (
        <span className="text-muted-foreground block text-xs">
          {t('invoices.refunded', {
            amount: formatMoney(invoice.refundedMinor, invoice.currency),
          })}
        </span>
      )}
    </span>
  );
}

export function invoiceNumber(invoice: Invoice, draftLabel: string): string {
  return invoice.formattedNumber ?? draftLabel;
}

export function InvoiceActions({
  invoice,
  canRefund,
  onRefund,
}: {
  invoice: Invoice;
  canRefund: boolean;
  onRefund: (invoice: Invoice) => void;
}) {
  const { t } = useTranslation();
  const { api } = useServices();
  const number = invoiceNumber(invoice, t('invoices.draft'));
  const pdf = useMutation({
    mutationFn: async () => {
      const { data, error } = await api.fetchClient.GET('/v1/invoices/{id}.pdf', {
        params: { path: { id: invoice.id } },
        parseAs: 'blob',
      });
      if (error) throw error;
      saveBlob(data, `${invoice.formattedNumber ?? invoice.id}.pdf`);
    },
    onError: (error) => toast.error(apiErrorMessage(error, t('invoices.pdfFailed'))),
  });
  const refundable = canRefund && invoice.kind === 'invoice' && invoice.status !== 'draft';
  const fullyRefunded = remainingRefundableMinor(invoice) === 0;
  return (
    <div className="flex justify-end gap-1">
      {invoice.status !== 'draft' && (
        <Button
          variant="ghost"
          size="sm"
          disabled={pdf.isPending}
          title={t('invoices.pdfLabel', { number })}
          onClick={() => pdf.mutate()}
        >
          <FileDown aria-hidden />
          {t('invoices.pdf')}
        </Button>
      )}
      {refundable && (
        <Button
          variant="ghost"
          size="sm"
          disabled={fullyRefunded}
          title={
            fullyRefunded
              ? t('invoices.fullyRefunded', { number })
              : t('invoices.refundLabel', { number })
          }
          onClick={() => onRefund(invoice)}
        >
          <Undo2 aria-hidden />
          {t('invoices.refund')}
        </Button>
      )}
    </div>
  );
}
