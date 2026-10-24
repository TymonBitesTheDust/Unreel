import { router } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { Button, Group, Notice, Row, Screen } from '../components/ui';
import * as Blocker from '../lib/blocker';
import { useBlocker } from '../state/BlockerProvider';
import { space, type, usePalette } from '../theme';

export default function Setup() {
  const { status } = useBlocker();
  if (!status) return <Screen>{null}</Screen>;
  return status.platform === 'android' ? <AndroidSetup status={status} /> : <IOSSetup status={status} />;
}

/**
 * Google Play requires a prominent, in-app disclosure before sending the user to enable an
 * AccessibilityService that isn't an accessibility tool. This screen is that disclosure: it must
 * say what's read, why, and that the user can decline — and it must come before the Settings jump.
 */
function AndroidSetup({ status }: { status: Blocker.AndroidStatus }) {
  const c = usePalette();
  const done = status.serviceEnabled && status.serviceRunning;

  return (
    <Screen>
      <View style={styles.intro}>
        <Text style={[type.title, { color: c.ink }]}>Unreel uses Accessibility access</Text>
        <Text style={[type.body, { color: c.muted }]}>
          It’s how Unreel notices the moment Shorts or Reels open, so it can send you back to the main feed.
        </Text>
      </View>

      <Group title="What Unreel does with it">
        <Row first title="Watches only YouTube and Instagram" subtitle="Android doesn’t send Unreel anything from other apps." />
        <Row title="Reads the names of on-screen layout elements" subtitle="For example, whether the Reels tab is selected. Not your messages, captions or typing." />
        <Row title="Presses Back or taps Home for you" subtitle="Only when the Shorts or Reels feed is on screen." />
        <Row title="Keeps everything on this phone" subtitle="Block counts stay on the device. Nothing about your use is sent anywhere." />
      </Group>

      {done ? (
        <Notice
          title="You’re set up"
          body="Open YouTube or Instagram and try the Shorts or Reels tab to see it work."
          action={<Button label="Back to dashboard" onPress={() => router.back()} />}
        />
      ) : (
        <View style={styles.actions}>
          <Button label="Agree and open Accessibility settings" onPress={() => Blocker.android.openServiceSettings()} />
          <Text style={[type.small, { color: c.muted }]}>
            In Settings, choose Unreel, then switch it on. You can switch it off there at any time.
          </Text>
          <Button label="Not now" variant="quiet" onPress={() => router.back()} />
        </View>
      )}

      {!done && (
        <Group
          title="If the switch is greyed out"
          footer="Android 13 and later restricts Accessibility for apps installed outside the Play Store. Open App info, tap the menu in the corner, then Allow restricted settings."
        >
          <Row first title="Open App info" onPress={() => Blocker.android.openAppInfo()} />
        </Group>
      )}
    </Screen>
  );
}

function IOSSetup({ status }: { status: Blocker.IOSStatus }) {
  const c = usePalette();
  const { refresh } = useBlocker();
  const [error, setError] = useState<string | null>(null);
  const authorized = status.authorization === 'approved';
  const s = status.selection;
  const picked = s.applications + s.categories + s.webDomains > 0;

  async function authorize() {
    setError(null);
    try {
      await Blocker.ios.requestAuthorization();
    } catch {
      setError('Screen Time access wasn’t granted. You can try again, or allow it later in Settings, Screen Time.');
    }
    refresh();
  }

  async function pick() {
    await Blocker.ios.presentAppPicker();
    refresh();
  }

  return (
    <Screen>
      <View style={styles.intro}>
        <Text style={[type.title, { color: c.ink }]}>Two steps on iPhone</Text>
        <Text style={[type.body, { color: c.muted }]}>
          iOS doesn’t let apps look inside other apps, so Unreel can’t spot Reels inside Instagram. Instead it
          locks the apps with Screen Time, and removes Reels and Shorts from the websites in Safari.
        </Text>
      </View>

      <Group title="Allow Screen Time access" footer="Confirmed with Face ID or your passcode. Unreel can lock apps you choose; it can’t see what you do in them.">
        <Row
          first
          title={authorized ? 'Screen Time access allowed' : 'Allow Screen Time access'}
          subtitle={status.authorization === 'denied' ? 'Currently denied' : undefined}
          right={authorized ? <Text style={{ color: c.ok, fontWeight: '600' }}>Done</Text> : undefined}
          onPress={authorized ? undefined : () => void authorize()}
        />
      </Group>

      <Group title="Choose the apps to lock" footer="In the list, search for Instagram and YouTube and tick both.">
        <Row
          first
          disabled={!authorized}
          title={picked ? 'Apps chosen' : 'Choose Instagram and YouTube'}
          subtitle={picked ? `${s.applications + s.categories} selected. Tap to change.` : undefined}
          onPress={authorized ? () => void pick() : undefined}
        />
      </Group>

      <Group
        title="Optional: Safari extension"
        footer="Settings, then Apps, Safari, Extensions, Unreel. Switch it on and allow it on instagram.com and youtube.com."
      >
        <Row first title="Keep the websites, without the feeds" subtitle="Reels and Shorts links open as a single post or video." />
      </Group>

      {error && <Notice title="Not allowed yet" body={error} />}
      {authorized && picked && (
        <Notice title="You’re set up" body="Instagram and YouTube are now locked." action={<Button label="Back to dashboard" onPress={() => router.back()} />} />
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  intro: { gap: space.sm, marginTop: space.sm },
  actions: { gap: space.md },
});
