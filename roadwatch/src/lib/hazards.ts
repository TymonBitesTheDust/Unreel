import type { LatLng } from './geo';

export type HazardKind = 'police' | 'speed_camera' | 'traffic_camera';

/** Where a hazard came from. Shown in its callout so the driver knows how much to trust it. */
export type HazardSource = 'osm' | 'waze' | 'report';

export type Hazard = LatLng & {
  /** Stable across refreshes, e.g. `osm-n123`, `waze-<uuid>`, `report-<time>`. */
  id: string;
  kind: HazardKind;
  source: HazardSource;
  /** Short, specific name: "Speed camera", "Red-light camera", "Hidden police". */
  label: string;
  /** Posted limit at a speed camera, as written on the sign ("50 km/h", "30 mph"). */
  speedLimit?: string;
  street?: string;
  /** Milliseconds since epoch. */
  reportedAt?: number;
  /** After this time the hazard is dropped (police move on; feeds go stale). */
  expiresAt?: number;
};

export const KIND_ORDER: HazardKind[] = ['police', 'speed_camera', 'traffic_camera'];

export const KIND_INFO: Record<HazardKind, { name: string; plural: string; emoji: string; spoken: string }> = {
  police: { name: 'Police', plural: 'Police', emoji: '🚓', spoken: 'Police' },
  speed_camera: { name: 'Speed camera', plural: 'Speed cameras', emoji: '📸', spoken: 'Speed camera' },
  traffic_camera: { name: 'Traffic camera', plural: 'Traffic cameras', emoji: '🚦', spoken: 'Traffic camera' },
};

export const SOURCE_NAME: Record<HazardSource, string> = {
  osm: 'OpenStreetMap',
  waze: 'Waze feed',
  report: 'Your report',
};

/** Drop expired hazards and merge sources; later lists win on id clashes. */
export function mergeHazards(lists: Hazard[][], now: number): Hazard[] {
  const byId = new Map<string, Hazard>();
  for (const list of lists) {
    for (const h of list) {
      if (h.expiresAt !== undefined && h.expiresAt <= now) continue;
      byId.set(h.id, h);
    }
  }
  return [...byId.values()];
}

/** "50" → "50 km/h"; "30 mph" stays; anything unparseable is dropped. */
export function formatSpeedLimit(raw: string | undefined): string | undefined {
  if (!raw) return undefined;
  const value = raw.trim().split(';')[0].trim();
  if (/^\d+$/.test(value)) return `${value} km/h`;
  const mph = value.match(/^(\d+)\s*mph$/i);
  if (mph) return `${mph[1]} mph`;
  const kmh = value.match(/^(\d+)\s*(km\/h|kmh|kph)$/i);
  if (kmh) return `${kmh[1]} km/h`;
  return undefined;
}
