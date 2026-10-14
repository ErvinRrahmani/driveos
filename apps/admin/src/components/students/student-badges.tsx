import type { StudentStatus } from '@driveos/shared';
import { useTranslation } from 'react-i18next';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

export function StudentStatusBadge({ status }: { status: StudentStatus }) {
  const { t } = useTranslation();
  return (
    <Badge variant={status === 'active' ? 'secondary' : 'outline'}>
      {t(`students.statuses.${status}`)}
    </Badge>
  );
}

export function CreditMinutes({ minutes, signed = false }: { minutes: number; signed?: boolean }) {
  const { t } = useTranslation();
  const value = signed && minutes > 0 ? `+${String(minutes)}` : String(minutes);
  return (
    <span className={cn('tabular-nums', minutes < 0 && 'text-destructive')}>
      {t('students.minutes', { value })}
    </span>
  );
}
