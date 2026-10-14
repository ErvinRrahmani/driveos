import type { ContractResponse, ContractSignature } from '@driveos/shared';
import { FilePlus } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { z } from 'zod';
import { columnHelperFor, DataTable } from '@/components/data-table';
import { reportSubmitError, useAppForm } from '@/components/form';
import { FormDialog } from '@/components/form-dialog';
import { EmptyState, ErrorState, LoadingState } from '@/components/states';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { DialogFooter } from '@/components/ui/dialog';
import { useServices } from '@/hooks/use-services';
import { formatDateTime } from '@/lib/format';

export function ContractsTab({
  studentId,
  contractId,
  onContract,
}: {
  studentId: string;
  contractId: string | undefined;
  onContract: (contractId: string) => void;
}) {
  const { t } = useTranslation();
  const [creating, setCreating] = useState(false);
  return (
    <section className="space-y-4">
      <div className="flex justify-end">
        <Button onClick={() => setCreating(true)}>
          <FilePlus aria-hidden />
          {t('contracts.add')}
        </Button>
      </div>
      {contractId ? (
        <ContractDetails contractId={contractId} />
      ) : (
        <EmptyState title={t('contracts.none')} description={t('contracts.noneBody')} />
      )}
      <FormDialog open={creating} onOpenChange={setCreating} title={t('contracts.add')}>
        <ContractForm
          studentId={studentId}
          onCancel={() => setCreating(false)}
          onCreated={(id) => {
            setCreating(false);
            onContract(id);
          }}
        />
      </FormDialog>
    </section>
  );
}

const contractSchema = z.object({ templateId: z.string().nullable() }).superRefine((value, ctx) => {
  if (!value.templateId) {
    ctx.addIssue({ code: 'custom', path: ['templateId'], message: 'validation.required' });
  }
});
type ContractValues = z.input<typeof contractSchema>;

function ContractForm({
  studentId,
  onCreated,
  onCancel,
}: {
  studentId: string;
  onCreated: (id: string) => void;
  onCancel: () => void;
}) {
  const { t } = useTranslation();
  const { api } = useServices();
  const templates = api.$api.useQuery('get', '/v1/contract-templates', {
    params: { query: { active: 'true', limit: 200 } },
  });
  const create = api.$api.useMutation('post', '/v1/contracts');
  const defaultValues: ContractValues = { templateId: null };
  const form = useAppForm({
    defaultValues,
    validators: { onChange: contractSchema, onSubmit: contractSchema },
    onSubmit: async ({ value }) => {
      try {
        const result = await create.mutateAsync({
          body: { studentId, templateId: contractSchema.parse(value).templateId ?? '' },
        });
        toast.success(t('contracts.created'));
        onCreated(result.id);
      } catch (error) {
        reportSubmitError(form, error, t('errors.generic'));
      }
    },
  });
  const options = (templates.data?.items ?? []).map((template) => ({
    value: template.id,
    label: t('contracts.templateOption', { name: template.name, version: template.version }),
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
      <form.AppField name="templateId">
        {(field) => (
          <field.SelectField
            label={t('contracts.template')}
            options={options}
            emptyLabel={t('contracts.pickTemplate')}
          />
        )}
      </form.AppField>
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onCancel}>
          {t('common.cancel')}
        </Button>
        <form.AppForm>
          <form.SubmitButton label={t('contracts.create')} />
        </form.AppForm>
      </DialogFooter>
    </form>
  );
}

const signatureHelper = columnHelperFor<ContractSignature>();

function ContractDetails({ contractId }: { contractId: string }) {
  const { t } = useTranslation();
  const { api } = useServices();
  const contract = api.$api.useQuery('get', '/v1/contracts/{id}', {
    params: { path: { id: contractId } },
  });
  const columns = useMemo(
    () =>
      signatureHelper.columns([
        signatureHelper.accessor('signerName', { header: t('contracts.signer') }),
        signatureHelper.accessor('signerRole', {
          header: t('contracts.role'),
          cell: ({ getValue }) => t(`contracts.roles.${getValue()}`),
        }),
        signatureHelper.accessor('signedAt', {
          header: t('contracts.signedAt'),
          cell: ({ getValue }) => formatDateTime(getValue()),
        }),
      ]),
    [t],
  );
  if (contract.status === 'pending') return <LoadingState />;
  if (contract.status === 'error')
    return <ErrorState error={contract.error} onRetry={() => void contract.refetch()} />;
  const data: ContractResponse = contract.data;
  const signedRoles = new Set(data.signatures.map((signature) => signature.signerRole));
  return (
    <Card>
      <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2">
        <CardTitle>{t('contracts.version', { version: data.templateVersion })}</CardTitle>
        <Badge variant={data.status === 'signed' ? 'secondary' : 'outline'}>
          {t(`contracts.statuses.${data.status}`)}
        </Badge>
      </CardHeader>
      <CardContent className="space-y-4">
        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
          <dt className="text-muted-foreground">{t('contracts.createdAt')}</dt>
          <dd>{formatDateTime(data.createdAt)}</dd>
          <dt className="text-muted-foreground">{t('contracts.completedAt')}</dt>
          <dd>{data.completedAt ? formatDateTime(data.completedAt) : '—'}</dd>
          <dt className="text-muted-foreground">{t('contracts.required')}</dt>
          <dd className="flex flex-wrap gap-1">
            {data.requiredSignerRoles.map((role) => (
              <Badge key={role} variant={signedRoles.has(role) ? 'secondary' : 'outline'}>
                {t(`contracts.roles.${role}`)}
              </Badge>
            ))}
          </dd>
        </dl>
        <DataTable
          label={t('contracts.signatures')}
          columns={columns}
          items={data.signatures}
          nextCursor={null}
          status="success"
          getRowId={(signature) => signature.id}
          emptyTitle={t('contracts.noSignatures')}
        />
        <details className="rounded-md border p-3 text-sm">
          <summary className="cursor-pointer font-medium">{t('contracts.body')}</summary>
          <p className="mt-2 whitespace-pre-wrap">{data.body}</p>
        </details>
      </CardContent>
    </Card>
  );
}
