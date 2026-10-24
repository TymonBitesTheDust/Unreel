import * as Crypto from 'expo-crypto';
import * as SecureStore from 'expo-secure-store';

import type { BlockerConfig, ConfigPatch } from './blocker';

/**
 * Friction: the things that stand between an impulse and turning the blocker off.
 *
 * Any *loosening* change (turn off, pause, stop blocking one app, shorten the delay, remove the
 * PIN) goes through the same gate:
 *   PIN (if set)  →  wait `unlockDelaySec`  →  confirm within CONFIRM_WINDOW_MS  →  applied.
 * Tightening changes (turn on, add an app, lengthen the delay) apply immediately.
 *
 * Threat model, stated honestly: this protects the user from their own impulses, not from a
 * determined attacker. Someone can always revoke the system permission in Settings; the PIN hash
 * is salted SHA-256 because a 4–8 digit PIN can't be made brute-force-proof anyway.
 */

export type FrictionSettings = {
  /** 0 = no delay. */
  unlockDelaySec: number;
  pinHash: string | null;
  pinSalt: string | null;
  failedAttempts: number;
  /** Epoch ms; PIN entry refused until then after too many wrong attempts. */
  lockedUntil: number;
};

export type PendingChange = {
  /** Shown to the user while they wait, e.g. "Pause for 1 hour". */
  label: string;
  config?: ConfigPatch;
  /** Resolved to `pausedUntil` at confirm time, so the pause starts when it's confirmed. */
  pauseMinutes?: number;
  /** Pause until the next local midnight (resolved at confirm time). */
  pauseUntilMidnight?: boolean;
  friction?: { unlockDelaySec?: number; removePin?: boolean };
};

export type UnlockRequest = {
  change: PendingChange;
  requestedAt: number;
  readyAt: number;
  expiresAt: number;
};

export const DELAY_OPTIONS_SEC = [0, 60, 5 * 60, 15 * 60, 30 * 60] as const;
export const CONFIRM_WINDOW_MS = 2 * 60_000;
export const MAX_PIN_ATTEMPTS = 5;
export const PIN_LOCKOUT_MS = 5 * 60_000;
export const PIN_PATTERN = /^\d{4,8}$/;

const SETTINGS_KEY = 'unreel.friction.v1';
const REQUEST_KEY = 'unreel.unlockRequest.v1';

const DEFAULT_SETTINGS: FrictionSettings = {
  unlockDelaySec: 5 * 60,
  pinHash: null,
  pinSalt: null,
  failedAttempts: 0,
  lockedUntil: 0,
};

// ---- Persistence -----------------------------------------------------------------------------

// Storage failures (keychain locked during a restore, unavailable on web) must never leave the
// gate unusable: reads fall back to defaults and writes are best-effort, so the flow continues
// in memory for this session.

async function read(key: string): Promise<string | null> {
  try {
    return await SecureStore.getItemAsync(key);
  } catch (e) {
    console.warn(`[friction] could not read ${key}`, e);
    return null;
  }
}

async function write(key: string, value: string | null): Promise<void> {
  try {
    if (value === null) await SecureStore.deleteItemAsync(key);
    else await SecureStore.setItemAsync(key, value);
  } catch (e) {
    console.warn(`[friction] could not write ${key}`, e);
  }
}

