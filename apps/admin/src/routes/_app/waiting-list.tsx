import { createFileRoute } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { PageHeader } from '@/components/page-header';
import { RequirePermission } from '@/components/require-permission';
import { WaitingListSection } from '@/components/waiting-list/waiting-list-section';
import { parseListSearch } from '@/lib/search';

export const Route = createFileRoute('/_app/waiting-list')({
  validateSearch: parseListSearch,
  component: () => (
    <RequirePermission anyOf={['waiting_list.manage']}>
      <WaitingListPage />
    </RequirePermission>
  ),
});

function WaitingListPage() {
  const { t } = useTranslation();
  const search = Route.useSearch();
  const navigate = Route.useNavigate();
  return (
    <>
      <PageHeader title={t('waitingList.title')} description={t('waitingList.description')} />
      <WaitingListSection
        cursor={search.cursor}
        limit={search.limit}
        onCursorChange={(cursor) => void navigate({ search: (prev) => ({ ...prev, cursor }) })}
      />
    </>
  );
}
