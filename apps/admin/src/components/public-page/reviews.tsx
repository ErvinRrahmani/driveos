import type { PublicSchoolPage } from '@driveos/shared';
import { ExternalLink, Star } from 'lucide-react';
import { useId } from 'react';
import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';

const MAX_RATING = 5;

function Stars({ rating, label }: { rating: number; label: string }) {
  return (
    <span role="img" aria-label={label} className="flex gap-0.5">
      {Array.from({ length: MAX_RATING }, (_, index) => (
        <Star
          key={index}
          aria-hidden
          className={cn(
            'size-4',
            index < Math.round(rating) ? 'fill-amber-400 text-amber-400' : 'text-muted-foreground',
          )}
        />
      ))}
    </span>
  );
}

export function Reviews({
  reviews,
  externalReviewUrl,
  locale,
  timeZone,
}: {
  reviews: PublicSchoolPage['reviews'];
  externalReviewUrl: string | null;
  locale: string;
  timeZone: string;
}) {
  const { t } = useTranslation();
  const titleId = useId();
  const oneDecimal = new Intl.NumberFormat(locale, {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  });
  const date = new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeZone });
  const average = reviews.averageRatingTenths / 10;
  return (
    <section aria-labelledby={titleId} className="bg-card rounded-xl border p-5">
      <h2 id={titleId} className="text-lg font-semibold">
        {t('publicPage.site.reviews.title')}
      </h2>
      {reviews.count > 0 ? (
        <>
          <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1">
            <Stars
              rating={average}
              label={t('publicPage.site.reviews.stars', { rating: oneDecimal.format(average) })}
            />
            <span className="font-semibold">
              {t('publicPage.site.reviews.average', { rating: oneDecimal.format(average) })}
            </span>
            <span className="text-muted-foreground text-sm">
              {t('publicPage.site.reviews.count', { count: reviews.count })}
            </span>
          </div>
          <ul className="mt-4 space-y-4">
            {reviews.items.map((review) => (
              <li key={review.id} className="space-y-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium">{review.displayName}</span>
                  <Stars
                    rating={review.rating}
                    label={t('publicPage.site.reviews.stars', { rating: review.rating })}
                  />
                  <time dateTime={review.submittedAt} className="text-muted-foreground text-xs">
                    {date.format(new Date(review.submittedAt))}
                  </time>
                </div>
                {review.text && <p className="text-sm">{review.text}</p>}
              </li>
            ))}
          </ul>
        </>
      ) : (
        <p className="text-muted-foreground mt-3 text-sm">{t('publicPage.site.reviews.empty')}</p>
      )}
      {externalReviewUrl && (
        <a
          href={externalReviewUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="text-primary mt-4 inline-flex items-center gap-1 text-sm font-medium underline-offset-4 hover:underline"
        >
          {t('publicPage.site.reviews.external')}
          <ExternalLink aria-hidden className="size-3.5" />
        </a>
      )}
    </section>
  );
}
