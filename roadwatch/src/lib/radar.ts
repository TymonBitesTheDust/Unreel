/**
 * The app's single source of truth: where the car is, which hazards are around, what to warn about.
 *
 * It lives outside React so the background location task (which can run with no screen mounted)
 * and the map share one state. Screens read it with `useRadar()`.
 */
import * as Location from 'expo-location';
import { AppState } from 'react-native';

import { announce, initAlerts, requestNotificationPermission } from './alerts';
import { bboxAround, distance, distanceToPolyline, simplifyTo, type LatLng } from './geo';
import { computeRoute, hasGoogleKey, type Place, type Route } from './google';
import { mergeHazards, type Hazard, type HazardKind } from './hazards';
import { ProximityEngine, type Fix, type Nearby } from './proximity';
import { loadSettings, saveSettings, type Settings } from './settings';
import { fetchOsmHazards } from './sources/osm';
import { fetchWazeFeed } from './sources/waze';
import { readJSON, writeJSON } from './storage';

export const LOCATION_TASK = 'roadwatch-location';

/** Thrown by `startDriving` when location access is off, so the UI can offer the Settings app. */
export class LocationPermissionError extends Error {}

export type SourceStatus = {
  state: 'off' | 'idle' | 'loading' | 'ok' | 'error';
  count: number;
  updatedAt?: number;
  error?: string;
};

export type RadarState = {
  settings: Settings;
  fix: Fix | null;
  course: number | null;
  moving: boolean;
  /** Every known hazard (all sources merged, expired ones dropped). */
  hazards: Hazard[];
  reports: Hazard[];
  inRange: Nearby[];
  upcoming: Nearby | null;
  driving: boolean;
  osm: SourceStatus;
  waze: SourceStatus;
  destination: Place | null;
  route: Route | null;
  routeStatus: 'idle' | 'loading' | 'ok' | 'error';
  routeError?: string;
  /** Hazards within 50 m of the route, by kind. */
  routeCounts: Record<HazardKind, number> | null;
};

// --- Persistence keys and tuning ------------------------------------------------------------

const AREA_KEY = 'osm.area.v1';
const ROUTE_KEY = 'osm.route.v1';
const REPORTS_KEY = 'reports.v1';

/** Cameras are fetched for this radius around the car… */
const AREA_RADIUS = 12_000;
/** …and fetched again when the car gets this close to the edge, or the data is this old. */
const AREA_EDGE_MARGIN = 4_000;
const AREA_MAX_AGE = 12 * 3600_000;
const WAZE_INTERVAL = 120_000;
const WAZE_RADIUS = 50_000;
/** Your own police reports fade after an hour; police don't stay put. */
const POLICE_REPORT_LIFETIME = 3600_000;
const ON_ROUTE = 50;

type AreaCache = { center: LatLng; radius: number; fetchedAt: number; hazards: Hazard[] };

let area = readJSON<AreaCache | null>(AREA_KEY, null);
let routeCameras = readJSON<Hazard[]>(ROUTE_KEY, []);
let wazeHazards: Hazard[] = [];
const engine = new ProximityEngine();

const initialSettings = loadSettings();
const initialReports = readJSON<Hazard[]>(REPORTS_KEY, []);

let state: RadarState = {
  settings: initialSettings,
  fix: null,
  course: null,
  moving: false,
  hazards: [],
  reports: initialReports,
  inRange: [],
  upcoming: null,
  driving: false,
  osm: initialSettings.osmEnabled ? cachedOsmStatus() : { state: 'off', count: 0 },
  waze: { state: initialSettings.wazeFeedUrl ? 'idle' : 'off', count: 0 },
  destination: null,
  route: null,
  routeStatus: 'idle',
  routeCounts: null,
};
state.hazards = merged(Date.now());

const listeners = new Set<() => void>();

export function getState(): RadarState {
  return state;
}

export function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function setState(patch: Partial<RadarState>) {
  state = { ...state, ...patch };
  for (const l of listeners) l();
}

function cachedOsmStatus(): SourceStatus {
  return area ? { state: 'ok', count: area.hazards.length, updatedAt: area.fetchedAt } : { state: 'idle', count: 0 };
}

function merged(now: number): Hazard[] {
  const osm = state.settings.osmEnabled ? [area?.hazards ?? [], routeCameras] : [];
  return mergeHazards([...osm, wazeHazards, state.reports], now);
}

function rebuildHazards() {
  const hazards = merged(Date.now());
  setState({ hazards, routeCounts: countOnRoute(state.route, hazards) });
}

function countOnRoute(route: Route | null, hazards: Hazard[]): Record<HazardKind, number> | null {
  if (!route) return null;
  const line = simplifyTo(route.coordinates, 600, 10);
  const counts: Record<HazardKind, number> = { police: 0, speed_camera: 0, traffic_camera: 0 };
  for (const h of hazards) if (distanceToPolyline(h, line) <= ON_ROUTE) counts[h.kind]++;
  return counts;
}

