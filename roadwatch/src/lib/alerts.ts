/**
 * How a warning reaches the driver.
 *
 * - App in front: the on-screen banner, plus the alert sound (expo-audio), a spoken warning and a
 *   vibration. No system notification, so nothing beeps twice.
 * - App in the background (Google Maps or Waze in front, or the screen off): a high-priority
 *   notification that plays the same alert sound, plus the spoken warning.
 */
import { createAudioPlayer, setAudioModeAsync, type AudioPlayer } from 'expo-audio';
import * as Haptics from 'expo-haptics';
import * as Notifications from 'expo-notifications';
import * as Speech from 'expo-speech';
import { Platform } from 'react-native';

import { formatDistance } from './geo';
import { KIND_INFO, type Hazard } from './hazards';
import type { Nearby } from './proximity';
import type { Settings } from './settings';

/** Bundled by the expo-notifications config plugin (Android res/raw, iOS app bundle). */
const SOUND_FILE = 'radar_alert.wav';
// Android channels can't change sound after creation, so there is one per sound setting.
const CHANNEL_SOUND = 'hazard-alerts';
const CHANNEL_SILENT = 'hazard-alerts-silent';

let player: AudioPlayer | null = null;
let ready: Promise<void> | null = null;

export function initAlerts(): Promise<void> {
  ready ??= (async () => {
    Notifications.setNotificationHandler({
      handleNotification: async () => ({
        shouldShowBanner: true,
        shouldShowList: true,
        shouldPlaySound: true,
        shouldSetBadge: false,
      }),
    });
    if (Platform.OS === 'android') {
      const common = {
        importance: Notifications.AndroidImportance.MAX,
        lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
        vibrationPattern: [0, 350, 150, 350],
        enableVibrate: true,
      };
      await Notifications.setNotificationChannelAsync(CHANNEL_SOUND, {
        ...common,
        name: 'Police and camera alerts',
        description: 'Warnings before police, speed cameras and traffic cameras',
        sound: SOUND_FILE,
        // Navigation-guidance audio plays on the media volume, like Google Maps and Waze voice.
        audioAttributes: {
          usage: Notifications.AndroidAudioUsage.ASSISTANCE_NAVIGATION_GUIDANCE,
          contentType: Notifications.AndroidAudioContentType.SONIFICATION,
        },
      });
      await Notifications.setNotificationChannelAsync(CHANNEL_SILENT, {
        ...common,
        name: 'Police and camera alerts (no sound)',
        description: 'Used when alert sounds are off in RoadWatch settings',
        sound: null,
      });
    }
    // Mix with music instead of pausing it, and play even with the iPhone's silent switch on.
    await setAudioModeAsync({
      playsInSilentMode: true,
      interruptionMode: 'mixWithOthers',
      shouldPlayInBackground: true,
    });
  })().catch((e) => {
    ready = null;
    console.warn('Alert setup failed', e);
  });
  return ready;
}

export async function requestNotificationPermission(): Promise<boolean> {
  await initAlerts(); // Android 13 only shows the prompt once a channel exists.
  const current = await Notifications.getPermissionsAsync();
  if (current.granted) return true;
  const asked = await Notifications.requestPermissionsAsync({
    ios: { allowAlert: true, allowSound: true, allowBadge: false },
  });
  return asked.granted;
}

function headline(hazard: Hazard, metres: number): string {
  return `${KIND_INFO[hazard.kind].emoji} ${hazard.label} in ${formatDistance(metres)}`;
}

function details(hazard: Hazard): string {
  return [hazard.speedLimit && `Limit ${hazard.speedLimit}`, hazard.street].filter(Boolean).join(' · ');
}

function spoken(items: Nearby[]): string {
  const first = items[0];
  const metres = Math.round(first.distance / 50) * 50 || Math.round(first.distance);
  let text = `${first.hazard.label} ahead, ${metres} metres.`;
  if (first.hazard.speedLimit) text += ` Limit ${first.hazard.speedLimit.replace('km/h', 'kilometres per hour')}.`;
  if (items.length > 1) text += ` And ${items.length - 1} more.`;
  return text;
}

function beep() {
  try {
    player ??= createAudioPlayer(require('../../assets/sounds/radar_alert.wav'));
    player.volume = 1;
    player.seekTo(0).catch(() => {});
    player.play();
  } catch (e) {
    console.warn('Alert sound failed', e);
  }
}

/** Announce hazards that just came into range. */
export async function announce(items: Nearby[], settings: Settings, appActive: boolean): Promise<void> {
  if (items.length === 0) return;
  await initAlerts();
  const first = items[0];

  if (appActive) {
    if (settings.sound) beep();
    if (settings.vibrate) Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => {});
  } else {
    const more = items.length > 1 ? ` (+${items.length - 1} more)` : '';
    await Notifications.scheduleNotificationAsync({
      identifier: `hazard-${first.hazard.id}`,
      content: {
        title: headline(first.hazard, first.distance) + more,
        body: details(first.hazard) || 'Drive carefully',
        sound: settings.sound ? SOUND_FILE : false,
        vibrate: settings.vibrate ? [0, 350, 150, 350] : undefined,
        interruptionLevel: 'timeSensitive',
        priority: Notifications.AndroidNotificationPriority.MAX,
        data: { hazardId: first.hazard.id },
      },
      trigger: Platform.OS === 'android' ? { channelId: settings.sound ? CHANNEL_SOUND : CHANNEL_SILENT } : null,
    }).catch((e) => console.warn('Alert notification failed', e));
  }

  if (settings.voice) {
    // Let the beep finish first.
    setTimeout(() => Speech.speak(spoken(items), { rate: 1.0 }), settings.sound ? 900 : 0);
  }
}

/** For the settings screen: a sample warning now, and a notification a few seconds later. */
export async function sendTestAlerts(settings: Settings, appActive: boolean): Promise<void> {
  const sample: Nearby = {
    distance: settings.alertDistance,
    hazard: {
      id: 'test',
      kind: 'speed_camera',
      source: 'report',
      label: 'Speed camera',
      speedLimit: '50 km/h',
      latitude: 0,
      longitude: 0,
    },
  };
  await announce([sample], settings, appActive);
  await Notifications.scheduleNotificationAsync({
    content: {
      title: headline(sample.hazard, sample.distance),
      body: 'Test alert from RoadWatch. This is how warnings look while you use Google Maps or Waze.',
      sound: settings.sound ? SOUND_FILE : false,
      interruptionLevel: 'timeSensitive',
    },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,
      seconds: 5,
      channelId: settings.sound ? CHANNEL_SOUND : CHANNEL_SILENT,
    },
  });
}
