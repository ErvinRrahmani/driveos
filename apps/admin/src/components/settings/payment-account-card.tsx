import type { SchoolResponse } from '@driveos/shared';
import { CreditCard, ExternalLink } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useInvalidate } from '@/hooks/use-invalidate';
import { useServices } from '@/hooks/use-services';
import { useCan } from '@/hooks/use-session';
import { apiErrorMessage } from '@/lib/api-errors';

export function PaymentAccountCard({ school }: { school: SchoolResponse }) {
  const { t } = useTranslation();
  const { api } = useServices();
  const invalidate = useInvalidate();
  const canManage = useCan('payment_account.manage');
  const connect = api.$api.useMutation('post', '/v1/school/payment-account');
  const connected = connect.data;
  const account = connected
    ? { provider: connected.provider, status: connected.status }
    : school.paymentAccount;
  const onboardingUrl = connected?.status === 'pending' ? connected.onboardingUrl : null;

  const onConnect = async () => {
    try {
      await connect.mutateAsync({
        body: {
          provider: 'fake',
          returnUrl: `${window.location.origin}/settings?tab=payments`,
        },
      });
      await invalidate('/v1/school');
      toast.success(t('settings.payments.connected'));
    } catch (error) {
      toast.error(apiErrorMessage(error, t('errors.generic')));
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <CreditCard className="size-4" aria-hidden />
          {t('settings.payments.title')}
        </CardTitle>
        <CardDescription>{t('settings.payments.description')}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-wrap items-center justify-between gap-4">
        {account ? (
          <p className="flex items-center gap-2 text-sm">
            {account.provider}
            <Badge variant="secondary">
              {t(`settings.payments.statusValue.${account.status}`)}
            </Badge>
          </p>
        ) : (
          <p className="text-muted-foreground text-sm">{t('settings.payments.notConnected')}</p>
        )}
        {onboardingUrl && (
          <div className="basis-full space-y-2">
            <p className="text-muted-foreground text-sm">{t('settings.payments.pendingHint')}</p>
            <a
              href={onboardingUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-primary inline-flex items-center gap-1 text-sm font-medium underline-offset-4 hover:underline"
            >
              {t('settings.payments.finishSetup', { provider: account?.provider })}
              <ExternalLink className="size-3.5" aria-hidden />
            </a>
          </div>
        )}
        {canManage && account?.status !== 'active' && !onboardingUrl && (
          <Button onClick={() => void onConnect()} disabled={connect.isPending}>
            {t('settings.payments.connect')}
          </Button>
        )}
      </CardContent>
    </Card>
  );
}
