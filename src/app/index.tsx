import { router, Stack } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, Switch, Text, View } from 'react-native';

import { FrameStrip } from '../components/FrameStrip';
import { PauseSheet } from '../components/PauseSheet';
import { UnlockBanner } from '../components/UnlockBanner';
import { Button, Group, Notice, Row, Screen, Segmented, SwitchRow } from '../components/ui';
import { WeekChart } from '../components/WeekChart';
import * as Blocker from '../lib/blocker';
import { isLoosening, type PendingChange } from '../lib/friction';
import { clockTime } from '../lib/time';
import { useBlocker } from '../state/BlockerProvider';
import { useFriction } from '../state/FrictionProvider';
import { radius, space, type, usePalette } from '../theme';

const BUDGET_OPTIONS = [
  { value: 10, label: '10 min' },
  { value: 15, label: '15 min' },
  { value: 30, label: '30 min' },
  { value: 60, label: '1 hour' },
];

export default function Dashboard() {
  const c = usePalette();
  const blocker = useBlocker();
  const friction = useFriction();
  const [pauseSheet, setPauseSheet] = useState(false);
  const { config, status, stats } = blocker;

  const header = (
    <Stack.Screen
      options={{
        headerRight: () => (
          <Pressable onPress={() => router.push('/settings')} hitSlop={12} accessibilityRole="button">
            <Text style={[type.body, { color: c.link, fontWeight: '600' }]}>Settings</Text>
          </Pressable>
        ),
      }}
    />
  );

  if (!blocker.available) {
    return (
      <Screen>
        <Notice
          title="This build can’t block anything"
          body="Unreel needs its native module, which Expo Go doesn’t include. Build the app with `npx expo run:android` or `npx expo run:ios`."
        />
      </Screen>
    );
  }

  const now = Date.now();
  const paused = config.pausedUntil > now;
  const active = config.enabled && !paused;
  const androidStatus = Blocker.android.status(status);
  const iosStatus = Blocker.ios.status(status);

  /** Tightening changes apply immediately; loosening ones go through PIN → delay → confirm. */
  function change(label: string, patch: Blocker.ConfigPatch) {
    if (isLoosening(patch, config)) friction.ask({ label, config: patch });
    else void blocker.applyConfig(patch);
  }

  function onMainSwitch(on: boolean) {
    if (on) void blocker.applyConfig({ enabled: true, pausedUntil: 0 });
    else setPauseSheet(true);
  }

  function onPauseChoice(choice: PendingChange) {
    setPauseSheet(false);
    friction.ask(choice);
  }

  const headline = describe(config, status, blocker.ready, now);
  const today = stats?.today;

  return (
    <Screen>
      {header}

      {/* The status block: what's happening now, the master switch, and today's cut frames. */}
      <View style={[styles.hero, { backgroundColor: c.brand }]}>
        <View style={styles.heroTop}>
          <View style={{ flex: 1 }}>
            <Text style={[type.body, { color: c.onBrand, fontWeight: '600' }]}>{headline.title}</Text>
            <Text style={[type.small, { color: c.onBrandMuted, marginTop: 2 }]}>{headline.detail}</Text>
          </View>
          <Switch
            value={active}
            onValueChange={onMainSwitch}
            disabled={!blocker.ready && !active}
            trackColor={{ true: c.signal, false: 'rgba(255,255,255,0.3)' }}
            thumbColor="#FFFFFF"
            accessibilityLabel="Blocking"
          />
        </View>

        <View style={styles.counter}>
          <Text style={[type.hero, { color: c.onBrand, fontVariant: ['tabular-nums'] }]}>{today?.total ?? 0}</Text>
          <Text style={[type.body, styles.counterLabel, { color: c.onBrandMuted }]}>
            {Blocker.platform === 'ios' ? 'times Unreel\nstopped you today' : 'Shorts and Reels\nstopped today'}
          </Text>
        </View>

        <FrameStrip count={today?.total ?? 0} pulseKey={blocker.lastEvent?.at} />

        <View style={styles.split}>
          <AppCount label="YouTube" value={today?.youtube ?? 0} />
          <AppCount label="Instagram" value={today?.instagram ?? 0} />
        </View>
      </View>

      <UnlockBanner />

      {!blocker.ready && (
        <Notice
          title="Finish setup to start blocking"
          body={
            Blocker.platform === 'android'
              ? 'Unreel needs Accessibility access to notice when Shorts or Reels open.'
              : 'Unreel needs Screen Time access and to know which apps to lock.'
          }
          action={<Button label="Set up Unreel" onPress={() => router.push('/setup')} />}
        />
      )}

      {androidStatus?.serviceEnabled && !androidStatus.serviceRunning && (
        <Notice
          title="Android stopped the blocker"
          body="This happens after a crash or when a battery saver closes Unreel. Switch Unreel off and on again in Accessibility settings."
          action={<Button label="Open Accessibility settings" onPress={() => Blocker.android.openServiceSettings()} />}
        />
      )}

      {iosStatus && !iosStatus.appGroupReachable && (
        <Notice
          title="Locks can’t follow your settings"
          body="This build is missing its App Group, so the Screen Time extensions can’t read your choices. Reinstall the latest version of Unreel."
        />
      )}

      {stats && (
        <Group title="This week">
          <WeekChart days={stats.days} />
        </Group>
      )}

      {androidStatus && (
        <Group
          title="What to block"
          footer="Feed posts, Stories, messages, search and long videos keep working."
        >
          <SwitchRow
            first
            title="YouTube Shorts"
            subtitle={androidStatus.installed.youtube ? undefined : 'YouTube isn’t installed'}
            value={config.youtubeShorts}
            onChange={(v) => change('Stop blocking YouTube Shorts', { youtubeShorts: v })}
          />
          <SwitchRow
            title="Instagram Reels"
            subtitle={androidStatus.installed.instagram ? undefined : 'Instagram isn’t installed'}
            value={config.instagramReels}
            onChange={(v) => change('Stop blocking Instagram Reels', { instagramReels: v })}
          />
          <SwitchRow
            title="Allow one shared video"
            subtitle="A Reel or Short someone sends you plays. Swiping to the next one is blocked."
            value={config.allowSharedReels}
            onChange={(v) => change('Allow shared Reels and Shorts', { allowSharedReels: v })}
          />
        </Group>
      )}

      {iosStatus && (
        <>
          <Group
            title="Locked apps"
            footer="iPhone doesn’t let other apps see inside Instagram or YouTube, so Unreel locks the apps themselves."
          >
            <Row
              first
              title={selectionLabel(iosStatus.selection)}
              subtitle="Tap to change"
              onPress={() => void Blocker.ios.presentAppPicker().then(blocker.refresh)}
            />
            <View style={styles.inset}>
              <Segmented
                options={[
                  { value: 'always', label: 'Always locked' },
                  { value: 'budget', label: 'Daily allowance' },
                ]}
                value={config.iosMode}
                onChange={(mode) =>
                  change('Switch to a daily allowance', { iosMode: mode as Blocker.BlockerConfig['iosMode'] })
                }
              />
            </View>
            {config.iosMode === 'budget' && (
              <View style={styles.inset}>
                <Text style={[type.small, { color: c.muted, marginBottom: space.sm }]}>
                  Time allowed per day, across all locked apps
                </Text>
                <Segmented
                  options={BUDGET_OPTIONS}
                  value={config.dailyBudgetMinutes}
                  onChange={(minutes) => change('Raise your daily allowance', { dailyBudgetMinutes: minutes })}
                />
              </View>
            )}
          </Group>
          <Group
            title="Instagram and YouTube in Safari"
            footer="On the websites, Unreel removes only Reels and Shorts. Turn it on in Settings, then Apps, Safari, Extensions, Unreel, and allow it on instagram.com and youtube.com."
          >
            <Row first title="Use the websites instead" subtitle="Feed, Stories, messages and long videos still work." />
          </Group>
        </>
      )}

      <PauseSheet
        visible={pauseSheet}
        delaySec={friction.settings?.unlockDelaySec ?? 0}
        hasPin={friction.hasPin}
        onChoose={onPauseChoice}
        onClose={() => setPauseSheet(false)}
      />
    </Screen>
  );
}

