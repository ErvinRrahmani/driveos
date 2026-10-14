import type { GuardianLink, Invitation, StudentResponse } from '@driveos/shared';
import { Link2, UserPlus } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { z } from 'zod';
import { columnHelperFor, DataTable } from '@/components/data-table';
import { reportSubmitError, useAppForm } from '@/components/form';
import { FormDialog } from '@/components/form-dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { DialogFooter } from '@/components/ui/dialog';
import { useInvalidate } from '@/hooks/use-invalidate';
import { useServices } from '@/hooks/use-services';
import { useCan } from '@/hooks/use-session';
import { formatDate, formatDateTime } from '@/lib/format';
import { ContactInvitationForm } from './contact-invitation-form';

type ConsentState = 'given' | 'pending' | 'revoked';

function consentOf(link: GuardianLink): ConsentState {
  if (link.revokedAt) return 'revoked';
  return link.consentAt ? 'given' : 'pending';
}

const guardianHelper = columnHelperFor<GuardianLink>();
const invitationHelper = columnHelperFor<Invitation>();

export function GuardiansTab({ student }: { student: StudentResponse }) {
  const { t } = useTranslation();
  const { api } = useServices();
  const canManage = useCan('guardians.manage');
  const canInvite = useCan('invitations.manage');
  const [dialog, setDialog] = useState<'invite' | 'link' | null>(null);
  const invitations = api.$api.useQuery(
    'get',
    '/v1/invitations',
    { params: { query: { limit: 200 } } },
    { enabled: canInvite },
  );
  const pending = (invitations.data?.items ?? []).filter(
    (invitation) => invitation.studentId === student.id && invitation.roles.includes('parent'),
  );
  const guardianColumns = useMemo(
    () =>
      guardianHelper.columns([
        guardianHelper.accessor('fullName', { header: t('guardians.name') }),
        guardianHelper.display({
          id: 'contact',
          header: t('guardians.contact'),
          cell: ({ row }) => row.original.phone ?? row.original.email ?? '—',
        }),
        guardianHelper.display({
          id: 'consent',
          header: t('guardians.consent'),
          cell: ({ row }) => {
            const state = consentOf(row.original);
            return (
              <Badge variant={state === 'given' ? 'secondary' : 'outline'}>
                {t(`guardians.consentStates.${state}`)}
              </Badge>
            );
          },
        }),
        guardianHelper.display({
          id: 'consentDetail',
          header: t('guardians.consentDetail'),
          cell: ({ row }) =>
            row.original.consentAt
              ? t('guardians.consentAt', {
                  date: formatDateTime(row.original.consentAt),
                  version: row.original.consentTextVersion ?? '—',
                })
              : '—',
        }),
      ]),
    [t],
  );
  const invitationColumns = useMemo(
    () =>
      invitationHelper.columns([
        invitationHelper.display({
          id: 'contact',
          header: t('guardians.contact'),
          cell: ({ row }) => row.original.email ?? row.original.phone ?? '—',
        }),
        invitationHelper.accessor('createdAt', {
          header: t('guardians.invitedAt'),
          cell: ({ getValue }) => formatDate(getValue()),
        }),
        invitationHelper.accessor('expiresAt', {
          header: t('staff.expiresAt'),
          cell: ({ getValue }) => formatDate(getValue()),
        }),
      ]),
    [t],
  );
  const active = student.status === 'active';
  return (
    <div className="space-y-6">
      {student.isMinor && (
        <p className="text-muted-foreground text-sm">{t('guardians.minorHint')}</p>
      )}
      <section className="space-y-3">
        <div className="flex flex-wrap items-center justify-end gap-2">
          {canManage && active && (
            <Button variant="outline" onClick={() => setDialog('link')}>
              <Link2 aria-hidden />
              {t('guardians.link')}
            </Button>
          )}
          {canInvite && active && (
            <Button onClick={() => setDialog('invite')}>
              <UserPlus aria-hidden />
              {t('guardians.invite')}
            </Button>
          )}
        </div>
        <DataTable
          label={t('guardians.title')}
          columns={guardianColumns}
          items={student.guardians}
          nextCursor={null}
          status="success"
          getRowId={(link) => link.id}
          emptyTitle={t('guardians.empty')}
        />
      </section>
      {pending.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-lg font-semibold">{t('guardians.pendingTitle')}</h2>
          <DataTable
            label={t('guardians.pendingTitle')}
            columns={invitationColumns}
            items={pending}
            nextCursor={null}
            status="success"
            getRowId={(invitation) => invitation.id}
            emptyTitle={t('guardians.empty')}
          />
        </section>
      )}
      <FormDialog
        open={dialog === 'invite'}
        onOpenChange={(open) => !open && setDialog(null)}
        title={t('guardians.invite')}
        description={t('guardians.inviteBody')}
      >
        <ContactInvitationForm
          role="parent"
          studentId={student.id}
          onDone={() => setDialog(null)}
        />
      </FormDialog>
      <FormDialog
        open={dialog === 'link'}
        onOpenChange={(open) => !open && setDialog(null)}
        title={t('guardians.link')}
        description={t('guardians.linkBody')}
      >
        <LinkGuardianForm studentId={student.id} onDone={() => setDialog(null)} />
      </FormDialog>
    </div>
  );
}

const linkSchema = z.object({ guardianUserId: z.uuid('validation.uuid') });
type LinkValues = z.input<typeof linkSchema>;

function LinkGuardianForm({ studentId, onDone }: { studentId: string; onDone: () => void }) {
  const { t } = useTranslation();
  const { api } = useServices();
  const invalidate = useInvalidate();
  const link = api.$api.useMutation('post', '/v1/students/{id}/guardians');
  const defaultValues: LinkValues = { guardianUserId: '' };
  const form = useAppForm({
    defaultValues,
    validators: { onChange: linkSchema, onSubmit: linkSchema },
    onSubmit: async ({ value }) => {
      try {
        await link.mutateAsync({
          params: { path: { id: studentId } },
          body: linkSchema.parse(value),
        });
        await invalidate('/v1/students/{id}');
        toast.success(t('guardians.linked'));
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
      <form.AppField name="guardianUserId">
        {(field) => (
          <field.TextField
            label={t('guardians.userId')}
            description={t('guardians.userIdHint')}
            autoComplete="off"
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
