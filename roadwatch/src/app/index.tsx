import Ionicons from '@expo/vector-icons/Ionicons';
import Constants from 'expo-constants';
import * as Haptics from 'expo-haptics';
import { activateKeepAwakeAsync, deactivateKeepAwake } from 'expo-keep-awake';
import * as Location from 'expo-location';
import { Link, Redirect, router, useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, AppState, Linking, Platform, Pressable, StyleSheet, Text, useColorScheme, View } from 'react-native';
import MapView, {
  Circle,
  Marker,
  Polyline,
  PROVIDER_GOOGLE,
  type LongPressEvent,
  type Region,
} from 'react-native-maps';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AlertBanner } from '../components/AlertBanner';
import { DestinationCard } from '../components/DestinationCard';
import { HazardMarker } from '../components/HazardMarker';
import { MapButton, PillButton } from '../components/MapButton';
import { ReportSheet } from '../components/ReportSheet';
import { SpeedBadge } from '../components/SpeedBadge';
import { distance } from '../lib/geo';
import { describePoint, hasGoogleKey } from '../lib/google';
import { openInGoogleMaps, openInWaze } from '../lib/handoff';
import type { Hazard, HazardKind } from '../lib/hazards';
import {
  addReport,
  clearDestination,
  handleLocation,
  LocationPermissionError,
  removeReport,
  setDestination,
  startDriving,
  stopDriving,
} from '../lib/radar';
import { useRadar } from '../state/useRadar';
import { radius, space, type, usePalette } from '../theme';

const MAX_MARKERS = 400;
const isExpoGo = Constants.executionEnvironment === 'storeClient';

function useAppActive() {
  const [active, setActive] = useState(AppState.currentState === 'active');
  useEffect(() => {
    const sub = AppState.addEventListener('change', (s) => setActive(s === 'active'));
    return () => sub.remove();
  }, []);
  return active;
}