// --- Settings -------------------------------------------------------------------------------

export function updateSettings(patch: Partial<Settings>) {
  const settings = { ...state.settings, ...patch, kinds: { ...state.settings.kinds, ...patch.kinds } };
  saveSettings(settings);
  const osm: SourceStatus = settings.osmEnabled
    ? state.osm.state === 'off'
      ? cachedOsmStatus()
      : state.osm
    : { state: 'off', count: 0 };
  let waze = state.waze;
  if (patch.wazeFeedUrl !== undefined && patch.wazeFeedUrl !== state.settings.wazeFeedUrl) {
    wazeHazards = [];
    lastWazeAttempt = 0;
    waze = { state: settings.wazeFeedUrl ? 'idle' : 'off', count: 0 };
  }
  setState({ settings, osm, waze });
  rebuildHazards();
  if (state.fix) refreshSources(state.fix);
}

// --- Location handling (foreground watcher and background task both end up here) ------------

export function toFix(loc: Location.LocationObject): Fix {
  return {
    latitude: loc.coords.latitude,
    longitude: loc.coords.longitude,
    speed: loc.coords.speed,
    heading: loc.coords.heading,
    accuracy: loc.coords.accuracy,
    timestamp: loc.timestamp,
  };
}

let lastPrune = 0;

export function handleLocation(loc: Location.LocationObject) {
  const fix = toFix(loc);
  // Ignore fixes that arrive out of order (the background task can batch them).
  if (state.fix && fix.timestamp < state.fix.timestamp) return;
  const now = Date.now();
  if (now - lastPrune > 30_000) {
    lastPrune = now;
    pruneExpiredReports(now);
    if (state.hazards.some((h) => h.expiresAt !== undefined && h.expiresAt <= now)) rebuildHazards();
  }

  const result = engine.update(fix, state.hazards, state.settings);
  setState({ fix, course: result.course, moving: result.moving, inRange: result.inRange, upcoming: result.upcoming });
  if (result.fresh.length) announce(result.fresh, state.settings, AppState.currentState === 'active');
  refreshSources(fix);
}

// --- Data sources ---------------------------------------------------------------------------

let osmInFlight = false;
let osmRetryAt = 0;
let osmBackoff = 30_000;

function refreshSources(fix: Fix) {
  maybeRefreshOsm(fix);
  maybeRefreshWaze(fix);
}

function maybeRefreshOsm(fix: Fix) {
  if (!state.settings.osmEnabled || osmInFlight) return;
  const now = Date.now();
  if (now < osmRetryAt) return;
  const fresh =
    area !== null && now - area.fetchedAt < AREA_MAX_AGE && distance(fix, area.center) < area.radius - AREA_EDGE_MARGIN;
  if (fresh) return;

  osmInFlight = true;
  const center = { latitude: fix.latitude, longitude: fix.longitude };
  setState({ osm: { ...state.osm, state: 'loading' } });
  fetchOsmHazards({ bbox: bboxAround(center, AREA_RADIUS) })
    .then((hazards) => {
      area = { center, radius: AREA_RADIUS, fetchedAt: Date.now(), hazards };
      writeJSON(AREA_KEY, area);
      osmBackoff = 30_000;
      setState({ osm: { state: 'ok', count: hazards.length, updatedAt: area.fetchedAt } });
      rebuildHazards();
    })
    .catch((e: Error) => {
      osmRetryAt = Date.now() + osmBackoff;
      osmBackoff = Math.min(osmBackoff * 2, 10 * 60_000);
      setState({ osm: { ...state.osm, state: 'error', error: e.message } });
    })
    .finally(() => {
      osmInFlight = false;
    });
}

let lastWazeAttempt = 0;

function maybeRefreshWaze(fix: Fix) {
  const url = state.settings.wazeFeedUrl.trim();
  if (!url) return;
  const now = Date.now();
  if (now - lastWazeAttempt < WAZE_INTERVAL) return;
  lastWazeAttempt = now;
  setState({ waze: { ...state.waze, state: 'loading' } });
  fetchWazeFeed(url, now)
    .then((hazards) => {
      if (url !== state.settings.wazeFeedUrl.trim()) return; // changed meanwhile
      wazeHazards = hazards.filter((h) => distance(fix, h) <= WAZE_RADIUS);
      setState({ waze: { state: 'ok', count: wazeHazards.length, updatedAt: Date.now() } });
      rebuildHazards();
    })
    .catch((e: Error) => setState({ waze: { ...state.waze, state: 'error', error: e.message } }));
}

/** Pull fresh data now (the refresh button). */
export function refreshNow() {
  area = null;
  osmRetryAt = 0;
  lastWazeAttempt = 0;
  if (state.fix) refreshSources(state.fix);
}

