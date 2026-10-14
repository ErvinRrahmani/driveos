import { createFileRoute } from '@tanstack/react-router';
import { z } from 'zod';
import { RequirePermission } from '@/components/require-permission';
import { StudentProfile, type StudentSearch } from '@/components/students/student-profile';
import { listSearchSchema } from '@/lib/search';
import { STUDENT_TABS } from '@/lib/students';

const studentSearchSchema = listSearchSchema.extend({
  tab: z.enum(STUDENT_TABS).optional().catch(undefined),
  from: z.iso.date().optional().catch(undefined),
  to: z.iso.date().optional().catch(undefined),
  contractId: z.uuid().optional().catch(undefined),
});

export const Route = createFileRoute('/_app/students/$id')({
  validateSearch: (search: Record<string, unknown>): StudentSearch =>
    studentSearchSchema.parse(search),
  component: () => (
    <RequirePermission anyOf={['students.read']}>
      <StudentScreen />
    </RequirePermission>
  ),
});

function StudentScreen() {
  const { id } = Route.useParams();
  const search = Route.useSearch();
  const navigate = Route.useNavigate();
  return (
    <StudentProfile
      key={id}
      studentId={id}
      search={search}
      onSearch={(patch) => void navigate({ search: (prev) => ({ ...prev, ...patch }) })}
      onTab={(tab) => void navigate({ search: { tab: tab === 'overview' ? undefined : tab } })}
      onGone={() => void navigate({ to: '/students' })}
    />
  );
}
