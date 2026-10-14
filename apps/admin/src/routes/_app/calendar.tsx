import { createFileRoute } from '@tanstack/react-router';
import { z } from 'zod';
import { type CalendarSearch, CalendarPage } from '@/components/calendar/calendar-page';
import { RequirePermission } from '@/components/require-permission';
import { CALENDAR_GROUPS, CALENDAR_VIEWS } from '@/lib/calendar';

const calendarSearchSchema = z.object({
  view: z.enum(CALENDAR_VIEWS).optional().catch(undefined),
  date: z.iso.date().optional().catch(undefined),
  by: z.enum(CALENDAR_GROUPS).optional().catch(undefined),
  instructorId: z.uuid().optional().catch(undefined),
  vehicleId: z.uuid().optional().catch(undefined),
  studentId: z.uuid().optional().catch(undefined),
});

export const Route = createFileRoute('/_app/calendar')({
  validateSearch: (search: Record<string, unknown>): CalendarSearch =>
    calendarSearchSchema.parse(search),
  component: () => (
    <RequirePermission anyOf={['calendar.read']}>
      <CalendarScreen />
    </RequirePermission>
  ),
});

function CalendarScreen() {
  const search = Route.useSearch();
  const navigate = Route.useNavigate();
  return (
    <CalendarPage
      search={search}
      onSearch={(patch) => void navigate({ search: (prev) => ({ ...prev, ...patch }) })}
    />
  );
}
