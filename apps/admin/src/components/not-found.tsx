import { Link } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';

export function NotFound() {
  const { t } = useTranslation();
  return (
    <div className="flex min-h-[50vh] flex-col items-center justify-center gap-3 text-center">
      <h1 className="text-2xl font-semibold">{t('common.notFoundTitle')}</h1>
      <p className="text-muted-foreground text-sm">{t('common.notFoundBody')}</p>
      <Button asChild variant="outline">
        <Link to="/">{t('common.backHome')}</Link>
      </Button>
    </div>
  );
}
