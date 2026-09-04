/* tools/sync-hostdb.mjs — the release-time merge of the service's curated
 * tracker table into HOST_DB, and ck-saas.js applying the same table at runtime.
 *
 * The merge is tested against fixtures rather than the network, on purpose: a
 * unit test that fetches https://consent.ecomconsult.net fails whenever the
 * service is down or the machine is offline, which teaches everyone to ignore
 * it. What actually needs guarding is the merge logic — that a hand-written
 * entry is never overwritten, that re-running with unchanged data produces
 * identical bytes, and that the result is still something
 * tools/export-hostdb.mjs can parse (it reads the very literal this tool edits).
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

import {
  mergeSource, selectOverrides, handMaintainedHosts, findHostDb,
  renderedEntries, BEGIN, END, DEFAULT_URL
} from '../tools/sync-hostdb.mjs';

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const CORE = readFileSync(join(REPO, 'src', 'ck-core.js'), 'utf8');

/* A miniature ck-core.js: the same HOST_DB shape, small enough that an
   assertion about the merged text is readable. */
const FIXTURE = `(function (global) {
  var HOST_DB = {
    // --- analytics ---
    'known-analytics.example': 'analytics',
    'known-marketing.example': 'marketing'   // trailing comment
  };
  var PATH_DB = { '/gtag/js': 'analytics' };
})(window);
`;

/* --------------------------------------------------------------- extraction */

test('the HOST_DB literal is located in the real core', () => {
  const { open, close } = findHostDb(CORE);
  assert.ok(close > open, 'braces did not balance');
  assert.ok(CORE.slice(open, close).includes("'google-analytics.com'"));
});

test('hand-maintained hosts are read out of the real core', () => {
  const hosts = handMaintainedHosts(CORE);
  assert.ok(hosts.size >= 40, `only ${hosts.size} hosts found — the parser is broken`);
  assert.ok(hosts.has('doubleclick.net'));
  assert.ok(hosts.has('intercom.io'));
});

/* --------------------------------------------------------------- selection */

test('a host already in HOST_DB is skipped, never re-categorised', () => {
  const hand = handMaintainedHosts(FIXTURE);
  const { entries, skipped } = selectOverrides({
    'known-analytics.example': 'marketing',   // the service disagrees…
    'new-tracker.example': 'marketing'
  }, hand);
  assert.equal(skipped, 1, 'the existing host was not skipped');
  assert.deepEqual(entries, [['new-tracker.example', 'marketing']]);
});

test('malformed hosts and unknown categories are rejected, not written', () => {
  const { entries, rejected } = selectOverrides({
    'good.example': 'analytics',
    'no-dot': 'analytics',
    'sp ace.example': 'marketing',
    'bad-cat.example': 'advertising',
    'null-cat.example': null
  }, new Set());
  assert.deepEqual(entries, [['good.example', 'analytics']]);
  assert.equal(rejected.length, 4);
  // A bad category here would break `node tools/export-hostdb.mjs` later, far
  // from its cause — which is why it is caught at the point of entry.
  assert.ok(rejected.some((r) => r.includes('advertising')));
});

test('hosts are normalised (case, port, stray dots) and sorted', () => {
  const { entries } = selectOverrides({
    'ZZZ.example': 'marketing',
    'AAA.example:8443': 'analytics',
    '.mid.example.': 'functional'
  }, new Set());
  assert.deepEqual(entries, [
    ['aaa.example', 'analytics'],
    ['mid.example', 'functional'],
    ['zzz.example', 'marketing']
  ]);
});

test('a table that is not an object is refused', () => {
  assert.throws(() => selectOverrides(null, new Set()), /not a JSON object/);
  assert.throws(() => selectOverrides([1, 2], new Set()), /not a JSON object/);
});

test('an implausibly large table is refused as a wrong endpoint', () => {
  const huge = {};
  for (let i = 0; i < 2100; i++) { huge[`h${i}.example`] = 'marketing'; }
  assert.throws(() => selectOverrides(huge, new Set()), /wrong endpoint/);
});

/* ------------------------------------------------------------------- merge */

test('the merge appends a delimited block inside HOST_DB', () => {
  const r = mergeSource(FIXTURE, { 'new-tracker.example': 'marketing' }, '2026-09-05');
  assert.ok(r.changed);
  assert.ok(r.source.includes(`${BEGIN} 2026-09-05) ---`));
  assert.ok(r.source.includes(END));
  assert.ok(r.source.includes("'new-tracker.example': 'marketing',"));
  // The block sits INSIDE the literal, or the exporter would never see it.
  const { open, close } = findHostDb(r.source);
  assert.ok(r.source.indexOf(BEGIN) > open && r.source.indexOf(BEGIN) < close);
});

