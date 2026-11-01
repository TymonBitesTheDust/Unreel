export type AppKey = 'youtube' | 'instagram';

/** Settings understood by the native side. Each platform ignores the keys that don't apply to it. */
export type BlockerConfig = {
  enabled: boolean;
  /** Epoch ms; 0 = not paused. Enforced natively, so a pause ends even if the app never reopens. */
  pausedUntil: number;

  // Android: in-app detection of the feed.
  youtubeShorts: boolean;
  instagramReels: boolean;
  /** Let one reel/short opened from a DM or link play; block swiping to the next. */
  allowSharedReels: boolean;
  /** Full-screen pause card after redirecting (otherwise a toast). */
  interstitial: boolean;
  /**
   * Time limits: the feeds play until `quotaDailyMinutes` a day or `quotaHourlyMinutes` in the
   * current clock hour are used up (YouTube and Instagram combined), then they're blocked.
   */
  quotaEnabled: boolean;
  quotaDailyMinutes: number;
  quotaHourlyMinutes: number;

  // iOS: whole-app shields via Screen Time.
  iosMode: 'always' | 'budget';
  dailyBudgetMinutes: number;
};

export type ConfigPatch = Partial<BlockerConfig>;

export type DayStats = {
  /** Local calendar day, yyyy-MM-dd. */
  date: string;
  total: number;
  youtube: number;
  instagram: number;
};

/** (android) Today's and this hour's use of the time limits. Times are ms; instants are epoch ms. */
export type QuotaStatus = {
  dailyLimitMinutes: number;
  hourlyLimitMinutes: number;
  usedTodayMs: number;
  usedThisHourMs: number;
  leftTodayMs: number;
  leftThisHourMs: number;
  /** What can be watched right now: the smaller of the two. */
  leftMs: number;
  /** Which allowance ran out; 'day' when both have. */
  exhausted: 'day' | 'hour' | null;
  /** When the feeds play again, or null while there's time left. */
  availableAt: number | null;
  /** The next clock hour, when the hourly allowance refills. */
  hourEndsAt: number;
  dayEndsAt: number;
};

export type BlockStats = {
  /** Oldest first, one entry per day including empty days. */
  days: DayStats[];
  today: DayStats;
  allTime: number;
};

export type AndroidStatus = {
  platform: 'android';
  sdkInt: number;
  /** User switched the service on in Settings → Accessibility. */
  serviceEnabled: boolean;
  /** The service is actually bound and running in our process right now. */
  serviceRunning: boolean;
  lastEventAt: number;
  installed: Record<AppKey, boolean>;
  rulesVersion: number;
  rulesSource: 'bundled' | 'override';
};

export type IOSStatus = {
  platform: 'ios';
  authorization: 'notDetermined' | 'denied' | 'approved' | 'unknown';
  appGroupReachable: boolean;
  selection: { applications: number; categories: number; webDomains: number };
  shieldActive: boolean;
  budgetExhaustedToday: boolean;
};

export type NativeStatus = AndroidStatus | IOSStatus;

export type BlockedEvent = {
  app: AppKey;
  feature: 'shorts' | 'reels';
  /** tab: opened the feed tab · player: full-screen player · swipe/limit: past a shared one · quota: time ran out mid-feed */
  trigger: 'tab' | 'player' | 'swipe' | 'limit' | 'quota';
  method: 'exitTab' | 'back' | 'home';
  at: number;
  todayTotal: number;
};

export type RulesInfo = { version: number; source: 'bundled' | 'override' };

export type SelectionSummary = IOSStatus['selection'];

export type UnreelBlockerEvents = {
  onBlocked(event: BlockedEvent): void;
  onServiceStateChanged(event: { running: boolean }): void;
};
