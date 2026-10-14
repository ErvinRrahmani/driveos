import { type SlotOffer, slotOfferStatusSchema } from '@driveos/shared';
import { keepPreviousData } from '@tanstack/react-query';
import { createFileRoute } from '@tanstack/react-router';
import { Plus } from 'lucide-react';
import { useId, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { z } from 'zod';
import { columnHelperFor, DataTable } from '@/components/data-table';
import { FormDialog } from '@/components/form-dialog';
import { PageHeader } from '@/components/page-header';
import { RequirePermission } from '@/components/require-permission';
import { SlotOfferForm } from '@/components/slot-offers/slot-offer-form';
import { LoadingState } from '@/components/states';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { NativeSelect } from '@/components/ui/native-select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { WaitingListSection } from '@/components/waiting-list/waiting-list-section';
import { useCursorPagination } from '@/hooks/use-cursor-pagination';
import { useDialogTarget } from '@/hooks/use-dialog-target';
import { useSchoolClock } from '@/hooks/use-school-clock';
import { useCan } from '@/hooks/use-session';
import { useServices } from '@/hooks/use-services';
import { zonedRange } from '@/lib/calendar';
import { formatDateTimeIn, formatPlainDay } from '@/lib/format';
import { listSearchSchema, pageQuery } from '@/lib/search';
import { todayIn } from '@/lib/zoned-time';

const SLOT_OFFER_STATUSES = slotOfferStatusSchema.options;
const SLOT_OFFER_VIEWS = ['offers', 'waiting'] as const;
type SlotOfferView = (typeof SLOT_OFFER_VIEWS)[number];

const slotOfferSearchSchema = listSearchSchema.extend({
  status: z.enum(SLOT_OFFER_STATUSES).optional().catch(undefined),
  view: z.enum(SLOT_OFFER_VIEWS).optional().catch(undefined),
});

export const Route = createFileRoute('/_app/slot-offers')({
  validateSearch: (search: Record<string, unknown>) => slotOfferSearchSchema.parse(search),
  component: () => (
    <RequirePermission anyOf={['slot_offers.manage']}>
      <SlotOffersScreen />
    </RequirePermission>
  ),
});

const helper = columnHelperFor<SlotOffer>();

function SlotOffersScreen() {
  const clock = useSchoolClock();
  return clock.timeZone ? <SlotOffersPage timeZone={clock.timeZone} /> : <LoadingState />;
}

function SlotOffersPage({ timeZone }: { timeZone: string }) {
  const { t } = useTranslation();
  const { api } = useServices();
  const filterId = useId();
  const search = Route.useSearch();
  const navigate = Route.useNavigate();
  const [today] = useState(() => todayIn(timeZone, new Date()));
  const setCursor = (cursor: string | undefined) =>
    void navigate({ search: (prev) => ({ ...prev, cursor }) });
  const pagination = useCursorPagination(search.cursor, setCursor);
  const dialog = useDialogTarget<SlotOffer>();
  const canManageWaitingList = useCan('waiting_list.manage');
  const view: SlotOfferView = canManageWaitingList ? (search.view ?? 'offers') : 'offers';
  const list = api.$api.useQuery(
    'get',
    '/v1/slot-offers',
    { params: { query: { ...pageQuery(search), status: search.status } } },
    { placeholderData: keepPreviousData, enabled: view === 'offers' },
  );

  const columns = useMemo(
    () =>
      helper.columns([
        helper.display({
          id: 'when',
          header: t('slotOffers.when'),
          cell: ({ row }) => {
            const range = zonedRange(row.original.start, row.original.end, timeZone);
            return `${formatPlainDay(range.day)} ${range.label}`;
          },
        }),
        helper.accessor('lessonTypeName', { header: t('slotOffers.lessonType') }),
        helper.accessor('instructorName', { header: t('slotOffers.instructor') }),
        helper.accessor('source', {
          header: t('slotOffers.source'),
          cell: ({ getValue }) => t(`slotOffers.sources.${getValue()}`),
        }),
        helper.accessor('status', {
          header: t('slotOffers.status'),
          cell: ({ getValue }) => (
            <Badge variant={getValue() === 'open' ? 'default' : 'secondary'}>
              {t(`slotOffers.statuses.${getValue()}`)}
            </Badge>
          ),
        }),
        helper.accessor('expiresAt', {
          header: t('slotOffers.expires'),
          cell: ({ getValue }) => formatDateTimeIn(getValue(), timeZone),
        }),
      ]),
    [t, timeZone],
  );

  return (
    <>
      <PageHeader
        title={t('slotOffers.title')}
        description={t('slotOffers.description')}
        actions={
          <Button onClick={dialog.create}>
            <Plus aria-hidden />
            {t('slotOffers.add')}
          </Button>
        }
      />
      <Tabs
        value={view}
        onValueChange={(value) =>
          void navigate({
            search: (prev) => ({
              ...prev,
              cursor: undefined,
              view: value === 'waiting' ? 'waiting' : undefined,
            }),
          })
        }
      >
        {canManageWaitingList && (
          <TabsList>
            <TabsTrigger value="offers">{t('slotOffers.tabs.offers')}</TabsTrigger>
            <TabsTrigger value="waiting">{t('slotOffers.tabs.waiting')}</TabsTrigger>
          </TabsList>
        )}
        <TabsContent value="offers" className="mt-4 space-y-4">
          <div className="grid max-w-xs gap-1">
            <Label htmlFor={filterId} className="text-muted-foreground text-xs">
              {t('slotOffers.statusFilter')}
            </Label>
            <NativeSelect
              id={filterId}
              value={search.status ?? ''}
              onChange={(event) =>
                void navigate({
                  search: (prev) => ({
                    ...prev,
                    cursor: undefined,
                    status: slotOfferStatusSchema.safeParse(event.target.value).data,
                  }),
                })
              }
            >
              <option value="">{t('slotOffers.allStatuses')}</option>
              {SLOT_OFFER_STATUSES.map((status) => (
                <option key={status} value={status}>
                  {t(`slotOffers.statuses.${status}`)}
                </option>
              ))}
            </NativeSelect>
          </div>
          <DataTable
            label={t('slotOffers.title')}
            columns={columns}
            items={list.data?.items}
            nextCursor={list.data?.nextCursor}
            status={list.status}
            error={list.error}
            onRetry={() => void list.refetch()}
            pagination={pagination}
            getRowId={(offer) => offer.id}
            emptyTitle={t('slotOffers.empty')}
            emptyDescription={t('slotOffers.emptyBody')}
          />
        </TabsContent>
        {canManageWaitingList && (
          <TabsContent value="waiting" className="mt-4">
            <WaitingListSection
              cursor={search.cursor}
              limit={search.limit}
              onCursorChange={setCursor}
            />
          </TabsContent>
        )}
      </Tabs>
      <FormDialog
        open={dialog.open}
        onOpenChange={(open) => !open && dialog.close()}
        title={t('slotOffers.addTitle')}
      >
        <SlotOfferForm timeZone={timeZone} today={today} onDone={dialog.close} />
      </FormDialog>
    </>
  );
}
