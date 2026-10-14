import { Pressable, ScrollView, StyleSheet } from 'react-native';
import { colors, radius, spacing, Text } from '../ui';

export interface Chip {
  key: string;
  label: string;
}

export function Chips({
  chips,
  selected,
  onSelect,
}: {
  chips: Chip[];
  selected: string | null;
  onSelect: (key: string) => void;
}) {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.row}
    >
      {chips.map((chip) => {
        const active = chip.key === selected;
        return (
          <Pressable
            key={chip.key}
            accessibilityRole="button"
            accessibilityState={{ selected: active }}
            onPress={() => onSelect(chip.key)}
            style={[styles.chip, active && styles.active]}
          >
            <Text variant="label" tone={active ? 'inverse' : 'default'}>
              {chip.label}
            </Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  row: { gap: spacing.sm },
  chip: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  active: { backgroundColor: colors.primary, borderColor: colors.primary },
});
