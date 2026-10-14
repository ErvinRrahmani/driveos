import type { InvoiceKind } from '@driveos/shared';
import { keepPreviousData } from '@tanstack/react-query';
import { useSchoolClock } from '@/hooks/use-school-clock';
import { useServices } from '@/hooks/use-services';
import { instantRange } from '@/lib/date-range';
import { type ListSearch, pageQuery } from '@/lib/search';

export interface InvoiceSearch extends ListSearch {
  studentId?: string | undefined;
  from?: string | undefined;
  to?: string | undefined;
}

export function useInvoices(search: InvoiceSearch, kind: InvoiceKind | undefined) {
  const { api } = useServices();
  const { timeZone } = useSchoolClock();
  return api.$api.useQuery(
    'get',
    '/v1/invoices',
    {
      params: {
        query: {
          ...pageQuery(search),
          studentId: search.studentId,
          kind,
          ...instantRange(search.from, search.to, timeZone ?? 'UTC'),
        },
      },
    },
    { placeholderData: keepPreviousData, enabled: timeZone !== undefined },
  );
}
