import type { LedgerEntry } from '@driveos/shared';
import { keepPreviousData, useMutation } from '@tanstack/react-query';
import { SlidersHorizontal } from 'lucide-react';
import { useId, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { z } from 'zod';
import { columnHelperFor, DataTable } from '@/components/data-table';
import { reportSubmitError, useAppForm } from '@/components/form';
import { FormDialog } from '@/components/form-dialog';
import { ErrorState, LoadingState } from '@/components/states';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { DialogFooter } from '@/components/ui/dialog';
import { useCursorPagination } from '@/hooks/use-cursor-pagination';
import { useIdempotencyKey } from '@/hooks/use-idempotency-key';
import { useInvalidate } from '@/hooks/use-invalidate';
import { useServices } from '@/hooks/use-services';
import { useCan } from '@/hooks/use-session';
import { formatDateTime } from '@/lib/format';
import { numberInput, requiredNumber, requiredText } from '@/lib/form-schemas';
import { pageQuery } from '@/lib/search';
import { CreditMinutes } from './student-badges';
import type { StudentSearch, StudentSearchPatch } from './student-profile';

const helper = columnHelperFor<LedgerEntry>();

export function BalanceTab({
  studentId,
  search,
  onSearch,
}: {
  studentId: string;
  search: StudentSearch;
  onSearch: (patch: StudentSearchPatch) => void;
}) {
  const { t } = useTranslation();
  const { api } = useServices();
  const canAdjust = useCan('ledger.adjust');
  const titleId = useId();
  const [adjusting, setAdjusting] = useState(false);
  const balance = api.$api.useQuery('get', '/v1/students/{id}/balance', {
    params: { path: { id: studentId } },
  });
  const pagination = useCursorPagination(search.cursor, (cursor) => onSearch({ cursor }));
  const ledger = api.$api.useQuery(
    'get',
    '/v1/students/{id}/ledger',
    { params: { path: { id: studentId }, query: pageQuery(search) } },
    { placeholderData: keepPreviousData },
  );
  const columns = useMemo(
    () =>
      helper.columns([
        helper.accessor('createdAt', {
          header: t('ledger.when'),
          cell: ({ getValue }) => formatDateTime(getValue()),
        }),
        helper.accessor('entryType', {
          header: t('ledger.type'),
          cell: ({ getValue }) => t(`ledger.types.${getValue()}`),
        }),
        helper.accessor('minutes', {
          header: t('ledger.minutes'),
          cell: ({ getValue }) => <CreditMinutes minutes={getValue()} signed />,
        }),
        helper.accessor('balanceAfter', {
          header: t('ledger.balanceAfter'),
          cell: ({ getValue }) => <CreditMinutes minutes={getValue()} />,
        }),
        helper.accessor('note', {
          header: t('ledger.note'),
          cell: ({ getValue }) => getValue() ?? '—',
        }),
      ]),
    [t],
  );
  return (
    <div className="space-y-6">
      <Card role="region" aria-labelledby={titleId}>
        <CardHeader className="flex flex-row items-start justify-between gap-4">
          <CardTitle id={titleId}>{t('ledger.balance')}</CardTitle>
          {canAdjust && (
            <Button variant="outline" onClick={() => setAdjusting(true)}>
              <SlidersHorizontal aria-hidden />
              {t('ledger.adjust')}
            </Button>
          )}
        </CardHeader>
        <CardContent className="space-y-2">
          {balance.status === 'pending' ? (
            <LoadingState />
          ) : balance.status === 'error' ? (
            <ErrorState error={balance.error} onRetry={() => void balance.refetch()} />
          ) : (
            <>
              <p className="text-3xl font-semibold">
                <CreditMinutes minutes={balance.data.balanceMinutes} />
              </p>
              <div className="flex flex-wrap items-center gap-2 text-sm">
                <span className="text-muted-foreground">{t('ledger.entitlements')}</span>
                {balance.data.entitlements.length === 0
                  ? t('common.none')
                  : balance.data.entitlements.map((entitlement) => (
                      <Badge key={entitlement.id} variant="secondary">
                        {t(`entitlements.${entitlement.kind}`)}
                      </Badge>
                    ))}
              </div>
            </>
          )}
        </CardContent>
      </Card>
      <DataTable
        label={t('ledger.title')}
        columns={columns}
        items={ledger.data?.items}
        nextCursor={ledger.data?.nextCursor}
        status={ledger.status}
        error={ledger.error}
        onRetry={() => void ledger.refetch()}
        pagination={pagination}
        getRowId={(entry) => entry.id}
        emptyTitle={t('ledger.empty')}
      />
      <FormDialog
        open={adjusting}
        onOpenChange={setAdjusting}
        title={t('ledger.adjustTitle')}
        description={t('ledger.adjustBody')}
      >
        <AdjustmentForm studentId={studentId} onDone={() => setAdjusting(false)} />
      </FormDialog>
    </div>
  );
}

const adjustmentSchema = z.object({
  minutes: numberInput(
    requiredNumber()
      .int('validation.integer')
      .refine((value) => value !== 0, 'validation.nonZero'),
  ),
  reason: requiredText(500),
  note: requiredText(500),
});
type AdjustmentValues = z.input<typeof adjustmentSchema>;

export function AdjustmentForm({ studentId, onDone }: { studentId: string; onDone: () => void }) {
  const { t } = useTranslation();
  const { api } = useServices();
  const invalidate = useInvalidate();
  const idempotency = useIdempotencyKey();
  const adjust = useMutation({
    mutationFn: async (body: { minutes: number; reason: string; note: string }) => {
      const { data, error, response } = await api.fetchClient.POST('/v1/ledger/adjustments', {
        params: { header: { 'Idempotency-Key': idempotency.current() } },
        body: { studentId, ...body },
      });
      idempotency.settle(response.status);
      if (error) throw error;
      return data;
    },
  });
  const defaultValues: AdjustmentValues = { minutes: null, reason: '', note: '' };
  const form = useAppForm({
    defaultValues,
    validators: { onChange: adjustmentSchema, onSubmit: adjustmentSchema },
    onSubmit: async ({ value }) => {
      try {
        await adjust.mutateAsync(adjustmentSchema.parse(value));
        await invalidate('/v1/students/{id}/balance', '/v1/students/{id}/ledger', '/v1/students');
        toast.success(t('ledger.adjusted'));
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
      <form.AppField name="minutes">
        {(field) => (
          <field.NumberField
            label={t('ledger.adjustMinutes')}
            description={t('ledger.adjustMinutesHint')}
            step={1}
          />
        )}
      </form.AppField>
      <form.AppField name="reason">
        {(field) => <field.TextField label={t('ledger.reason')} />}
      </form.AppField>
      <form.AppField name="note">
        {(field) => <field.TextField label={t('ledger.note')} />}
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
