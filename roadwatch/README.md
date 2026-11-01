# RoadWatch

A navigation companion on **Google Maps** that shows **police**, **speed cameras** and **traffic cameras** on the map and warns you **200 metres before** you reach one, with an **alert sound**, a **spoken warning**, a **vibration** and a **notification**. Pick a destination and drive with **Google Maps** or **Waze**. RoadWatch keeps warning you in the background while they navigate.

> Speed-camera and police warnings are restricted or illegal in some countries, including Germany, Switzerland and France. Check the law where you drive.

## What it does

| | |
|---|---|
| **Map** | Google Maps with Google's live traffic layer, your position, speed, and every known police and camera location nearby |
| **Alerts** | At 200 m (or 100 / 300 / 500 m, in Settings): a big coloured banner with the distance counting down and the speed limit, a three-beep alert sound, a spoken "Speed camera ahead, 200 metres", and a vibration. With another app in front or the screen off, a high-priority notification plays the same sound |
| **Smart** | Only warns about hazards **ahead** of you, not ones you've passed. Each one warns **once** per approach, so waiting at a red light next to a camera doesn't keep beeping |
| **Navigate** | Search with Google (or long-press the map). RoadWatch shows the route, the time, and how many police and cameras are on it, then hands off to **Google Maps** or **Waze** with one tap. Or drive with RoadWatch's own map |
| **Report** | Tap the megaphone to mark police (fades after an hour), a speed camera or a traffic camera where you are |

Colours never change: **police are blue 🚓**, **speed cameras red 📸**, **traffic and red-light cameras amber 🚦**.

## Where the data comes from

Google Maps and Waze don't let other apps read their police or camera reports, so RoadWatch uses:

- **Speed cameras, average-speed checks, red-light cameras and traffic cameras:** [OpenStreetMap](https://www.openstreetmap.org), loaded for about 12 km around you and along your whole route. Free and worldwide; coverage is best in Europe and varies elsewhere.
- **Police:**
  - **Your own reports**, saved on your phone.
  - **Waze for Cities.** Waze only shares live police reports with partners in its [Waze for Cities](https://www.waze.com/wazeforcities) programme, such as cities and road authorities. If you have a partner feed link, paste it in **Settings → Waze for Cities feed** and its police reports appear on the map and trigger alerts.
- **Traffic:** Google Maps' live traffic layer.

A camera that isn't in OpenStreetMap won't be warned about. You can add missing cameras to OpenStreetMap yourself and everyone benefits.

## Set it up

### 1. Get a Google Maps key (free tier)

1. Open the [Google Cloud console](https://console.cloud.google.com/), create a project, and set up billing (Google's free monthly usage normally covers personal use).
2. Under **APIs & Services → Library**, enable **Maps SDK for Android**, **Maps SDK for iOS**, **Places API (New)** and **Routes API**.
3. Under **APIs & Services → Credentials**, create an **API key**. Under **API restrictions**, allow only those four APIs.

Without a key, the map stays blank on Android builds, search uses the phone's own address lookup, and no route line is drawn. Handing off to Google Maps or Waze still works.

### 2a. Android phone: build the APK on GitHub

1. In this repository on GitHub: **Settings → Secrets and variables → Actions → New repository secret**. Name it `GOOGLE_MAPS_API_KEY` and paste the key.
2. **Actions → RoadWatch APK → Run workflow**. After about 15 minutes, download **roadwatch-apk** from the finished run, unzip it, and open the APK on your phone.

### 2b. Or build it yourself

```bash
cd roadwatch
npm install
cp .env.example .env        # then put your key in .env
```

- **Expo Go** (quickest look): `npx expo start`, then scan the QR code. The map and on-screen alerts work. Background alerts and the custom sound need a development build.
- **Development build on your phone:** `npx expo run:android` or `npx expo run:ios`, or in Expo's cloud: `npx eas-cli@latest build --profile development`.
- **Installable Android APK from Expo's cloud:** `npx eas-cli@latest build -p android --profile preview`. Add the key first with `npx eas-cli@latest env:create --name EXPO_PUBLIC_GOOGLE_MAPS_API_KEY --value <key>`.

iPhone builds need a Mac with Xcode or EAS, and an Apple Developer account.

## Using it

1. Open RoadWatch and allow **location** and **notifications**.
2. Tap **Where to?**, pick a place, then tap **Google Maps** or **Waze**. RoadWatch starts watching first, then opens the other app.
3. Drive. You'll hear the alert sound and the spoken warning 200 m before each police report or camera, even with Google Maps or Waze in front. On Android a "RoadWatch is watching the road" notification shows while it runs; on iPhone the location indicator turns blue.
4. Come back and tap **Stop** when you arrive.

Check that it works with **Settings → Send a test alert**.

**Not hearing alerts?**
- Notifications must be allowed for RoadWatch. On iPhone, the ring/silent switch mutes notification sounds, so keep **Spoken warning** on in Settings.
- Android phones that close background apps aggressively (Xiaomi, Huawei, Samsung and others) may stop RoadWatch. Set its battery use to **Unrestricted**. See [dontkillmyapp.com](https://dontkillmyapp.com).

## Privacy

Your location stays on your phone. RoadWatch only sends the area around you (or your route) to OpenStreetMap's Overpass API to fetch cameras, your searches and route to Google if you set a key, and nothing else. No account, ads or tracking. RoadWatch needs location only **while in use**: during a drive it runs as a visible foreground service, so it never asks for "allow all the time".

## For developers

```bash
npm test             # proximity engine, OpenStreetMap and Waze parsers
npm run typecheck
npm run lint
python3 scripts/make-assets.py   # redraw the icons and the alert sound
```

| Path | What it is |
|---|---|
| `src/app/` | Screens (Expo Router): the map, search, settings, first-run welcome |
| `src/lib/proximity.ts` | When to warn: distance, direction of travel, once per approach |
| `src/lib/radar.ts` | Shared state for the screens and the background location task; loads and caches data |
| `src/lib/alerts.ts` | Notification channels, alert sound, speech, vibration |
| `src/lib/sources/` | OpenStreetMap (Overpass) and Waze for Cities feed parsers |
| `src/lib/google.ts`, `handoff.ts` | Google Places and Routes; deep links into Google Maps and Waze |
| `index.ts` | Defines the background location task before Expo Router starts |

Camera data © [OpenStreetMap contributors](https://www.openstreetmap.org/copyright), available under the ODbL. RoadWatch isn't affiliated with Google or Waze.
