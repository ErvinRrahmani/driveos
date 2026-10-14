import { PROGRESS_LEVEL_MAX, type StudentResponse } from '@driveos/shared';
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { columnHelperFor, DataTable } from '@/components/data-table';
import { EmptyState, ErrorState, LoadingState } from '@/components/states';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { useServices } from '@/hooks/use-services';
import { formatDate } from '@/lib/format';
import { cn } from '@/lib/utils';

export function useStudentProgress(studentId: string) {
  const { api } = useServices();
  return api.$api.useQuery('get', '/v1/students/{id}/progress', {
    params: { path: { id: studentId } },
  });
}

type SyllabusProgress = NonNullable<
  ReturnType<typeof useStudentProgress>['data']
>['syllabus'][number];

type ProgressRow = SyllabusProgress & { id: string };

const NOT_STARTED = { level: null, lastNote: null, lessonCount: 0, updatedAt: null };

const helper = columnHelperFor<ProgressRow>();

export function ProgressTab({ student }: { student: StudentResponse }) {
  const { t } = useTranslation();
  const { api } = useServices();
  const progress = useStudentProgress(student.id);
  const syllabus = api.$api.useQuery('get', '/v1/syllabus', {
    params: { query: { licenceClass: student.licenceClass } },
  });

  const rows = useMemo<ProgressRow[] | undefined>(() => {
    if (!progress.data) return undefined;
    const byItem = new Map(progress.data.syllabus.map((row) => [row.syllabusItemId, row]));
    const items = syllabus.data?.items ?? [];
    const merged = items.map(
      (item): SyllabusProgress =>
        byItem.get(item.id) ?? {
          syllabusItemId: item.id,
          code: item.code,
          title: item.title,
          sortOrder: item.sortOrder,
          ...NOT_STARTED,
        },
    );
    const extra = progress.data.syllabus.filter(
      (row) => !items.some((item) => item.id === row.syllabusItemId),
    );
    return [...merged, ...extra]
      .sort((a, b) => a.sortOrder - b.sortOrder)
      .map((row) => ({ ...row, id: row.syllabusItemId }));
  }, [progress.data, syllabus.data]);

  const columns = useMemo(
    () =>
      helper.columns([
        helper.accessor('code', { header: t('progress.code') }),
        helper.accessor('title', { header: t('progress.item') }),
        helper.accessor('level', {
          header: t('progress.level'),
          cell: ({ row }) => <LevelBar level={row.original.level} title={row.original.title} />,
        }),
        helper.accessor('lastNote', {
          header: t('progress.lastNote'),
          cell: ({ getValue }) => getValue() ?? '—',
        }),
        helper.accessor('updatedAt', {
          header: t('progress.updated'),
          cell: ({ getValue }) => {
            const updated = getValue();
            return updated ? formatDate(updated) : '—';
          },
        }),
      ]),
    [t],
  );

  return (
    <div className="space-y-4">
      {progress.data && (
        <p className="text-sm">
          {t('progress.overall')}{' '}
          <span className="font-semibold">
            {t('students.percent', { value: progress.data.progressPct })}
          </span>
        </p>
      )}
      <DataTable
        label={t('progress.title')}
        columns={columns}
        items={rows}
        nextCursor={null}
        status={progress.status}
        error={progress.error}
        onRetry={() => void progress.refetch()}
        getRowId={(row) => row.id}
        emptyTitle={t('progress.empty')}
      />
    </div>
  );
}

function LevelBar({ level, title }: { level: number | null; title: string }) {
  const { t } = useTranslation();
  if (level === null)
    return <span className="text-muted-foreground">{t('progress.notStarted')}</span>;
  return (
    <div
      role="meter"
      aria-label={t('progress.levelOf', { item: title })}
      aria-valuemin={0}
      aria-valuemax={PROGRESS_LEVEL_MAX}
      aria-valuenow={level}
      aria-valuetext={t('progress.levelText', { level, max: PROGRESS_LEVEL_MAX })}
      className="flex items-center gap-2"
    >
      <span className="flex gap-0.5" aria-hidden>
        {Array.from({ length: PROGRESS_LEVEL_MAX }, (_, index) => (
          <span
            key={index}
            className={cn('h-2 w-5 rounded-sm', index < level ? 'bg-primary' : 'bg-muted')}
          />
        ))}
      </span>
      <span className="text-muted-foreground text-xs tabular-nums" aria-hidden>
        {level}/{PROGRESS_LEVEL_MAX}
      </span>
    </div>
  );
}

export function NotesTab({ studentId }: { studentId: string }) {
  const { t } = useTranslation();
  const progress = useStudentProgress(studentId);
  const notes = (progress.data?.entries ?? [])
    .filter((entry) => entry.note.trim() !== '')
    .sort((a, b) => b.lessonStart.localeCompare(a.lessonStart));
  return (
    <div className="space-y-4">
      <Alert>
        <AlertTitle>{t('notes.privateUnavailable')}</AlertTitle>
        <AlertDescription>{t('notes.privateUnavailableBody')}</AlertDescription>
      </Alert>
      <h2 className="text-lg font-semibold">{t('notes.lessonNotes')}</h2>
      {progress.status === 'pending' ? (
        <LoadingState />
      ) : progress.status === 'error' ? (
        <ErrorState error={progress.error} onRetry={() => void progress.refetch()} />
      ) : notes.length === 0 ? (
        <EmptyState title={t('notes.empty')} />
      ) : (
        <ul className="space-y-3">
          {notes.map((entry) => (
            <li key={entry.id} className="rounded-lg border p-4">
              <p className="text-muted-foreground text-xs">
                {t('notes.meta', {
                  date: formatDate(entry.lessonStart),
                  instructor: entry.instructorName,
                })}
              </p>
              <p className="mt-1 text-sm">{entry.note}</p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
