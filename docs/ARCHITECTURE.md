# Unreel — technical guide

Unreel blocks the **YouTube Shorts** and **Instagram Reels** feeds while leaving the rest of both apps usable: search, long videos, feed posts, Stories and DMs keep working.

This document covers what each platform allows, the stack choice, how the codebase is put together, and the failure modes you'll meet in production.

---

## 0. Strategy in one page

The two platforms allow fundamentally different things, so the app uses a different mechanism on each and shares only the UI.

| | Android | iOS |
|---|---|---|
| Can a third-party app see *inside* YouTube / Instagram? | **Yes**, through an `AccessibilityService` the user switches on | **No.** The sandbox gives no API for another app's UI |
| What Unreel blocks | Exactly the Shorts / Reels feed, wherever it opens | The **whole** app (Screen Time shield), always or after a daily allowance |
| Selective blocking | Native, in-app | Only on the **websites**, via a Safari Web Extension |
| Intervention | Tap the app's Home tab (or Back), then an optional full-screen pause card | Apple's shield screen, styled by Unreel |
| Runs while Unreel is closed | Yes, the service is bound by the system | Yes, DeviceActivity extensions are launched by the system |

```
                 ┌──────────────── React Native (Expo Router) ────────────────┐
                 │ Dashboard · Setup · Settings · Friction gate (PIN, delay)  │
                 └───────────────┬───────────────────────────┬────────────────┘
                                 │ modules/unreel-blocker    │
                ┌────────────────▼──────────┐   ┌────────────▼─────────────────────────┐
   Android      │ UnreelBlockerModule.kt    │   │ UnreelBlockerModule.swift            │  iOS
                │  ↕ SharedPreferences      │   │  ↕ App Group UserDefaults            │
                │ ShortFormBlockerService   │   │ ManagedSettingsStore (shields)       │
                │  ├ ShortFormDetector      │   │ DeviceActivityCenter (schedules)     │
                │  ├ RulesRepository (JSON) │   │  ├ activity-monitor extension        │
                │  ├ FeedExitNavigator      │   │  ├ shield-config extension           │
                │  └ BlockOverlay           │   │  ├ shield-action extension           │
                └───────────────────────────┘   │  └ safari web extension              │
                                                └──────────────────────────────────────┘
```

---

## 1. Feasibility and system permissions

### 1.1 Android

**Options considered**

| API | What it gives you | Verdict |
|---|---|---|
| `UsageStatsManager` | Which *app* is in the foreground, coarse and delayed | Can't tell Shorts from long videos. Useful for whole-app time limits only |
| `SYSTEM_ALERT_WINDOW` overlay | Draw over other apps | Can cover the screen but can't *know* what's on it |
| **`AccessibilityService`** | Live events and the view tree of chosen apps, plus global actions (Back, Home) and its own overlay type | **The only API that can detect the Shorts/Reels screen.** Used here |

**How detection works** (`modules/unreel-blocker/android/.../service/ShortFormBlockerService.kt`)

1. The service config (`res/xml/unreel_accessibility_service.xml`) limits events to `com.google.android.youtube` and `com.instagram.android`, and sets `flagReportViewIds` (without it every `viewIdResourceName` is null).
2. `onAccessibilityEvent` copies the package, type and scroll source off the event and hands them to a worker thread. Window-state changes scan immediately; content-change and scroll events are coalesced into one scan per 150 ms.
3. A scan finds the target app's window (not always the active one: the keyboard, a dialog or our own overlay may be in front) and runs `ShortFormDetector` against the rules:
   - **Feed tab selected** → `FEED_TAB` → block. Instagram marks selection on the child `tab_icon` of `clips_tab`; YouTube on the "Shorts" pivot item.
   - **Exclusion visible** → not a feed. Instagram calls Stories "reels" internally (`reel_viewer_container`), so this guard protects Stories.
   - **Player container visible** → `PLAYER` (e.g. a reel opened from a DM, which runs in a modal with no tab bar).
4. Only **visible** nodes count: both apps keep detached fragments in the tree after you leave a tab.

**Current identifiers** (bundled in `android/src/main/assets/unreel_rules.json`, cross-checked against the open-source blockers Nudge, Tapback and Shorts Blocker, maintained through Sept 2026):

| App | Signal | Identifier |
|---|---|---|
| YouTube | Shorts player | `reel_player_page_container`, `reel_recycler`, `reel_progress_bar` |
| YouTube | Feed tab | label `Shorts` + selected state |
| Instagram | Reels player | `clips_viewer_view_pager`, `clips_video_container`, `clips_media_component` |
| Instagram | Feed tab | `clips_tab` (selected `tab_icon` child), label `Reels` |
| Instagram | Exit target | `feed_tab` |
| Instagram | Never block (Stories) | `reel_viewer_container`, `story_viewer_container` |

