import type { ReactNode } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useOnline } from '../lib/network';
import { Text } from './text';
import { colors, spacing } from './theme';

export interface ScreenProps {
  title?: string;
  subtitle?: string;
  scroll?: boolean;
  children: ReactNode;
}

export function Screen({ title, subtitle, scroll = true, children }: ScreenProps) {
  const online = useOnline();
  const header = title ? (
    <View style={styles.header}>
      <Text variant="title">{title}</Text>
      {subtitle ? <Text tone="muted">{subtitle}</Text> : null}
    </View>
  ) : null;
  return (
    <SafeAreaView style={styles.safe} edges={online ? ['top', 'left', 'right'] : ['left', 'right']}>
      {scroll ? (
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          {header}
          {children}
        </ScrollView>
      ) : (
        <View style={[styles.content, styles.fill]}>
          {header}
          {children}
        </View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  fill: { flex: 1 },
  content: { padding: spacing.lg, gap: spacing.lg },
  header: { gap: spacing.xs },
});
