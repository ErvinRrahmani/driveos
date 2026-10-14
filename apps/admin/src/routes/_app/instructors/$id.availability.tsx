import { createFileRoute } from '@tanstack/react-router';
import { AvailabilityPage } from '@/components/availability/availability-page';
import { RequirePermission } from '@/components/require-permission';

export const Route = createFileRoute('/_app/instructors/$id/availability')({
  component: () => (
    <RequirePermission anyOf={['availability.manage']}>
      <AvailabilityScreen />
    </RequirePermission>
  ),
});

function AvailabilityScreen() {
  const { id } = Route.useParams();
  return <AvailabilityPage instructorId={id} />;
}
