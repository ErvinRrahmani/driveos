import { createFileRoute } from '@tanstack/react-router';
import { Plus } from 'lucide-react';
import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { z } from 'zod';
import { FormDialog } from '@/components/form-dialog';
import { CreateLeadForm } from '@/components/leads/create-lead-form';
import { LeadDrawer } from '@/components/leads/lead-drawer';
import { LeadSearch, LeadStatusTabs } from '@/components/leads/lead-filters';
import { LeadsTable } from '@/components/leads/leads-table';
import { PageHeader } from '@/components/page-header';
import { RequirePermission } from '@/components/require-permission';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent } from '@/components/ui/tabs';
import { useCursorPagination } from '@/hooks/use-cursor-pagination';
import { useCan } from '@/hooks/use-session';
import { LEAD_STATUSES, LEAD_TABS } from '@/lib/leads';
import { listSearchSchema, pageQuery } from '@/lib/search';

const leadsSearchSchema = listSearchSchema.extend({
  status: z.enum(LEAD_STATUSES).optional().catch(undefined),
  q: z.string().trim().min(1).max(100).optional().catch(undefined),
  lead: z.uuid().optional().catch(undefined),
});

export const Route = createFileRoute('/_app/leads/')({
  validateSearch: (search) => leadsSearchSchema.parse(search),
  component: () => (
    <RequirePermission anyOf={['leads.read']}>
      <LeadsPage />
    </RequirePermission>
  ),
});

function LeadsPage() {
  const { t } = useTranslation();
  const canManage = useCan('leads.manage');
  const search = Route.useSearch();
  const navigate = Route.useNavigate();
  const [creating, setCreating] = useState(false);
  const pagination = useCursorPagination(
    search.cursor,
    (cursor) => void navigate({ search: (prev) => ({ ...prev, cursor }) }),
  );
  const tab = search.status ?? 'all';
  const openLead = useCallback(
    (lead: string | undefined) => void navigate({ search: (prev) => ({ ...prev, lead }) }),
    [navigate],
  );

  return (
    <>
      <PageHeader
        title={t('leads.title')}
        description={t('leads.description')}
        actions={
          canManage ? (
            <Button onClick={() => setCreating(true)}>
              <Plus aria-hidden />
              {t('leads.add')}
            </Button>
          ) : undefined
        }
      />
      <Tabs
        value={tab}
        onValueChange={(value) => {
          const next = LEAD_TABS.find((candidate) => candidate === value);
          void navigate({
            search: (prev) => ({
              ...prev,
              status: next === 'all' ? undefined : next,
              cursor: undefined,
            }),
          });
        }}
        className="gap-4"
      >
        <div className="flex flex-wrap items-end justify-between gap-4">
          <LeadStatusTabs />
          <LeadSearch
            q={search.q}
            onChange={(q) =>
              void navigate({
                search: (prev) => ({ ...prev, q, cursor: undefined }),
                replace: true,
              })
            }
          />
        </div>
        <TabsContent value={tab}>
          <LeadsTable
            query={{ ...pageQuery(search), status: search.status, q: search.q }}
            pagination={pagination}
            onOpen={openLead}
          />
        </TabsContent>
      </Tabs>
      <LeadDrawer
        leadId={search.lead}
        onClose={() => openLead(undefined)}
        onConverted={(id) => void navigate({ to: '/students/$id', params: { id } })}
      />
      <FormDialog open={creating} onOpenChange={setCreating} title={t('leads.addTitle')}>
        <CreateLeadForm onDone={() => setCreating(false)} />
      </FormDialog>
    </>
  );
}
