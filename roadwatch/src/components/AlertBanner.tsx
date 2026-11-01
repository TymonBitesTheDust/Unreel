import { StyleSheet, Text, View } from 'react-native';

import { formatDistance } from '../lib/geo';
import { KIND_INFO } from '../lib/hazards';
import type { Nearby } from '../lib/proximity';
import { KIND_COLOR, radius, space, type, usePalette } from '../theme';

/** The big warning while a hazard is within alert distance; a small "next" chip otherwise. */
export function AlertBanner({ inRange, upcoming }: { inRange: Nearby[]; upcoming: Nearby | null }) {
  const c = usePalette();
  const first = inRange[0];

  if (first) {
    const { hazard, distance } = first;
    return (
      <View
        accessibilityRole="alert"
        accessibilityLabel={`${hazard.label} in ${formatDistance(distance)}`}
        style={[styles.banner, { backgroundColor: KIND_COLOR[hazard.kind] }]}
      >
        <Text style={styles.bigEmoji}>{KIND_INFO[hazard.kind].emoji}</Text>
        <View style={styles.bannerText}>
          <Text style={[type.title, styles.white]} numberOfLines={1}>
            {hazard.label}
          </Text>
          <Text style={[type.body, styles.whiteSoft]} numberOfLines={1}>
            {[hazard.street, inRange.length > 1 && `+${inRange.length - 1} more nearby`].filter(Boolean).join(' · ') ||
              'Ahead'}
          </Text>
        </View>
        <View style={styles.right}>
          <Text style={[styles.distance, styles.white]}>{formatDistance(distance)}</Text>
          {hazard.speedLimit && (
            <View style={styles.limit}>
              <Text style={styles.limitText}>{hazard.speedLimit.replace(/\s*(km\/h|mph)/, '')}</Text>
            </View>
          )}
        </View>
      </View>
    );
  }

  if (upcoming) {
    const { hazard, distance } = upcoming;
    return (
      <View style={[styles.chip, { backgroundColor: c.raised, borderColor: c.line, shadowColor: c.shadow }]}>
        <View style={[styles.dot, { backgroundColor: KIND_COLOR[hazard.kind] }]} />
        <Text style={[type.small, { color: c.ink, fontWeight: '600' }]} numberOfLines={1}>
          Next: {hazard.label} · {formatDistance(distance)}
        </Text>
      </View>
    );
  }

  return null;
}

const styles = StyleSheet.create({
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    padding: space.lg,
    borderRadius: radius.md,
    elevation: 6,
    shadowOpacity: 0.25,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
  },
  bigEmoji: { fontSize: 38 },
  bannerText: { flex: 1 },
  right: { alignItems: 'flex-end', gap: space.xs },
  distance: { fontSize: 28, fontWeight: '800', fontVariant: ['tabular-nums'] },
  white: { color: '#FFFFFF' },
  whiteSoft: { color: 'rgba(255,255,255,0.88)' },
  limit: {
    minWidth: 40,
    height: 40,
    paddingHorizontal: 4,
    borderRadius: 20,
    borderWidth: 4,
    borderColor: '#E11D48',
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  limitText: { fontSize: 15, fontWeight: '800', color: '#111111' },
  chip: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    paddingVertical: space.sm,
    paddingHorizontal: space.md,
    borderRadius: radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
    elevation: 3,
    shadowOpacity: 0.15,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
  },
  dot: { width: 10, height: 10, borderRadius: 5 },
});
