import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client';
import { Stack } from 'expo-router';
import { useEffect, useState } from 'react';
import { I18nextProvider } from 'react-i18next';
import { View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { OfflineBanner } from '../src/components/offline-banner';
import { parseUseMocks } from '../src/config';
import { i18n, pickLanguage } from '../src/lib/i18n';
import { bindOnlineManager } from '../src/lib/network';
import { addConnectivityListener, deviceLanguageCodes } from '../src/lib/platform';
import { ServicesProvider } from '../src/lib/session';
import { startMocks } from '../src/mocks';
import { services } from '../src/services';
import { colors } from '../src/ui';

const useMocks = parseUseMocks(process.env.EXPO_PUBLIC_USE_MOCKS);
const mocksStarted = startMocks(useMocks);
void i18n.changeLanguage(pickLanguage(deviceLanguageCodes()));

export default function RootLayout() {
  const [ready, setReady] = useState(!useMocks);

  useEffect(() => {
    void mocksStarted.then(() => setReady(true));
  }, []);
  useEffect(() => bindOnlineManager(addConnectivityListener), []);
  useEffect(() => {
    if (ready) void services.auth.restore();
  }, [ready]);

  if (!ready) return null;
  return (
    <SafeAreaProvider>
      <I18nextProvider i18n={i18n}>
        <ServicesProvider services={services}>
          <PersistQueryClientProvider
            client={services.queryClient}
            persistOptions={services.persist}
          >
            <View style={{ flex: 1, backgroundColor: colors.background }}>
              <OfflineBanner />
              <Stack screenOptions={{ headerShown: false }} />
            </View>
          </PersistQueryClientProvider>
        </ServicesProvider>
      </I18nextProvider>
    </SafeAreaProvider>
  );
}
