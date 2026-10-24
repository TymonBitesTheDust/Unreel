import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

import { PinSheet } from '../components/PinSheet';
import type { ConfigPatch } from '../lib/blocker';
import {
  clearRequest,
  createRequest,
  loadFriction,
  loadRequest,
  saveFriction,
  saveRequest,
  setPin as storePin,
  verifyPin,
  type FrictionSettings,
  type PendingChange,
  type UnlockRequest,
} from '../lib/friction';
import { MINUTE, nextMidnight } from '../lib/time';
import { useBlocker } from './BlockerProvider';

type FrictionState = {
  settings: FrictionSettings | null;
  pending: UnlockRequest | null;
  /** Ticks every second while a request is pending, so countdowns re-render. */
  now: number;
  hasPin: boolean;
  /** Route a loosening change through PIN → delay → confirm. */
  ask(change: PendingChange): void;
  /** Applies the pending change if its wait is over and it hasn't expired. */
  confirmPending(): Promise<void>;
  cancelPending(): Promise<void>;
  /** Tightening: applies immediately. */
  lengthenDelay(seconds: number): Promise<void>;
  /** Opens the create-PIN sheet (only when no PIN is set). */
  startPinSetup(): void;
};

const FrictionContext = createContext<FrictionState | null>(null);

type Sheet = { mode: 'verify'; change: PendingChange } | { mode: 'create' } | null;

export function FrictionProvider({ children }: { children: ReactNode }) {
  const { applyConfig } = useBlocker();
  const [settings, setSettings] = useState<FrictionSettings | null>(null);
  const [pending, setPending] = useState<UnlockRequest | null>(null);
  const [now, setNow] = useState(Date.now());
  const [sheet, setSheet] = useState<Sheet>(null);

  useEffect(() => {
    void loadFriction().then(setSettings);
    void loadRequest().then(setPending);
  }, []);

  // One clock for every countdown on screen; only runs while something is waiting.
  useEffect(() => {
    if (!pending) return;
    const id = setInterval(() => {
      const t = Date.now();
      setNow(t);
      if (t > pending.expiresAt) {
        setPending(null);
        void clearRequest();
      }
    }, 1000);
    return () => clearInterval(id);
  }, [pending]);

  const apply = useCallback(
    async (change: PendingChange) => {
      const patch: ConfigPatch = { ...change.config };
      if (change.pauseMinutes) patch.pausedUntil = Date.now() + change.pauseMinutes * MINUTE;
      if (change.pauseUntilMidnight) patch.pausedUntil = nextMidnight();
      if (Object.keys(patch).length > 0) await applyConfig(patch);

      if (change.friction && settings) {
        const next: FrictionSettings = { ...settings };
        if (change.friction.unlockDelaySec !== undefined) next.unlockDelaySec = change.friction.unlockDelaySec;
        if (change.friction.removePin) {
          next.pinHash = null;
          next.pinSalt = null;
        }
        await saveFriction(next);
        setSettings(next);
      }
    },
    [applyConfig, settings],
  );

  /** After the PIN (if any) is cleared: wait, or apply straight away when there's no delay. */
  const afterPin = useCallback(
    async (change: PendingChange, current: FrictionSettings) => {
      if (current.unlockDelaySec <= 0) {
        await apply(change);
        return;
      }
      const request = createRequest(change, current.unlockDelaySec);
      await saveRequest(request);
      setNow(Date.now());
      setPending(request);
    },
    [apply],
  );

  const ask = useCallback(
    (change: PendingChange) => {
      if (!settings) return;
      if (settings.pinHash) {
        setSheet({ mode: 'verify', change });
      } else {
        void afterPin(change, settings);
      }
    },
    [settings, afterPin],
  );

  const confirmPending = useCallback(async () => {
    const t = Date.now();
    if (!pending || t < pending.readyAt || t > pending.expiresAt) return;
    const change = pending.change;
    setPending(null);
    await clearRequest();
    await apply(change);
  }, [pending, apply]);

  const cancelPending = useCallback(async () => {
    setPending(null);
    await clearRequest();
  }, []);

  const lengthenDelay = useCallback(
    async (seconds: number) => {
      if (!settings || seconds <= settings.unlockDelaySec) return;
      const next = { ...settings, unlockDelaySec: seconds };
      await saveFriction(next);
      setSettings(next);
    },
    [settings],
  );

  const handlePin = useCallback(
    async (pin: string): Promise<string | null> => {
      if (!settings || !sheet) return null;
      if (sheet.mode === 'create') {
        setSettings(await storePin(settings, pin));
        setSheet(null);
        return null;
      }
      const check = await verifyPin(settings, pin);
      setSettings(check.settings);
      if (check.result === 'ok') {
        const change = sheet.change;
        setSheet(null);
        await afterPin(change, check.settings);
        return null;
      }
      if (check.result === 'locked') {
        const minutes = Math.max(1, Math.ceil((check.until - Date.now()) / MINUTE));
        return `Too many wrong PINs. Try again in ${minutes} min.`;
      }
      return `That PIN isn't right. ${check.attemptsLeft} ${check.attemptsLeft === 1 ? 'try' : 'tries'} left.`;
    },
    [settings, sheet, afterPin],
  );

  const value = useMemo<FrictionState>(
    () => ({
      settings,
      pending,
      now,
      hasPin: !!settings?.pinHash,
      ask,
      confirmPending,
      cancelPending,
      lengthenDelay,
      startPinSetup: () => setSheet({ mode: 'create' }),
    }),
    [settings, pending, now, ask, confirmPending, cancelPending, lengthenDelay],
  );

  return (
    <FrictionContext.Provider value={value}>
      {children}
      <PinSheet
        visible={sheet !== null}
        mode={sheet?.mode ?? 'verify'}
        actionLabel={sheet?.mode === 'verify' ? sheet.change.label : undefined}
        onSubmit={handlePin}
        onCancel={() => setSheet(null)}
      />
    </FrictionContext.Provider>
  );
}

export function useFriction(): FrictionState {
  const ctx = useContext(FrictionContext);
  if (!ctx) throw new Error('useFriction must be used inside <FrictionProvider>');
  return ctx;
}
