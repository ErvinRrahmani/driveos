import type { Lead } from '@driveos/shared';
import { Link } from '@tanstack/react-router';
import { useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { z } from 'zod';
import { FormDialog } from '@/components/form-dialog';
import { reportSubmitError, useAppForm } from '@/components/form';
import { ErrorState, LoadingState } from '@/components/states';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useInvalidate } from '@/hooks/use-invalidate';
import { useServices } from '@/hooks/use-services';
import { useCan } from '@/hooks/use-session';
import { formatDate, formatDateTime } from '@/lib/format';
import { optionalText } from '@/lib/form-schemas';
import { ConvertLeadForm } from './convert-lead-form';
import { LeadSourceLabel, LeadStatusBadge } from './lead-badges';
import { LostLeadForm } from './lost-lead-form';

const SIDE_PANEL =
  'top-0 right-0 left-auto h-full max-h-none w-full max-w-md translate-x-0 translate-y-0 content-start rounded-none border-y-0 border-r-0 sm:max-w-md';

/** The lead's details, notes and status actions in a side panel. */
export function LeadDrawer({
  leadId,
  onClose,
  onConverted,
}: {
  leadId: string | undefined;
  onClose: () => void;
  onConverted: (studentId: string) => void;
}) {
  const { t } = useTranslation();
  const { api } = useServices();
  const lead = api.$api.useQuery(
    'get',
    '/v1/leads/{id}',
    { params: { path: { id: leadId ?? '' } } },
    { enabled: leadId !== undefined },
  );
  return (
    <Dialog open={leadId !== undefined} onOpenChange={(open) => !open && onClose()}>
      <DialogContent closeLabel={t('common.close')} className={SIDE_PANEL}>
        {lead.data ? (
          <LeadPanel lead={lead.data} onConverted={onConverted} />
        ) : (
          <>
            <DialogHeader>
              <DialogTitle>{t('leads.details')}</DialogTitle>
              <DialogDescription className="sr-only">{t('leads.details')}</DialogDescription>
            </DialogHeader>
            {lead.isError ? (
              <ErrorState error={lead.error} onRetry={() => void lead.refetch()} />
            ) : (
              <LoadingState />
            )}
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

function LeadPanel({
  lead,
  onConverted,
}: {
  lead: Lead;
  onConverted: (studentId: string) => void;
}) {
  const { t } = useTranslation();
  const canManage = useCan('leads.manage');
  const [dialog, setDialog] = useState<'convert' | 'lost' | null>(null);
  const closeDialog = () => setDialog(null);
  return (
    <div className="grid gap-6">
      <DialogHeader>
        <DialogTitle>{lead.fullName}</DialogTitle>
        <DialogDescription className="flex flex-wrap items-center gap-2">
          <LeadStatusBadge status={lead.status} />
          <LeadSourceLabel source={lead.source} />
          <span>· {formatDateTime(lead.createdAt)}</span>
        </DialogDescription>
      </DialogHeader>
      <LeadDetails lead={lead} />
      {lead.status === 'converted' && lead.studentId && (
        <Button asChild variant="outline">
          <Link to="/students/$id" params={{ id: lead.studentId }}>
            {t('leads.openStudent')}
          </Link>
        </Button>
      )}
      {canManage && lead.status !== 'converted' && (
        <>
          <div className="flex flex-wrap gap-2">
            <Button onClick={() => setDialog('convert')}>{t('leads.convert')}</Button>
            {lead.status !== 'contacted' && <MarkContactedButton leadId={lead.id} />}
            {lead.status !== 'lost' && (
              <Button variant="outline" onClick={() => setDialog('lost')}>
                {t('leads.markLost')}
              </Button>
            )}
          </div>
          <LeadNoteForm key={lead.version} lead={lead} />
        </>
      )}
      <FormDialog
        open={dialog === 'convert'}
        onOpenChange={(open) => !open && closeDialog()}
        title={t('leads.convertForm.title')}
      >
        <ConvertLeadForm lead={lead} onCancel={closeDialog} onConverted={onConverted} />
      </FormDialog>
      <FormDialog
        open={dialog === 'lost'}
        onOpenChange={(open) => !open && closeDialog()}
        title={t('leads.lostTitle')}
      >
        <LostLeadForm leadId={lead.id} onDone={closeDialog} />
      </FormDialog>
    </div>
  );
}

function Detail({ label, children }: { label: string; children: ReactNode }) {
  return (
    <>
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="min-w-0 break-words">{children}</dd>
    </>
  );
}

function LeadDetails({ lead }: { lead: Lead }) {
  const { t } = useTranslation();
  return (
    <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
      {lead.phone && (
        <Detail label={t('leads.phone')}>
          <a href={`tel:${lead.phone}`} className="underline-offset-4 hover:underline">
            {lead.phone}
          </a>
        </Detail>
      )}
      {lead.email && (
        <Detail label={t('leads.email')}>
          <a href={`mailto:${lead.email}`} className="underline-offset-4 hover:underline">
            {lead.email}
          </a>
        </Detail>
      )}
      <Detail label={t('leads.licenceClass')}>{lead.licenceClass}</Detail>
      {lead.message && (
        <Detail label={t('leads.message')}>
          <span className="whitespace-pre-line">{lead.message}</span>
        </Detail>
      )}
      {lead.isMinor && (
        <Detail label={t('leads.guardian')}>
          {[lead.guardianName, lead.guardianContact].filter(Boolean).join(' · ')}
        </Detail>
      )}
      <Detail label={t('leads.consent')}>
        {t('leads.consentValue', {
          version: lead.consentTextVersion,
          date: formatDateTime(lead.consentedAt),
        })}
      </Detail>
      {lead.convertedAt && (
        <Detail label={t('leads.status')}>
          {t('leads.convertedOn', { date: formatDate(lead.convertedAt) })}
        </Detail>
      )}
      {lead.lostAt && (
        <Detail label={t('leads.status')}>
          {t('leads.lostOn', { date: formatDate(lead.lostAt) })}
          {lead.lostReason && (
            <span className="block">{t('leads.lostReasonValue', { reason: lead.lostReason })}</span>
          )}
        </Detail>
      )}
      {lead.status === 'converted' && lead.note && (
        <Detail label={t('leads.notes')}>
          <span className="whitespace-pre-line">{lead.note}</span>
        </Detail>
      )}
    </dl>
  );
}

function MarkContactedButton({ leadId }: { leadId: string }) {
  const { t } = useTranslation();
  const { api } = useServices();
  const invalidate = useInvalidate();
  const update = api.$api.useMutation('patch', '/v1/leads/{id}');
  return (
    <Button
      variant="outline"
      disabled={update.isPending}
      onClick={() =>
        update.mutate(
          { params: { path: { id: leadId } }, body: { status: 'contacted' } },
          {
            onSuccess: async () => {
              await invalidate('/v1/leads', '/v1/leads/{id}');
              toast.success(t('leads.updated'));
            },
            onError: () => toast.error(t('errors.generic')),
          },
        )
      }
    >
      {t('leads.markContacted')}
    </Button>
  );
}

const noteSchema = z.object({ note: optionalText(2000) });

function LeadNoteForm({ lead }: { lead: Lead }) {
  const { t } = useTranslation();
  const { api } = useServices();
  const invalidate = useInvalidate();
  const update = api.$api.useMutation('patch', '/v1/leads/{id}');
  const form = useAppForm({
    defaultValues: { note: lead.note ?? '' } as z.input<typeof noteSchema>,
    validators: { onChange: noteSchema, onSubmit: noteSchema },
    onSubmit: async ({ value }) => {
      try {
        await update.mutateAsync({
          params: { path: { id: lead.id } },
          body: { note: noteSchema.parse(value).note },
        });
        await invalidate('/v1/leads', '/v1/leads/{id}');
        toast.success(t('leads.noteSaved'));
      } catch (error) {
        reportSubmitError(form, error, t('errors.generic'));
      }
    },
  });
  return (
    <form
      className="grid gap-2"
      noValidate
      onSubmit={(event) => {
        event.preventDefault();
        void form.handleSubmit();
      }}
    >
      <form.AppField name="note">
        {(field) => <field.TextAreaField label={t('leads.notes')} rows={4} submitOnModEnter />}
      </form.AppField>
      <div className="flex justify-end">
        <form.AppForm>
          <form.SubmitButton label={t('leads.saveNote')} />
        </form.AppForm>
      </div>
    </form>
  );
}
