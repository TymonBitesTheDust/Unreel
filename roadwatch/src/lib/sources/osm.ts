/**
 * Fixed cameras from OpenStreetMap, through the public Overpass API.
 *
 * Tagging (https://wiki.openstreetmap.org/wiki/Key:enforcement):
 * - `highway=speed_camera` nodes are speed cameras;
 * - `type=enforcement` relations tie a camera (`device`, or the `from` point) to what it enforces:
 *   `maxspeed` / `average_speed` / `mindistance` (speed) or `traffic_signals` (red light);
 * - `man_made=surveillance` + `surveillance:zone=traffic` are traffic-monitoring cameras, and
 *   `surveillance:type=ALPR` number-plate readers.
 *
 * Data © OpenStreetMap contributors, ODbL. The app shows that attribution on the map.
 */
import { formatSpeedLimit, type Hazard, type HazardKind } from '../hazards';
import type { BBox, LatLng } from '../geo';

export const OVERPASS_URL = 'https://overpass-api.de/api/interpreter';

type OsmNode = { type: 'node'; id: number; lat: number; lon: number; tags?: Record<string, string> };
type OsmMember = { type: 'node' | 'way' | 'relation'; ref: number; role: string };
type OsmRelation = { type: 'relation'; id: number; members?: OsmMember[]; tags?: Record<string, string> };
type OsmElement = OsmNode | OsmRelation | { type: 'way'; id: number };

export type OverpassArea = { bbox: BBox } | { around: { radius: number; line: LatLng[] } };

const r = (n: number) => n.toFixed(6);

function areaFilter(area: OverpassArea): string {
  if ('bbox' in area) {
    const { south, west, north, east } = area.bbox;
    return `(${r(south)},${r(west)},${r(north)},${r(east)})`;
  }
  const coords = area.around.line.map((p) => `${r(p.latitude)},${r(p.longitude)}`).join(',');
  return `(around:${Math.round(area.around.radius)},${coords})`;
}

export function buildOverpassQuery(area: OverpassArea): string {
  const f = areaFilter(area);
  return [
    '[out:json][timeout:25];',
    '(',
    `  node["highway"="speed_camera"]${f};`,
    `  node["man_made"="surveillance"]["surveillance:zone"="traffic"]${f};`,
    `  node["man_made"="surveillance"]["surveillance:type"="ALPR"]${f};`,
    `  rel["type"="enforcement"]["enforcement"~"^(maxspeed|average_speed|mindistance|traffic_signals)$"]${f};`,
    ')->.hits;',
    '(.hits; node(r.hits););',
    'out body;',
  ].join('\n');
}

const SPEED_ENFORCEMENT = new Set(['maxspeed', 'average_speed', 'mindistance']);

function nodeHazard(node: OsmNode, kind: HazardKind, label: string, speedLimit?: string): Hazard {
  return {
    id: `osm-n${node.id}`,
    kind,
    source: 'osm',
    latitude: node.lat,
    longitude: node.lon,
    label,
    speedLimit,
    street: node.tags?.['addr:street'],
  };
}

export function parseOverpass(json: unknown): Hazard[] {
  const elements = (json as { elements?: OsmElement[] } | null)?.elements;
  if (!Array.isArray(elements)) throw new Error('Unexpected Overpass response');

  const nodes = new Map<number, OsmNode>();
  for (const el of elements) {
    if (el.type === 'node' && typeof el.lat === 'number' && typeof el.lon === 'number') nodes.set(el.id, el);
  }

  const hazards = new Map<string, Hazard>();

  for (const node of nodes.values()) {
    const t = node.tags ?? {};
    if (t.highway === 'speed_camera') {
      hazards.set(`osm-n${node.id}`, nodeHazard(node, 'speed_camera', 'Speed camera', formatSpeedLimit(t.maxspeed)));
    } else if (t.man_made === 'surveillance' && t['surveillance:type'] === 'ALPR') {
      hazards.set(`osm-n${node.id}`, nodeHazard(node, 'traffic_camera', 'Number-plate camera'));
    } else if (t.man_made === 'surveillance' && t['surveillance:zone'] === 'traffic') {
      hazards.set(`osm-n${node.id}`, nodeHazard(node, 'traffic_camera', 'Traffic camera'));
    }
  }

  // Enforcement relations add red-light cameras and limits, keyed on the camera's own node so a
  // camera mapped both ways appears once.
  for (const el of elements) {
    if (el.type !== 'relation' || el.tags?.type !== 'enforcement') continue;
    const enforcement = el.tags.enforcement ?? '';
    const isSpeed = SPEED_ENFORCEMENT.has(enforcement);
    const isRedLight = enforcement === 'traffic_signals';
    if (!isSpeed && !isRedLight) continue;

    const members = el.members ?? [];
    const pick = (role: string) => members.find((m) => m.type === 'node' && m.role === role && nodes.has(m.ref))?.ref;
    const nodeId = pick('device') ?? pick('from');
    if (nodeId === undefined) continue;
    const node = nodes.get(nodeId)!;
    const id = `osm-n${nodeId}`;
    const existing = hazards.get(id);
    const limit = formatSpeedLimit(el.tags.maxspeed) ?? existing?.speedLimit;

    if (isRedLight && existing?.kind === 'speed_camera') {
      hazards.set(id, { ...existing, label: 'Speed and red-light camera' });
    } else if (isRedLight) {
      hazards.set(id, {
        ...(existing ?? nodeHazard(node, 'traffic_camera', '')),
        kind: 'traffic_camera',
        label: 'Red-light camera',
      });
    } else {
      const label = enforcement === 'average_speed' ? 'Average speed check' : 'Speed camera';
      hazards.set(id, {
        ...(existing ?? nodeHazard(node, 'speed_camera', label)),
        kind: 'speed_camera',
        label,
        speedLimit: limit,
      });
    }
  }

  return [...hazards.values()];
}

export async function fetchOsmHazards(area: OverpassArea, signal?: AbortSignal): Promise<Hazard[]> {
  const res = await fetch(OVERPASS_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `data=${encodeURIComponent(buildOverpassQuery(area))}`,
    signal,
  });
  if (!res.ok)
    throw new Error(res.status === 429 ? 'OpenStreetMap is busy, retrying later' : `OpenStreetMap error ${res.status}`);
  return parseOverpass(await res.json());
}
