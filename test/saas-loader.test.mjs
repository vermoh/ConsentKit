/* src/ck-saas.js — more than one snippet on the same page (SPEC §1).
 *
 * The bug this suite exists for: a site that migrated between two site ids and
 * left the old <script> in place. The dead id 404s, and before 0.5.14 that 404
 * raised the strict fallback — re-initialising the core with every opt-in
 * category denied, over the top of a banner the LIVE snippet had already
 * configured correctly. A block nobody had looked at in a year silently broke
 * the consent UI.
 *
 * The arbitration is entirely about ordering, so the harness below runs N real
 * copies of the loader in ONE shared vm context (that shared context is what
 * window.__ckSaas is for) and hands the test explicit control over which fetch
 * resolves when. Nothing here uses real timers: setTimeout is a no-op stub and
 * every ordering is expressed by resolving deferreds in a chosen sequence.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SAAS = readFileSync(join(REPO, 'src', 'ck-saas.js'), 'utf8');

/* A promise plus the handles to settle it later. The loader's own control flow
   is all promise-based, so "resolve the second tag's fetch first" is expressed
   here and nowhere else. */
function deferred() {
  let resolve_, reject_;
  const promise = new Promise((res, rej) => { resolve_ = res; reject_ = rej; });
  return { promise, resolve: resolve_, reject: reject_ };
}

const res = (status, body) => ({
  ok: status >= 200 && status < 300,
  status,
  headers: { get: (h) => (h.toLowerCase() === 'etag' ? 'W/"e"' : null) },
  json: () => Promise.resolve(body)
});

/* Lets every pending microtask chain drain. The loader goes fetch -> .then ->
   res.json() -> .then, so a single await is not enough. */
const settle = async () => { for (let i = 0; i < 12; i++) { await Promise.resolve(); } };

/* Arrays built inside the vm context have that context's Array.prototype, so
   deepStrictEqual rejects them as "same structure, not reference-equal". Copy
   into this realm before comparing. */
const plain = (a) => Array.prototype.slice.call(a || []);

/* One page, N loaders.
 *
 *   ids      — the data-ck-id of each <script>, in document order
 *   cache    — { siteId: config } preloaded into localStorage
 *
 * Returns the shared context plus a `run(i)` that executes the loader for
 * tags[i] with document.currentScript pointing at it, and a `fetches` log whose
 * entries carry the deferred each call is waiting on.
 */
function makePage({ ids, cache = {} }) {
  const warnings = [];
  const inits = [];
  const fetches = [];
  const store = {};

  for (const [siteId, config] of Object.entries(cache)) {
    store['ck_cfg_' + siteId] = JSON.stringify({ etag: 'W/"cached"', config });
  }

  const tags = ids.map((id) => ({
    getAttribute: (n) => (n === 'data-ck-id' ? id : n === 'data-ck-api' ? 'https://api.test' : null)
  }));

  const g = {};
  g.window = g;
  g.self = g;
  g.Promise = Promise;
  g.document = {
    currentScript: null,
    // Every loader sees every tag. On a real page the first loader would see
    // only the tags parsed so far, but "all of them, always" is the harsher
    // input: it is what makes the duplicate warning fire twice unless the
    // once-guard actually lives in shared state.
    querySelectorAll: (sel) => (sel === 'script[data-ck-id]' ? tags : []),
    addEventListener: () => {}
  };
  g.localStorage = {
    getItem: (k) => (k in store ? store[k] : null),
    setItem: (k, v) => { store[k] = String(v); }
  };
  g.console = {
    warn: (msg) => { warnings.push(String(msg)); },
    error: (msg) => { warnings.push(String(msg)); }
  };
  g.navigator = {};
  g.addEventListener = () => {};
  // No real timers anywhere: the abort timer never needs to fire, because
  // every test drives its outcomes explicitly.
  g.setTimeout = () => 0;
  g.clearTimeout = () => {};
  g.AbortController = function () { this.signal = null; this.abort = () => {}; };

  g.fetch = (url, opts) => {
    const d = deferred();
    fetches.push({ url, opts, deferred: d });
    return d.promise;
  };

  g.ConsentKit = {
    version: '0.5.14',
    config: null,
    init(config) {
      inits.push(config);
      g.ConsentKit.config = config;
      return { decided: false, categories: {} };
    },
    getState() { return { decided: false, categories: {} }; },
    _extendHostDb() { return 0; },
    _deniedServices() { return []; }
  };

  const ctx = vm.createContext(g);

  return {
    g, ctx, warnings, inits, fetches, store,
    run(i) {
      g.document.currentScript = tags[i];
      vm.runInContext(SAAS, ctx, { filename: 'src/ck-saas.js' });
    },
    // The fetch issued for a given site id, by the URL the loader built.
    fetchFor(siteId) {
      return fetches.find((f) => f.url.indexOf('/v1/config/' + siteId + '.json') !== -1);
    },
    dupWarnings() {
      return warnings.filter((w) => w.indexOf('another ConsentKit snippet') !== -1);
    }
  };
}

