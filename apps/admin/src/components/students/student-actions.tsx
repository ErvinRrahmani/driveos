import type { StudentResponse } from '@driveos/shared';
import { useMutation } from '@tanstack/react-query';
import { Archive, Download, UserX } from 'lucide-react';
import { useId, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useInvalidate } from '@/hooks/use-invalidate';
import { useServices } from '@/hooks/use-services';
import { useCan } from '@/hooks/use-session';
import { apiErrorMessage } from '@/lib/api-errors';
import { base64ToBlob, saveBlob } from '@/lib/download';
import { exportFileBase, nameMatches } from '@/lib/students';

type Pending = 'export' | 'archive' | 'anonymize' | null;

export function StudentActions({
  student,
  onGone,
}: {
  student: StudentResponse;
  onGone: () => void;
}) {
  const { t } = useTranslation();
  const canExport = useCan('students.export');
  const canArchive = useCan('students.manage');
  const canAnonymize = useCan('students.anonymize');
  const [open, setOpen] = useState<Pending>(null);
  const close = () => setOpen(null);
  const anonymized = student.status === 'anonymized';
  return (
    <>
      {canExport && !anonymized && (
        <Button variant="outline" onClick={() => setOpen('export')}>
          <Download aria-hidden />
          {t('studentActions.export')}
        </Button>
      )}
      {canArchive && student.status === 'active' && (
        <Button variant="outline" onClick={() => setOpen('archive')}>
          <Archive aria-hidden />
          {t('studentActions.archive')}
        </Button>
      )}
      {canAnonymize && !anonymized && (
        <Button variant="destructive" onClick={() => setOpen('anonymize')}>
          <UserX aria-hidden />
          {t('studentActions.anonymize')}
        </Button>
      )}
      <ExportDialog student={student} open={open === 'export'} onClose={close} />
      <ArchiveDialog
        key={`archive-${String(open === 'archive')}`}
        student={student}
        open={open === 'archive'}
        onClose={close}
      />
      <AnonymizeDialog
        key={`anonymize-${String(open === 'anonymize')}`}
        student={student}
        open={open === 'anonymize'}
        onClose={close}
        onGone={onGone}
      />
    </>
  );
}

interface DialogProps {
  student: StudentResponse;
  open: boolean;
  onClose: () => void;
}

function ExportDialog({ student, open, onClose }: DialogProps) {
  const { t } = useTranslation();
  const { api } = useServices();
  const exportData = useMutation({
    mutationFn: async () => {
      const { data, error } = await api.fetchClient.POST('/v1/students/{id}/export', {
        params: { path: { id: student.id } },
      });
      if (error) throw error;
      return data;
    },
    onSuccess: (result) => {
      const base = exportFileBase(student.fullName);
      saveBlob(
        new Blob([JSON.stringify(result.bundle, null, 2)], { type: 'application/json' }),
        `${base}.json`,
      );
      saveBlob(base64ToBlob(result.pdfBase64, 'application/pdf'), `${base}.pdf`);
      onClose();
      toast.success(t('studentActions.exportReady'));
    },
    onError: (error) => toast.error(apiErrorMessage(error, t('errors.generic'))),
  });
  return (
    <ConfirmDialog
      open={open}
      onOpenChange={(next) => !next && onClose()}
      title={t('studentActions.exportTitle')}
      description={t('studentActions.exportBody', { name: student.fullName })}
      confirmLabel={t('studentActions.exportConfirm')}
      pending={exportData.isPending}
      onConfirm={() => exportData.mutate()}
    />
  );
}

function ArchiveDialog({ student, open, onClose }: DialogProps) {
  const { t } = useTranslation();
  const { api } = useServices();
  const invalidate = useInvalidate();
  const reasonId = useId();
  const [reason, setReason] = useState('');
  const archive = api.$api.useMutation('post', '/v1/students/{id}/archive', {
    onSuccess: async () => {
      await invalidate('/v1/students', '/v1/students/{id}');
      toast.success(t('studentActions.archived'));
      onClose();
    },
    onError: (error) => toast.error(apiErrorMessage(error, t('errors.generic'))),
  });
  return (
    <ConfirmDialog
      open={open}
      onOpenChange={(next) => !next && onClose()}
      title={t('studentActions.archiveTitle')}
      description={t('studentActions.archiveBody', { name: student.fullName })}
      confirmLabel={t('studentActions.archive')}
      pending={archive.isPending}
      onConfirm={() =>
        archive.mutate({
          params: { path: { id: student.id } },
          body: reason.trim() ? { reason: reason.trim() } : {},
        })
      }
    >
      <div className="grid gap-2">
        <Label htmlFor={reasonId}>{t('studentActions.archiveReason')}</Label>
        <Input
          id={reasonId}
          value={reason}
          maxLength={500}
          onChange={(event) => setReason(event.target.value)}
        />
      </div>
    </ConfirmDialog>
  );
}

function AnonymizeDialog({ student, open, onClose, onGone }: DialogProps & { onGone: () => void }) {
  const { t } = useTranslation();
  const { api, queryClient } = useServices();
  const invalidate = useInvalidate();
  const typedId = useId();
  const [typed, setTyped] = useState('');
  const anonymize = api.$api.useMutation('delete', '/v1/students/{id}', {
    onSuccess: async () => {
      queryClient.removeQueries({ queryKey: ['get', '/v1/students/{id}'] });
      await invalidate('/v1/students');
      toast.success(t('studentActions.anonymized'));
      onClose();
      onGone();
    },
    onError: (error) => toast.error(apiErrorMessage(error, t('errors.generic'))),
  });
  return (
    <ConfirmDialog
      open={open}
      onOpenChange={(next) => !next && onClose()}
      title={t('studentActions.anonymizeTitle')}
      description={t('studentActions.anonymizeBody')}
      confirmLabel={t('studentActions.anonymize')}
      destructive
      pending={anonymize.isPending}
      confirmDisabled={!nameMatches(typed, student.fullName)}
      onConfirm={() => anonymize.mutate({ params: { path: { id: student.id } } })}
    >
      <div className="grid gap-2">
        <Label htmlFor={typedId}>
          {t('studentActions.anonymizeType', { name: student.fullName })}
        </Label>
        <Input
          id={typedId}
          value={typed}
          autoComplete="off"
          onChange={(event) => setTyped(event.target.value)}
        />
      </div>
    </ConfirmDialog>
  );
}
