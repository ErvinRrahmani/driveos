import { Text as NativeText, type TextProps as NativeTextProps } from 'react-native';
import { colors, typography } from './theme';

export type TextVariant = keyof typeof typography;
export type TextTone = 'default' | 'muted' | 'danger' | 'inverse' | 'primary';

const TONES: Record<TextTone, string> = {
  default: colors.text,
  muted: colors.muted,
  danger: colors.danger,
  inverse: colors.onPrimary,
  primary: colors.primary,
};

export interface TextProps extends NativeTextProps {
  variant?: TextVariant;
  tone?: TextTone;
}

export function Text({ variant = 'body', tone = 'default', style, ...props }: TextProps) {
  return (
    <NativeText
      accessibilityRole={variant === 'title' || variant === 'heading' ? 'header' : undefined}
      style={[typography[variant], { color: TONES[tone] }, style]}
      {...props}
    />
  );
}
