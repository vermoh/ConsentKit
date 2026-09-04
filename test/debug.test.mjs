/* src/ck-debug.js — the opt-in debug panel (SPEC §8.1).
 *
 * Two things must hold and nothing else notices when they stop holding:
 *
 *  1. Activation. The panel is off by default. `?ck_debug=1`, `#ck_debug` and
 *     localStorage all turn it on; `?ck_debug=0` turns it off AND forgets the
 *     stored flag. Get this wrong in either direction and either every visitor
 *     of a production site sees a debug panel, or the owner cannot get rid of
 *     one.
 *
 *  2. The report carries no PII. It is meant to be pasted into a support
 *     ticket, so it must hold host+path but never query strings (tracker URLs
 *     put ids there) and cookie names but never values.
 *
 * Like the core, ck-debug.js is a classic side-effect script rather than a
 * module: it is concatenated into ready/*.txt and printed as a plain <script>
 * by the WordPress plugin. It is therefore loaded here the same way
 * version.test.mjs loads the core — a window stub plus vm.runInThisContext —
 * and the functions under test are read back off the global it publishes.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SOURCE = readFileSync(join(REPO, 'src', 'ck-debug.js'), 'utf8');

/* Loads ck-debug.js against a stub window. `env` may supply `location`,
   `localStorage` and a `document`; anything omitted is simply absent, which is
   the case the file has to survive without throwing. Returns the published
   `__ckDebug` surface plus the stub, so a test can inspect what was touched. */
function load(env = {}) {
  const g = globalThis;
  const saved = {
    window: g.window, self: g.self, document: g.document,
    location: g.location, localStorage: g.localStorage,
    ConsentKit: g.ConsentKit, __ckDebug: g.__ckDebug, dataLayer: g.dataLayer
  };
  for (const k of Object.keys(saved)) { delete g[k]; }

  g.window = g;
  g.self = g;
  if (env.location) g.location = env.location;
  if (env.localStorage) g.localStorage = env.localStorage;
  if (env.document) g.document = env.document;
  if (env.ConsentKit) g.ConsentKit = env.ConsentKit;

  try {
    vm.runInThisContext(SOURCE, { filename: 'src/ck-debug.js' });
    const api = g.__ckDebug;
    assert.ok(api, 'src/ck-debug.js did not publish window.__ckDebug');
    return api;
  } finally {
    for (const k of Object.keys(saved)) {
      if (saved[k] === undefined) { delete g[k]; } else { g[k] = saved[k]; }
    }
  }
}

/* A localStorage stub that records writes, so the "sticky" behaviour of the
   query parameter can be asserted rather than assumed. */
function fakeStorage(initial = {}) {
  const data = { ...initial };
  return {
    data,
    getItem: (k) => (k in data ? data[k] : null),
    setItem: (k, v) => { data[k] = String(v); },
    removeItem: (k) => { delete data[k]; }
  };
}

/* ------------------------------------------------------------- activation */

const parse = load().parseActivation;

test('off by default: no parameter, no stored flag', () => {
  assert.deepEqual(parse('', '', null), { active: false, persist: null });
  assert.deepEqual(parse('?utm_source=x', '#section', null), { active: false, persist: null });
});

test('?ck_debug=1 turns it on and is sticky', () => {
  assert.deepEqual(parse('?ck_debug=1', '', null), { active: true, persist: 'on' });
  // A leading "?" is optional and the parameter may sit anywhere in the query.
  assert.deepEqual(parse('ck_debug=1', '', null), { active: true, persist: 'on' });
  assert.deepEqual(parse('?a=1&ck_debug=1&b=2', '', null), { active: true, persist: 'on' });
});

test('a bare ?ck_debug (no value) counts as on', () => {
  assert.deepEqual(parse('?ck_debug', '', null), { active: true, persist: 'on' });
});

test('#ck_debug turns it on', () => {
  assert.deepEqual(parse('', '#ck_debug', null), { active: true, persist: 'on' });
  assert.deepEqual(parse('', '#ck_debug=1', null), { active: true, persist: 'on' });
  assert.deepEqual(parse('', '#pricing', null), { active: false, persist: null });
});

test('?ck_debug=0 turns it off and clears the stored flag', () => {
  // The important half: it must beat a stored '1', otherwise the panel can
  // never be dismissed from the URL once it has been switched on.
  assert.deepEqual(parse('?ck_debug=0', '', '1'), { active: false, persist: 'off' });
  assert.deepEqual(parse('?ck_debug=false', '', '1'), { active: false, persist: 'off' });
  assert.deepEqual(parse('?ck_debug=', '', '1'), { active: false, persist: 'off' });
});