export async function loadFriction(): Promise<FrictionSettings> {
  const raw = await read(SETTINGS_KEY);
  if (!raw) return { ...DEFAULT_SETTINGS };
  try {
    return { ...DEFAULT_SETTINGS, ...(JSON.parse(raw) as Partial<FrictionSettings>) };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export async function saveFriction(settings: FrictionSettings): Promise<void> {
  await write(SETTINGS_KEY, JSON.stringify(settings));
}

export async function loadRequest(now = Date.now()): Promise<UnlockRequest | null> {
  const raw = await read(REQUEST_KEY);
  if (!raw) return null;
  try {
    const request = JSON.parse(raw) as UnlockRequest;
    if (now > request.expiresAt) {
      await clearRequest();
      return null;
    }
    return request;
  } catch {
    await clearRequest();
    return null;
  }
}

export async function saveRequest(request: UnlockRequest): Promise<void> {
  await write(REQUEST_KEY, JSON.stringify(request));
}

export async function clearRequest(): Promise<void> {
  await write(REQUEST_KEY, null);
}

export function createRequest(change: PendingChange, delaySec: number, now = Date.now()): UnlockRequest {
  const readyAt = now + delaySec * 1000;
  return { change, requestedAt: now, readyAt, expiresAt: readyAt + CONFIRM_WINDOW_MS };
}

// ---- PIN -------------------------------------------------------------------------------------

async function hashPin(pin: string, salt: string): Promise<string> {
  return Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, `${salt}:${pin}`);
}

export async function setPin(settings: FrictionSettings, pin: string): Promise<FrictionSettings> {
  if (!PIN_PATTERN.test(pin)) throw new Error('PIN must be 4 to 8 digits');
  const salt = Crypto.randomUUID();
  const next = { ...settings, pinSalt: salt, pinHash: await hashPin(pin, salt), failedAttempts: 0, lockedUntil: 0 };
  await saveFriction(next);
  return next;
}

export type PinCheck =
  | { result: 'ok'; settings: FrictionSettings }
  | { result: 'wrong'; settings: FrictionSettings; attemptsLeft: number }
  | { result: 'locked'; settings: FrictionSettings; until: number };

export async function verifyPin(settings: FrictionSettings, pin: string, now = Date.now()): Promise<PinCheck> {
  if (!settings.pinHash || !settings.pinSalt) return { result: 'ok', settings };
  if (now < settings.lockedUntil) return { result: 'locked', settings, until: settings.lockedUntil };

  if ((await hashPin(pin, settings.pinSalt)) === settings.pinHash) {
    const next = { ...settings, failedAttempts: 0, lockedUntil: 0 };
    await saveFriction(next);
    return { result: 'ok', settings: next };
  }

  const failed = settings.failedAttempts + 1;
  if (failed >= MAX_PIN_ATTEMPTS) {
    const next = { ...settings, failedAttempts: 0, lockedUntil: now + PIN_LOCKOUT_MS };
    await saveFriction(next);
    return { result: 'locked', settings: next, until: next.lockedUntil };
  }
  const next = { ...settings, failedAttempts: failed };
  await saveFriction(next);
  return { result: 'wrong', settings: next, attemptsLeft: MAX_PIN_ATTEMPTS - failed };
}

// ---- Classifying changes ---------------------------------------------------------------------

/** True if applying `patch` to `current` would block less than today. */
export function isLoosening(patch: ConfigPatch, current: BlockerConfig): boolean {
  const turnsOff = (key: 'enabled' | 'youtubeShorts' | 'instagramReels') =>
    patch[key] === false && current[key] === true;

  if (turnsOff('enabled') || turnsOff('youtubeShorts') || turnsOff('instagramReels')) return true;
  if (patch.allowSharedReels === true && !current.allowSharedReels) return true;
  if (patch.pausedUntil !== undefined && patch.pausedUntil > Math.max(current.pausedUntil, Date.now())) return true;
  if (patch.iosMode === 'budget' && current.iosMode === 'always') return true;
  if (
    patch.dailyBudgetMinutes !== undefined &&
    patch.dailyBudgetMinutes > current.dailyBudgetMinutes &&
    (patch.iosMode ?? current.iosMode) === 'budget'
  ) {
    return true;
  }
  return false;
}

export function isFrictionLoosening(change: PendingChange['friction'], settings: FrictionSettings): boolean {
  if (!change) return false;
  if (change.removePin && settings.pinHash) return true;
  if (change.unlockDelaySec !== undefined && change.unlockDelaySec < settings.unlockDelaySec) return true;
  return false;
}