/* ------------------------------------------------------------------ case (a) */

test('a dead second snippet does not take the page down with it', async () => {
  // The migration case, with the WORST ordering: the dead id answers first, so
  // at the moment the 404 lands nothing has initialised yet and the pre-0.5.14
  // loader would have gone straight to the strict fallback.
  const page = makePage({ ids: ['live-1', 'dead-2'] });
  page.run(0);
  page.run(1);

  assert.equal(page.fetches.length, 2, 'each distinct snippet fetches its own config');

  page.fetchFor('dead-2').deferred.resolve(res(404));
  await settle();

  assert.deepEqual(page.inits, [],
    'the 404 initialised the page while the other snippet was still in flight');
  assert.equal(page.g.__ckSaas.pending, 1, 'the live snippet must still be counted');

  page.fetchFor('live-1').deferred.resolve(res(200, { v: 3, policyVersion: '1' }));
  await settle();

  assert.equal(page.inits.length, 1, 'init() must run exactly once');
  assert.equal(page.inits[0].policyVersion, '1', 'the page must run the network config');
  assert.notEqual(page.inits[0].policyVersion, 'strict-fallback');
  assert.equal(page.g.ConsentKit._saas.strictFallback, false);
  assert.equal(page.dupWarnings().length, 1,
    'the duplicate-snippet warning must be said once per page, not once per loader');
  assert.deepEqual(plain(page.g.ConsentKit._saas.siteIds), ['live-1', 'dead-2']);
  assert.equal(page.g.__ckSaas.failures.length, 1);
  assert.match(page.g.__ckSaas.failures[0], /^dead-2: site not found \(404\)$/);
});

test('the loser is told which snippet won, in either order', async () => {
  // Same page, opposite resolution order: the live config lands first, so the
  // 404 arrives after the banner is already up. Nothing may re-initialise.
  const page = makePage({ ids: ['live-1', 'dead-2'] });
  page.run(0);
  page.run(1);

  page.fetchFor('live-1').deferred.resolve(res(200, { v: 3, policyVersion: '1' }));
  await settle();
  assert.equal(page.inits.length, 1);

  page.fetchFor('dead-2').deferred.resolve(res(404));
  await settle();

  assert.equal(page.inits.length, 1,
    'a late 404 re-initialised the core over a live banner');
  assert.ok(
    page.warnings.some((w) => w.indexOf('the page is driven by snippet live-1') !== -1),
    'the warning must name the snippet that actually configured the page'
  );
  assert.equal(page.g.ConsentKit._saas.strictFallback, false);
});

/* ------------------------------------------------------------------ case (b) */

test('the strict fallback returns when EVERY snippet fails', async () => {
  const page = makePage({ ids: ['dead-1', 'dead-2'] });
  page.run(0);
  page.run(1);

  page.fetchFor('dead-1').deferred.resolve(res(404));
  await settle();
  assert.deepEqual(page.inits, [], 'the strict fallback fired while a snippet was still pending');
  assert.ok(
    page.warnings.some((w) => w.indexOf('waiting for the other snippet') !== -1),
    'the first failure must say it is waiting rather than give up'
  );

  page.fetchFor('dead-2').deferred.resolve(res(500));
  await settle();

  assert.equal(page.inits.length, 1, 'the strict fallback must be raised exactly once');
  assert.equal(page.inits[0].policyVersion, 'strict-fallback');
  assert.equal(page.g.__ckSaas.strictFallback, true);
  assert.equal(page.g.ConsentKit._saas.strictFallback, true,
    'a _saas published before the fallback must still report it');
  // Both reasons reach the warning: a site owner debugging this needs to know
  // that BOTH ids are broken, not just the last one to answer.
  const strict = page.warnings.find((w) => w.indexOf('strict fallback') !== -1);
  assert.ok(strict.indexOf('dead-1: site not found (404)') !== -1, strict);
  assert.ok(strict.indexOf('dead-2: HTTP 500') !== -1, strict);
});

/* ------------------------------------------------------------------ case (c) */

