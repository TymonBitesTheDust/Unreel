import { useState } from 'react';
import { Alert, StyleSheet, Text, View } from 'react-native';

import { Group, Row, Screen, Segmented, SwitchRow } from '../components/ui';
import { UnlockBanner } from '../components/UnlockBanner';
import * as Blocker from '../lib/blocker';
import { DELAY_OPTIONS_SEC } from '../lib/friction';
import { checkForRuleUpdate, RULES_URL } from '../lib/rules';
import { durationLabel } from '../lib/time';
import { useBlocker } from '../state/BlockerProvider';
import { useFriction } from '../state/FrictionProvider';
import { space, type, usePalette } from '../theme';

const DELAY_LABELS: Record<number, string> = { 0: 'None', 60: '1 min', 300: '5 min', 900: '15 min', 1800: '30 min' };

export default function Settings() {
  const c = usePalette();
  const blocker = useBlocker();
  const friction = useFriction();
  const [rulesMessage, setRulesMessage] = useState<string | null>(null);
  const androidStatus = Blocker.android.status(blocker.status);
  const delay = friction.settings?.unlockDelaySec ?? 0;

  function onDelayChange(seconds: number) {
    if (seconds > delay) void friction.lengthenDelay(seconds);
    else if (seconds < delay)
      friction.ask({ label: `Shorten the unlock delay to ${durationLabel(seconds).toLowerCase()}`, friction: { unlockDelaySec: seconds } });
  }

  async function onCheckRules() {
    setRulesMessage('Checking…');
    const result = await checkForRuleUpdate({ force: true });
    blocker.refresh();
    setRulesMessage(
      {
        updated: 'Detection rules updated.',
        current: 'Detection rules are up to date.',
        skipped: 'No update server is configured for this build.',
        failed: `Couldn’t check: ${result.kind === 'failed' ? result.message : ''}`,
      }[result.kind],
    );
  }

  return (
    <Screen>
      <UnlockBanner />

      <Group
        title="Make it harder to give in"
        footer="Turning blocking off, pausing it, allowing an app, removing the PIN or shortening the delay all go through these steps."
      >
        {friction.hasPin ? (
          <Row
            first
            title="Remove PIN"
            subtitle="Asks for the PIN, then waits out the delay."
            onPress={() => friction.ask({ label: 'Remove your PIN', friction: { removePin: true } })}
          />
        ) : (
          <Row first title="Set a PIN" subtitle="Give it to a friend if you don’t trust yourself with it." onPress={friction.startPinSetup} />
        )}
        <View style={{ paddingHorizontal: space.lg, paddingVertical: space.lg, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: c.line }}>
          <Text style={[type.body, { color: c.ink, marginBottom: space.xs }]}>Unlock delay</Text>
          <Text style={[type.small, { color: c.muted, marginBottom: space.md }]}>
            How long to wait before a change that loosens blocking takes effect.
          </Text>
          <Segmented
            options={DELAY_OPTIONS_SEC.map((s) => ({ value: s, label: DELAY_LABELS[s] ?? durationLabel(s) }))}
            value={delay}
            onChange={onDelayChange}
          />
        </View>
      </Group>

      {androidStatus && (
        <Group title="Blocking on this phone">
          <SwitchRow
            first
            title="Show a pause screen"
            subtitle="After sending you back, show a full-screen reminder for a few seconds. Off: a short message instead."
            value={blocker.config.interstitial}
            onChange={(v) => void blocker.applyConfig({ interstitial: v })}
          />
          <Row
            title="Accessibility settings"
            subtitle={androidStatus.serviceRunning ? 'Unreel is running' : 'Unreel isn’t running'}
            onPress={() => Blocker.android.openServiceSettings()}
          />
          <Row
            title="Detection rules"
            subtitle={
              rulesMessage ??
              `Version ${androidStatus.rulesVersion}${androidStatus.rulesSource === 'override' ? ', updated online' : ', built in'}`
            }
            onPress={RULES_URL ? () => void onCheckRules() : undefined}
          />
        </Group>
      )}

      <Group title="Your numbers" footer={Blocker.platform === 'ios' ? 'On iPhone, a block is counted each time the lock screen appears, so a single visit can occasionally count twice.' : undefined}>
        <Row first title="Stopped in total" right={<Text style={[type.heading, { color: c.ink }]}>{blocker.stats?.allTime ?? 0}</Text>} />
        <Row
          title="Reset numbers"
          onPress={() =>
            Alert.alert('Reset your numbers?', 'This clears every count. Blocking keeps working.', [
              { text: 'Cancel', style: 'cancel' },
              {
                text: 'Reset',
                style: 'destructive',
                onPress: () => {
                  Blocker.resetStats();
                  blocker.refresh();
                },
              },
            ])
          }
        />
      </Group>

      <Group title="Privacy" footer="Unreel has no account and no analytics. Block counts and settings never leave this device.">
        <Row first title="Everything stays on this phone" />
      </Group>
    </Screen>
  );
}
