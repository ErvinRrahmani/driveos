import type { AuditLogEntry } from '@driveos/shared';
import { keepPreviousData } from '@tanstack/react-query';
import { createFileRoute } from '@tanstack/react-router';
import { ShieldCheck } from 'lucide-react';
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { z } from 'zod';
import { columnHelperFor, DataTable } from '@/components/data-table';
import { DateRangeFilter, FilterBar, TextFilter } from '@/components/list-filters';
import { PageHeader } from '@/components/page-header';
import { RequirePermission } from '@/components/require-permission';
import { Badge } from '@/components/ui/badge';
import { useCursorPagination } from '@/hooks/use-cursor-pagination';
import { useSchoolClock } from '@/hooks/use-school-clock';
import { useServices } from '@/hooks/use-services';
import { dateParam, instantRange } from '@/lib/date-range';
import { formatDateTimeIn } from '@/lib/format';
import { listSearchSchema, pageQuery } from '@/lib/search';

const auditSearchSchema = listSearchSchema.extend({
  action: z.string().trim().min(1).max(100).optional().catch(undefined),
  from: dateParam(),
  to: dateParam(),
});

export const Route = createFileRoute('/_app/audit-log')({
  validateSearch: (search) => auditSearchSchema.parse(search),
  component: () => (
    <RequirePermission anyOf={['audit_log.read']}>
      <AuditLogPage />
    </RequirePermission>
  ),
});

const helper = columnHelperFor<AuditLogEntry>();

function AuditLogPage() {
  const { t } = useTranslation();
  const { api } = useServices();
  const { timeZone } = useSchoolClock();
  const search = Route.useSearch();
  const navigate = Route.useNavigate();
  const pagination = useCursorPagination(
    search.cursor,
    (cursor) => void navigate({ search: (prev) => ({ ...prev, cursor }) }),
  );
  const filter = (patch: Partial<z.output<typeof auditSearchSchema>>) =>
    void navigate({ search: (prev) => ({ ...prev, ...patch, cursor: undefined }) });
  const zone = timeZone ?? 'UTC';
  const list = api.$api.useQuery(
    'get',
    '/v1/audit-log',
    {
      params: {
        query: {
          ...pageQuery(search),
          action: search.action,
          ...instantRange(search.from, search.to, zone),
        },
      },
    },
    { placeholderData: keepPreviousData, enabled: timeZone !== undefined },
  );

  const columns = useMemo(
    () =>
      helper.columns([
        helper.accessor('at', {
          header: t('auditLog.when'),
          cell: ({ getValue }) => formatDateTimeIn(getValue(), zone),
        }),
        helper.display({
          id: 'actor',
          header: t('auditLog.actor'),
          cell: ({ row }) => (
            <span className="flex flex-wrap items-center gap-2">
              {row.original.actorName ?? t('auditLog.unknownActor')}
              {row.original.supportSessionId && (
                <Badge variant="outline">
                  <ShieldCheck aria-hidden />
                  {t('auditLog.supportSession')}
                </Badge>
              )}
            </span>
          ),
        }),
        helper.accessor('action', {
          header: t('auditLog.action'),
          cell: ({ getValue }) => <code className="text-xs">{getValue()}</code>,
        }),
        helper.display({
          id: 'target',
          header: t('auditLog.target'),
          cell: ({ row }) => (
            <span title={row.original.targetId}>
              {row.original.targetType} · {row.original.targetId.slice(-8)}
            </span>
          ),
        }),
        helper.accessor('reason', {
          header: t('auditLog.reason'),
          cell: ({ getValue }) => getValue() ?? '—',
        }),
      ]),
    [t, zone],
  );

  return (
    <>
      <PageHeader title={t('auditLog.title')} description={t('auditLog.description')} />
      <FilterBar>
        <TextFilter
          label={t('auditLog.action')}
          value={search.action}
          onChange={(action) => filter({ action })}
        />
        <DateRangeFilter from={search.from} to={search.to} onChange={filter} />
      </FilterBar>
      <DataTable
        label={t('auditLog.title')}
        columns={columns}
        items={list.data?.items}
        nextCursor={list.data?.nextCursor}
        status={list.status}
        error={list.error}
        onRetry={() => void list.refetch()}
        pagination={pagination}
        getRowId={(entry) => entry.id}
        emptyTitle={t('auditLog.empty')}
        emptyDescription={t('auditLog.emptyBody')}
      />
    </>
  );
}
