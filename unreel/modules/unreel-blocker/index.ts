import { Platform } from 'react-native';

import NativeOrNull, { type UnreelBlockerNativeModule } from './src/UnreelBlockerModule';
import type {
  AndroidStatus,
  BlockStats,
  BlockedEvent,
  BlockerConfig,
  ConfigPatch,
  IOSStatus,
  NativeStatus,
  RulesInfo,
  SelectionSummary,
} from './src/UnreelBlocker.types';

export * from './src/UnreelBlocker.types';

/** False in Expo Go / web: blocking needs a development or store build with the native module. */
export const isAvailable = NativeOrNull != null;

function native(): UnreelBlockerNativeModule {
  if (!NativeOrNull) {
    throw new Error('UnreelBlocker native module is missing. Build the app with `npx expo run:android` or `run:ios`.');
  }
  return NativeOrNull;
}

export const DEFAULT_CONFIG: BlockerConfig = {
  enabled: true,
  pausedUntil: 0,
  youtubeShorts: true,
  instagramReels: true,
  allowSharedReels: true,
  interstitial: true,
  iosMode: 'always',
  dailyBudgetMinutes: 15,
};

/** iOS can't schedule a pause shorter than this (DeviceActivity minimum interval). */
export const MIN_IOS_PAUSE_MINUTES = 15;

export function getStatus(): NativeStatus {
  return native().getStatus();
}

/** True when blocking can actually happen on this device. */
export function isReady(status: NativeStatus): boolean {
  if (status.platform === 'android') return status.serviceEnabled && status.serviceRunning;
  const s = status.selection;
  return status.authorization === 'approved' && s.applications + s.categories + s.webDomains > 0;
}

export function getConfig(): BlockerConfig {
  return { ...DEFAULT_CONFIG, ...native().getConfig() };
}

export async function setConfig(patch: ConfigPatch): Promise<BlockerConfig> {
  return { ...DEFAULT_CONFIG, ...(await native().setConfig(patch)) };
}

export function getStats(days = 7): BlockStats {
  return native().getStats(days);
}

export function resetStats(): void {
  native().resetStats();
}

type Subscription = { remove(): void };
const noop: Subscription = { remove() {} };

/** Live block events (Android only — iOS shields run in extensions that can't reach the app). */
export function addBlockedListener(listener: (event: BlockedEvent) => void): Subscription {
  return NativeOrNull ? NativeOrNull.addListener('onBlocked', listener) : noop;
}

export function addServiceStateListener(listener: (event: { running: boolean }) => void): Subscription {
  return NativeOrNull ? NativeOrNull.addListener('onServiceStateChanged', listener) : noop;
}

// ---- Android ---------------------------------------------------------------------------------

export const android = {
  openServiceSettings(): boolean {
    return native().openServiceSettings?.() ?? false;
  },
  openAppInfo(): boolean {
    return native().openAppInfo?.() ?? false;
  },
  updateRules(json: string): RulesInfo {
    const fn = native().updateRules;
    if (!fn) throw new Error('updateRules is Android-only');
    return fn.call(native(), json);
  },
  resetRules(): RulesInfo | null {
    return native().resetRules?.() ?? null;
  },
  status(status: NativeStatus | null): AndroidStatus | null {
    return status?.platform === 'android' ? status : null;
  },
};

// ---- iOS -------------------------------------------------------------------------------------

export const ios = {
  async requestAuthorization(): Promise<IOSStatus['authorization']> {
    const m = native();
    if (!m.requestAuthorization) throw new Error('requestAuthorization is iOS-only');
    return (await m.requestAuthorization()) as IOSStatus['authorization'];
  },
  async presentAppPicker(): Promise<SelectionSummary | null> {
    const m = native();
    if (!m.presentAppPicker) throw new Error('presentAppPicker is iOS-only');
    return m.presentAppPicker();
  },
  status(status: NativeStatus | null): IOSStatus | null {
    return status?.platform === 'ios' ? status : null;
  },
};

export const platform: 'ios' | 'android' = Platform.OS === 'ios' ? 'ios' : 'android';