// --- Reports --------------------------------------------------------------------------------

export function addReport(kind: HazardKind): Hazard | null {
  const fix = state.fix;
  if (!fix) return null;
  const now = Date.now();
  const labels: Record<HazardKind, string> = {
    police: 'Police',
    speed_camera: 'Speed camera',
    traffic_camera: 'Traffic camera',
  };
  const report: Hazard = {
    id: `report-${now}-${Math.round(Math.random() * 1e6)}`,
    kind,
    source: 'report',
    latitude: fix.latitude,
    longitude: fix.longitude,
    label: labels[kind],
    reportedAt: now,
    expiresAt: kind === 'police' ? now + POLICE_REPORT_LIFETIME : undefined,
  };
  // You're standing at it; don't warn about your own report right away.
  engine.suppress(report.id);
  saveReports([...state.reports, report]);
  return report;
}

export function removeReport(id: string) {
  saveReports(state.reports.filter((r) => r.id !== id));
}

export function clearReports() {
  saveReports([]);
}

function pruneExpiredReports(now: number) {
  const live = state.reports.filter((r) => r.expiresAt === undefined || r.expiresAt > now);
  if (live.length !== state.reports.length) saveReports(live);
}

function saveReports(reports: Hazard[]) {
  writeJSON(REPORTS_KEY, reports);
  state = { ...state, reports };
  rebuildHazards();
}

// --- Destination and route ------------------------------------------------------------------

let routeRequest = 0;

export async function setDestination(place: Place) {
  const request = ++routeRequest;
  routeCameras = [];
  setState({ destination: place, route: null, routeCounts: null, routeStatus: 'idle', routeError: undefined });
  rebuildHazards();
  if (!hasGoogleKey || !state.fix) return;

  setState({ routeStatus: 'loading' });
  try {
    const route = await computeRoute(state.fix, place);
    if (request !== routeRequest) return;
    setState({ route, routeStatus: 'ok', routeCounts: countOnRoute(route, state.hazards) });
    if (state.settings.osmEnabled) {
      // Cameras along the whole route, so they're known before the car gets near them.
      const line = simplifyTo(route.coordinates, 250, 30);
      fetchOsmHazards({ around: { radius: ON_ROUTE * 2, line } })
        .then((hazards) => {
          if (request !== routeRequest) return;
          routeCameras = hazards;
          writeJSON(ROUTE_KEY, hazards);
          rebuildHazards();
        })
        .catch(() => {});
    }
  } catch (e) {
    if (request !== routeRequest) return;
    setState({ routeStatus: 'error', routeError: (e as Error).message });
  }
}

export function clearDestination() {
  routeRequest++;
  routeCameras = [];
  writeJSON(ROUTE_KEY, []);
  setState({ destination: null, route: null, routeCounts: null, routeStatus: 'idle', routeError: undefined });
  rebuildHazards();
}

// --- Driving mode ---------------------------------------------------------------------------

/**
 * Keeps location updates running with the app in the background (an Android foreground service,
 * the blue location pill on iOS), so warnings keep coming while Google Maps or Waze is in front.
 * Both platforms only need "while using the app" location for this, as long as it starts while
 * RoadWatch is open, so call it before handing off to another app.
 */
export async function startDriving(): Promise<void> {
  const fg = await Location.requestForegroundPermissionsAsync();
  if (!fg.granted)
    throw new LocationPermissionError('RoadWatch needs your location to warn you about police and cameras.');
  await requestNotificationPermission().catch(() => false);
  await initAlerts();
  if (!(await Location.hasStartedLocationUpdatesAsync(LOCATION_TASK))) {
    await Location.startLocationUpdatesAsync(LOCATION_TASK, {
      accuracy: Location.Accuracy.BestForNavigation,
      timeInterval: 1000,
      distanceInterval: 5,
      activityType: Location.ActivityType.AutomotiveNavigation,
      pausesUpdatesAutomatically: false,
      showsBackgroundLocationIndicator: true,
      foregroundService: {
        notificationTitle: 'RoadWatch is watching the road',
        notificationBody: 'You will be warned before police, speed cameras and traffic cameras.',
        notificationColor: '#0F766E',
        killServiceOnDestroy: true,
      },
    });
  }
  setState({ driving: true });
}

export async function stopDriving(): Promise<void> {
  try {
    if (await Location.hasStartedLocationUpdatesAsync(LOCATION_TASK))
      await Location.stopLocationUpdatesAsync(LOCATION_TASK);
  } finally {
    setState({ driving: false, inRange: [], upcoming: null });
  }
}

/** On launch, pick up a drive that was still running (for example after the UI was reloaded). */
export async function syncDrivingState(): Promise<void> {
  try {
    const running = await Location.hasStartedLocationUpdatesAsync(LOCATION_TASK);
    if (running !== state.driving) setState({ driving: running });
  } catch {}
}