**Intervention** (`intervention/FeedExitNavigator.kt`, `BlockOverlay.kt`)

- From the feed tab: click the app's own **Home** tab, so the user stays in the app on an allowed screen. Playback stops because the feed fragment pauses.
- From a player: `GLOBAL_ACTION_BACK`, which returns to the DM or link it came from.
- 700 ms later the service re-checks; if the feed is still there (a bottom sheet swallowed Back), it presses Back again, then Home.
- Then either a full-screen card (`TYPE_ACCESSIBILITY_OVERLAY`, which needs **no** "Display over other apps" permission) or a toast. The card is `FLAG_NOT_FOCUSABLE` so the escalation's Back still reaches the app.
- **Shared single item:** with *Allow one shared video* on, a reel/short opened from a DM or link plays. A scroll event whose source is the vertical pager (`swipeViewIds`) means the user swiped to the next one, which is blocked. A 3-minute cap closes the loophole if a pager ID ever goes missing.

**Permissions and policy**

- `BIND_ACCESSIBILITY_SERVICE` (service-side) — the user enables it in *Settings → Accessibility*. The app can only deep-link there (`ServiceStatus.openSettings`).
- **Google Play:** apps targeting API 31+ that ship an `AccessibilityService` must complete the Accessibility declaration in Play Console, and non-accessibility-tool apps need a prominent in-app disclosure *before* sending the user to Settings. `src/app/setup.tsx` is that disclosure. Expect to supply a demo video in review.
- `isAccessibilityTool="false"` — this is a wellbeing app. Declaring `true` is a policy violation.
- **Android 13+ sideloads:** the toggle is greyed out ("Restricted setting") until the user opens *App info → ⋮ → Allow restricted settings*. The setup screen links there.
- **Advanced Protection Mode:** Android 17 extends it so that, when switched on, the system revokes and refuses accessibility access for apps that aren't accessibility tools. There's no workaround; the dashboard will show the service as not running. Explain it in support docs.

### 1.2 iOS

**The hard limit:** iOS apps can't read or control another app's UI. There's no accessibility-service equivalent for third parties, no way to inspect Instagram's view hierarchy, and no way to inject into it. **In-app, Reels-only blocking is not possible on iOS.** Anything claiming otherwise is either locking the whole app or working on the website.

**What Screen Time APIs (iOS 16+) do allow**

| Framework | Role in Unreel |
|---|---|
| **FamilyControls** | `AuthorizationCenter.requestAuthorization(for: .individual)` — the user authorizes themselves with Face ID / passcode. `FamilyActivityPicker` lets them choose Instagram and YouTube; Unreel receives opaque tokens, never bundle IDs |
| **ManagedSettings** | `ManagedSettingsStore(named: "unreel").shield.applications = tokens` puts Apple's shield over the chosen apps |
| **ManagedSettingsUI** | `ShieldConfigurationDataSource` extension styles the shield (title, subtitle, colours, button) |
| **DeviceActivity** | Repeating all-day schedule plus an optional usage-threshold event; the monitor extension runs at midnight, when a pause ends and when the allowance runs out — while Unreel itself isn't running |

**Two iOS modes** (`shared/ios/ShieldApplier.swift`):