test('the comma before the block is added so the literal stays valid', () => {
  // The last hand-written entry has no trailing comma; without one the merged
  // literal is a syntax error and the exporter's vm evaluation throws.
  const r = mergeSource(FIXTURE, { 'new-tracker.example': 'marketing' }, '2026-09-05');
  const { open, close } = findHostDb(r.source);
  const value = vm.runInNewContext(`(${r.source.slice(open, close + 1)})`, Object.create(null));
  assert.equal(value['new-tracker.example'], 'marketing');
  assert.equal(value['known-analytics.example'], 'analytics', 'a hand-written entry was lost');
});

test('re-running with the same data changes nothing at all', () => {
  const remote = { 'a.example': 'marketing', 'b.example': 'analytics' };
  const first = mergeSource(FIXTURE, remote, '2026-09-05');
  // A later date must NOT move the header: a release diff that says only "a
  // tool was run" is noise, and noise is what stops people reading diffs.
  const second = mergeSource(first.source, remote, '2027-01-01');
  assert.equal(second.changed, false);
  assert.equal(second.source, first.source, 'an unchanged sync rewrote the file');
});

test('a new host replaces the block wholesale and moves the date', () => {
  const first = mergeSource(FIXTURE, { 'a.example': 'marketing' }, '2026-09-05');
  const second = mergeSource(first.source, { 'a.example': 'marketing', 'b.example': 'analytics' }, '2027-01-01');
  assert.ok(second.changed);
  assert.ok(second.source.includes('2027-01-01'));
  assert.ok(!second.source.includes('2026-09-05'), 'the old block survived');
  // Exactly one block, not two appended in sequence.
  assert.equal(second.source.split(BEGIN).length - 1, 1);
  assert.deepEqual(renderedEntries(second.source), [['a.example', 'marketing'], ['b.example', 'analytics']]);
});

test('an emptied remote table removes the block entirely', () => {
  const first = mergeSource(FIXTURE, { 'a.example': 'marketing' }, '2026-09-05');
  const second = mergeSource(first.source, {}, '2027-01-01');
  assert.ok(second.changed);
  assert.ok(!second.source.includes(BEGIN), 'the block outlived its data');
  const { open, close } = findHostDb(second.source);
  const value = vm.runInNewContext(`(${second.source.slice(open, close + 1)})`, Object.create(null));
  assert.equal(value['known-analytics.example'], 'analytics');
  assert.equal(Object.keys(value).length, 2, 'removing the block damaged HOST_DB');
});

test('a truncated block is a hard error rather than a silent double-write', () => {
  const broken = FIXTURE.replace("'known-marketing.example': 'marketing'",
    `'known-marketing.example': 'marketing',\n    ${BEGIN} 2026-01-01) ---\n    'x.example': 'marketing',`);
  assert.throws(() => mergeSource(broken, { 'y.example': 'marketing' }, '2026-09-05'), /without its closing/);
});

test('the merged real core is still parseable by the exporter', () => {
  // The exporter locates HOST_DB the same way and evaluates it; if the merge
  // ever produced something it cannot read, hostdb.php generation breaks.
  const merged = mergeSource(CORE, { 'service-added.example': 'marketing' }, '2026-09-05');
  const { open, close } = findHostDb(merged.source);
  const value = vm.runInNewContext(`(${merged.source.slice(open, close + 1)})`, Object.create(null), { timeout: 1000 });
  assert.equal(value['service-added.example'], 'marketing');
  assert.ok(Object.keys(value).length > 60);
  // And the client agrees with the file: loading the merged core classifies it.
  const g = { window: null, document: undefined };
  g.window = g;
  vm.runInNewContext(merged.source, g, { filename: 'merged-core.js' });
  assert.equal(g.ConsentKit._categoryForUrl('https://service-added.example/x.js'), 'marketing');
});

test('the default endpoint is the documented public one', () => {
  assert.equal(DEFAULT_URL, 'https://consent.ecomconsult.net/v1/public/hostdb.json');
});

/* ------------------------------------------- ck-saas.js applies it before init */

/* ck-saas.js is an IIFE that reads its own <script> tag and then calls
   CK.init(). The harness gives it just enough: a tag with data-ck-id, a
   ConsentKit spy that records the ORDER of _extendHostDb and init calls, and a
   localStorage carrying a cached config so the synchronous cache path runs. */