export default function MapScreen() {
  const s = useRadar();
  const c = usePalette();
  const scheme = useColorScheme();
  const insets = useSafeAreaInsets();
  const appActive = useAppActive();
  const mapRef = useRef<MapView>(null);
  const [follow, setFollow] = useState(true);
  const [region, setRegion] = useState<Region | null>(null);
  const [reporting, setReporting] = useState(false);
  const [bottomHeight, setBottomHeight] = useState(0);
  const [permission, setPermission] = useState<'unknown' | 'granted' | 'denied'>('unknown');

  // Coming back from the welcome screen (or system settings) may have changed permission.
  const [focusCount, setFocusCount] = useState(0);
  useFocusEffect(useCallback(() => setFocusCount((n) => n + 1), []));
  const recheck = permission === 'denied' ? focusCount : 0;

  // Foreground location while not in a drive (the drive's background task feeds the same store).
  useEffect(() => {
    if (!s.settings.onboarded || s.driving || !appActive) return;
    let sub: Location.LocationSubscription | null = null;
    let cancelled = false;
    (async () => {
      const perm = await Location.getForegroundPermissionsAsync();
      if (cancelled) return;
      setPermission(perm.granted ? 'granted' : 'denied');
      if (!perm.granted) return;
      const last = await Location.getLastKnownPositionAsync().catch(() => null);
      if (last && !cancelled) handleLocation(last);
      const watcher = await Location.watchPositionAsync(
        { accuracy: Location.Accuracy.High, timeInterval: 1000, distanceInterval: 5 },
        handleLocation,
      );
      if (cancelled) watcher.remove();
      else sub = watcher;
    })().catch(() => setPermission('denied'));
    return () => {
      cancelled = true;
      sub?.remove();
    };
  }, [s.settings.onboarded, s.driving, appActive, recheck]);

  // Keep the screen on during a drive, like a navigation app.
  useEffect(() => {
    if (s.driving) activateKeepAwakeAsync('drive').catch(() => {});
    else deactivateKeepAwake('drive').catch(() => {});
  }, [s.driving]);

  // Follow the car.
  const fix = s.fix;
  useEffect(() => {
    if (!fix || !follow || !mapRef.current) return;
    const center = { latitude: fix.latitude, longitude: fix.longitude };
    if (s.driving) {
      mapRef.current.animateCamera(
        { center, zoom: 17, pitch: 45, ...(s.course !== null ? { heading: s.course } : {}) },
        { duration: 900 },
      );
    } else {
      mapRef.current.animateCamera(
        { center, pitch: 0, heading: 0, ...(region ? {} : { zoom: 15 }) },
        { duration: 600 },
      );
    }
    // Region is only read to pick the first zoom level.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fix, follow, s.driving, s.course]);

  const hasFix = fix !== null;
  const visible = useMemo(() => {
    const within = (h: Hazard) => {
      if (region) {
        const lat = region.latitudeDelta * 0.75;
        const lng = region.longitudeDelta * 0.75;
        return Math.abs(h.latitude - region.latitude) <= lat && Math.abs(h.longitude - region.longitude) <= lng;
      }
      return fix ? distance(fix, h) < 5000 : false;
    };
    const list = s.hazards.filter((h) => s.settings.kinds[h.kind] && within(h));
    return list.length > MAX_MARKERS ? list.slice(0, MAX_MARKERS) : list;
    // Recompute on region or data changes, not on every GPS fix.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [s.hazards, s.settings.kinds, region, hasFix]);

  if (!s.settings.onboarded) return <Redirect href="/welcome" />;

  const recenter = () => {
    setFollow(true);
    if (fix && mapRef.current) {
      const center = { latitude: fix.latitude, longitude: fix.longitude };
      mapRef.current.animateCamera({ center, zoom: s.driving ? 17 : 15 }, { duration: 500 });
    }
  };

  const onLongPress = async (e: LongPressEvent) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    setDestination(await describePoint(e.nativeEvent.coordinate));
  };

  const beginDrive = async (): Promise<boolean> => {
    try {
      await startDriving();
      setFollow(true);
      return true;
    } catch (e) {
      if (e instanceof LocationPermissionError) {
        Alert.alert('Location needed', e.message, [
          { text: 'Not now', style: 'cancel' },
          { text: 'Open settings', onPress: () => Linking.openSettings() },
        ]);
      } else {
        // For example Expo Go on iPhone, which can't track location in the background.
        Alert.alert(
          'Could not start background alerts',
          `${(e as Error).message}\n\nAlerts still work while RoadWatch is open.`,
        );
      }
      return false;
    }
  };

  const handOff = async (open: typeof openInGoogleMaps) => {
    const dest = s.destination;
    if (!dest) return;
    // Start the drive first: Android only allows the location service to start while RoadWatch is open.
    await beginDrive();
    try {
      await open(dest);
    } catch {
      Alert.alert('Could not open the navigation app', 'Is it installed on this phone?');
    }
  };

  const onReport = (kind: HazardKind) => {
    setReporting(false);
    if (addReport(kind)) Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    else Alert.alert('No GPS yet', 'Wait until your position shows on the map, then try again.');
  };

  const onHazardCallout = (h: Hazard) => {
    if (h.source !== 'report') return;
    Alert.alert('Remove this report?', h.label, [
      { text: 'Keep', style: 'cancel' },
      { text: 'Remove', style: 'destructive', onPress: () => removeReport(h.id) },
    ]);
  };

  const statusLine = (() => {
    if (permission === 'denied' && !s.driving) return 'Location is off. Allow it so RoadWatch can warn you.';
    if (!fix) return 'Finding your location…';
    if (s.osm.state === 'loading') return 'Loading cameras near you…';
    if (s.osm.state === 'error') return `Cameras: ${s.osm.error ?? 'could not load'}. Retrying.`;
    const count = s.hazards.filter((h) => s.settings.kinds[h.kind]).length;
    if (s.driving) return `Watching the road · ${count} known alerts nearby`;
    return `${count} known police and camera locations nearby`;
  })();

  const showKeyWarning = !hasGoogleKey && Platform.OS === 'android' && !isExpoGo;

  return (
    <View style={styles.fill}>
      <MapView
        ref={mapRef}
        style={StyleSheet.absoluteFill}
        provider={hasGoogleKey || Platform.OS === 'android' ? PROVIDER_GOOGLE : undefined}
        showsUserLocation
        showsMyLocationButton={false}
        showsCompass={false}
        toolbarEnabled={false}
        showsTraffic={s.settings.showTraffic}
        showsBuildings
        userInterfaceStyle={scheme === 'dark' ? 'dark' : 'light'}
        mapPadding={{ top: insets.top + 64, right: 0, bottom: bottomHeight, left: 0 }}
        onPanDrag={() => setFollow(false)}
        onRegionChangeComplete={setRegion}
        onLongPress={onLongPress}
        moveOnMarkerPress={false}
      >
        {visible.map((h) => (
          <HazardMarker key={h.id} hazard={h} onCalloutPress={h.source === 'report' ? onHazardCallout : undefined} />
        ))}
        {s.route && (
          <Polyline
            coordinates={s.route.coordinates}
            strokeColor="#1A73E8"
            strokeWidth={6}
            lineCap="round"
            lineJoin="round"
          />
        )}
        {s.destination && (
          <Marker
            coordinate={{ latitude: s.destination.latitude, longitude: s.destination.longitude }}
            title={s.destination.name}
            description={s.destination.address}
            pinColor={c.brand}
          />
        )}
        {s.driving && fix && (
          <Circle
            center={{ latitude: fix.latitude, longitude: fix.longitude }}
            radius={s.settings.alertDistance}
            strokeColor={c.brand}
            strokeWidth={1.5}
            fillColor="rgba(20,184,166,0.08)"
          />
        )}
      </MapView>

      {/* Top: search, settings, and the warning banner. */}
      <View style={[styles.top, { paddingTop: insets.top + space.sm }]} pointerEvents="box-none">
        <View style={styles.topRow}>
          <Link href="/search" asChild>
            <Pressable
              accessibilityRole="search"
              style={[styles.search, { backgroundColor: c.raised, borderColor: c.line, shadowColor: c.shadow }]}
            >
              <Ionicons name="search" size={20} color={c.muted} />
              <Text style={[type.body, { color: c.muted, flex: 1 }]} numberOfLines={1}>
                Where to?
              </Text>
            </Pressable>
          </Link>
          <MapButton icon="settings-sharp" label="Settings" onPress={() => router.push('/settings')} />
        </View>
        {showKeyWarning && (
          <View style={[styles.warning, { backgroundColor: c.warnSurface }]}>
            <Text style={[type.small, { color: c.warnInk }]}>
              Google Maps API key missing, so the map stays blank. Add EXPO_PUBLIC_GOOGLE_MAPS_API_KEY and rebuild (see
              README).
            </Text>
          </View>
        )}
        <AlertBanner inRange={s.inRange} upcoming={s.driving || s.moving ? s.upcoming : null} />
      </View>

      {/* Bottom: speed, buttons, destination or drive controls. */}
      <View
        style={[styles.bottom, { paddingBottom: insets.bottom + space.md }]}
        pointerEvents="box-none"
        onLayout={(e) => setBottomHeight(Math.round(e.nativeEvent.layout.height))}
      >
        <View style={styles.bottomRow} pointerEvents="box-none">
          <SpeedBadge speed={fix?.speed ?? null} />
          <View style={styles.sideButtons}>
            <MapButton
              icon="megaphone"
              label="Report police or camera"
              onPress={() => setReporting(true)}
              tint="#DC2626"
            />
            <MapButton icon="locate" label="Center on my location" onPress={recenter} tint={follow ? c.brand : c.ink} />
          </View>
        </View>

        {s.destination ? (
          <DestinationCard
            destination={s.destination}
            from={fix}
            route={s.route}
            routeStatus={s.routeStatus}
            routeError={s.routeError}
            routeCounts={s.routeCounts}
            driving={s.driving}
            onGoogleMaps={() => handOff(openInGoogleMaps)}
            onWaze={() => handOff(openInWaze)}
            onStart={beginDrive}
            onClose={clearDestination}
          />
        ) : null}

        {(!s.destination || s.driving) && (
          <View style={[styles.panel, { backgroundColor: c.surface, borderColor: c.line, shadowColor: c.shadow }]}>
            <Text style={[type.small, { color: c.muted }]} numberOfLines={2}>
              {statusLine}
            </Text>
            {permission === 'denied' && !s.driving ? (
              <PillButton
                label="Allow location"
                icon="locate"
                onPress={() => router.push('/welcome')}
                color={c.brand}
                textColor={c.onBrand}
              />
            ) : s.driving ? (
              <PillButton
                label="Stop"
                icon="stop-circle"
                onPress={() => stopDriving()}
                color={c.danger}
                textColor="#FFFFFF"
              />
            ) : (
              <PillButton
                label="Start driving"
                icon="shield-checkmark"
                onPress={beginDrive}
                color={c.brand}
                textColor={c.onBrand}
              />
            )}
          </View>
        )}
        {s.settings.osmEnabled && (
          <Text style={[type.caption, styles.attribution, { color: c.muted, backgroundColor: c.surface }]}>
            Camera data © OpenStreetMap contributors
          </Text>
        )}
      </View>

      <ReportSheet visible={reporting} onReport={onReport} onClose={() => setReporting(false)} />
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  top: { position: 'absolute', top: 0, left: 0, right: 0, paddingHorizontal: space.md, gap: space.sm },
  topRow: { flexDirection: 'row', gap: space.sm, alignItems: 'center' },
  search: {
    flex: 1,
    height: 52,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    paddingHorizontal: space.lg,
    borderRadius: radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
    elevation: 4,
    shadowOpacity: 0.18,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
  },
  warning: { borderRadius: radius.sm, padding: space.md },
  bottom: { position: 'absolute', left: 0, right: 0, bottom: 0, paddingHorizontal: space.md, gap: space.sm },
  bottomRow: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between' },
  sideButtons: { gap: space.sm },
  attribution: {
    alignSelf: 'center',
    paddingHorizontal: space.sm,
    borderRadius: radius.sm,
    overflow: 'hidden',
    opacity: 0.9,
  },
  panel: {
    gap: space.sm,
    padding: space.md,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    elevation: 6,
    shadowOpacity: 0.18,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 3 },
  },
});
