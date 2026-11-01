/// <reference types="node" />
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { bboxAround, bearing, decodePolyline, distance, distanceToPolyline, formatDistance, simplifyTo } from './geo';
import { formatSpeedLimit, mergeHazards, type Hazard } from './hazards';
import { ProximityEngine, type AlertConfig, type Fix } from './proximity';

// A straight road heading due north from (52.0, 4.0). 0.001° latitude ≈ 111 m.
const START = { latitude: 52.0, longitude: 4.0 };
const north = (metres: number) => ({ latitude: START.latitude + metres / 111_195, longitude: START.longitude });

const camera: Hazard = { id: 'cam', kind: 'speed_camera', source: 'osm', label: 'Speed camera', ...north(1000) };
const police: Hazard = { id: 'pol', kind: 'police', source: 'report', label: 'Police', ...north(1100) };

const config: AlertConfig = {
  alertDistance: 200,
  kinds: { police: true, speed_camera: true, traffic_camera: true },
  aheadOnly: true,
};

/** Drive north at 20 m/s (72 km/h), one fix per second, from `from` to `to` metres. */
function drive(engine: ProximityEngine, hazards: Hazard[], from: number, to: number, cfg = config) {
  const events: { ids: string[]; distance: number }[] = [];
  const step = from <= to ? 20 : -20;
  let t = 0;
  for (let m = from; step > 0 ? m <= to : m >= to; m += step) {
    const fix: Fix = { ...north(m), speed: 20, heading: step > 0 ? 0 : 180, timestamp: (t += 1000) };
    const result = engine.update(fix, hazards, cfg);
    if (result.fresh.length) {
      events.push({ ids: result.fresh.map((n) => n.hazard.id), distance: result.fresh[0].distance });
    }
  }
  return events;
}

/** Each event fired within `limit` metres, and no more than one 20 m step earlier than needed. */
function assertWarnedAt(events: { ids: string[]; distance: number }[], expected: string[][], limit = 200) {
  assert.deepEqual(
    events.map((e) => e.ids),
    expected,
  );
  for (const e of events) assert.ok(e.distance <= limit && e.distance > limit - 20, `warned at ${e.distance} m`);
}

test('geo: distance and bearing on a known line', () => {
  assert.ok(Math.abs(distance(START, north(1000)) - 1000) < 1);
  assert.ok(bearing(START, north(1000)) < 0.001);
  assert.ok(Math.abs(bearing(START, { latitude: 52, longitude: 4.01 }) - 90) < 0.1);
});

test('geo: decodes Google polylines', () => {
  // Example from Google's polyline algorithm documentation.
  const pts = decodePolyline('_p~iF~ps|U_ulLnnqC_mqNvxq`@');
  assert.deepEqual(
    pts.map((p) => [p.latitude, p.longitude]),
    [
      [38.5, -120.2],
      [40.7, -120.95],
      [43.252, -126.453],
    ],
  );
});

test('geo: polyline distance and simplification', () => {
  const line = Array.from({ length: 101 }, (_, i) => north(i * 10));
  assert.ok(distanceToPolyline({ latitude: north(500).latitude, longitude: 4.001 }, line) < 70);
  assert.equal(simplifyTo(line, 10).length, 2); // a straight line needs only its ends
  const box = bboxAround(START, 1000);
  assert.ok(box.north > north(999).latitude && box.south < START.latitude);
});

test('formatting', () => {
  assert.equal(formatDistance(187), '190 m');
  assert.equal(formatDistance(4), '10 m');
  assert.equal(formatDistance(1520), '1.5 km');
  assert.equal(formatSpeedLimit('50'), '50 km/h');
  assert.equal(formatSpeedLimit('30 mph'), '30 mph');
  assert.equal(formatSpeedLimit('signals'), undefined);
});

test('warns once, about 200 m before each hazard', () => {
  const engine = new ProximityEngine();
  assertWarnedAt(drive(engine, [camera, police], 0, 1500), [['cam'], ['pol']]);
});

test('respects a custom alert distance', () => {
  const engine = new ProximityEngine();
  assertWarnedAt(drive(engine, [camera], 0, 1500, { ...config, alertDistance: 500 }), [['cam']], 500);
});

test('ignores hazards behind the car', () => {
  const engine = new ProximityEngine();
  // Start just past the camera, driving away from it.
  const events = drive(engine, [camera], 1100, 1500);
  assert.deepEqual(events, []);
});

test('when standing still every direction counts', () => {
  const engine = new ProximityEngine();
  const fix: Fix = { ...north(1100), speed: 0, heading: 0, timestamp: 1 };
  assert.deepEqual(
    engine.update(fix, [camera], config).fresh.map((n) => n.hazard.id),
    ['cam'],
  );
  // ...and only once while waiting there.
  assert.equal(engine.update({ ...fix, timestamp: 2 }, [camera], config).fresh.length, 0);
});

test('re-arms after driving well clear, so the same road warns again later', () => {
  const engine = new ProximityEngine();
  assert.equal(drive(engine, [camera], 0, 1500).length, 1);
  // Turn around and come back south past it.
  assertWarnedAt(drive(engine, [camera], 1500, 0), [['cam']]);
});

test('disabled kinds never warn', () => {
  const engine = new ProximityEngine();
  const events = drive(engine, [camera, police], 0, 1500, {
    ...config,
    kinds: { police: false, speed_camera: true, traffic_camera: true },
  });
  assertWarnedAt(events, [['cam']]);
});

test('reports the next hazard ahead beyond alert distance', () => {
  const engine = new ProximityEngine();
  const r = engine.update({ ...north(0), speed: 20, heading: 0, timestamp: 1 }, [camera, police], config);
  assert.equal(r.upcoming?.hazard.id, 'cam');
  assert.ok(Math.abs(r.upcoming!.distance - 1000) < 2);
});

test('mergeHazards drops expired entries and dedupes by id', () => {
  const a: Hazard = { ...camera, label: 'old' };
  const b: Hazard = { ...camera, label: 'new' };
  const gone: Hazard = { ...police, expiresAt: 5 };
  const merged = mergeHazards([[a, gone], [b]], 10);
  assert.deepEqual(
    merged.map((h) => h.label),
    ['new'],
  );
});
