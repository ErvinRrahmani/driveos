import type { PublicSchoolPage } from '@driveos/shared';
import { AlertCircle, Loader2, MapPin, MessageCircle, Phone, SearchX } from 'lucide-react';
import { type ReactNode, useEffect, useId } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { EnrolmentSection } from './enrolment-form';
import { PriceList } from './price-list';
import { Reviews } from './reviews';

const WEEKDAY_KEYS = [
  'weekdays.1',
  'weekdays.2',
  'weekdays.3',
  'weekdays.4',
  'weekdays.5',
  'weekdays.6',
  'weekdays.7',
] as const;

/** ISO weekday (1 = Monday … 7 = Sunday, validated by the page schema) → its i18n key. */
const weekdayKey = (weekday: number) => WEEKDAY_KEYS[weekday - 1] ?? WEEKDAY_KEYS[0];

/** Mobile-first shell for the public page; no session, no admin navigation. */
function PublicLayout({ children }: { children: ReactNode }) {
  return (
    <div className="bg-muted/40 min-h-svh">
      <main className="mx-auto flex max-w-2xl flex-col gap-4 px-4 py-6 sm:py-10">{children}</main>
    </div>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  const titleId = useId();
  return (
    <section aria-labelledby={titleId} className="bg-card rounded-xl border p-5">
      <h2 id={titleId} className="text-lg font-semibold">
        {title}
      </h2>
      <div className="mt-3">{children}</div>
    </section>
  );
}

function Header({ page }: { page: PublicSchoolPage }) {
  const { t } = useTranslation();
  const linkClass = 'text-primary text-sm font-medium underline-offset-4 hover:underline';
  return (
    <header className="bg-card space-y-3 rounded-xl border p-5">
      <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">{page.name}</h1>
      {page.headline && <p className="text-lg">{page.headline}</p>}
      {page.description && <p className="text-muted-foreground text-sm">{page.description}</p>}
      <p className="text-muted-foreground flex items-start gap-1.5 text-sm">
        <MapPin aria-hidden className="mt-0.5 size-4 shrink-0" />
        <span>
          <span className="sr-only">{t('publicPage.site.address')}: </span>
          {page.address}
        </span>
      </p>
      {(page.whatsappUrl ?? page.phone) && (
        <div className="flex flex-col gap-2 pt-1 sm:flex-row">
          {page.whatsappUrl && (
            <Button asChild size="lg">
              <a href={page.whatsappUrl} target="_blank" rel="noopener noreferrer">
                <MessageCircle aria-hidden />
                {t('publicPage.site.whatsapp')}
              </a>
            </Button>
          )}
          {page.phone && (
            <Button asChild size="lg" variant="outline">
              <a href={`tel:${page.phone}`}>
                <Phone aria-hidden />
                {t('publicPage.site.call', { phone: page.phone })}
              </a>
            </Button>
          )}
        </div>
      )}
      {(page.instagramUrl ?? page.facebookUrl) && (
        <div className="flex gap-4">
          {page.instagramUrl && (
            <a
              href={page.instagramUrl}
              target="_blank"
              rel="noopener noreferrer"
              className={linkClass}
            >
              {t('publicPage.site.instagram')}
            </a>
          )}
          {page.facebookUrl && (
            <a
              href={page.facebookUrl}
              target="_blank"
              rel="noopener noreferrer"
              className={linkClass}
            >
              {t('publicPage.site.facebook')}
            </a>
          )}
        </div>
      )}
    </header>
  );
}

function OpeningHours({ branches }: { branches: PublicSchoolPage['branches'] }) {
  const { t } = useTranslation();
  const withHours = branches.filter((branch) => branch.openingHours.length > 0);
  if (withHours.length === 0) return null;
  return (
    <Section title={t('publicPage.site.openingHours')}>
      <div className="grid gap-4 sm:grid-cols-2">
        {withHours.map((branch) => (
          <div key={branch.id}>
            <h3 className="font-medium">{branch.name}</h3>
            <p className="text-muted-foreground text-xs">{branch.address}</p>
            <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
              {branch.openingHours.map((row) => (
                <div key={`${row.weekday}-${row.opens}`} className="contents">
                  <dt>{t(weekdayKey(row.weekday))}</dt>
                  <dd className="tabular-nums">
                    {t('publicPage.site.hoursRange', { opens: row.opens, closes: row.closes })}
                  </dd>
                </div>
              ))}
            </dl>
          </div>
        ))}
      </div>
    </Section>
  );
}

function Instructors({ instructors }: { instructors: PublicSchoolPage['instructors'] }) {
  const { t } = useTranslation();
  if (instructors.length === 0) return null;
  return (
    <Section title={t('publicPage.site.instructors')}>
      <ul className="flex flex-wrap gap-2">
        {instructors.map((instructor, index) => (
          <li
            key={`${index}-${instructor.name}`}
            className="bg-muted rounded-full px-3 py-1 text-sm"
          >
            {instructor.name}
          </li>
        ))}
      </ul>
    </Section>
  );
}

export function PublicPage({ page }: { page: PublicSchoolPage }) {
  useEffect(() => {
    const previous = document.title;
    document.title = page.name;
    return () => {
      document.title = previous;
    };
  }, [page.name]);
  return (
    <PublicLayout>
      <Header page={page} />
      <OpeningHours branches={page.branches} />
      <PriceList prices={page.prices} locale={page.locale} />
      <Instructors instructors={page.instructors} />
      <Reviews
        reviews={page.reviews}
        externalReviewUrl={page.externalReviewUrl}
        locale={page.locale}
        timeZone={page.timeZone}
      />
      <EnrolmentSection page={page} />
    </PublicLayout>
  );
}

function Notice({
  icon,
  title,
  children,
}: {
  icon: ReactNode;
  title: string;
  children?: ReactNode;
}) {
  return (
    <PublicLayout>
      <div className="bg-card flex flex-col items-center gap-3 rounded-xl border px-6 py-12 text-center">
        {icon}
        <h1 className="text-xl font-semibold">{title}</h1>
        {children}
      </div>
    </PublicLayout>
  );
}

export function PublicPageNotFound() {
  const { t } = useTranslation();
  return (
    <Notice
      icon={<SearchX aria-hidden className="text-muted-foreground size-8" />}
      title={t('publicPage.site.notFoundTitle')}
    >
      <p className="text-muted-foreground text-sm">{t('publicPage.site.notFoundBody')}</p>
    </Notice>
  );
}

export function PublicPageFailure({ onRetry }: { onRetry: () => void }) {
  const { t } = useTranslation();
  return (
    <Notice
      icon={<AlertCircle aria-hidden className="text-destructive size-8" />}
      title={t('publicPage.site.errorTitle')}
    >
      <p role="alert" className="text-muted-foreground text-sm">
        {t('errors.generic')}
      </p>
      <Button variant="outline" onClick={onRetry}>
        {t('common.retry')}
      </Button>
    </Notice>
  );
}

export function PublicPageLoading() {
  const { t } = useTranslation();
  return (
    <PublicLayout>
      <div
        role="status"
        aria-live="polite"
        className="text-muted-foreground flex items-center justify-center gap-2 py-24"
      >
        <Loader2 aria-hidden className="size-4 animate-spin" />
        <span className="text-sm">{t('publicPage.site.loading')}</span>
      </div>
    </PublicLayout>
  );
}
