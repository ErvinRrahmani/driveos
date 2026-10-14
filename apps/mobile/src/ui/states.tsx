import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { Button } from './button';
import { Text } from './text';
import { colors, spacing } from './theme';

export function LoadingState({ label }: { label?: string }) {
  const { t } = useTranslation();
  return (
    <View
      style={styles.center}
      accessibilityRole="progressbar"
      accessibilityLabel={label ?? t('common.loading')}
    >
      <ActivityIndicator color={colors.primary} />
      <Text tone="muted">{label ?? t('common.loading')}</Text>
    </View>
  );
}

export function ErrorState({
  message,
  onRetry,
}: {
  message?: string | null;
  onRetry?: () => void;
}) {
  const { t } = useTranslation();
  return (
    <View style={styles.center} accessibilityRole="alert">
      <Text variant="heading">{t('common.errorTitle')}</Text>
      <Text tone="muted" style={styles.centerText}>
        {message ?? t('errors.generic')}
      </Text>
      {onRetry ? <Button title={t('common.retry')} variant="secondary" onPress={onRetry} /> : null}
    </View>
  );
}

export function EmptyState({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <View style={styles.center}>
      <Text variant="heading" style={styles.centerText}>
        {title}
      </Text>
      {description ? (
        <Text tone="muted" style={styles.centerText}>
          {description}
        </Text>
      ) : null}
      {action}
    </View>
  );
}

const styles = StyleSheet.create({
  center: { alignItems: 'center', justifyContent: 'center', gap: spacing.md, padding: spacing.xl },
  centerText: { textAlign: 'center' },
});
