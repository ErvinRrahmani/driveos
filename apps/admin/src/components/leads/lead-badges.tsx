import type { LeadSource, LeadStatus } from '@driveos/shared';
import { useTranslation } from 'react-i18next';
import { Badge } from '@/components/ui/badge';

const STATUS_VARIANT = {
  new: 'default',
  contacted: 'secondary',
  converted: 'outline',
  lost: 'outline',
} as const satisfies Record<LeadStatus, 'default' | 'secondary' | 'outline'>;

export function LeadStatusBadge({ status }: { status: LeadStatus }) {
  const { t } = useTranslation();
  return <Badge variant={STATUS_VARIANT[status]}>{t(`leads.statuses.${status}`)}</Badge>;
}

export function LeadSourceLabel({ source }: { source: LeadSource }) {
  const { t } = useTranslation();
  return <span className="text-muted-foreground">{t(`leads.sources.${source}`)}</span>;
}
