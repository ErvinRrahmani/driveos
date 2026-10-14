import type { ParseKeys } from 'i18next';
import { Stack } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { colors } from '../ui';

export function SectionStack({ screens }: { screens: Record<string, ParseKeys> }) {
  const { t } = useTranslation();
  return (
    <Stack
      screenOptions={{
        headerTintColor: colors.primary,
        headerStyle: { backgroundColor: colors.surface },
        contentStyle: { backgroundColor: colors.background },
        headerBackTitle: t('common.back'),
      }}
    >
      <Stack.Screen name="index" options={{ headerShown: false }} />
      {Object.entries(screens).map(([name, title]) => (
        <Stack.Screen key={name} name={name} options={{ title: t(title) }} />
      ))}
    </Stack>
  );
}
