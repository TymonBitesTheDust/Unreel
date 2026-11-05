#!/usr/bin/env node
/**
 * Tests for the Safari extension and the iPhone userscript (they share content.js):
 *
 * - content.js runs in a sandbox per URL and must send each page to the expected place;
 * - rules.json (declarativeNetRequest, full page loads) must agree with it;
 * - the loop guard must stop after repeated bounces instead of reloading forever.
 *
 *   npm run test:userscript
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const code = readFileSync(join(root, 'targets/safari/assets/content.js'), 'utf8');
const rules = JSON.parse(readFileSync(join(root, 'targets/safari/assets/rules.json'), 'utf8'));

/** Runs content.js as if `href` had just loaded. Returns where it sent the page, if anywhere. */
function load(href, { storage = new Map(), now = 1_000_000 } = {}) {
  const url = new URL(href);
  const replaced = [];
  const appended = [];
  const element = () => ({ style: {}, setAttribute() {}, addEventListener() {}, remove() {} });
  const context = {
    location: { hostname: url.hostname, pathname: url.pathname, search: url.search, href: url.href, replace: (t) => replaced.push(t) },
    document: {
      body: { appendChild: (el) => appended.push(el) },
      addEventListener() {},
      getElementById: (id) => appended.find((el) => el.id === id) ?? null,
      createElement: element,
    },
    window: { addEventListener() {} },
    sessionStorage: { getItem: (k) => storage.get(k) ?? null, setItem: (k, v) => storage.set(k, String(v)) },
    setInterval: () => 0,
    URLSearchParams,
    Date: { now: () => now },
    JSON,
  };
  vm.runInNewContext(code, context);
  return { target: replaced[0] ?? null, notices: appended.length };
}

/** What Safari's declarativeNetRequest would do with a full page load of `href`. */
function dnr(href) {
  const matches = rules
    .map((r) => ({ r, m: new RegExp(r.condition.regexFilter).exec(href) }))
    .filter((x) => x.m && x.r.condition.resourceTypes.includes('main_frame'))
    .sort((a, b) => b.r.priority - a.r.priority);
  if (!matches.length) return null;
  const { r, m } = matches[0];
  if (r.action.redirect.url) return r.action.redirect.url;
  return r.action.redirect.regexSubstitution.replace(/\\(\d)/g, (_, n) => m[Number(n)] ?? '');
}

const youtube = [
  // [path, where content.js sends it (null = leave alone), where a full load is redirected]
  ['/shorts/abc123XYZ_-', '/watch?v=abc123XYZ_-', 'https://m.youtube.com/watch?v=abc123XYZ_-'],
  ['/shorts/abc123?feature=share', '/watch?v=abc123', 'https://m.youtube.com/watch?v=abc123'],
  ['/shorts/abc123?t=12', '/watch?v=abc123&t=12', 'https://m.youtube.com/watch?v=abc123'],
  ['/shorts', '/', 'https://www.youtube.com/'],
  ['/shorts/', '/', 'https://www.youtube.com/'],
  ['/@mkbhd/shorts', '/@mkbhd/videos', 'https://m.youtube.com/@mkbhd/videos'],
  ['/@mkbhd/shorts/', '/@mkbhd/videos', 'https://m.youtube.com/@mkbhd/videos'],
  ['/channel/UC123abc/shorts', '/channel/UC123abc/videos', 'https://m.youtube.com/channel/UC123abc/videos'],
  ['/c/SomeName/shorts', '/c/SomeName/videos', 'https://m.youtube.com/c/SomeName/videos'],
  ['/user/someone/shorts', '/user/someone/videos', 'https://m.youtube.com/user/someone/videos'],
  ['/hashtag/cats/shorts', '/hashtag/cats', 'https://m.youtube.com/hashtag/cats'],
  ['/', null, null],
  ['/watch?v=abc123', null, null],
  ['/@mkbhd', null, null],
  ['/@mkbhd/videos', null, null],
  ['/results?search_query=shorts', null, null],
  ['/feed/subscriptions', null, null],
  ['/hashtag/cats', null, null],
];

