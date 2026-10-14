import { createFileRoute } from '@tanstack/react-router';
import { z } from 'zod';
import { GrowthReport } from '@/components/dashboard/growth-report';
import { PageHeader } from '@/components/page-header';
import { Card, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useCan, useSession } from '@/hooks/use-session';
import { useTranslation } from 'react-i18next';

const dashboardSearchSchema = z.object({
  month: z
    .string()
    .regex(/^\d{4}-(0[1-9]|1[0-2])$/)
    .optional()
    .catch(undefined),
});

export const Route = createFileRoute('/_app/')({
  validateSearch: (search) => dashboardSearchSchema.parse(search),
  component: DashboardPage,
});

function DashboardPage() {
  const { t } = useTranslation();
  const { me } = useSession();
  const canReadReports = useCan('reports.read');
  const search = Route.useSearch();
  const navigate = Route.useNavigate();
  return (
    <>
      <PageHeader title={t('dashboard.title')} />
      {canReadReports ? (
        <GrowthReport
          month={search.month}
          onMonthChange={(month) => void navigate({ search: { month } })}
        />
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>{t('dashboard.welcome', { name: me.user.fullName })}</CardTitle>
            <CardDescription>{t('dashboard.welcomeBody')}</CardDescription>
          </CardHeader>
        </Card>
      )}
    </>
  );
}
