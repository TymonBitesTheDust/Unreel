/** Small geodesy helpers. All distances are metres, all angles degrees. */

export type LatLng = { latitude: number; longitude: number };

const EARTH_RADIUS = 6_371_008.8;
const toRad = (d: number) => (d * Math.PI) / 180;
const toDeg = (r: number) => (r * 180) / Math.PI;

/** Great-circle distance between two points (haversine). */
export function distance(a: LatLng, b: LatLng): number {
  const dLat = toRad(b.latitude - a.latitude);
  const dLng = toRad(b.longitude - a.longitude);
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.latitude)) * Math.cos(toRad(b.latitude)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** Initial compass bearing from `a` to `b`, 0–360 with 0 = north. */
export function bearing(a: LatLng, b: LatLng): number {
  const φ1 = toRad(a.latitude);
  const φ2 = toRad(b.latitude);
  const Δλ = toRad(b.longitude - a.longitude);
  const y = Math.sin(Δλ) * Math.cos(φ2);
  const x = Math.cos(φ1) * Math.sin(φ2) - Math.sin(φ1) * Math.cos(φ2) * Math.cos(Δλ);
  return (toDeg(Math.atan2(y, x)) + 360) % 360;
}

/** Smallest difference between two headings, 0–180. */
export function angleDiff(a: number, b: number): number {
  const d = Math.abs(((a - b) % 360) + 360) % 360;
  return d > 180 ? 360 - d : d;
}

export type BBox = { south: number; west: number; north: number; east: number };

/** A box that contains a circle of `radius` metres around `center`. */
export function bboxAround(center: LatLng, radius: number): BBox {
  const dLat = toDeg(radius / EARTH_RADIUS);
  const dLng = toDeg(radius / (EARTH_RADIUS * Math.max(0.01, Math.cos(toRad(center.latitude)))));
  return {
    south: Math.max(-90, center.latitude - dLat),
    north: Math.min(90, center.latitude + dLat),
    west: Math.max(-180, center.longitude - dLng),
    east: Math.min(180, center.longitude + dLng),
  };
}

export function inBBox(p: LatLng, box: BBox): boolean {
  return p.latitude >= box.south && p.latitude <= box.north && p.longitude >= box.west && p.longitude <= box.east;
}

/** Decode a Google encoded polyline (precision 5). */
export function decodePolyline(encoded: string): LatLng[] {
  const points: LatLng[] = [];
  let index = 0;
  let lat = 0;
  let lng = 0;
  while (index < encoded.length) {
    for (const axis of [0, 1]) {
      let result = 0;
      let shift = 0;
      let byte: number;
      do {
        byte = encoded.charCodeAt(index++) - 63;
        result |= (byte & 0x1f) << shift;
        shift += 5;
      } while (byte >= 0x20 && index < encoded.length);
      const delta = result & 1 ? ~(result >> 1) : result >> 1;
      if (axis === 0) lat += delta;
      else lng += delta;
    }
    points.push({ latitude: lat / 1e5, longitude: lng / 1e5 });
  }
  return points;
}

/** Project to local metres around `origin` (equirectangular; fine for a few hundred km). */
function project(origin: LatLng, p: LatLng): [number, number] {
  const x = toRad(p.longitude - origin.longitude) * EARTH_RADIUS * Math.cos(toRad(origin.latitude));
  const y = toRad(p.latitude - origin.latitude) * EARTH_RADIUS;
  return [x, y];
}

function segmentDistance(p: [number, number], a: [number, number], b: [number, number]): number {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const len2 = dx * dx + dy * dy;
  const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / len2));
  return Math.hypot(p[0] - (a[0] + t * dx), p[1] - (a[1] + t * dy));
}

/** Shortest distance from a point to a polyline. */
export function distanceToPolyline(p: LatLng, line: LatLng[]): number {
  if (line.length === 0) return Infinity;
  if (line.length === 1) return distance(p, line[0]);
  const origin = p;
  const pp = project(origin, p);
  let best = Infinity;
  let prev = project(origin, line[0]);
  for (let i = 1; i < line.length; i++) {
    const cur = project(origin, line[i]);
    best = Math.min(best, segmentDistance(pp, prev, cur));
    prev = cur;
  }
  return best;
}

/** Douglas–Peucker simplification with a tolerance in metres. */
export function simplify(line: LatLng[], tolerance: number): LatLng[] {
  if (line.length <= 2) return line.slice();
  const origin = line[0];
  const pts = line.map((p) => project(origin, p));
  const keep = new Uint8Array(line.length);
  keep[0] = keep[line.length - 1] = 1;
  const stack: [number, number][] = [[0, line.length - 1]];
  while (stack.length) {
    const [start, end] = stack.pop()!;
    let maxD = -1;
    let maxI = -1;
    for (let i = start + 1; i < end; i++) {
      const d = segmentDistance(pts[i], pts[start], pts[end]);
      if (d > maxD) {
        maxD = d;
        maxI = i;
      }
    }
    if (maxD > tolerance && maxI > 0) {
      keep[maxI] = 1;
      stack.push([start, maxI], [maxI, end]);
    }
  }
  return line.filter((_, i) => keep[i]);
}

/** Simplify a line until it has at most `maxPoints` points. */
export function simplifyTo(line: LatLng[], maxPoints: number, startTolerance = 25): LatLng[] {
  let tolerance = startTolerance;
  let out = simplify(line, tolerance);
  while (out.length > maxPoints && tolerance < 50_000) {
    tolerance *= 1.6;
    out = simplify(line, tolerance);
  }
  return out;
}

/** "180 m", "1.2 km". */
export function formatDistance(metres: number): string {
  if (metres < 1000) return `${Math.max(10, Math.round(metres / 10) * 10)} m`;
  return `${(metres / 1000).toFixed(metres < 10_000 ? 1 : 0)} km`;
}

/** "1 h 05 min", "12 min". */
export function formatDuration(seconds: number): string {
  const minutes = Math.max(1, Math.round(seconds / 60));
  if (minutes < 60) return `${minutes} min`;
  return `${Math.floor(minutes / 60)} h ${String(minutes % 60).padStart(2, '0')} min`;
}
