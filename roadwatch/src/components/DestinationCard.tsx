import Ionicons from '@expo/vector-icons/Ionicons';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import { distance, formatDistance, formatDuration, type LatLng } from '../lib/geo';
import type { Place, Route } from '../lib/google';
import { KIND_INFO, KIND_ORDER, type HazardKind } from '../lib/hazards';
import { KIND_COLOR, radius, space, type, usePalette } from '../theme';
import { PillButton } from './MapButton';

type Props = {
  destination: Place;
  from: LatLng | null;
  route: Route | null;
  routeStatus: 'idle' | 'loading' | 'ok' | 'error';
  routeError?: string;
  routeCounts: Record<HazardKind, number> | null;
  driving: boolean;
  onGoogleMaps: () => void;
  onWaze: () => void;
  onStart: () => void;
  onClose: () => void;
};

export function DestinationCard(p: Props) {
  const c = usePalette();

  let summary: string;
  if (p.route) summary = `${formatDuration(p.route.durationSeconds)} · ${formatDistance(p.route.distanceMeters)}`;
  else if (p.from) summary = `${formatDistance(distance(p.from, p.destination))} away (straight line)`;
  else summary = p.destination.address ?? '';

  const counts = p.routeCounts
    ? KIND_ORDER.filter((k) => p.routeCounts![k] > 0).map((k) => ({ kind: k, n: p.routeCounts![k] }))
    : [];

  return (
    <View style={[styles.card, { backgroundColor: c.surface, borderColor: c.line, shadowColor: c.shadow }]}>
      <View style={styles.header}>
        <View style={{ flex: 1 }}>
          <Text style={[type.heading, { color: c.ink }]} numberOfLines={1}>
            {p.destination.name}
          </Text>
          <Text style={[type.small, { color: c.muted, marginTop: 2 }]} numberOfLines={1}>
            {summary}
          </Text>
        </View>
        <Pressable accessibilityRole="button" accessibilityLabel="Close" onPress={p.onClose} hitSlop={12}>
          <Ionicons name="close" size={26} color={c.muted} />
        </Pressable>
      </View>

      {p.routeStatus === 'loading' && (
        <View style={styles.row}>
          <ActivityIndicator color={c.brand} />
          <Text style={[type.small, { color: c.muted }]}>Finding the route and cameras on it…</Text>
        </View>
      )}
      {p.routeStatus === 'error' && (
        <Text style={[type.small, { color: c.danger }]} numberOfLines={2}>
          No route: {p.routeError}
        </Text>
      )}
      {p.routeStatus === 'ok' && (
        <View style={[styles.row, { flexWrap: 'wrap' }]}>
          {counts.length === 0 ? (
            <Text style={[type.small, { color: c.muted }]}>No known police or cameras on this route.</Text>
          ) : (
            counts.map(({ kind, n }) => (
              <View key={kind} style={[styles.count, { borderColor: KIND_COLOR[kind] }]}>
                <Text style={[type.small, { color: c.ink, fontWeight: '700' }]}>
                  {KIND_INFO[kind].emoji} {n}{' '}
                  {n === 1 ? KIND_INFO[kind].name.toLowerCase() : KIND_INFO[kind].plural.toLowerCase()}
                </Text>
              </View>
            ))
          )}
        </View>
      )}

      <View style={styles.actions}>
        <PillButton
          label="Google Maps"
          icon="navigate"
          onPress={p.onGoogleMaps}
          color="#1A73E8"
          textColor="#FFFFFF"
          style={styles.flex}
        />
        <PillButton
          label="Waze"
          icon="car-sport"
          onPress={p.onWaze}
          color="#33CCFF"
          textColor="#06222C"
          style={styles.flex}
        />
      </View>
      {!p.driving && (
        <PillButton
          label="Drive here with RoadWatch"
          icon="play"
          onPress={p.onStart}
          color={c.brand}
          textColor={c.onBrand}
        />
      )}
      <Text style={[type.caption, { color: c.muted, textAlign: 'center' }]}>
        RoadWatch keeps warning you in the background while Google Maps or Waze navigates.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    gap: space.md,
    padding: space.lg,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    elevation: 8,
    shadowOpacity: 0.2,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 4 },
  },
  header: { flexDirection: 'row', alignItems: 'flex-start', gap: space.md },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  count: { borderWidth: 1.5, borderRadius: radius.pill, paddingVertical: 4, paddingHorizontal: space.md },
  actions: { flexDirection: 'row', gap: space.sm },
  flex: { flex: 1 },
});