function AppCount({ label, value }: { label: string; value: number }) {
  const c = usePalette();
  return (
    <View style={{ flex: 1 }}>
      <Text style={[type.heading, { color: c.onBrand, fontVariant: ['tabular-nums'] }]}>{value}</Text>
      <Text style={[type.caption, { color: c.onBrandMuted }]}>{label}</Text>
    </View>
  );
}

function selectionLabel(s: Blocker.IOSStatus['selection']): string {
  const n = s.applications + s.categories;
  if (n === 0 && s.webDomains === 0) return 'Choose Instagram and YouTube';
  if (n === 0) return `${s.webDomains} website${s.webDomains === 1 ? '' : 's'} chosen`;
  return `${n} app${n === 1 ? '' : 's'} chosen`;
}

function describe(
  config: Blocker.BlockerConfig,
  status: Blocker.NativeStatus | null,
  ready: boolean,
  now: number,
): { title: string; detail: string } {
  if (!ready) return { title: 'Not blocking yet', detail: 'Setup isn’t finished.' };
  if (!config.enabled) return { title: 'Blocking is off', detail: 'Turn it on to stop Shorts and Reels again.' };
  if (config.pausedUntil > now) {
    return { title: `Paused until ${clockTime(config.pausedUntil)}`, detail: 'Blocking comes back on by itself.' };
  }
  if (status?.platform === 'ios') {
    if (config.iosMode === 'budget') {
      return status.budgetExhaustedToday
        ? { title: 'Today’s allowance is used up', detail: 'Locked until midnight.' }
        : { title: `${config.dailyBudgetMinutes} minutes a day`, detail: 'Apps lock when the time runs out.' };
    }
    return { title: 'Your chosen apps are locked', detail: 'Use Safari for feed, Stories and messages.' };
  }
  if (config.youtubeShorts && config.instagramReels) return { title: 'Blocking is on', detail: 'Shorts and Reels close as soon as they open.' };
  if (config.youtubeShorts) return { title: 'Blocking YouTube Shorts', detail: 'Instagram Reels are allowed.' };
  if (config.instagramReels) return { title: 'Blocking Instagram Reels', detail: 'YouTube Shorts are allowed.' };
  return { title: 'Nothing to block', detail: 'Both apps are switched off below.' };
}

const styles = StyleSheet.create({
  hero: { borderRadius: radius.hero, padding: space.xl, gap: space.lg },
  heroTop: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  counter: { flexDirection: 'row', alignItems: 'flex-end', gap: space.md, marginTop: space.sm },
  counterLabel: { paddingBottom: 12 },
  split: { flexDirection: 'row', gap: space.lg },
  inset: { paddingHorizontal: space.lg, paddingBottom: space.md },
});
