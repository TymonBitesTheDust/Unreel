import { useState } from 'react';
import { Alert, AppState, Linking, Text, TextInput, View } from 'react-native';

import { Group, Row, Screen, Segmented, ToggleRow } from '../components/ui';
import { requestNotificationPermission, sendTestAlerts } from '../lib/alerts';
import { hasGoogleKey } from '../lib/google';
import { KIND_INFO, KIND_ORDER } from '../lib/hazards';
import { clearReports, refreshNow, updateSettings, type SourceStatus } from '../lib/radar';
import { ALERT_DISTANCES } from '../lib/settings';
import { useRadar } from '../state/useRadar';
import { radius, space, type, usePalette } from '../theme';

function statusText(s: SourceStatus): string {
  const when = s.updatedAt
    ? ` · updated ${new Date(s.updatedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`
    : '';
  switch (s.state) {
    case 'off':
      return 'Off';
    case 'idle':
      return 'Waiting for your location';
    case 'loading':
      return 'Loading…';
    case 'ok':
      return `${s.count} nearby${when}`;
    case 'error':
      return `Error: ${s.error ?? 'unknown'}`;
  }
}

export default function SettingsScreen() {
  const c = usePalette();
  const s = useRadar();
  const st = s.settings;
  const [feedUrl, setFeedUrl] = useState(st.wazeFeedUrl);

  const saveFeed = () => {
    const url = feedUrl.trim();
    if (url && !/^https:\/\//i.test(url)) {
      Alert.alert('Use an https:// link', 'Waze for Cities feed links start with https://');
      return;
    }
    updateSettings({ wazeFeedUrl: url });
  };

  const test = async () => {
    const allowed = await requestNotificationPermission();
    await sendTestAlerts(st, AppState.currentState === 'active');
    Alert.alert(
      'Test alert sent',
      allowed
        ? 'You just heard the in-app alert. A notification follows in 5 seconds: switch to Google Maps or lock the phone to see it.'
        : 'Notifications are off for RoadWatch, so you will only get alerts while it is open.',
      allowed ? undefined : [{ text: 'OK' }, { text: 'Open settings', onPress: () => Linking.openSettings() }],
    );
  };

  return (
    <Screen>
      <Group
        title="Warn me"
        footer="RoadWatch warns once per hazard as you approach it, and again only after you have driven well clear of it."
      >
        <Text style={[type.small, { color: c.muted, paddingHorizontal: space.lg, paddingTop: space.md }]}>
          Distance before the hazard
        </Text>
        <Segmented
          options={ALERT_DISTANCES}
          value={st.alertDistance as (typeof ALERT_DISTANCES)[number]}
          onChange={(v) => updateSettings({ alertDistance: v })}
          format={(v) => `${v} m`}
        />
        {KIND_ORDER.map((kind) => (
          <ToggleRow
            key={kind}
            title={`${KIND_INFO[kind].emoji}  ${KIND_INFO[kind].plural}`}
            value={st.kinds[kind]}
            onChange={(v) => updateSettings({ kinds: { ...st.kinds, [kind]: v } })}
          />
        ))}
        <ToggleRow
          title="Only hazards ahead"
          subtitle="Skip cameras behind you or that you’ve already passed"
          value={st.aheadOnly}
          onChange={(v) => updateSettings({ aheadOnly: v })}
        />
      </Group>

      <Group title="How">
        <ToggleRow
          first
          title="Alert sound"
          subtitle="Also used for notifications"
          value={st.sound}
          onChange={(v) => updateSettings({ sound: v })}
        />
        <ToggleRow
          title="Spoken warning"
          subtitle={'"Speed camera ahead, 200 metres"'}
          value={st.voice}
          onChange={(v) => updateSettings({ voice: v })}
        />
        <ToggleRow title="Vibrate" value={st.vibrate} onChange={(v) => updateSettings({ vibrate: v })} />
        <Row title="Send a test alert" subtitle="Check the sound, voice and notification" onPress={test} />
      </Group>

      <Group title="Map">
        <ToggleRow
          first
          title="Google traffic layer"
          subtitle="Live traffic from Google Maps"
          value={st.showTraffic}
          onChange={(v) => updateSettings({ showTraffic: v })}
        />
        <Row
          title="Google Maps API key"
          subtitle={
            hasGoogleKey ? 'Set: Google search and routes are on' : 'Not set: search uses the phone, no route line'
          }
        />
      </Group>

      <Group
        title="Data"
        footer="Fixed speed, red-light and traffic cameras come from OpenStreetMap (© OpenStreetMap contributors, ODbL). Waze has no public police API: police reports come from a Waze for Cities partner feed if you have one, and from your own reports."
      >
        <ToggleRow
          first
          title="OpenStreetMap cameras"
          subtitle={statusText(s.osm)}
          value={st.osmEnabled}
          onChange={(v) => updateSettings({ osmEnabled: v })}
        />
        <Row title="Refresh now" onPress={refreshNow} />
        <View style={{ padding: space.lg, gap: space.sm, borderTopWidth: 0.5, borderTopColor: c.line }}>
          <Text style={[type.body, { color: c.ink }]}>Waze for Cities feed</Text>
          <Text style={[type.small, { color: c.muted }]}>
            {st.wazeFeedUrl ? statusText(s.waze) : 'Paste your partner feed link (JSON)'}
          </Text>
          <TextInput
            value={feedUrl}
            onChangeText={setFeedUrl}
            onEndEditing={saveFeed}
            onSubmitEditing={saveFeed}
            placeholder="https://…"
            placeholderTextColor={c.muted}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="url"
            returnKeyType="done"
            style={[
              type.small,
              { color: c.ink, borderColor: c.line, borderWidth: 1, borderRadius: radius.sm, padding: space.md },
            ]}
          />
        </View>
      </Group>

      <Group title="Your reports" footer="Reports stay on this phone. Police reports disappear after an hour.">
        <Row first title={`${s.reports.length} saved`} />
        <Row
          title="Delete all reports"
          destructive
          onPress={() =>
            Alert.alert('Delete all your reports?', undefined, [
              { text: 'Cancel', style: 'cancel' },
              { text: 'Delete', style: 'destructive', onPress: clearReports },
            ])
          }
        />
      </Group>

      <Group title="Please note">
        <Text style={[type.small, { color: c.muted, padding: space.lg, lineHeight: 20 }]}>
          Warnings about speed cameras or police are restricted or illegal in some countries (for example Germany,
          Switzerland and France). Check the law where you drive. Cameras and police may be missing or out of date, so
          always follow the posted limits. Don’t handle your phone while driving.
        </Text>
      </Group>
    </Screen>
  );
}