test('the query parameter beats the hash', () => {
  assert.deepEqual(parse('?ck_debug=0', '#ck_debug', '1'), { active: false, persist: 'off' });
});

test('a stored flag alone activates but changes nothing', () => {
  assert.deepEqual(parse('', '', '1'), { active: true, persist: null });
  assert.deepEqual(parse('', '', '0'), { active: false, persist: null });
});

/* ------------------------------------------------------------ no-op guard */

test('inactive: nothing is created, nothing is observed', () => {
  // A real document stub, so "nothing happened" is an observation rather than
  // the absence of an opportunity: appendChild would have been called if the
  // panel had mounted.
  const created = [];
  const appended = [];
  let observers = 0;
  const doc = {
    readyState: 'complete',
    cookie: 'ck_consent=SECRET; sid=abc',
    createElement: (tag) => { created.push(tag); return { setAttribute() {}, appendChild() {}, addEventListener() {}, style: {} }; },
    getElementById: () => null,
    addEventListener() {},
    body: { appendChild: (n) => appended.push(n) }
  };
  const g = globalThis;
  const savedPO = g.PerformanceObserver;
  g.PerformanceObserver = function () { observers++; this.observe = () => {}; };
  try {
    const api = load({
      document: doc,
      location: { search: '?utm=1', hash: '', href: 'https://example.com/', hostname: 'example.com' },
      localStorage: fakeStorage()
    });
    assert.equal(api.active, false, 'the panel reported itself active without activation');
    assert.deepEqual(created, [], 'ck-debug.js created DOM nodes while inactive');
    assert.deepEqual(appended, [], 'ck-debug.js appended a host while inactive');
    assert.equal(observers, 0, 'ck-debug.js installed a PerformanceObserver while inactive');
  } finally {
    if (savedPO === undefined) { delete g.PerformanceObserver; } else { g.PerformanceObserver = savedPO; }
  }
});

test('loading with no location and no localStorage does not throw', () => {
  // Server-side rendering and hardened browsers both reach this path; the file
  // must publish its API and return quietly rather than take the page down.
  const api = load();
  assert.equal(api.active, false);
  assert.equal(typeof api.buildReport, 'function');
});

test('?ck_debug=1 persists the flag, ?ck_debug=0 removes it', () => {
  // Asserted through the real load path (not just the pure parser), because
  // the persistence is what makes the panel survive navigation.
  const on = fakeStorage();
  load({ location: { search: '?ck_debug=1', hash: '', href: 'https://e.test/' }, localStorage: on });
  assert.equal(on.data.ck_debug, '1', 'activation was not remembered');

  const off = fakeStorage({ ck_debug: '1' });
  load({ location: { search: '?ck_debug=0', hash: '', href: 'https://e.test/' }, localStorage: off });
  assert.equal(off.data.ck_debug, undefined, '?ck_debug=0 left the flag behind');
});

/* ---------------------------------------------------------------- report */

const { buildReport, buildRequests, stripUrl } = load();

// A stand-in for ConsentKit._categoryForUrl, so the report test does not
// depend on the contents of HOST_DB.
const classify = (url) =>
  /google-analytics|mc\.yandex/.test(url) ? 'analytics'
    : /facebook|doubleclick/.test(url) ? 'marketing'
      : null;

test('stripUrl keeps host and path, drops the query and fragment', () => {
  assert.deepEqual(
    stripUrl('https://www.google-analytics.com/collect?tid=UA-1&cid=SECRET#frag'),
    { host: 'www.google-analytics.com', path: '/collect' }
  );
  assert.deepEqual(stripUrl('https://mc.yandex.ru:443/watch/12345'),
    { host: 'mc.yandex.ru', path: '/watch/12345' });
});

test('requests are classified and split before/after the decision', () => {
  const entries = [
    { name: 'https://www.google-analytics.com/g/collect?v=2&cid=X', startTime: 120, initiatorType: 'fetch' },
    { name: 'https://connect.facebook.net/en_US/fbevents.js?id=1', startTime: 900, initiatorType: 'script' },
    { name: 'https://example.com/styles.css', startTime: 50, initiatorType: 'link' }
  ];
  const out = buildRequests(entries, 500, classify);

  assert.equal(out.length, 2, 'a non-tracker request leaked into the list');
  assert.deepEqual(out.map((r) => [r.host, r.category, r.when]), [
    ['www.google-analytics.com', 'analytics', 'before'],
    ['connect.facebook.net', 'marketing', 'after']
  ]);
  assert.ok(out.every((r) => !JSON.stringify(r).includes('cid=X')), 'a query string survived');
});

