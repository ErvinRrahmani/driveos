import type { Review, ReviewStatus } from '@driveos/shared';
import { reviewStatusSchema } from '@driveos/shared';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { columnHelperFor, DataTable } from '@/components/data-table';
import { SegmentedControl } from '@/components/segmented-control';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useInvalidate } from '@/hooks/use-invalidate';
import { useServices } from '@/hooks/use-services';
import { formatDate } from '@/lib/format';

const helper = columnHelperFor<Review>();
type Filter = ReviewStatus | 'all';

/** The moderation table: approved reviews appear on the public page. */
export function ReviewsModeration() {
  const { t } = useTranslation();
  const { api } = useServices();
  const [filter, setFilter] = useState<Filter>('all');
  const reviews = api.$api.useQuery('get', '/v1/reviews', {
    params: { query: { limit: 200, ...(filter !== 'all' && { status: filter }) } },
  });
  const columns = useMemo(
    () =>
      helper.columns([
        helper.accessor('displayName', {
          header: t('reviews.author'),
          cell: ({ getValue }) => <span className="font-medium">{getValue()}</span>,
        }),
        helper.accessor('rating', {
          header: t('reviews.rating'),
          cell: ({ getValue }) => t('reviews.ratingValue', { rating: getValue() }),
        }),
        helper.accessor('text', {
          header: t('reviews.text'),
          cell: ({ getValue }) => (
            <span className="block max-w-sm whitespace-normal">{getValue() ?? '—'}</span>
          ),
        }),
        helper.accessor('submittedAt', {
          header: t('reviews.submitted'),
          cell: ({ getValue }) => formatDate(getValue()),
        }),
        helper.accessor('status', {
          header: t('reviews.status'),
          cell: ({ getValue }) => (
            <Badge variant={getValue() === 'approved' ? 'secondary' : 'outline'}>
              {t(`reviews.statuses.${getValue()}`)}
            </Badge>
          ),
        }),
        helper.display({
          id: 'actions',
          header: t('common.actions'),
          cell: ({ row }) => <ModerationActions review={row.original} />,
        }),
      ]),
    [t],
  );
  return (
    <div className="space-y-4">
      <p className="text-muted-foreground text-sm">{t('reviews.fairness')}</p>
      <SegmentedControl
        label={t('reviews.filter')}
        value={filter}
        onChange={setFilter}
        options={[
          { value: 'all', label: t('reviews.all') },
          ...reviewStatusSchema.options.map((status) => ({
            value: status,
            label: t(`reviews.statuses.${status}`),
          })),
        ]}
      />
      <DataTable
        label={t('reviews.title')}
        columns={columns}
        items={reviews.data?.items}
        nextCursor={null}
        status={reviews.status}
        error={reviews.error}
        onRetry={() => void reviews.refetch()}
        getRowId={(review) => review.id}
        emptyTitle={t('reviews.empty')}
        emptyDescription={t('reviews.emptyBody')}
      />
    </div>
  );
}

function ModerationActions({ review }: { review: Review }) {
  const { t } = useTranslation();
  const { api } = useServices();
  const invalidate = useInvalidate();
  const moderate = api.$api.useMutation('patch', '/v1/reviews/{id}');
  const set = (status: 'approved' | 'hidden') =>
    moderate.mutate(
      { params: { path: { id: review.id } }, body: { status } },
      {
        onSuccess: async () => {
          await invalidate('/v1/reviews');
          toast.success(t('reviews.moderated'));
        },
        onError: () => toast.error(t('errors.generic')),
      },
    );
  return (
    <div className="flex gap-2">
      {review.status !== 'approved' && (
        <Button size="sm" disabled={moderate.isPending} onClick={() => set('approved')}>
          {t('reviews.approve')}
        </Button>
      )}
      {review.status !== 'hidden' && (
        <Button
          size="sm"
          variant="outline"
          disabled={moderate.isPending}
          onClick={() => set('hidden')}
        >
          {t('reviews.hide')}
        </Button>
      )}
    </div>
  );
}
