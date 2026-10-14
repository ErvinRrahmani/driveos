import type { StudentListItem } from '@driveos/shared';
import { keepPreviousData } from '@tanstack/react-query';
import { createFileRoute, Link } from '@tanstack/react-router';
import { Plus } from 'lucide-react';
import { useEffect, useEffectEvent, useId, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { z } from 'zod';
import { columnHelperFor, DataTable } from '@/components/data-table';
import { FormDialog } from '@/components/form-dialog';
import { PageHeader } from '@/components/page-header';
import { RequirePermission } from '@/components/require-permission';
import { CreateStudentForm } from '@/components/students/create-student-form';
import { CreditMinutes, StudentStatusBadge } from '@/components/students/student-badges';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { NativeSelect } from '@/components/ui/native-select';
import { useCursorPagination } from '@/hooks/use-cursor-pagination';
import { useInstructors } from '@/hooks/use-scheduling-options';
import { useSchoolClock } from '@/hooks/use-school-clock';
import { useServices } from '@/hooks/use-services';
import { useCan } from '@/hooks/use-session';
import { formatDateTimeIn } from '@/lib/format';
import { listSearchSchema, pageQuery } from '@/lib/search';
import { STUDENT_STATUSES } from '@/lib/students';

const SEARCH_DEBOUNCE_MS = 300;

const studentsSearchSchema = listSearchSchema.extend({
  q: z.string().trim().min(1).max(100).optional().catch(undefined),
  status: z.enum(STUDENT_STATUSES).optional().catch(undefined),
  instructorId: z.uuid().optional().catch(undefined),
});

export const Route = createFileRoute('/_app/students/')({
  validateSearch: (search) => studentsSearchSchema.parse(search),
  component: () => (
    <RequirePermission anyOf={['students.read']}>
      <StudentsPage />
    </RequirePermission>
  ),
});

const helper = columnHelperFor<StudentListItem>();

function StudentsPage() {
  const { t } = useTranslation();
  const { api } = useServices();
  const canManage = useCan('students.manage');
  const { timeZone } = useSchoolClock();
  const search = Route.useSearch();
  const navigate = Route.useNavigate();
  const [creating, setCreating] = useState(false);
  const pagination = useCursorPagination(
    search.cursor,
    (cursor) => void navigate({ search: (prev) => ({ ...prev, cursor }) }),
  );
  const list = api.$api.useQuery(
    'get',
    '/v1/students',
    {
      params: {
        query: {
          ...pageQuery(search),
          q: search.q,
          status: search.status,
          instructorId: search.instructorId,
        },
      },
    },
    { placeholderData: keepPreviousData },
  );

  const columns = useMemo(() => {
    const when = (iso: string | null) =>
      iso ? formatDateTimeIn(iso, timeZone ?? 'UTC') : t('students.noLesson');
    return helper.columns([
      helper.accessor('fullName', {
        header: t('students.name'),
        cell: ({ row }) => (
          <Link
            to="/students/$id"
            params={{ id: row.original.id }}
            className="font-medium underline-offset-4 hover:underline"
          >
            {row.original.fullName}
          </Link>
        ),
      }),
      helper.accessor('licenceClass', { header: t('students.licenceClass') }),
      helper.accessor('status', {
        header: t('students.status'),
        cell: ({ getValue }) => <StudentStatusBadge status={getValue()} />,
      }),
      helper.accessor('primaryInstructorName', {
        header: t('students.primaryInstructor'),
        cell: ({ getValue }) => getValue() ?? t('common.none'),
      }),
      helper.accessor('balanceMinutes', {
        header: t('students.balance'),
        cell: ({ getValue }) => <CreditMinutes minutes={getValue()} />,
      }),
      helper.accessor('nextLessonAt', {
        header: t('students.nextLesson'),
        cell: ({ getValue }) => when(getValue()),
      }),
      helper.accessor('lastLessonAt', {
        header: t('students.lastLesson'),
        cell: ({ getValue }) => when(getValue()),
      }),
      helper.accessor('progressPct', {
        header: t('students.progress'),
        cell: ({ getValue }) => t('students.percent', { value: getValue() }),
      }),
    ]);
  }, [t, timeZone]);

  const addButton = canManage ? (
    <Button onClick={() => setCreating(true)}>
      <Plus aria-hidden />
      {t('students.add')}
    </Button>
  ) : undefined;

  return (
    <>
      <PageHeader title={t('students.title')} actions={addButton} />
      <StudentFilters
        q={search.q}
        status={search.status}
        instructorId={search.instructorId}
        onChange={(patch) =>
          void navigate({
            search: (prev) => ({ ...prev, ...patch, cursor: undefined }),
            replace: 'q' in patch,
          })
        }
      />
      <DataTable
        label={t('students.title')}
        columns={columns}
        items={list.data?.items}
        nextCursor={list.data?.nextCursor}
        status={list.status}
        error={list.error}
        onRetry={() => void list.refetch()}
        pagination={pagination}
        getRowId={(student) => student.id}
        emptyTitle={t('students.empty')}
        emptyDescription={t('students.emptyBody')}
      />
      <FormDialog open={creating} onOpenChange={setCreating} title={t('students.addTitle')}>
        <CreateStudentForm
          onCancel={() => setCreating(false)}
          onCreated={(id) => {
            setCreating(false);
            void navigate({ to: '/students/$id', params: { id } });
          }}
        />
      </FormDialog>
    </>
  );
}

interface FilterPatch {
  q?: string | undefined;
  status?: (typeof STUDENT_STATUSES)[number] | undefined;
  instructorId?: string | undefined;
}

function StudentFilters({
  q,
  status,
  instructorId,
  onChange,
}: {
  q: string | undefined;
  status: FilterPatch['status'];
  instructorId: string | undefined;
  onChange: (patch: FilterPatch) => void;
}) {
  const { t } = useTranslation();
  const instructors = useInstructors();
  const [text, setText] = useState(q ?? '');
  const searchId = useId();
  const statusId = useId();
  const instructorFilterId = useId();
  const commitSearch = useEffectEvent((next: string | undefined) => onChange({ q: next }));

  useEffect(() => {
    const next = text.trim() || undefined;
    if (next === q) return;
    const timer = setTimeout(() => commitSearch(next), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [text, q]);

  return (
    <div className="flex flex-wrap items-end gap-4">
      <div className="grid w-64 gap-2">
        <Label htmlFor={searchId}>{t('students.search')}</Label>
        <Input
          id={searchId}
          type="search"
          value={text}
          placeholder={t('students.searchPlaceholder')}
          onChange={(event) => setText(event.target.value)}
        />
      </div>
      <div className="grid w-44 gap-2">
        <Label htmlFor={statusId}>{t('students.status')}</Label>
        <NativeSelect
          id={statusId}
          value={status ?? ''}
          onChange={(event) =>
            onChange({ status: STUDENT_STATUSES.find((value) => value === event.target.value) })
          }
        >
          <option value="">{t('students.allStatuses')}</option>
          {STUDENT_STATUSES.map((value) => (
            <option key={value} value={value}>
              {t(`students.statuses.${value}`)}
            </option>
          ))}
        </NativeSelect>
      </div>
      <div className="grid w-56 gap-2">
        <Label htmlFor={instructorFilterId}>{t('students.instructor')}</Label>
        <NativeSelect
          id={instructorFilterId}
          value={instructorId ?? ''}
          onChange={(event) => onChange({ instructorId: event.target.value || undefined })}
        >
          <option value="">{t('students.allInstructors')}</option>
          {instructors.options.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </NativeSelect>
      </div>
    </div>
  );
}
