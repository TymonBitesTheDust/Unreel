import Ionicons from '@expo/vector-icons/Ionicons';
import type { ComponentProps } from 'react';
import { Pressable, StyleSheet, Text, type StyleProp, type ViewStyle } from 'react-native';

import { radius, space, usePalette } from '../theme';

type IconName = ComponentProps<typeof Ionicons>['name'];

/** A round floating button on the map. */
export function MapButton({
  icon,
  label,
  onPress,
  tint,
  style,
}: {
  icon: IconName;
  label: string;
  onPress: () => void;
  tint?: string;
  style?: StyleProp<ViewStyle>;
}) {
  const c = usePalette();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      hitSlop={6}
      style={({ pressed }) => [
        styles.round,
        { backgroundColor: c.raised, borderColor: c.line, shadowColor: c.shadow, opacity: pressed ? 0.8 : 1 },
        style,
      ]}
    >
      <Ionicons name={icon} size={24} color={tint ?? c.ink} />
    </Pressable>
  );
}

/** A full-width pill button. */
export function PillButton({
  label,
  icon,
  onPress,
  color,
  textColor,
  disabled,
  style,
}: {
  label: string;
  icon?: IconName;
  onPress: () => void;
  color: string;
  textColor: string;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [
        styles.pill,
        { backgroundColor: color, opacity: disabled ? 0.5 : pressed ? 0.85 : 1 },
        style,
      ]}
    >
      {icon && <Ionicons name={icon} size={20} color={textColor} />}
      <Text style={[styles.pillText, { color: textColor }]} numberOfLines={1}>
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  round: {
    width: 52,
    height: 52,
    borderRadius: 26,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 4,
    shadowOpacity: 0.18,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
  },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: space.sm,
    minHeight: 54,
    paddingHorizontal: space.lg,
    borderRadius: radius.pill,
  },
  pillText: { fontSize: 17, fontWeight: '700' },
});
