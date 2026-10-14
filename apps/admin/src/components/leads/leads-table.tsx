import type { Lead, LeadStatus } from '@driveos/shared';
import { keepPreviousData } from '@tanstack/react-query';
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { columnHelperFor, DataTable } from '@/components/data-table';
import { Badge } from '@/components/ui/badge';
import type { CursorPagination } from '@/hooks/use-cursor-pagination';
import { useServices } from '@/hooks/use-services';
import { formatDate } from '@/lib/format';
import { LeadSourceLabel, LeadStatusBadge } from './lead-badges';

const helper = columnHelperFor<Lead>();

export interface LeadsQuery {
  status: LeadStatus | undefined;
  q: string | undefined;
  cursor: string | undefined;
  limit: number;
}

export function LeadsTable({
  query,
  pagination,
  onOpen,
}: {
  query: LeadsQuery;
  pagination: CursorPagination;
  onOpen: (id: string) => void;
}) {
  const { t } = useTranslation();
  const { api } = useServices();
  const list = api.$api.useQuery(
    'get',
    '/v1/leads',
    { params: { query } },
    { placeholderData: keepPreviousData },
  );

  const columns = useMemo(
    () =>
      helper.columns([
        helper.accessor('fullName', {
          header: t('leads.name'),
          cell: ({ row }) => (
            <span className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => onOpen(row.original.id)}
                className="focus-visible:ring-ring/50 rounded-sm font-medium underline-offset-4 outline-none hover:underline focus-visible:ring-[3px]"
              >
                {row.original.fullName}
              </button>
              {row.original.isMinor && <Badge variant="outline">{t('leads.minor')}</Badge>}
            </span>
          ),
        }),
        helper.display({
          id: 'contact',
          header: t('leads.contact'),
          cell: ({ row }) => (
            <span className="grid">
              {row.original.phone && <span>{row.original.phone}</span>}
              {row.original.email && (
                <span className="text-muted-foreground">{row.original.email}</span>
              )}
            </span>
          ),
        }),
        helper.accessor('licenceClass', { header: t('leads.licenceClass') }),
        helper.accessor('source', {
          header: t('leads.source'),
          cell: ({ getValue }) => <LeadSourceLabel source={getValue()} />,
        }),
        helper.accessor('status', {
          header: t('leads.status'),
          cell: ({ getValue }) => <LeadStatusBadge status={getValue()} />,
        }),
        helper.accessor('createdAt', {
          header: t('leads.received'),
          cell: ({ getValue }) => formatDate(getValue()),
        }),
      ]),
    [t, onOpen],
  );

  return (
    <DataTable
      label={t('leads.title')}
      columns={columns}
      items={list.data?.items}
      nextCursor={list.data?.nextCursor}
      status={list.status}
      error={list.error}
      onRetry={() => void list.refetch()}
      pagination={pagination}
      getRowId={(lead) => lead.id}
      emptyTitle={t('leads.empty')}
      emptyDescription={t('leads.emptyBody')}
    />
  );
}