function runSaas({ cached = null, fetchImpl = null } = {}) {
  const SAAS = readFileSync(join(REPO, 'src', 'ck-saas.js'), 'utf8');
  const calls = [];
  const tag = {
    getAttribute: (n) => (n === 'data-ck-id' ? 'site-1' : n === 'data-ck-api' ? 'https://api.test' : null)
  };
  const store = {};
  if (cached) { store['ck_cfg_site-1'] = JSON.stringify({ etag: 'W/"1"', config: cached }); }

  const g = {};
  g.window = g;
  g.self = g;
  g.document = {
    currentScript: tag,
    querySelectorAll: () => [tag],
    addEventListener: () => {}
  };
  g.localStorage = {
    getItem: (k) => (k in store ? store[k] : null),
    setItem: (k, v) => { store[k] = String(v); }
  };
  g.console = { warn: () => {}, error: () => {} };
  g.navigator = {};
  g.addEventListener = () => {};
  g.setTimeout = (fn) => fn;
  g.clearTimeout = () => {};
  g.ConsentKit = {
    version: '0.4.0',
    init(cfg) { calls.push(['init', cfg]); return {}; },
    _extendHostDb(map) { calls.push(['_extendHostDb', map]); return Object.keys(map || {}).length; }
  };
  if (fetchImpl) { g.fetch = fetchImpl; }

  vm.runInNewContext(SAAS, g, { filename: 'src/ck-saas.js' });
  return { calls, store, g };
}

test('ck-saas applies config.hostdb BEFORE calling init', () => {
  const { calls } = runSaas({
    cached: { policyVersion: '1', hostdb: { 'curated.example': 'marketing' } }
  });
  const names = calls.map((c) => c[0]);
  assert.deepEqual(names, ['_extendHostDb', 'init'],
    'the overrides must be merged before init() scans the document');
  assert.equal(calls[0][1]['curated.example'], 'marketing');
});

test('ck-saas still initialises when the config carries no hostdb', () => {
  const { calls } = runSaas({ cached: { policyVersion: '1' } });
  assert.deepEqual(calls.map((c) => c[0]), ['init']);
});

test('ck-saas applies a changed hostdb on background revalidation', async () => {
  // The rest of a revalidated config deliberately waits for the next page load
  // (re-init would swap ConsentKit.config identity). hostdb is the exception:
  // extending the map only affects later insertions, which is exactly what
  // _extendHostDb promises for a call after init().
  const fresh = { policyVersion: '1', hostdb: { 'new-from-service.example': 'analytics' } };
  const fetchImpl = () => Promise.resolve({
    ok: true, status: 200,
    headers: { get: () => 'W/"2"' },
    json: () => Promise.resolve(fresh)
  });
  const { calls } = runSaas({ cached: { policyVersion: '1' }, fetchImpl });
  await new Promise((r) => setImmediate(r));
  await new Promise((r) => setImmediate(r));

  const extend = calls.filter((c) => c[0] === '_extendHostDb');
  assert.equal(extend.length, 1, 'the revalidated hostdb was not applied');
  assert.equal(extend[0][1]['new-from-service.example'], 'analytics');
  // …and init was NOT called a second time.
  assert.equal(calls.filter((c) => c[0] === 'init').length, 1);
});

test('ck-saas survives a core too old to know _extendHostDb', () => {
  const SAAS = readFileSync(join(REPO, 'src', 'ck-saas.js'), 'utf8');
  const calls = [];
  const tag = { getAttribute: (n) => (n === 'data-ck-id' ? 'site-1' : null) };
  const store = { 'ck_cfg_site-1': JSON.stringify({ etag: null, config: { policyVersion: '1', hostdb: { 'a.example': 'marketing' } } }) };
  const g = {};
  g.window = g; g.self = g;
  g.document = { currentScript: tag, querySelectorAll: () => [tag], addEventListener: () => {} };
  g.localStorage = { getItem: (k) => store[k] || null, setItem: () => {} };
  const warnings = [];
  g.console = { warn: (m) => warnings.push(String(m)), error: () => {} };
  g.navigator = {}; g.addEventListener = () => {};
  g.setTimeout = (fn) => fn; g.clearTimeout = () => {};
  g.ConsentKit = { version: '0.3.6', init: (c) => { calls.push('init'); return {}; } };  // no _extendHostDb

  vm.runInNewContext(SAAS, g, { filename: 'src/ck-saas.js' });
  assert.deepEqual(calls, ['init'], 'an old core must still be initialised');
  assert.ok(warnings.some((w) => w.includes('hostdb')), 'the mismatch should be reported');
});
