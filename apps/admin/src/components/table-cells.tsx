import { Pencil } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';

export function ActiveBadge({ active }: { active: boolean }) {
  const { t } = useTranslation();
  return (
    <Badge variant={active ? 'secondary' : 'outline'}>
      {active ? t('common.active') : t('common.inactive')}
    </Badge>
  );
}

export function EditButton({ onClick }: { onClick: () => void }) {
  const { t } = useTranslation();
  return (
    <Button variant="ghost" size="sm" onClick={onClick}>
      <Pencil aria-hidden />
      {t('common.edit')}
    </Button>
  );
}

export function YesNo({ value }: { value: boolean }) {
  const { t } = useTranslation();
  return value ? t('common.yes') : t('common.no');
}
