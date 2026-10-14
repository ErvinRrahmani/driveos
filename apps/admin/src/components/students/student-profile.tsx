import type { StudentResponse } from '@driveos/shared';
import { Link } from '@tanstack/react-router';
import { ArrowLeft } from 'lucide-react';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { PageHeader } from '@/components/page-header';
import { ErrorState, LoadingState } from '@/components/states';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useSchoolClock } from '@/hooks/use-school-clock';
import { useServices } from '@/hooks/use-services';
import { useSession } from '@/hooks/use-session';
import { hasPermission, type Permission } from '@/lib/permissions';
import { isMinorOn, STUDENT_TABS, type StudentTab } from '@/lib/students';
import { todayIn } from '@/lib/zoned-time';
import { BalanceTab } from './balance-tab';
import { ContractsTab } from './contracts-tab';
import { DocumentsTab } from './documents-tab';
import { GuardiansTab } from './guardians-tab';
import { LessonsTab } from './lessons-tab';
import { OverviewTab } from './overview-tab';
import { NotesTab, ProgressTab } from './progress-tab';
import { StudentActions } from './student-actions';
import { StudentStatusBadge } from './student-badges';
import { TestsTab } from './tests-tab';

export interface StudentSearch {
  cursor?: string;
  limit?: number;
  tab?: StudentTab;
  from?: string;
  to?: string;
  contractId?: string;
}

export type StudentSearchPatch = Partial<StudentSearch>;

const TAB_PERMISSIONS: Record<StudentTab, Permission[]> = {
  overview: [],
  progress: ['progress.read'],
  notes: ['private_notes.read'],
  tests: ['progress.read'],
  balance: ['balance.read'],
  lessons: ['calendar.read'],
  documents: ['documents.read'],
  contracts: ['contracts.manage'],
  guardians: [],
};

export function StudentProfile({
  studentId,
  search,
  onSearch,
  onTab,
  onGone,
}: {
  studentId: string;
  search: StudentSearch;
  onSearch: (patch: StudentSearchPatch) => void;
  onTab: (tab: StudentTab) => void;
  onGone: () => void;
}) {
  const { t } = useTranslation();
  const { api } = useServices();
  const { permissions } = useSession();
  const student = api.$api.useQuery('get', '/v1/students/{id}', {
    params: { path: { id: studentId } },
  });
  const tabs = STUDENT_TABS.filter((tab) => hasPermission(permissions, TAB_PERMISSIONS[tab]));
  const active = tabs.find((tab) => tab === search.tab) ?? 'overview';

  if (student.status === 'pending') return <LoadingState />;
  if (student.status === 'error')
    return <ErrorState error={student.error} onRetry={() => void student.refetch()} />;

  const panels: Record<StudentTab, () => ReactNode> = {
    overview: () => <OverviewTab student={student.data} />,
    progress: () => <ProgressTab student={student.data} />,
    notes: () => <NotesTab studentId={studentId} />,
    tests: () => <TestsTab studentId={studentId} />,
    balance: () => <BalanceTab studentId={studentId} search={search} onSearch={onSearch} />,
    lessons: () => <LessonsTab studentId={studentId} search={search} onSearch={onSearch} />,
    documents: () => <DocumentsTab studentId={studentId} search={search} onSearch={onSearch} />,
    contracts: () => (
      <ContractsTab
        studentId={studentId}
        contractId={search.contractId}
        onContract={(contractId) => onSearch({ contractId })}
      />
    ),
    guardians: () => <GuardiansTab student={student.data} />,
  };

  return (
    <>
      <Link
        to="/students"
        className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1 text-sm"
      >
        <ArrowLeft className="size-4" aria-hidden />
        {t('studentProfile.back')}
      </Link>
      <PageHeader
        title={student.data.fullName}
        description={t('studentProfile.subtitle', { licenceClass: student.data.licenceClass })}
        actions={<StudentActions student={student.data} onGone={onGone} />}
      />
      <StudentBadges student={student.data} />
      <Tabs
        value={active}
        onValueChange={(value) => onTab(tabs.find((tab) => tab === value) ?? 'overview')}
      >
        <TabsList className="h-auto flex-wrap">
          {tabs.map((tab) => (
            <TabsTrigger key={tab} value={tab}>
              {t(`studentProfile.tabs.${tab}`)}
            </TabsTrigger>
          ))}
        </TabsList>
        <TabsContent value={active} className="space-y-6 pt-2">
          {panels[active]()}
        </TabsContent>
      </Tabs>
    </>
  );
}

function StudentBadges({ student }: { student: StudentResponse }) {
  const { t } = useTranslation();
  const { api } = useServices();
  const { timeZone } = useSchoolClock();
  const settings = api.$api.useQuery('get', '/v1/school/settings');
  const minor =
    timeZone !== undefined &&
    settings.status === 'success' &&
    isMinorOn(student.dateOfBirth, settings.data.ageOfMajority, todayIn(timeZone, new Date()));
  return (
    <div className="flex flex-wrap items-center gap-2">
      <StudentStatusBadge status={student.status} />
      {minor && <Badge variant="outline">{t('studentProfile.minor')}</Badge>}
    </div>
  );
}