test('a single snippet with a dead id behaves exactly as it did in 0.5.13', async () => {
  const page = makePage({ ids: ['dead-1'] });
  page.run(0);

  page.fetchFor('dead-1').deferred.resolve(res(404));
  await settle();

  assert.equal(page.inits.length, 1);
  assert.equal(page.inits[0].policyVersion, 'strict-fallback');
  assert.deepEqual(page.dupWarnings(), [], 'one snippet is not a duplicate');
  const strict = page.warnings.find((w) => w.indexOf('strict fallback') !== -1);
  assert.ok(strict.indexOf('config unavailable (') !== -1,
    'the 0.5.13 warning prefix must survive: ' + strict);
  assert.equal(page.g.__ckSaas.pending, 0);
  assert.deepEqual(plain(page.g.ConsentKit._saas.siteIds), ['dead-1']);
  // _saas is published synchronously, before the 404 lands. This is true only
  // because initStrict() reaches back and mutates the already-published object.
  assert.equal(page.g.ConsentKit._saas.strictFallback, true,
    'a single dead snippet must still report the fallback to the panel');
});

test('a lone network error still reaches the strict fallback', async () => {
  const page = makePage({ ids: ['site-1'] });
  page.run(0);

  page.fetchFor('site-1').deferred.reject(new Error('offline'));
  await settle();

  assert.equal(page.inits.length, 1);
  assert.equal(page.inits[0].policyVersion, 'strict-fallback');
});

test('the wait for the other snippet is bounded by CFG_TIMEOUT_MS', async () => {
  /* Every other test resolves both snippets explicitly, so none of them shows
     that the «waiting for the other snippet» branch ever ENDS. It does, because
     fetchConfig arms an abort timer at CFG_TIMEOUT_MS and maps the resulting
     AbortError to the timeout reason — a snippet whose server never answers at
     all cannot strand the page without a banner. Rejecting with an AbortError
     is exactly what that timer causes. */
  const page = makePage({ ids: ['dead-1', 'silent-2'] });
  page.run(0);
  page.run(1);

  page.fetchFor('dead-1').deferred.resolve(res(404));
  await settle();
  assert.deepEqual(page.inits, [], 'the page must still be waiting on the second snippet');

  const err = new Error('aborted');
  err.name = 'AbortError';
  page.fetchFor('silent-2').deferred.reject(err);
  await settle();

  assert.equal(page.inits.length, 1);
  assert.equal(page.inits[0].policyVersion, 'strict-fallback');
  const strict = page.warnings.find((w) => w.indexOf('strict fallback') !== -1);
  // The literal 3000 pins the reason string to CFG_TIMEOUT_MS: tuning the
  // constant without revisiting the message fails here.
  assert.ok(strict.indexOf('silent-2: timeout after 3000ms') !== -1, strict);
  assert.ok(strict.indexOf('dead-1: site not found (404)') !== -1, strict);
});

/* ------------------------------------------------------------------ case (d) */

test('a cached first snippet wins immediately over a second that 404s', async () => {
  // The cache path initialises SYNCHRONOUSLY, so `done` is already true when
  // the second loader even starts. The trap here is the background
  // revalidation the cached path fires: it must not be able to decrement the
  // counter or record a failure a second time.
  const page = makePage({
    ids: ['cached-1', 'dead-2'],
    cache: { 'cached-1': { v: 9, policyVersion: 'from-cache' } }
  });
  page.run(0);
  assert.equal(page.inits.length, 1, 'a cache hit must initialise without waiting for the network');
  assert.equal(page.inits[0].policyVersion, 'from-cache');

  page.run(1);
  page.fetchFor('dead-2').deferred.resolve(res(404));
  await settle();

  assert.equal(page.inits.length, 1, 'the dead snippet re-initialised over a cached config');
  assert.equal(page.dupWarnings().length, 1);
  assert.ok(
    page.warnings.some((w) => w.indexOf('the page is driven by snippet cached-1') !== -1),
    'the dead snippet must point at the cached one'
  );
  assert.equal(page.g.ConsentKit._saas.strictFallback, false);

  // The revalidation fails too. Nothing may change: the page is already
  // running the cached config and that failure was never the page's problem.
  const reval = page.fetchFor('cached-1');
  assert.ok(reval, 'the cache path did not revalidate in the background');
  reval.deferred.reject(new Error('offline'));
  await settle();

  assert.equal(page.inits.length, 1, 'a failed revalidation must not re-initialise');
  assert.equal(page.g.__ckSaas.pending, 0,
    'the revalidation decremented a counter its loader had already settled');
  assert.equal(page.g.__ckSaas.failures.length, 1,
    'a background revalidation is not a config failure');
  assert.equal(page.g.__ckSaas.strictFallback, undefined);
});

/* ------------------------------------------------------------------ case (e) */

