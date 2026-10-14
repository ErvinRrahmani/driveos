import { ActivityIndicator, Pressable, type PressableProps, StyleSheet } from 'react-native';
import { Text, type TextTone } from './text';
import { colors, radius, spacing } from './theme';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';

const VARIANTS: Record<
  ButtonVariant,
  { background: string; pressed: string; border: string; tone: TextTone }
> = {
  primary: {
    background: colors.primary,
    pressed: colors.primaryPressed,
    border: colors.primary,
    tone: 'inverse',
  },
  secondary: {
    background: colors.surface,
    pressed: colors.background,
    border: colors.border,
    tone: 'default',
  },
  ghost: {
    background: 'transparent',
    pressed: colors.background,
    border: 'transparent',
    tone: 'primary',
  },
  danger: {
    background: colors.surface,
    pressed: colors.dangerSurface,
    border: colors.danger,
    tone: 'danger',
  },
};

export interface ButtonProps extends Omit<PressableProps, 'children' | 'style'> {
  title: string;
  variant?: ButtonVariant;
  loading?: boolean;
}

export function Button({
  title,
  variant = 'primary',
  loading = false,
  disabled,
  ...props
}: ButtonProps) {
  const look = VARIANTS[variant];
  const inactive = disabled === true || loading;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: inactive, busy: loading }}
      disabled={inactive}
      style={({ pressed }) => [
        styles.base,
        {
          backgroundColor: pressed ? look.pressed : look.background,
          borderColor: look.border,
          opacity: inactive ? 0.6 : 1,
        },
      ]}
      {...props}
    >
      {loading ? (
        <ActivityIndicator color={look.tone === 'inverse' ? colors.onPrimary : colors.primary} />
      ) : (
        <Text variant="label" tone={look.tone}>
          {title}
        </Text>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    minHeight: 48,
    borderRadius: radius.md,
    borderWidth: 1,
    paddingHorizontal: spacing.lg,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
