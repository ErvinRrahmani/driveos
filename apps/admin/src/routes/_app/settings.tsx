import { createFileRoute } from '@tanstack/react-router';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { z } from 'zod';
import { PageHeader } from '@/components/page-header';
import { RequirePermission } from '@/components/require-permission';
import { BookingRulesForm } from '@/components/settings/booking-rules-form';
import { OpeningHoursForm } from '@/components/settings/opening-hours-form';
import { PaymentAccountCard } from '@/components/settings/payment-account-card';
import { PublicPageForm } from '@/components/settings/public-page-form';
import { PublicPriceToggles } from '@/components/settings/public-price-toggles';
import { ReviewsModeration } from '@/components/settings/reviews-moderation';
import { SchoolProfileForm } from '@/components/settings/school-profile-form';
import { ErrorState, LoadingState } from '@/components/states';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useBranchOptions } from '@/hooks/use-branch-options';
import { useServices } from '@/hooks/use-services';
import { useCan, useHasFeature } from '@/hooks/use-session';
import { apiErrorCode } from '@/lib/api-errors';
import { ENROLMENT_PAGE_FEATURE } from '@/lib/navigation';

const SETTINGS_TABS = ['profile', 'rules', 'hours', 'payments', 'publicPage'] as const;
type SettingsTab = (typeof SETTINGS_TABS)[number];

const settingsSearchSchema = z.object({
  tab: z.enum(SETTINGS_TABS).optional().catch(undefined),
});

export const Route = createFileRoute('/_app/settings')({
  validateSearch: (search) => settingsSearchSchema.parse(search),
  component: () => (
    <RequirePermission anyOf={['settings.manage']}>
      <SettingsPage />
    </RequirePermission>
  ),
});

function SettingsPage() {
  const { t } = useTranslation();
  const search = Route.useSearch();
  const navigate = Route.useNavigate();
  const canManagePage = useCan('public_page.manage');
  const tabs = SETTINGS_TABS.filter((value) => value !== 'publicPage' || canManagePage);
  const tab = search.tab && tabs.includes(search.tab) ? search.tab : 'profile';
  return (
    <>
      <PageHeader title={t('settings.title')} />
      <Tabs
        value={tab}
        onValueChange={(value) => {
          const next = SETTINGS_TABS.find((candidate) => candidate === value);
          void navigate({ search: { tab: next === 'profile' ? undefined : next } });
        }}
      >
        <TabsList>
          {tabs.map((value) => (
            <TabsTrigger key={value} value={value}>
              {t(`settings.tabs.${value}`)}
            </TabsTrigger>
          ))}
        </TabsList>
        <SettingsPanel value="profile">
          <ProfileTab />
        </SettingsPanel>
        <SettingsPanel value="rules">
          <RulesTab />
        </SettingsPanel>
        <SettingsPanel value="hours">
          <HoursTab />
        </SettingsPanel>
        <TabsContent value="payments">
          <PaymentsTab />
        </TabsContent>
        {canManagePage && (
          <TabsContent value="publicPage">
            <PublicPageTab />
          </TabsContent>
        )}
      </Tabs>
    </>
  );
}

function SettingsPanel({ value, children }: { value: SettingsTab; children: ReactNode }) {
  return (
    <TabsContent value={value}>
      <Card>
        <CardContent>{children}</CardContent>
      </Card>
    </TabsContent>
  );
}

function ProfileTab() {
  const { api } = useServices();
  const school = api.$api.useQuery('get', '/v1/school');
  if (school.isPending) return <LoadingState />;
  if (school.isError)
    return <ErrorState error={school.error} onRetry={() => void school.refetch()} />;
  return <SchoolProfileForm school={school.data} />;
}

function RulesTab() {
  const { api } = useServices();
  const settings = api.$api.useQuery('get', '/v1/school/settings');
  if (settings.isPending) return <LoadingState />;
  if (settings.isError) {
    return <ErrorState error={settings.error} onRetry={() => void settings.refetch()} />;
  }
  return <BookingRulesForm settings={settings.data} />;
}

function HoursTab() {
  const { api } = useServices();
  const hours = api.$api.useQuery('get', '/v1/school/opening-hours');
  const branches = useBranchOptions();
  if (hours.isPending || branches.isPending) return <LoadingState />;
  if (hours.isError) return <ErrorState error={hours.error} onRetry={() => void hours.refetch()} />;
  return <OpeningHoursForm entries={hours.data.items} branchOptions={branches.options} />;
}

function PaymentsTab() {
  const { api } = useServices();
  const school = api.$api.useQuery('get', '/v1/school');
  if (school.isPending) return <LoadingState />;
  if (school.isError)
    return <ErrorState error={school.error} onRetry={() => void school.refetch()} />;
  return <PaymentAccountCard school={school.data} />;
}

function Section({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: ReactNode;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>
          <h2>{title}</h2>
        </CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}

function PublicPageTab() {
  const { t } = useTranslation();
  const hasFeature = useHasFeature(ENROLMENT_PAGE_FEATURE);
  const canModerate = useCan('reviews.moderate');
  const canPrice = useCan('prices.manage');
  if (!hasFeature) {
    return (
      <Alert>
        <AlertTitle>{t('publicPage.upgradeTitle')}</AlertTitle>
        <AlertDescription>{t('publicPage.upgrade')}</AlertDescription>
      </Alert>
    );
  }
  return (
    <div className="space-y-6">
      <Section title={t('publicPage.title')} description={t('publicPage.description')}>
        <PublicProfileSection />
      </Section>
      {canPrice && (
        <Section
          title={t('publicPage.prices.title')}
          description={t('publicPage.prices.description')}
        >
          <PublicPriceToggles />
        </Section>
      )}
      {canModerate && (
        <Section title={t('reviews.title')} description={t('reviews.description')}>
          <ReviewsModeration />
        </Section>
      )}
    </div>
  );
}

function PublicProfileSection() {
  const { api } = useServices();
  const profile = api.$api.useQuery('get', '/v1/school/public-profile');
  if (profile.isPending) return <LoadingState />;
  if (profile.isError) {
    // 404 until the school saves the page once: show the empty form.
    if (apiErrorCode(profile.error) === 'not_found') return <PublicPageForm profile={null} />;
    return <ErrorState error={profile.error} onRetry={() => void profile.refetch()} />;
  }
  return <PublicPageForm key={profile.data.version} profile={profile.data} />;
}