- **Always locked** — shield whenever blocking is on and not paused.
- **Daily allowance** — `DeviceActivityEvent(threshold: N min, includesPastActivity: true)` (iOS 17.4+; counts from midnight so changing a setting mid-day can't reset the allowance). On threshold the extension marks the day exhausted and shields; the flag is keyed by date, so it clears itself at midnight.

**Entitlement:** `com.apple.developer.family-controls` works in development builds immediately. For TestFlight / App Store you must request the **distribution** entitlement from Apple. Approval is team-scoped once granted, but developers have reported waits of several weeks in 2026 — request it as soon as the bundle ID exists. All three Screen Time extensions need it too, plus the shared App Group.

**Alternatives considered**

| Approach | Why it doesn't do the job |
|---|---|
| Local VPN (`NEPacketTunnelProvider`) blocking "Reels endpoints" | Traffic is TLS: a tunnel sees host names (SNI), not paths. Reels, feed videos and Stories come from the same hosts and CDNs, so blocking them breaks the whole app, and certificate pinning defeats interception. App Store guideline 5.4 also restricts VPN apps to organisation accounts and `NEVPNManager` |
| Content filter (`NEFilterDataProvider`) | Usable by Screen Time apps on unsupervised devices, but for native apps it also sees only flows and host names, with the same problem |
| DNS filtering (`NEDNSProxyProvider`) | Host-level only; same problem |
| Shortcuts automation ("When Instagram opens → open Unreel") | Adds friction to opening the whole app; can't see Reels. A reasonable add-on, not a blocker |
| **Safari Web Extension** | **Works, on the websites.** Content scripts and `declarativeNetRequest` can rewrite `/shorts/ID` to `/watch?v=ID`, bounce `/reels/` to the home page, turn `/reel/ID` into a single post, and hide Shorts/Reels shelves. Included as `targets/safari` |

So the iOS product is: *lock the native apps with Screen Time, and use the websites in Safari, where Unreel removes only the feeds.*

---

## 2. Tech stack recommendation

**Recommendation: Expo (React Native, SDK 58 / RN 0.88) with local Expo Modules in Kotlin and Swift, and `@bacons/apple-targets` for the iOS extensions.**

The deciding fact: the parts that matter can't run in JavaScript or Dart *on either framework*. The accessibility service is Kotlin; Screen Time extensions are separate Swift processes with a few-MB memory budget where no RN or Flutter engine can run. So the question is only "what renders the dashboard, and how painful are the native targets?"

| | Expo / React Native | Flutter | Native (Kotlin + Swift) |
|---|---|---|---|
| Dashboard UI shared across platforms | Yes | Yes | No — two UIs |
| Native bridge | Expo Modules API: typed Kotlin/Swift, events, Records | Platform channels (manual serialisation) | None needed |
| iOS extension targets (4 here) | **Generated** from `targets/*/expo-target.config.js` on every prebuild, with entitlements and App Groups | Created by hand in Xcode, then kept in sync | Created in Xcode |
| Reproducible native projects | `ios/` and `android/` regenerated (CNG) | Checked-in native folders | Checked-in |
| Runtime cost | None on the hot path: detection never touches JS | Same | Lowest |

Choose **fully native** instead if you'll have separate Android and iOS engineers anyway, or plan heavy platform-specific UI (widgets, Live Activities). Flutter is a fine UI choice too; the cost is hand-managing the four Xcode extension targets.

---

## 3. Codebase

### 3.1 Directory structure

```
unreel/
├── app.json                         Bundle IDs, App Group, entitlements, plugins
├── package.json                     Scripts: android, ios, prebuild, sync:swift, typecheck
├── docs/ARCHITECTURE.md             This guide
├── shared/ios/                      SOURCE OF TRUTH for Swift shared by app + extensions
│   ├── UnreelShared.swift           App Group, config model, counters (Foundation only)
│   └── ShieldApplier.swift          Selection storage, shield sync, DeviceActivity schedules
├── scripts/sync-shared-swift.mjs    Copies shared/ios into the module and targets (--check for CI)
│
├── src/                             React Native app (Expo Router)
│   ├── app/_layout.tsx              Fonts, providers, stack
│   ├── app/index.tsx                Dashboard
│   ├── app/setup.tsx                Android prominent disclosure / iOS Screen Time setup
│   ├── app/settings.tsx             PIN, unlock delay, overlay, rules, stats
│   ├── state/BlockerProvider.tsx    Native status/config/stats, refresh on foreground + events
│   ├── state/FrictionProvider.tsx   PIN → delay → confirm gate for loosening changes
│   ├── lib/friction.ts              PIN hashing, lockout, unlock requests, isLoosening()
│   ├── lib/rules.ts                 Optional over-the-air detection rules (Android)
│   ├── lib/blocker.ts               Single import point for the native module
│   ├── components/                  FrameStrip, WeekChart, UnlockBanner, PauseSheet, PinSheet, ui
│   └── theme.ts                     Palette (light/dark), type scale, spacing
│
├── modules/unreel-blocker/          Local Expo Module
│   ├── index.ts                     Platform-aware JS API (android.*, ios.*, shared calls)
│   ├── src/UnreelBlocker.types.ts   Shared types
│   ├── android/
│   │   ├── src/main/AndroidManifest.xml          Service declaration + <queries>
│   │   ├── src/main/res/xml/unreel_accessibility_service.xml
│   │   ├── src/main/assets/unreel_rules.json     Bundled detection rules
│   │   ├── src/main/java/expo/modules/unreelblocker/
│   │   │   ├── UnreelBlockerModule.kt            JS bridge
│   │   │   ├── service/ShortFormBlockerService.kt  The accessibility service
│   │   │   ├── service/ServiceStatus.kt          Enabled? Deep links to Settings
│   │   │   ├── service/ViewIdDiagnostics.kt      Debug-only view-ID logging
│   │   │   ├── detection/                        Rules model, parser, repository, detector, tree adapter
│   │   │   ├── intervention/                     Navigator (Home/Back/escalation), overlay card
│   │   │   └── data/                             Config prefs, daily stats, in-process event bus
│   │   └── src/test/.../ShortFormDetectorTest.kt JVM tests with fake trees
│   └── ios/
│       ├── UnreelBlockerModule.swift             JS bridge: auth, picker, config, stats
│       ├── ActivityPicker.swift                  FamilyActivityPicker sheet
│       └── UnreelShared.swift, ShieldApplier.swift   (generated copies)
│
└── targets/                         iOS extensions (generated into Xcode by apple-targets)
    ├── _shared/UnreelShared.swift   (generated copy, linked into every target)
    ├── activity-monitor/            DeviceActivityMonitor: midnight, pause end, allowance
    ├── shield-config/               Shield appearance + block counter
    ├── shield-action/               Shield button handling
    └── safari/                      Web extension: rules.json, content.js, content.css
```

### 3.2 Data flow

**Android**

```
JS setConfig({instagramReels:false}) ──► UnreelBlockerModule ──► SharedPreferences "unreel_blocker"
                                                                       │ OnSharedPreferenceChangeListener
                                                                       ▼
Instagram event ──► ShortFormBlockerService ──► detector + rules ──► navigator / overlay
                                   │
                                   ├─► StatsStore (per-day counts)
                                   └─► BlockEventBus ──► module.sendEvent("onBlocked") ──► dashboard
```

The module and the service share a process but never call each other: config flows through SharedPreferences, live events through an in-process listener set. Either side works when the other isn't running.

**iOS**

```
JS setConfig / presentAppPicker ──► UnreelBlockerModule ──► App Group UserDefaults
                                                         ├─► ShieldApplier.sync()  → ManagedSettingsStore
                                                         └─► DeviceActivityCenter.startMonitoring
System (midnight / pause end / threshold) ──► activity-monitor extension ──► ShieldApplier.sync()
User opens Instagram ──► shield-config extension ──► counter++ in App Group ──► dashboard reads on foreground
```

`ShieldApplier.sync()` is idempotent and derives everything from the App Group, so the app and the extension always reach the same answer regardless of which ran last.

### 3.3 Friction

Every *loosening* change — turn off, pause, stop blocking an app, allow shared videos, switch iOS to an allowance or raise it, shorten the delay, remove the PIN — goes through one gate (`src/state/FrictionProvider.tsx`):

```
tap ──► PIN (if set; 5 tries, then 5-minute lockout) ──► wait unlock delay (default 5 min)
    ──► "Confirm" within 2 minutes ──► applied        (otherwise the request expires)
```

Tightening changes apply immediately. The pending request is persisted, so killing the app doesn't skip the wait. Pauses are enforced natively — `pausedUntil` on Android, a DeviceActivity schedule on iOS — so blocking returns even if the app is never reopened.

---

## 4. Edge cases and how they're handled

| Risk | What happens | Handling in this codebase |
|---|---|---|
| **App update renames a view ID** | Detection silently stops | Multiple independent signals per target (tab ID, tab label, three player IDs); rules are JSON, not code; `updateRules(json)` installs a newer version over the air (`EXPO_PUBLIC_UNREEL_RULES_URL`); invalid or older pushes are rejected; debug builds log unmatched screens' view IDs (`adb logcat -s UnreelDiag`). `uiautomator dump` hangs on playing video, which is why this logger exists |
| Detached fragments still in the tree | Whole app gets blocked after visiting Shorts once | Only `isVisibleToUser` nodes match (unit-tested) |
| Instagram Stories use "reel" names | Stories blocked by mistake | `excludeViewIds` checked before player IDs (unit-tested) |
| Video titles containing "Shorts" | False tab match | Whole-label matching plus selected state (unit-tested) |
| Localised UI | "Home" / "Shorts" labels differ by language | IDs are tried first; labels are a fallback with a few translations; Back is the fallback exit |
| Event firehose while video plays | Battery and jank | `packageNames` filter, 150 ms coalescing, worker thread, indexed `findAccessibilityNodeInfosByViewId` lookups, no full-tree walks in release |
| Back is swallowed (sheet, dialog) | User stays in the feed | Verify after 700 ms, escalate Back → Home |
| Overlay steals key focus | Escalation's Back hits the overlay | `FLAG_NOT_FOCUSABLE` on the overlay window |
| Keyboard / dialog / split-screen in front | `rootInActiveWindow` is the wrong app | Scan `windows` for the target package's application window |
| **Service disconnected** (crash, OEM battery killer, force-stop) | Settings say "on", nothing runs | Dashboard compares "enabled in Settings" with the in-process `running` flag and tells the user to toggle it off and on; point users of aggressive OEMs to battery-optimisation exemptions |
| Reinstall | Android clears accessibility consent | Setup screen reappears because status isn't ready |
| Sideloaded on Android 13+ | Toggle greyed out | Setup links to App info with the "Allow restricted settings" instructions |
| Advanced Protection on | Android revokes the service | Surfaces as "not running"; document it, don't fake `isAccessibilityTool` |
| Shared reel used as a loophole | Endless swiping from a DM | Pager scroll = block; 3-minute cap |
| User disables the service or uninstalls | Blocking ends | Can't be prevented by a normal app. Options for a "strict mode": Device Admin to slow uninstall, or watching the Settings app's Unreel pages — both add Play-policy and support burden; left out deliberately |
| **iOS: Family Controls entitlement** | TestFlight builds fail to sign | Request distribution approval early; all extensions need it |
| iOS: missing App Group | Extensions can't read config | Derived from bundle ID (`group.<bundle id>`), mirrored into targets by apple-targets; status reports `appGroupReachable` |
| iOS: pause under 15 minutes | `DeviceActivityCenter` rejects it | UI only offers ≥ 15 min; native code validates before saving and rolls back on failure |
| iOS: allowance reset by re-scheduling | Fresh allowance mid-day | `includesPastActivity: true` (iOS 17.4+); day-keyed exhausted flag |
| iOS: shield counter over-counts | iOS can render the shield config more than once per visit | Labelled as approximate in Settings |
| iOS: shields persist after uninstall | Reported Apple behaviour | Named store; "Turn blocking off" clears it before uninstall — mention in support docs |
| iOS: universal links | Tapping an instagram.com link in Safari opens the shielded app | Long-press → open in Safari; the extension handles the page |
| iOS: user revokes Screen Time access | Shields drop | Status shows authorization isn't approved; setup reappears |
| Web selectors change | Shelves reappear in Safari | Same maintenance loop as Android IDs; CSS lives in one file |
| Web redirect bounced back (e.g. a site starts sending `/watch` to `/shorts`) | Page reloads forever | `content.js` redirects at most twice from the same path in 10 s, then stops and shows a notice; covered by `scripts/test-userscript.mjs` |
| Userscript fixes | Installed copies stay old | `@updateURL` → `iphone/unreel.meta.js`; raise `userscript.version` in `package.json` with every change |
| Expo Go | No native module | `requireOptionalNativeModule`; the app says a development build is needed |
| Keychain unavailable | Friction can't load | Storage reads fall back to defaults; writes are best-effort |

---

## 5. Build, run and ship

```bash
npm install
npm run android            # dev build on a device or emulator (Android Studio + JDK 17)
npm run ios                # syncs shared Swift, then builds (macOS + Xcode 16+, physical iPhone)
npm run typecheck
npm run check:swift        # CI: fails if a Swift copy drifted from shared/ios
npm run test:android       # after `npm run prebuild`: JVM tests for detection
```

**Before the first iOS build:** set `ios.appleTeamId` in `app.json`, change `com.unreel.app` / `group.com.unreel.app` to your IDs, and enable Family Controls + App Groups for the app ID and each extension ID (`.monitor`, `.shieldconfig`, `.shieldaction`). Screen Time APIs don't work in the Simulator.

**Testing checklist**

- Android: Shorts tab → lands on Home; Short from the home shelf (allowance on/off); Short from a shared link then swipe; Reels tab; reel from a DM then swipe; Stories untouched; feed inline video untouched; comments sheet open over a reel; split screen; dark mode; a second locale.
- Android: toggle the service off in Settings and check the dashboard; force-stop and relaunch; reinstall.
- iOS: authorize, pick both apps, open each; allowance mode with a 1-minute budget; pause 15 minutes and wait it out with the app closed; midnight rollover; revoke access in Settings.
- Safari: `youtube.com/shorts/<id>` opens `/watch`; in-site navigation to Shorts bounces; Instagram `/reels/` bounces to home, `/reel/<id>` opens as a post.

**Store submissions**

- Play: Accessibility declaration, prominent-disclosure screenshots, demo video, privacy policy stating nothing leaves the device (true by default; the optional rules URL fetches a file and sends no user data).
- App Store: Family Controls distribution entitlement approved for the team; describe the Safari extension in review notes; avoid claiming in-app Reels blocking on iOS.