const instagram = [
  ['/reels/', '/', 'https://www.instagram.com/'],
  ['/reels', '/', 'https://www.instagram.com/'],
  ['/reels/?igsh=abc', '/', 'https://www.instagram.com/'],
  ['/reel/Cxyz12345/', '/p/Cxyz12345/', 'https://www.instagram.com/p/Cxyz12345/'],
  ['/reels/Cxyz12345/', '/p/Cxyz12345/', 'https://www.instagram.com/p/Cxyz12345/'],
  ['/reel/Cxyz12345/?igsh=xyz', '/p/Cxyz12345/', 'https://www.instagram.com/p/Cxyz12345/'],
  ['/reels/audio/1234567890/', '/', 'https://www.instagram.com/'],
  ['/natgeo/reels/', '/natgeo/', 'https://www.instagram.com/natgeo/'],
  ['/', null, null],
  ['/p/Cabc12345/', null, null],
  ['/natgeo/', null, null],
  ['/direct/inbox/', null, null],
  ['/stories/natgeo/3456789/', null, null],
  ['/explore/', null, null],
];

test('YouTube pages go where the Android app would send you', () => {
  for (const [path, expected] of youtube) {
    for (const host of ['www.youtube.com', 'm.youtube.com']) {
      assert.equal(load(`https://${host}${path}`).target, expected, `${host}${path}`);
    }
  }
});

test('Instagram pages go where the Android app would send you', () => {
  for (const [path, expected] of instagram) {
    assert.equal(load(`https://www.instagram.com${path}`).target, expected, path);
  }
});

test('full page loads are redirected by rules.json to the same place', () => {
  for (const [path, , expected] of youtube) assert.equal(dnr(`https://m.youtube.com${path}`), expected, `m.youtube.com${path}`);
  for (const [path, , expected] of instagram) assert.equal(dnr(`https://www.instagram.com${path}`), expected, path);
});

test('rules have unique ids and only rewrite top-level pages', () => {
  const ids = rules.map((r) => r.id);
  assert.equal(new Set(ids).size, ids.length);
  for (const r of rules) assert.deepEqual(r.condition.resourceTypes, ['main_frame'], `rule ${r.id}`);
});

test('other sites are left alone', () => {
  assert.equal(load('https://example.com/shorts/abc').target, null);
  assert.equal(load('https://notyoutube.com/shorts/abc').target, null);
});

test('stops after two bounces from the same page and shows a notice', () => {
  const storage = new Map();
  const href = 'https://m.youtube.com/shorts/abc123';
  assert.equal(load(href, { storage, now: 1_000 }).target, '/watch?v=abc123');
  assert.equal(load(href, { storage, now: 2_000 }).target, '/watch?v=abc123');
  const third = load(href, { storage, now: 3_000 });
  assert.equal(third.target, null, 'no third redirect within ten seconds');
  assert.equal(third.notices, 1, 'tells the user instead');
  // Ten seconds later it's a fresh visit again.
  assert.equal(load(href, { storage, now: 20_000 }).target, '/watch?v=abc123');
});

// ---- Screen time (screentime.js) ----------------------------------------------------------------

const screenCode = readFileSync(join(root, 'targets/safari/assets/screentime.js'), 'utf8');

/** Objects made inside the vm have its own prototypes; compare plain copies. */
const plain = (value) => JSON.parse(JSON.stringify(value));

/** The pure parts of screentime.js, as its test hook exposes them. */
function screenTime() {
  const context = { __UNREEL_TEST__: true, location: { hostname: 'www.youtube.com' }, Date, JSON, Object, Math, String };
  context.globalThis = context;
  vm.runInNewContext(screenCode, context);
  return context.__unreelScreenTime;
}

