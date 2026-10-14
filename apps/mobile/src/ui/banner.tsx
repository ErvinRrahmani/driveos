import { StyleSheet, View, type ViewProps } from 'react-native';
import { Text } from './text';
import { colors, spacing } from './theme';

export type BannerTone = 'info' | 'warning' | 'danger' | 'success';

const TONES: Record<BannerTone, { background: string; text: string }> = {
  info: { background: colors.infoSurface, text: colors.info },
  warning: { background: colors.warningSurface, text: colors.warning },
  danger: { background: colors.dangerSurface, text: colors.danger },
  success: { background: colors.successSurface, text: colors.success },
};

export interface BannerProps extends ViewProps {
  message: string;
  tone?: BannerTone;
}

export function Banner({ message, tone = 'info', style, ...props }: BannerProps) {
  const look = TONES[tone];
  return (
    <View
      accessibilityRole={tone === 'danger' || tone === 'warning' ? 'alert' : 'summary'}
      accessibilityLiveRegion="polite"
      style={[styles.banner, { backgroundColor: look.background }, style]}
      {...props}
    >
      <Text variant="label" style={{ color: look.text }}>
        {message}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  banner: { paddingHorizontal: spacing.lg, paddingVertical: spacing.sm },
});
