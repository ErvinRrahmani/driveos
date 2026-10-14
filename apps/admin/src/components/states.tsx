import { AlertCircle, CalendarClock, Inbox, Loader2 } from 'lucide-react';
import { type ReactNode, useId } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { apiErrorMessage } from '@/lib/api-errors';
import { cn } from '@/lib/utils';

export function LoadingState({ label, className }: { label?: string; className?: string }) {
  const { t } = useTranslation();
  return (
    <div
      role="status"
      aria-live="polite"
      className={cn(
        'text-muted-foreground flex items-center justify-center gap-2 py-12',
        className,
      )}
    >
      <Loader2 className="size-4 animate-spin" aria-hidden />
      <span className="text-sm">{label ?? t('common.loading')}</span>
    </div>
  );
}

export function ErrorState({
  error,
  onRetry,
  className,
}: {
  error: unknown;
  onRetry?: () => void;
  className?: string;
}) {
  const { t } = useTranslation();
  return (
    <div
      role="alert"
      className={cn(
        'border-destructive/30 flex flex-col items-center gap-3 rounded-lg border border-dashed px-6 py-10 text-center',
        className,
      )}
    >
      <AlertCircle className="text-destructive size-6" aria-hidden />
      <div className="space-y-1">
        <p className="font-medium">{t('errors.title')}</p>
        <p className="text-muted-foreground text-sm">
          {apiErrorMessage(error, t('errors.generic'))}
        </p>
      </div>
      {onRetry && (
        <Button variant="outline" size="sm" onClick={onRetry}>
          {t('common.retry')}
        </Button>
      )}
    </div>
  );
}

export function NeutralState({
  title,
  description,
  className,
}: {
  title: string;
  description?: string;
  className?: string;
}) {
  const titleId = useId();
  return (
    <div
      role="status"
      aria-labelledby={titleId}
      className={cn(
        'text-muted-foreground flex flex-col items-center gap-3 rounded-lg border border-dashed px-6 py-10 text-center',
        className,
      )}
    >
      <CalendarClock className="size-6" aria-hidden />
      <div className="space-y-1">
        <p id={titleId} className="text-foreground font-medium">
          {title}
        </p>
        {description && <p className="text-sm">{description}</p>}
      </div>
    </div>
  );
}

export function EmptyState({
  title,
  description,
  action,
  className,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'flex flex-col items-center gap-3 rounded-lg border border-dashed px-6 py-10 text-center',
        className,
      )}
    >
      <Inbox className="text-muted-foreground size-6" aria-hidden />
      <div className="space-y-1">
        <p className="font-medium">{title}</p>
        {description && <p className="text-muted-foreground text-sm">{description}</p>}
      </div>
      {action}
    </div>
  );
}

export function ForbiddenState() {
  const { t } = useTranslation();
  return <EmptyState title={t('errors.forbidden')} />;
}
