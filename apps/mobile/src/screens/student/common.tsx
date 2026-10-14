import type { ReactNode } from 'react';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';
import { toFailure } from '../../lib/api-errors';
import { errorMessage } from '../../components/error-message';
import { ErrorState, LoadingState, spacing, Text } from '../../ui';

interface QueryLike<T> {
  data?: T;
  isError: boolean;
  error: unknown;
  refetch: () => unknown;
}

export function Loadable<T>({
  query,
  children,
}: {
  query: QueryLike<T>;
  children: (data: T) => ReactNode;
}) {
  const { t } = useTranslation();
  if (query.data !== undefined) return <>{children(query.data)}</>;
  if (query.isError) {
    return (
      <ErrorState
        message={errorMessage(t, toFailure(query.error))}
        onRetry={() => void query.refetch()}
      />
    );
  }
  return <LoadingState />;
}

export function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <View style={styles.section}>
      <Text variant="heading">{title}</Text>
      {children}
    </View>
  );
}

export function useNow(intervalMs = 30_000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(timer);
  }, [intervalMs]);
  return now;
}

const styles = StyleSheet.create({
  section: { gap: spacing.sm },
});
