import type { HazardKind } from './hazards';
import { readJSON, writeJSON } from './storage';

export type Settings = {
  /** Metres before a hazard to warn. */
  alertDistance: number;
  kinds: Record<HazardKind, boolean>;
  aheadOnly: boolean;
  sound: boolean;
  voice: boolean;
  vibrate: boolean;
  showTraffic: boolean;
  osmEnabled: boolean;
  /** A Waze for Cities partner feed URL, or empty. */
  wazeFeedUrl: string;
  onboarded: boolean;
};

export const ALERT_DISTANCES = [100, 200, 300, 500] as const;

export const DEFAULT_SETTINGS: Settings = {
  alertDistance: 200,
  kinds: { police: true, speed_camera: true, traffic_camera: true },
  aheadOnly: true,
  sound: true,
  voice: true,
  vibrate: true,
  showTraffic: true,
  osmEnabled: true,
  wazeFeedUrl: '',
  onboarded: false,
};

const KEY = 'settings.v1';

export function loadSettings(): Settings {
  const saved = readJSON<Partial<Settings>>(KEY, {});
  return { ...DEFAULT_SETTINGS, ...saved, kinds: { ...DEFAULT_SETTINGS.kinds, ...saved.kinds } };
}

export function saveSettings(settings: Settings): void {
  writeJSON(KEY, settings);
}