test('screen time sorts YouTube pages like the Android app', () => {
  const { partOf } = screenTime();
  const cases = [
    ['/', false, 'other'],
    ['/results', false, 'other'],
    ['/feed/subscriptions', false, 'other'],
    ['/@mkbhd/videos', false, 'other'],
    ['/watch', false, 'video'],
    ['/live/abc123', false, 'video'],
    ['/', true, 'video'], // The miniplayer: a video playing with sound counts wherever you are.
    ['/shorts/abc123', false, 'shorts'],
    ['/shorts', false, 'shorts'],
  ];
  for (const [path, playing, part] of cases) assert.equal(partOf('youtube', path, playing), part, `${path} playing=${playing}`);
});

test('screen time sorts Instagram pages like the Android app', () => {
  const { partOf } = screenTime();
  const cases = [
    ['/', 'normal'],
    ['/p/Cabc12345/', 'normal'],
    ['/reel/Cabc12345/', 'normal'], // One Reel, not the feed.
    ['/stories/natgeo/3456789/', 'normal'],
    ['/reels/', 'scrolling'],
    ['/reels/audio/123/', 'scrolling'],
    ['/direct/inbox/', 'chat'],
    ['/direct/t/123456/', 'chat'],
    ['/explore/', 'other'],
    ['/natgeo/', 'other'],
    ['/accounts/edit/', 'other'],
  ];
  for (const [path, part] of cases) assert.equal(partOf('instagram', path, false), part, path);
});

test('screen time parts match the Android app, in the same order', () => {
  const { SITES, siteOf } = screenTime();
  const kotlin = readFileSync(join(root, 'modules/unreel-blocker/android/src/main/java/expo/modules/unreelblocker/data/ScreenTimeStore.kt'), 'utf8');
  for (const site of ['youtube', 'instagram']) {
    const ids = [...new RegExp(`"${site}" to listOf\\(([^)]*)\\)`).exec(kotlin)[1].matchAll(/"(\w+)"/g)].map((m) => m[1]);
    assert.deepEqual(plain(SITES[site].parts.map(([id]) => id)), ids, site);
  }
  assert.equal(siteOf('m.youtube.com'), 'youtube');
  assert.equal(siteOf('www.instagram.com'), 'instagram');
  assert.equal(siteOf('notyoutube.com'), null);
});

test('screen time adds up per day, keeps 60 days and lists the last week', () => {
  const { add, merge, prune, lastDays, dayKey, parse } = screenTime();
  const now = new Date(2026, 10, 5, 15, 0).getTime();
  const day = 24 * 60 * 60_000;
  const store = parse(null);
  add(store, now, 'video', 60_000);
  add(store, now, 'video', 30_000);
  add(store, now - day, 'other', 5_000);
  add(store, now - 90 * day, 'video', 1_000);
  merge(store, { days: { [dayKey(now)]: { shorts: 2_000 } } });
  prune(store, now);

  assert.deepEqual(plain(store.days[dayKey(now)]), { video: 90_000, shorts: 2_000 });
  assert.equal(store.days[dayKey(now - 90 * day)], undefined, 'older than 60 days is dropped');
  const week = lastDays(store, 7, now);
  assert.equal(week.length, 7);
  assert.equal(week[6].date, dayKey(now));
  assert.deepEqual(plain(week[5].parts), { other: 5_000 });
  assert.deepEqual(plain(week[0].parts), {});
});

test('screen time survives unreadable storage', () => {
  const { parse } = screenTime();
  for (const raw of [null, '', 'not json', '[]', '{"days":[]}', '{"days":null}']) assert.deepEqual(plain(parse(raw)), { days: {} }, String(raw));
});

test('screen time durations read the same as on Android', () => {
  const { durationText } = screenTime();
  const min = 60_000;
  assert.equal(durationText(0), '0 min');
  assert.equal(durationText(30_000), 'under 1 min');
  assert.equal(durationText(45 * min), '45 min');
  assert.equal(durationText(120 * min), '2 h');
  assert.equal(durationText(72 * min), '1 h 12 min');
});
