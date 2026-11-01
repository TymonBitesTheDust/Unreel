/// <reference types="node" />
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { buildOverpassQuery, parseOverpass } from './osm';
import { parseWazeFeed } from './waze';

test('Overpass query covers cameras and enforcement relations, by box or along a route', () => {
  const q = buildOverpassQuery({ bbox: { south: 1, west: 2, north: 3, east: 4 } });
  assert.match(q, /node\["highway"="speed_camera"\]\(1\.000000,2\.000000,3\.000000,4\.000000\);/);
  assert.match(q, /rel\["type"="enforcement"\]/);
  assert.match(q, /node\(r\.hits\)/);
  const along = buildOverpassQuery({
    around: {
      radius: 100,
      line: [
        { latitude: 1, longitude: 2 },
        { latitude: 3, longitude: 4 },
      ],
    },
  });
  assert.match(along, /\(around:100,1\.000000,2\.000000,3\.000000,4\.000000\)/);
});

test('parses OpenStreetMap cameras and merges enforcement relations', () => {
  const hazards = parseOverpass({
    elements: [
      { type: 'node', id: 1, lat: 52.1, lon: 4.1, tags: { highway: 'speed_camera', maxspeed: '50' } },
      { type: 'node', id: 2, lat: 52.2, lon: 4.2, tags: { man_made: 'surveillance', 'surveillance:zone': 'traffic' } },
      { type: 'node', id: 3, lat: 52.3, lon: 4.3 }, // untagged red-light camera device
      { type: 'node', id: 4, lat: 52.31, lon: 4.31 }, // the junction it watches
      { type: 'node', id: 5, lat: 52.4, lon: 4.4, tags: { man_made: 'surveillance', 'surveillance:type': 'ALPR' } },
      { type: 'node', id: 6, lat: 52.5, lon: 4.5, tags: { amenity: 'cafe' } },
      {
        type: 'relation',
        id: 10,
        tags: { type: 'enforcement', enforcement: 'maxspeed', maxspeed: '70' },
        members: [{ type: 'node', ref: 1, role: 'device' }],
      },
      {
        type: 'relation',
        id: 11,
        tags: { type: 'enforcement', enforcement: 'traffic_signals' },
        members: [
          { type: 'node', ref: 3, role: 'device' },
          { type: 'node', ref: 4, role: 'to' },
        ],
      },
    ],
  });
  const byId = Object.fromEntries(hazards.map((h) => [h.id, h]));
  assert.equal(hazards.length, 4);
  assert.deepEqual(
    [byId['osm-n1'].kind, byId['osm-n1'].label, byId['osm-n1'].speedLimit],
    ['speed_camera', 'Speed camera', '70 km/h'],
  );
  assert.equal(byId['osm-n2'].kind, 'traffic_camera');
  assert.deepEqual([byId['osm-n3'].kind, byId['osm-n3'].label], ['traffic_camera', 'Red-light camera']);
  assert.equal(byId['osm-n5'].label, 'Number-plate camera');
  assert.equal(byId['osm-n4'], undefined);
  assert.throws(() => parseOverpass({ remark: 'runtime error' }));
});

test('parses police from a Waze for Cities feed', () => {
  const hazards = parseWazeFeed(
    {
      alerts: [
        {
          uuid: 'a',
          type: 'POLICE',
          subtype: 'POLICE_HIDING',
          location: { x: 4.9, y: 52.37 },
          street: 'A10',
          pubMillis: 1000,
        },
        { uuid: 'b', type: 'ACCIDENT', location: { x: 4.9, y: 52.37 } },
        { uuid: 'c', type: 'POLICE', subtype: '', location: { x: 4.8, y: 52.3 } },
        { uuid: 'd', type: 'POLICE', location: {} },
      ],
      jams: [],
    },
    5000,
  );
  assert.deepEqual(
    hazards.map((h) => [h.id, h.kind, h.label, h.latitude, h.longitude, h.street]),
    [
      ['waze-a', 'police', 'Hidden police', 52.37, 4.9, 'A10'],
      ['waze-c', 'police', 'Police', 52.3, 4.8, undefined],
    ],
  );
  assert.ok(hazards.every((h) => h.expiresAt! > 5000));
  assert.throws(() => parseWazeFeed({ nope: true }, 0));
});
