import type { ReactNode } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Text } from './text';
import { colors, radius, spacing } from './theme';

export interface ListItemProps {
  title: string;
  subtitle?: string;
  accessory?: ReactNode;
  selected?: boolean;
  disabled?: boolean;
  onPress?: () => void;
}

export function ListItem({
  title,
  subtitle,
  accessory,
  selected,
  disabled,
  onPress,
}: ListItemProps) {
  const content = (
    <>
      <View style={styles.text}>
        <Text variant="label">{title}</Text>
        {subtitle ? (
          <Text variant="caption" tone="muted">
            {subtitle}
          </Text>
        ) : null}
      </View>
      {accessory}
    </>
  );
  if (!onPress) return <View style={[styles.row, selected && styles.selected]}>{content}</View>;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: selected === true, disabled: disabled === true }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.row,
        selected && styles.selected,
        pressed && styles.pressed,
        disabled && styles.disabled,
      ]}
    >
      {content}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    minHeight: 56,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: radius.md,
  },
  text: { flex: 1, gap: 2 },
  selected: { borderColor: colors.primary, backgroundColor: colors.infoSurface },
  pressed: { backgroundColor: colors.background },
  disabled: { opacity: 0.6 },
});