test('the same id twice is Tilda, not a misconfiguration', async () => {
  // Tilda duplicates the head block on some page types. Warning about it would
  // be noise the owner cannot act on, and initialising twice would cost a
  // second config request and a second CK.init().
  const page = makePage({ ids: ['site-1', 'site-1'] });
  page.run(0);
  page.run(1);

  assert.deepEqual(page.dupWarnings(), [],
    'the same id twice is a duplicated block, not two snippets');
  assert.equal(page.fetches.length, 1, 'the duplicate must not fetch the config again');
  assert.equal(page.g.__ckSaas.pending, 1, 'the duplicate must not count as pending');
  assert.deepEqual(plain(page.g.__ckSaas.ids), ['site-1']);

  page.fetchFor('site-1').deferred.resolve(res(200, { v: 1, policyVersion: '1' }));
  await settle();

  assert.equal(page.inits.length, 1, 'CK.init() ran twice for one snippet');
  assert.deepEqual(plain(page.g.ConsentKit._saas.siteIds), ['site-1']);
  assert.equal(page.g.__ckSaas.pending, 0);
});

test('a duplicated dead id still reaches the strict fallback exactly once', async () => {
  // The stand-down must not leave `pending` holding a loader that will never
  // answer — that would strand the page with no banner at all.
  const page = makePage({ ids: ['dead-1', 'dead-1'] });
  page.run(0);
  page.run(1);

  page.fetchFor('dead-1').deferred.resolve(res(404));
  await settle();

  assert.equal(page.inits.length, 1);
  assert.equal(page.inits[0].policyVersion, 'strict-fallback');
});

/* -------------------------------------------------------------- three tags */

test('three snippets: the one that loads drives the page', async () => {
  const page = makePage({ ids: ['dead-1', 'live-2', 'dead-3'] });
  page.run(0);
  page.run(1);
  page.run(2);

  assert.equal(page.dupWarnings().length, 1, 'still one warning, not two');
  assert.deepEqual(plain(page.g.ConsentKit._saas.siteIds), ['dead-1', 'live-2', 'dead-3']);

  page.fetchFor('dead-1').deferred.resolve(res(404));
  page.fetchFor('dead-3').deferred.resolve(res(404));
  await settle();
  assert.deepEqual(page.inits, [], 'two failures out of three must not give up');

  page.fetchFor('live-2').deferred.resolve(res(200, { v: 2, policyVersion: '1' }));
  await settle();

  assert.equal(page.inits.length, 1);
  assert.equal(page.inits[0].policyVersion, '1');
  assert.equal(page.g.ConsentKit._saas.strictFallback, false);
});

/* ------------------------------------------------------- the warning strings */

test('the duplicate warning names the other id and reads as English prose', () => {
  const page = makePage({ ids: ['site-a', 'site-b'] });
  page.run(0);
  page.run(1);

  const w = page.dupWarnings()[0];
  assert.ok(w.indexOf('[ConsentKit SaaS]') === 0, 'the loader prefix is missing: ' + w);
  assert.ok(w.indexOf('another ConsentKit snippet on this page uses site id') !== -1, w);
  assert.ok(w.indexOf('keep one snippet per site') !== -1, w);
  // The warning is emitted by whichever loader runs first and must name the
  // OTHER id, never its own.
  assert.ok(w.indexOf('site-b') !== -1, 'the warning did not name the other snippet: ' + w);
});

/* ------------------------------------------------------- nothing else changed */

test('a single healthy snippet is untouched by any of this', async () => {
  const page = makePage({ ids: ['site-1'] });
  page.run(0);

  assert.equal(page.g.__ckSaas.pending, 1);
  assert.equal(page.g.__ckSaas.done, false);
  assert.deepEqual(page.dupWarnings(), []);

  page.fetchFor('site-1').deferred.resolve(res(200, { v: 4, policyVersion: '7' }));
  await settle();

  assert.equal(page.inits.length, 1);
  assert.equal(page.inits[0].policyVersion, '7');
  assert.equal(page.g.__ckSaas.done, true);
  assert.equal(page.g.__ckSaas.pending, 0);
  assert.deepEqual(plain(page.g.__ckSaas.failures), []);
  assert.equal(page.g.ConsentKit._saas.siteId, 'site-1');
  assert.equal(page.g.ConsentKit._saas.strictFallback, false);
  assert.equal(typeof page.g.ConsentKit._saas.pending, 'function',
    '_saas.pending() is the beacon queue and must stay a function');
  assert.equal(page.g.ConsentKit._saas.pending(), 0);
  // The config was written to the cache for the next page load.
  assert.ok(page.store['ck_cfg_site-1'], 'the network config was not cached');
});