test('with no decision yet every request counts as "before"', () => {
  const out = buildRequests(
    [{ name: 'https://mc.yandex.ru/watch/1', startTime: 10 }], null, classify);
  assert.equal(out[0].when, 'before');
});

test('repeat requests to the same host+path collapse into a count', () => {
  const out = buildRequests([
    { name: 'https://mc.yandex.ru/watch/1?a=1', startTime: 10 },
    { name: 'https://mc.yandex.ru/watch/1?a=2', startTime: 20 }
  ], null, classify);
  assert.equal(out.length, 1);
  assert.equal(out[0].count, 2);
});

test('buildReport assembles all six sections from plain data', () => {
  const r = buildReport({
    now: '2026-09-04T10:00:00.000Z',
    version: '0.3.5',
    siteId: 'site_abc',
    etag: 'W/"7"',
    ttlDays: 180,
    state: {
      decided: true, ts: '2026-09-04T09:59:00.000Z', policyVersion: '2', method: 'custom',
      categories: { necessary: true, functional: true, analytics: true, marketing: false }
    },
    blocked: [{ host: 'connect.facebook.net', path: '/en_US/fbevents.js', kind: 'script', category: 'marketing', origin: 'engine' }],
    entries: [{ name: 'https://mc.yandex.ru/watch/1?id=SECRET', startTime: 700 }],
    consentAtMs: 500,
    classify,
    consentMode: [{ type: 'gtag consent update', signals: { analytics_storage: 'granted' }, at: 500 }],
    cookieNames: ['ck_consent', '_ga']
  });

  assert.equal(r.client.version, '0.3.5');
  assert.equal(r.client.source, 'saas', 'a siteId should mark the config as SaaS-sourced');
  assert.equal(r.client.policyVersion, '2');
  assert.equal(r.consent.status, 'partial');
  assert.equal(r.consent.ttlDays, 180);
  assert.equal(r.blocked.length, 1);
  assert.equal(r.requests[0].when, 'after');
  assert.equal(r.consentMode.length, 1);
  assert.ok(r.note, 'the honest note about pre-load requests is missing');
});

test('consent status covers all four cases', () => {
  const at = (cats, decided = true) => buildReport({ state: { decided, categories: cats } }).consent.status;
  assert.equal(at({}, false), 'none');
  assert.equal(at({ functional: true, analytics: true, marketing: true }), 'accepted');
  assert.equal(at({ functional: false, analytics: false, marketing: false }), 'rejected');
  assert.equal(at({ functional: true, analytics: false, marketing: false }), 'partial');
});

test('the report carries no cookie values and no query strings', () => {
  // The whole point of the copy-report button: it is safe to paste anywhere.
  const json = JSON.stringify(buildReport({
    state: { decided: true, categories: { analytics: true } },
    entries: [{ name: 'https://www.google-analytics.com/collect?tid=UA-9&uid=user@example.com', startTime: 1 }],
    consentAtMs: 0,
    classify,
    blocked: [{ host: 'mc.yandex.ru', path: '/watch/1', kind: 'script', category: 'analytics', origin: 'engine' }],
    cookieNames: ['ck_consent', '_ga', 'sessionid']
  }));

  assert.ok(!json.includes('user@example.com'), 'an address from a tracker URL reached the report');
  assert.ok(!json.includes('UA-9'), 'a tracker id from a query string reached the report');
  assert.ok(!json.includes('tid='), 'a query string reached the report');
  assert.ok(json.includes('ck_consent'), 'cookie names should be listed');
});

test('a report built from nothing is still well-formed', () => {
  const r = buildReport();
  assert.equal(r.consent.status, 'none');
  assert.deepEqual(r.blocked, []);
  assert.deepEqual(r.requests, []);
  assert.equal(r.consent.categories.necessary, true);
});

/* --------------------------------------------------- the core's registry */

test('ConsentKit._blocked() exists and returns a list', () => {
  // ck-debug.js reads this; §8.1 item 3 is empty without it.
  const g = globalThis;
  const saved = { window: g.window, self: g.self, ConsentKit: g.ConsentKit };
  g.window = g;
  g.self = g;
  try {
    vm.runInThisContext(readFileSync(join(REPO, 'src', 'ck-core.js'), 'utf8'),
      { filename: 'src/ck-core.js' });
    assert.equal(typeof g.ConsentKit._blocked, 'function');
    assert.ok(Array.isArray(g.ConsentKit._blocked()));
  } finally {
    for (const k of Object.keys(saved)) {
      if (saved[k] === undefined) { delete g[k]; } else { g[k] = saved[k]; }
    }
  }
});
