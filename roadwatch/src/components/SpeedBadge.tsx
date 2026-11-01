import { StyleSheet, Text, View } from 'react-native';

import { space, usePalette } from '../theme';

/** Current speed from GPS, in km/h. */
export function SpeedBadge({ speed }: { speed: number | null }) {
  const c = usePalette();
  const kmh = speed !== null && speed >= 0 ? Math.round(speed * 3.6) : null;
  return (
    <View
      accessibilityLabel={kmh === null ? 'Speed unknown' : `${kmh} kilometres per hour`}
      style={[styles.badge, { backgroundColor: c.raised, borderColor: c.line, shadowColor: c.shadow }]}
    >
      <Text style={[styles.value, { color: c.ink }]}>{kmh ?? '–'}</Text>
      <Text style={[styles.unit, { color: c.muted }]}>km/h</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    width: 72,
    height: 72,
    borderRadius: 36,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: space.xs,
    elevation: 4,
    shadowOpacity: 0.18,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
  },
  value: { fontSize: 26, fontWeight: '800', fontVariant: ['tabular-nums'], lineHeight: 28 },
  unit: { fontSize: 11, fontWeight: '600' },
});
