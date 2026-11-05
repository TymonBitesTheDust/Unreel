import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { AppState } from 'react-native';

import * as Blocker from '../lib/blocker';
import { checkForRuleUpdate } from '../lib/rules';

type BlockerState = {
  available: boolean;
  status: Blocker.NativeStatus | null;
  config: Blocker.BlockerConfig;
  stats: Blocker.BlockStats | null;
  /** Android: today's and this hour's use of the time limits. */
  quota: Blocker.QuotaStatus | null;
  /** Android: the last 7 days of time in each part of YouTube and Instagram. */
  screenTime: Blocker.ScreenTime | null;
  ready: boolean;
  /** Bumps on each live block event so the dashboard can animate the newest frame. */
  lastEvent: Blocker.BlockedEvent | null;
  error: string | null;
  refresh(): void;
  /** Applies a change immediately. Screens should go through useFriction().request for loosening. */
  applyConfig(patch: Blocker.ConfigPatch): Promise<void>;
};

const BlockerContext = createContext<BlockerState | null>(null);

const STATS_DAYS = 7;
const POLL_MS = 30_000;

export function BlockerProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<Blocker.NativeStatus | null>(null);
  const [config, setConfigState] = useState<Blocker.BlockerConfig>(Blocker.DEFAULT_CONFIG);
  const [stats, setStats] = useState<Blocker.BlockStats | null>(null);
  const [quota, setQuota] = useState<Blocker.QuotaStatus | null>(null);
  const [screenTime, setScreenTime] = useState<Blocker.ScreenTime | null>(null);
  const [lastEvent, setLastEvent] = useState<Blocker.BlockedEvent | null>(null);
  const [error, setError] = useState<string | null>(null);
  const appState = useRef(AppState.currentState);

  const refresh = useCallback(() => {
    if (!Blocker.isAvailable) return;
    try {
      setStatus(Blocker.getStatus());
      setConfigState(Blocker.getConfig());
      setStats(Blocker.getStats(STATS_DAYS));
      setQuota(Blocker.android.getQuota());
      setScreenTime(Blocker.android.getScreenTime(STATS_DAYS));
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, []);

  const applyConfig = useCallback(async (patch: Blocker.ConfigPatch) => {
    try {
      setConfigState(await Blocker.setConfig(patch));
      setStatus(Blocker.getStatus());
      setQuota(Blocker.android.getQuota()); // Limits changed, so what's left did too.
      setError(null);
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      setError(message);
      throw e;
    }
  }, []);

  useEffect(() => {
    refresh();
    void checkForRuleUpdate().then((r) => r.kind === 'updated' && refresh());

    // Coming back from system Settings is the moment permissions change; re-read everything.
    const appSub = AppState.addEventListener('change', (next) => {
      if (appState.current?.match(/inactive|background/) && next === 'active') {
        refresh();
        void checkForRuleUpdate().then((r) => r.kind === 'updated' && refresh());
      }
      appState.current = next;
    });

    const blockSub = Blocker.addBlockedListener((event) => {
      setLastEvent(event);
      setStats(Blocker.getStats(STATS_DAYS));
      setQuota(Blocker.android.getQuota());
    });
    const serviceSub = Blocker.addServiceStateListener(() => refresh());

    // Pauses expire, hourly allowances refill and iOS counters change in extensions without telling us.
    const poll = setInterval(() => {
      if (AppState.currentState === 'active') refresh();
    }, POLL_MS);

    return () => {
      appSub.remove();
      blockSub.remove();
      serviceSub.remove();
      clearInterval(poll);
    };
  }, [refresh]);

  const value = useMemo<BlockerState>(
    () => ({
      available: Blocker.isAvailable,
      status,
      config,
      stats,
      quota,
      screenTime,
      ready: status ? Blocker.isReady(status) : false,
      lastEvent,
      error,
      refresh,
      applyConfig,
    }),
    [status, config, stats, quota, screenTime, lastEvent, error, refresh, applyConfig],
  );

  return <BlockerContext.Provider value={value}>{children}</BlockerContext.Provider>;
}

export function useBlocker(): BlockerState {
  const ctx = useContext(BlockerContext);
  if (!ctx) throw new Error('useBlocker must be used inside <BlockerProvider>');
  return ctx;
}
