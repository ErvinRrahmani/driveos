import { forwardRef, useId } from 'react';
import { StyleSheet, TextInput, type TextInputProps, View } from 'react-native';
import { Text } from './text';
import { colors, radius, spacing, typography } from './theme';

export interface InputProps extends TextInputProps {
  label: string;
  hint?: string;
  error?: string | null;
}

export const Input = forwardRef<TextInput, InputProps>(function Input(
  { label, hint, error, style, ...props },
  ref,
) {
  const id = useId();
  return (
    <View style={styles.field}>
      <Text variant="label" nativeID={id}>
        {label}
      </Text>
      <TextInput
        ref={ref}
        accessibilityLabel={label}
        accessibilityLabelledBy={id}
        accessibilityHint={hint}
        placeholderTextColor={colors.muted}
        style={[styles.input, error ? styles.invalid : null, style]}
        {...props}
      />
      {error ? (
        <Text variant="caption" tone="danger" accessibilityLiveRegion="polite">
          {error}
        </Text>
      ) : hint ? (
        <Text variant="caption" tone="muted">
          {hint}
        </Text>
      ) : null}
    </View>
  );
});

const styles = StyleSheet.create({
  field: { gap: spacing.xs },
  input: {
    ...typography.body,
    minHeight: 48,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    backgroundColor: colors.surface,
    color: colors.text,
  },
  invalid: { borderColor: colors.danger },
});
