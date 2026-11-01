/**
 * Police reports in Waze's alert format.
 *
 * Waze has no public API for police reports. Its live data is shared through the Waze for Cities
 * (Connected Citizens) programme: partners such as road authorities get a feed URL that returns
 * `{ alerts: [{ type, subtype, location: { x: lng, y: lat }, uuid, street, pubMillis, ... }] }`.
 * Paste that URL in Settings and RoadWatch shows the feed's police reports and warns about them.
 */
import type { Hazard } from '../hazards';

type WazeAlert = {
  uuid?: string;
  id?: string;
  type?: string;
  subtype?: string;
  location?: { x?: number; y?: number };
  street?: string;
  pubMillis?: number;
};

const POLICE_LABELS: Record<string, string> = {
  POLICE_VISIBLE: 'Police',
  POLICE_HIDING: 'Hidden police',
  POLICE_WITH_MOBILE_CAMERA: 'Police with mobile camera',
};

/** A feed entry missing from later refreshes disappears once this much time passes. */
const STALE_AFTER = 15 * 60_000;

export function parseWazeFeed(json: unknown, now: number): Hazard[] {
  const alerts = (json as { alerts?: WazeAlert[] } | null)?.alerts;
  if (!Array.isArray(alerts)) throw new Error('No "alerts" list in the Waze feed');

  const out: Hazard[] = [];
  for (const a of alerts) {
    if (a.type !== 'POLICE' && a.type !== 'POLICEMAN') continue;
    const lng = a.location?.x;
    const lat = a.location?.y;
    if (typeof lat !== 'number' || typeof lng !== 'number' || !isFinite(lat) || !isFinite(lng)) continue;
    const key = a.uuid ?? a.id ?? `${lat.toFixed(5)},${lng.toFixed(5)}`;
    out.push({
      id: `waze-${key}`,
      kind: 'police',
      source: 'waze',
      latitude: lat,
      longitude: lng,
      label: (a.subtype && POLICE_LABELS[a.subtype]) || 'Police',
      street: a.street || undefined,
      reportedAt: typeof a.pubMillis === 'number' ? a.pubMillis : undefined,
      expiresAt: now + STALE_AFTER,
    });
  }
  return out;
}

export async function fetchWazeFeed(url: string, now: number, signal?: AbortSignal): Promise<Hazard[]> {
  const res = await fetch(url, { headers: { Accept: 'application/json' }, signal });
  if (!res.ok) throw new Error(`Waze feed error ${res.status}`);
  return parseWazeFeed(await res.json(), now);
}
