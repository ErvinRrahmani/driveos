import {
  DOCUMENT_MAX_BYTES,
  documentKindSchema,
  documentMimeSchema,
  type DocumentItem,
  type DocumentKind,
  type DocumentMime,
} from '@driveos/shared';
import { keepPreviousData, useMutation } from '@tanstack/react-query';
import { Download, Upload } from 'lucide-react';
import { useId, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { columnHelperFor, DataTable } from '@/components/data-table';
import { FormDialog } from '@/components/form-dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { NativeSelect } from '@/components/ui/native-select';
import { useCursorPagination } from '@/hooks/use-cursor-pagination';
import { useInvalidate } from '@/hooks/use-invalidate';
import { useServices } from '@/hooks/use-services';
import { useCan } from '@/hooks/use-session';
import { apiErrorMessage } from '@/lib/api-errors';
import { startDownload } from '@/lib/download';
import { formatDateTime, formatNumber } from '@/lib/format';
import { pageQuery } from '@/lib/search';
import type { StudentSearch, StudentSearchPatch } from './student-profile';

const KINDS = documentKindSchema.options;
const MIMES: readonly string[] = documentMimeSchema.options;
const BYTES_PER_KB = 1024;

function isDocumentMime(value: string): value is DocumentMime {
  return MIMES.includes(value);
}

const helper = columnHelperFor<DocumentItem>();

export function DocumentsTab({
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
  const canUpload = useCan('documents.upload');
  const [uploading, setUploading] = useState(false);
  const pagination = useCursorPagination(search.cursor, (cursor) => onSearch({ cursor }));
  const documents = api.$api.useQuery(
    'get',
    '/v1/documents',
    { params: { query: { ...pageQuery(search), ownerStudentId: studentId } } },
    { placeholderData: keepPreviousData },
  );
  const download = useMutation({
    mutationFn: async (id: string) => {
      const { data, error } = await api.fetchClient.GET('/v1/documents/{id}/download-url', {
        params: { path: { id } },
      });
      if (error) throw error;
      return data;
    },
    onSuccess: (result) => startDownload(result.url),
    onError: (error) => toast.error(apiErrorMessage(error, t('errors.generic'))),
  });
  const columns = useMemo(
    () =>
      helper.columns([
        helper.accessor('kind', {
          header: t('documents.kind'),
          cell: ({ getValue }) => t(`documents.kinds.${getValue()}`),
        }),
        helper.accessor('mime', { header: t('documents.type') }),
        helper.accessor('sizeBytes', {
          header: t('documents.size'),
          cell: ({ getValue }) =>
            t('documents.kilobytes', { value: formatNumber(getValue() / BYTES_PER_KB, 0) }),
        }),
        helper.accessor('status', {
          header: t('documents.status'),
          cell: ({ getValue }) => (
            <Badge variant={getValue() === 'ready' ? 'secondary' : 'outline'}>
              {t(`documents.statuses.${getValue()}`)}
            </Badge>
          ),
        }),
        helper.accessor('uploadedByName', {
          header: t('documents.uploadedBy'),
          cell: ({ getValue }) => getValue() ?? '—',
        }),
        helper.accessor('createdAt', {
          header: t('documents.uploadedAt'),
          cell: ({ getValue }) => formatDateTime(getValue()),
        }),
        helper.display({
          id: 'download',
          header: () => <span className="sr-only">{t('common.actions')}</span>,
          cell: ({ row }) =>
            row.original.status === 'ready' && (
              <Button
                variant="ghost"
                size="sm"
                disabled={download.isPending}
                onClick={() => download.mutate(row.original.id)}
              >
                <Download aria-hidden />
                {t('documents.download')}
              </Button>
            ),
        }),
      ]),
    [t, download],
  );
  return (
    <section className="space-y-3">
      <div className="flex justify-end">
        {canUpload && (
          <Button onClick={() => setUploading(true)}>
            <Upload aria-hidden />
            {t('documents.upload')}
          </Button>
        )}
      </div>
      <DataTable
        label={t('documents.title')}
        columns={columns}
        items={documents.data?.items}
        nextCursor={documents.data?.nextCursor}
        status={documents.status}
        error={documents.error}
        onRetry={() => void documents.refetch()}
        pagination={pagination}
        getRowId={(document) => document.id}
        emptyTitle={t('documents.empty')}
      />
      <FormDialog
        open={uploading}
        onOpenChange={setUploading}
        title={t('documents.upload')}
        description={t('documents.uploadBody')}
      >
        <UploadForm studentId={studentId} onDone={() => setUploading(false)} />
      </FormDialog>
    </section>
  );
}

function UploadForm({ studentId, onDone }: { studentId: string; onDone: () => void }) {
  const { t } = useTranslation();
  const { api } = useServices();
  const invalidate = useInvalidate();
  const kindId = useId();
  const fileId = useId();
  const errorId = useId();
  const [kind, setKind] = useState<DocumentKind>('other');
  const [file, setFile] = useState<File | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const upload = useMutation({
    mutationFn: async ({ selected, mime }: { selected: File; mime: DocumentMime }) => {
      const created = await api.fetchClient.POST('/v1/documents/upload-url', {
        body: { kind, mime, sizeBytes: selected.size, ownerStudentId: studentId },
      });
      if (created.error) throw created.error;
      const stored = await fetch(created.data.uploadUrl, {
        method: created.data.method,
        headers: created.data.headers,
        body: selected,
      });
      if (!stored.ok) throw new Error(t('documents.storageFailed'));
      const completed = await api.fetchClient.POST('/v1/documents/{id}/complete', {
        params: { path: { id: created.data.documentId } },
      });
      if (completed.error) throw completed.error;
    },
    onSuccess: async () => {
      await invalidate('/v1/documents');
      toast.success(t('documents.uploaded'));
      onDone();
    },
    onError: (error) =>
      setProblem(
        error instanceof Error ? error.message : apiErrorMessage(error, t('errors.generic')),
      ),
  });
  const submit = () => {
    if (!file) return setProblem(t('documents.fileRequired'));
    if (!isDocumentMime(file.type)) return setProblem(t('documents.unsupportedType'));
    if (file.size > DOCUMENT_MAX_BYTES) return setProblem(t('documents.tooLarge'));
    setProblem(null);
    upload.mutate({ selected: file, mime: file.type });
  };
  return (
    <form
      className="grid gap-4"
      noValidate
      onSubmit={(event) => {
        event.preventDefault();
        submit();
      }}
    >
      <div className="grid gap-2">
        <Label htmlFor={kindId}>{t('documents.kind')}</Label>
        <NativeSelect
          id={kindId}
          value={kind}
          onChange={(event) =>
            setKind(KINDS.find((value) => value === event.target.value) ?? 'other')
          }
        >
          {KINDS.map((value) => (
            <option key={value} value={value}>
              {t(`documents.kinds.${value}`)}
            </option>
          ))}
        </NativeSelect>
      </div>
      <div className="grid gap-2">
        <Label htmlFor={fileId}>{t('documents.file')}</Label>
        <Input
          id={fileId}
          type="file"
          accept={MIMES.join(',')}
          aria-invalid={problem !== null}
          aria-describedby={problem ? errorId : undefined}
          onChange={(event) => {
            setFile(event.target.files?.[0] ?? null);
            setProblem(null);
          }}
        />
        {problem && (
          <p id={errorId} className="text-destructive text-sm">
            {problem}
          </p>
        )}
      </div>
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onDone}>
          {t('common.cancel')}
        </Button>
        <Button type="submit" disabled={upload.isPending}>
          {upload.isPending ? t('common.working') : t('documents.uploadConfirm')}
        </Button>
      </DialogFooter>
    </form>
  );
}
