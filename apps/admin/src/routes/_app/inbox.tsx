import { conversationKindSchema } from '@driveos/shared';
import { createFileRoute } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { z } from 'zod';
import { ConversationList } from '@/components/inbox/conversation-list';
import { Thread } from '@/components/inbox/thread';
import { FilterBar, SelectFilter } from '@/components/list-filters';
import { PageHeader } from '@/components/page-header';
import { RequirePermission } from '@/components/require-permission';
import { EmptyState, ErrorState, LoadingState } from '@/components/states';
import { useSchoolClock } from '@/hooks/use-school-clock';
import { useServices } from '@/hooks/use-services';

const CONVERSATION_LIMIT = 100;
const REFRESH_MS = 30_000;

const inboxSearchSchema = z.object({
  conversationId: z.uuid().optional().catch(undefined),
  kind: conversationKindSchema.optional().catch(undefined),
});

export const Route = createFileRoute('/_app/inbox')({
  validateSearch: (search) => inboxSearchSchema.parse(search),
  component: () => (
    <RequirePermission anyOf={['chat.read_all', 'chat.use']}>
      <InboxPage />
    </RequirePermission>
  ),
});

function InboxPage() {
  const { t } = useTranslation();
  const { api } = useServices();
  const { timeZone } = useSchoolClock();
  const search = Route.useSearch();
  const navigate = Route.useNavigate();
  const list = api.$api.useQuery(
    'get',
    '/v1/conversations',
    { params: { query: { limit: CONVERSATION_LIMIT, kind: search.kind } } },
    { refetchInterval: REFRESH_MS },
  );
  const zone = timeZone ?? 'UTC';
  const conversations = list.data?.items ?? [];
  const selected = conversations.find((item) => item.id === search.conversationId);

  return (
    <>
      <PageHeader title={t('inbox.title')} description={t('inbox.description')} />
      <FilterBar>
        <SelectFilter
          label={t('inbox.kind')}
          allLabel={t('inbox.allKinds')}
          value={search.kind}
          options={conversationKindSchema.options.map((kind) => ({
            value: kind,
            label: t(`inbox.kinds.${kind}`),
          }))}
          onChange={(kind) =>
            void navigate({
              search: (prev) => ({ ...prev, kind: conversationKindSchema.safeParse(kind).data }),
            })
          }
        />
      </FilterBar>
      {list.status === 'pending' ? (
        <LoadingState />
      ) : list.status === 'error' ? (
        <ErrorState error={list.error} onRetry={() => void list.refetch()} />
      ) : conversations.length === 0 ? (
        <EmptyState title={t('inbox.empty')} description={t('inbox.emptyBody')} />
      ) : (
        <div className="grid gap-6 lg:grid-cols-[20rem_1fr]">
          <ConversationList
            conversations={conversations}
            selectedId={search.conversationId}
            timeZone={zone}
          />
          {selected ? (
            <Thread key={selected.id} conversation={selected} timeZone={zone} />
          ) : search.conversationId ? (
            <EmptyState title={t('inbox.notFound')} />
          ) : (
            <EmptyState title={t('inbox.pick')} description={t('inbox.pickBody')} />
          )}
        </div>
      )}
    </>
  );
}
