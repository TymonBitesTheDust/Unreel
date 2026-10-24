import * as SecureStore from 'expo-secure-store';

import { android, isAvailable, platform, type RulesInfo } from './blocker';

/**
 * Optional over-the-air detection rules (Android).
 *
 * When YouTube or Instagram rename a view, blocking breaks until the IDs are updated. Host a
 * rules JSON (same schema as modules/unreel-blocker/android/src/main/assets/unreel_rules.json,
 * with a higher `version`) and set EXPO_PUBLIC_UNREEL_RULES_URL at build time. The native side
 * validates the document and ignores anything older than what's bundled, so a bad push can't
 * switch blocking off.
 *
 * Leave the variable unset to ship with bundled rules only (no network access needed).
 */
export const RULES_URL = process.env.EXPO_PUBLIC_UNREEL_RULES_URL ?? '';

const CHECKED_AT_KEY = 'unreel.rulesCheckedAt';
const CHECK_INTERVAL_MS = 12 * 60 * 60_000;
const TIMEOUT_MS = 8_000;

export type RuleUpdateResult =
  | { kind: 'updated'; info: RulesInfo }
  | { kind: 'current' }
  | { kind: 'skipped' }
  | { kind: 'failed'; message: string };

export async function checkForRuleUpdate({ force = false } = {}): Promise<RuleUpdateResult> {
  if (!RULES_URL || platform !== 'android' || !isAvailable) return { kind: 'skipped' };

  const now = Date.now();
  if (!force) {
    const last = Number((await SecureStore.getItemAsync(CHECKED_AT_KEY).catch(() => null)) ?? 0);
    if (now - last < CHECK_INTERVAL_MS) return { kind: 'skipped' };
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(RULES_URL, { signal: controller.signal, headers: { Accept: 'application/json' } });
    if (!res.ok) return { kind: 'failed', message: `Server answered ${res.status}` };
    const json = await res.text();
    await SecureStore.setItemAsync(CHECKED_AT_KEY, String(now)).catch(() => undefined);
    try {
      return { kind: 'updated', info: android.updateRules(json) };
    } catch (e) {
      // "older than the bundled" is the normal case right after an app update.
      const message = e instanceof Error ? e.message : String(e);
      return /older than/i.test(message) ? { kind: 'current' } : { kind: 'failed', message };
    }
  } catch (e) {
    return { kind: 'failed', message: e instanceof Error ? e.message : String(e) };
  } finally {
    clearTimeout(timer);
  }
}
