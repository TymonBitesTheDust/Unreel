import * as Location from 'expo-location';
import { router } from 'expo-router';
import { useState } from 'react';
import { Linking, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { PillButton } from '../components/MapButton';
import { requestNotificationPermission } from '../lib/alerts';
import { KIND_INFO, KIND_ORDER } from '../lib/hazards';
import { updateSettings } from '../lib/radar';
import { useRadar } from '../state/useRadar';
import { KIND_COLOR, radius, space, type, usePalette } from '../theme';

const WHAT: Record<string, string> = {
  police: 'From your reports and, if you have one, a Waze for Cities feed',
  speed_camera: 'Fixed and average-speed cameras from OpenStreetMap',
  traffic_camera: 'Red-light and traffic cameras from OpenStreetMap',
};

export default function WelcomeScreen() {
  const c = usePalette();
  const insets = useSafeAreaInsets();
  const { settings } = useRadar();
  const [busy, setBusy] = useState(false);
  const [denied, setDenied] = useState(false);

  const allow = async () => {
    setBusy(true);
    try {
      const loc = await Location.requestForegroundPermissionsAsync();
      await requestNotificationPermission().catch(() => false);
      if (!loc.granted) {
        setDenied(true);
        return;
      }
      updateSettings({ onboarded: true });
      // First launch arrives here by redirect; later visits come from the map's "Allow location".
      if (router.canGoBack()) router.back();
      else router.replace('/');
    } finally {
      setBusy(false);
    }
  };

  return (
    <ScrollView
      style={{ backgroundColor: c.background }}
      contentContainerStyle={[
        styles.page,
        { paddingTop: insets.top + space.xxl, paddingBottom: insets.bottom + space.xl },
      ]}
    >
      <View style={[styles.logo, { backgroundColor: c.brand }]}>
        <Text style={styles.logoEmoji}>🛡️</Text>
      </View>
      <Text style={[type.hero, { color: c.ink }]}>RoadWatch</Text>
      <Text style={[type.body, { color: c.muted, lineHeight: 23 }]}>
        A Google map that shows police, speed cameras and traffic cameras, and warns you {settings.alertDistance} metres
        before you reach them, with a sound, a spoken warning and a notification. Navigate with Google Maps or Waze and
        RoadWatch keeps watching in the background.
      </Text>

      <View style={styles.list}>
        {KIND_ORDER.map((k) => (
          <View key={k} style={[styles.item, { backgroundColor: c.surface, borderColor: c.line }]}>
            <View style={[styles.dot, { backgroundColor: KIND_COLOR[k] }]}>
              <Text style={styles.dotEmoji}>{KIND_INFO[k].emoji}</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[type.body, { color: c.ink, fontWeight: '700' }]}>{KIND_INFO[k].plural}</Text>
              <Text style={[type.small, { color: c.muted }]}>{WHAT[k]}</Text>
            </View>
          </View>
        ))}
      </View>

      <View style={[styles.note, { backgroundColor: c.warnSurface }]}>
        <Text style={[type.small, { color: c.warnInk, lineHeight: 20 }]}>
          Camera and police warnings are restricted or illegal in some countries, including Germany, Switzerland and
          France. Check the law where you drive, and always follow the posted limits.
        </Text>
      </View>

      <Text style={[type.small, { color: c.muted, lineHeight: 20 }]}>
        RoadWatch needs your location to know what’s ahead, and notifications to warn you while another app is open.
        Your location stays on your phone.
      </Text>

      {denied ? (
        <>
          <Text style={[type.small, { color: c.danger }]}>
            Location is off for RoadWatch. Turn it on in Settings to continue.
          </Text>
          <PillButton
            label="Open Settings"
            onPress={() => Linking.openSettings()}
            color={c.brand}
            textColor={c.onBrand}
          />
          <PillButton label="Try again" onPress={allow} color={c.surface} textColor={c.ink} disabled={busy} />
        </>
      ) : (
        <PillButton
          label="Allow location and notifications"
          icon="locate"
          onPress={allow}
          color={c.brand}
          textColor={c.onBrand}
          disabled={busy}
        />
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  page: { paddingHorizontal: space.xl, gap: space.lg },
  logo: { width: 72, height: 72, borderRadius: radius.md + 4, alignItems: 'center', justifyContent: 'center' },
  logoEmoji: { fontSize: 38 },
  list: { gap: space.sm },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    padding: space.md,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
  },
  dot: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  dotEmoji: { fontSize: 20 },
  note: { borderRadius: radius.sm, padding: space.md },
});
