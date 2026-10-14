import { useTranslation } from 'react-i18next';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useOnline } from '../lib/network';
import { Banner } from '../ui';

export function OfflineBanner() {
  const { t } = useTranslation();
  const online = useOnline();
  const insets = useSafeAreaInsets();
  if (online) return null;
  return (
    <Banner tone="warning" message={t('network.offline')} style={{ paddingTop: insets.top + 8 }} />
  );
}
