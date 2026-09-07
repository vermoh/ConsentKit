/*!
 * ConsentKit SaaS mode (experimental) — remote config + consent journal.
 * Vanilla ES2020, zero dependencies, no build step.
 *
 * Load order: ck-core.js -> ck-locales.js -> ck-ui.js -> ck-saas.js
 * Activation:  <script src="ck-saas.js" data-ck-id="SITE_ID"
 *                      data-ck-api="https://api.example.com"></script>
 *
 * This file owns init(): ck-core is loaded but NOT initialised by the page.
 * Standalone (non-SaaS) pages simply do not include this file, so the
 * standalone build is unchanged by construction.
 */
(function (global) {
  'use strict';

  // SSR / non-browser guard, same shape as the other files.
  if (!global || typeof global !== 'object') { return; }
  var doc = global.document;
  if (!doc) { return; }

  var DEFAULT_API = 'https://consent.ecomconsult.net';
  var CFG_TIMEOUT_MS = 3000;
  var RETRY_DELAY_MS = 2000;
  var CACHE_PREFIX = 'ck_cfg_';

  // ---------------------------------------------------------------------------
  // Utilities (defensive: this layer must never throw into the host page)
  // ---------------------------------------------------------------------------
  function warn(msg, extra) {
    try { (global.console && global.console.warn) && global.console.warn('[ConsentKit SaaS] ' + msg, extra === undefined ? '' : extra); } catch (e) { /* noop */ }
  }
  function error(msg) {
    try { (global.console && global.console.error) && global.console.error('[ConsentKit SaaS] ' + msg); } catch (e) { /* noop */ }
  }

  function uuid() {
    try {
      if (global.crypto && typeof global.crypto.randomUUID === 'function') { return global.crypto.randomUUID(); }
      if (global.crypto && typeof global.crypto.getRandomValues === 'function') {
        var b = new Uint8Array(16);
        global.crypto.getRandomValues(b);
        b[6] = (b[6] & 0x0f) | 0x40; b[8] = (b[8] & 0x3f) | 0x80;
        var h = [];
        for (var i = 0; i < 16; i++) { h.push((b[i] + 0x100).toString(16).slice(1)); }
        return h.slice(0,4).join('') + '-' + h.slice(4,6).join('') + '-' + h.slice(6,8).join('') +
               '-' + h.slice(8,10).join('') + '-' + h.slice(10,16).join('');
      }
    } catch (e) { /* fall through */ }
    // Non-secure context fallback.
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
      var r = (Math.random() * 16) | 0;
      return (c === 'x' ? r : ((r & 0x3) | 0x8)).toString(16);
    });
  }

  function lsGet(k) { try { return global.localStorage ? global.localStorage.getItem(k) : null; } catch (e) { return null; } }
  function lsSet(k, v) { try { global.localStorage && global.localStorage.setItem(k, v); } catch (e) { /* quota/private mode */ } }

  // ---------------------------------------------------------------------------
  // Own <script> tag -> siteId / api base
  // ---------------------------------------------------------------------------
  function findOwnTag() {
    try {
      // document.currentScript is correct while this file is executing.
      var cur = doc.currentScript;
      if (cur && cur.getAttribute && cur.getAttribute('data-ck-id')) { return cur; }
      // Fallback for the exotic case where currentScript is unavailable (an
      // async injection, an old browser). With two snippets on the page both
      // loaders would pick the same last tag — which the §1.2 stand-down below
      // turns into "the second one goes quiet" rather than a double init. Not
      // ideal, but it degrades in the safe direction, and every real snippet is
      // a plain synchronous <script> where currentScript is set.
      var all = doc.querySelectorAll('script[data-ck-id]');
      return all && all.length ? all[all.length - 1] : null;
    } catch (e) { return null; }
  }

  // Every distinct data-ck-id on the page, in document order. Read from the DOM
  // rather than accumulated across loaders, because on a real page the second
  // snippet's tag may not be parsed yet when the first loader runs — the last
  // loader to execute sees them all, and it is the one that matters.
  function tagIds() {
    var out = [];
    try {
      var all = doc.querySelectorAll('script[data-ck-id]');
      if (!all) { return out; }
      for (var i = 0; i < all.length; i++) {
        var id = '';
        try { id = String(all[i].getAttribute('data-ck-id') || '').trim(); } catch (e2) { id = ''; }
        if (id && out.indexOf(id) === -1) { out.push(id); }
      }
    } catch (e) { /* noop */ }
    return out;
  }

  var tag = findOwnTag();
  if (!tag) { return; }  // no data-ck-id -> standalone page, stay inert

  var siteId = '';
  var apiBase = DEFAULT_API;
  try {
    siteId = String(tag.getAttribute('data-ck-id') || '').trim();
    var a = tag.getAttribute('data-ck-api');
    if (a) { apiBase = String(a).trim().replace(/\/+$/, ''); }
  } catch (e) { /* noop */ }
  if (!siteId) { return; }

  var CK = global.ConsentKit;
  if (!CK || typeof CK.init !== 'function') {
    error('ConsentKit core not found on the page. Load ck-core.js before ck-saas.js.');
    return;
  }

  // ---------------------------------------------------------------------------
  // Shared state across every loader on the page (SPEC §1.1)
  // ---------------------------------------------------------------------------
  /* A page can carry more than one snippet: a site migrated between two ids and
     the old block was never removed, an agency pasted its own on top of the
     client's. Each copy of this file is a separate IIFE with its own closure, so
     the only thing they can agree on is a global.

     `pending` here counts CONFIG FETCHES still in flight — deliberately not the
     same thing as the beacon queue further down, which is also called `pending`
     but lives in this file's closure and is what _saas.pending() reports.

     `warnedDup` and `activeId` are not in the spec's field list, but the once-
     only duplicate warning and the "driven by snippet X" message have nowhere
     else to live: whichever loader speaks last would otherwise repeat the
     warning, and the loser needs the winner's id. */
  var shared = global.__ckSaas;
  if (!shared || typeof shared !== 'object') {
    shared = global.__ckSaas = { pending: 0, done: false, ids: [], failures: [] };
  }
  if (!shared.ids || typeof shared.ids.length !== 'number') { shared.ids = []; }
  if (!shared.failures || typeof shared.failures.length !== 'number') { shared.failures = []; }

  /* SPEC §1.2 — the same id twice is Tilda duplicating the head block, not two
     snippets. It is not a misconfiguration, so it must not warn; but it must
     also not fetch or initialise a second time, or the page would pay for two
     config requests and CK.init() would run twice. Stand down silently, and
     BEFORE pending++ so the vanished loader cannot hold the strict fallback
     hostage in §1.4. */
  if (shared.ids.indexOf(siteId) !== -1) { return; }
  shared.ids.push(siteId);
  shared.pending++;

  var allIds = tagIds();
  // A tag whose loader has not executed yet is still a snippet on this page.
  for (var ai = 0; ai < shared.ids.length; ai++) {
    if (allIds.indexOf(shared.ids[ai]) === -1) { allIds.push(shared.ids[ai]); }
  }
  if (allIds.length > 1 && !shared.warnedDup) {
    shared.warnedDup = true;
    var others = [];
    for (var oi = 0; oi < allIds.length; oi++) {
      if (allIds[oi] !== siteId) { others.push(allIds[oi]); }
    }
    warn('another ConsentKit snippet on this page uses site id ' + others.join(', ') +
      '; keep one snippet per site');
  }

  var cacheKey = CACHE_PREFIX + siteId;
  var activeConfig = null;   // config currently driving this page load

  // ---------------------------------------------------------------------------
  // Config cache
  // ---------------------------------------------------------------------------
  function readCache() {
    var raw = lsGet(cacheKey);
    if (!raw) { return null; }
    try {
      var o = JSON.parse(raw);
      if (o && typeof o === 'object' && o.config && typeof o.config === 'object') { return o; }
    } catch (e) { /* corrupt entry */ }
    return null;
  }

  function writeCache(etag, config) {
    try {
      lsSet(cacheKey, JSON.stringify({ etag: etag || null, savedAt: new Date().toISOString(), config: config }));
    } catch (e) { /* noop */ }
  }

  // x-ck-country -> ConsentKit._geo. Informational in V1.0; nothing reads it.
  function storeGeo(res) {
    try {
      var c = res && res.headers && res.headers.get ? res.headers.get('x-ck-country') : null;
      if (c) { CK._geo = { country: String(c) }; }
    } catch (e) { /* header not exposed by CORS */ }
  }

  function configUrl() { return apiBase + '/v1/config/' + encodeURIComponent(siteId) + '.json'; }

  // ---------------------------------------------------------------------------
  // Boot
  // ---------------------------------------------------------------------------
  // The service's tracker overrides (§1.3). Applied through the core's
  // _extendHostDb so the classification the scanner used server-side is the
  // classification the browser uses on the same page.
  //
  // ORDER MATTERS: this must run BEFORE CK.init(), because init() performs the
  // initial scan and the first applyConsentToDom() pass. A host merged after
  // that pass would not be recognised on the scripts already in the markup.
  function applyHostDb(config) {
    try {
      var map = config && config.hostdb;
      if (!map || typeof map !== 'object') { return 0; }
      if (typeof CK._extendHostDb !== 'function') {
        // An older core on the page (config contract is newer than the client).
        warn('this core does not support config.hostdb — update ck-core.js to 0.4.0 or later.');
        return 0;
      }
      return CK._extendHostDb(map);
    } catch (e) { return 0; }
  }

  /* This loader's own config attempt resolves exactly once. Both the cold path
     and the cached path run through here, and the cached path is the reason the
     guard exists at all: it settles SUCCESSFULLY the moment the cache is read,
     and then starts a background revalidation whose failure must not decrement
     `pending` a second time or push a failure the page never suffered. */
  var settled = false;
  function settleOk() {
    if (settled) { return; }
    settled = true;
    shared.done = true;
    shared.activeId = shared.activeId || siteId;
    shared.pending--;
  }

  function initWith(config, why) {
    settleOk();
    activeConfig = config;
    applyHostDb(config);
    try { CK.init(config); } catch (e) { error('init() failed: ' + (e && e.message)); }
    if (why) { /* reserved for diagnostics */ }
  }

  /* SPEC §1.4 — one loader's config failed. What follows depends entirely on
     what the OTHER loaders are doing, which is why none of this can be decided
     locally.

     The case that motivates the whole section: a site has a live snippet and a
     dead one (an id that was deleted from the account). Before 0.5.14 the dead
     one's 404 raised the strict fallback and re-initialised the core with
     everything denied — a working banner replaced by a broken one because of a
     block nobody had noticed in years. Now the dead snippet only fails; the
     live snippet still drives the page. */
  function settleFail(reason) {
    if (settled) { return; }
    settled = true;
    shared.pending--;
    shared.failures.push(siteId + ': ' + reason);

    if (shared.done) {
      // Someone else already initialised the page. Touching CK.init() now would
      // swap ConsentKit.config identity out from under a banner the visitor may
      // already be looking at.
      warn('config for ' + siteId + ' unavailable (' + reason + '); the page is driven by snippet ' +
        (shared.activeId || 'unknown'));
      return;
    }
    if (shared.pending > 0) {
      // SPEC §1.5: the strict fallback is a last resort, and it is not the last
      // resort while another snippet may still succeed. CFG_TIMEOUT_MS bounds
      // that wait — every in-flight fetch aborts by then, so this cannot hang.
      warn('config for ' + siteId + ' unavailable (' + reason + '); waiting for the other snippet');
      return;
    }
    // Every snippet on the page failed. This is the 0.5.13 behaviour, and for a
    // single tag the joined list is exactly one entry.
    initStrict(shared.failures.join('; '));
  }

  // Strict FALLBACK: banner shows, every opt-in category stays off, no journal.
  // policyVersion 'strict-fallback' deliberately mismatches any stored consent,
  // so a previous decision is not silently reused when the server is unreachable.
  //
  // Not to be confused with `blocking.mode: 'strict'` (SPEC §2), which is a
  // different thing that happens to share the word: this path deliberately does
  // NOT set it. When the config server is unreachable we know nothing about the
  // site, and turning on the mode that blocks every third-party script would
  // break a page precisely when its owner has no way to configure an allowlist.
  // Known trackers are still blocked, as always.
  function initStrict(reason) {
    warn('config unavailable (' + reason + ') — strict fallback: banner shown, all opt-in categories denied, journal disabled.');
    shared.strictFallback = true;
    // A _saas already published by another loader must learn this too: the
    // object below is a plain assignment and the last loader to run wins, so a
    // late publisher would otherwise report strictFallback: false.
    try { if (CK._saas) { CK._saas.strictFallback = true; } } catch (e) { /* noop */ }
    initWith({ policyVersion: 'strict-fallback' });
  }

  // cacheMode: 'default' lets the HTTP cache answer (cold load); 'no-cache'
  // forces a conditional request to the origin (background revalidation).
  function fetchConfig(etag, cacheMode, onOk, onFail) {
    if (typeof global.fetch !== 'function') {
      /* Deferred to a microtask rather than called inline. Every other failure
         path here is already asynchronous, so a synchronous one would be the
         single case where this loader could reach the strict fallback before a
         later snippet on the page had a chance to register itself in
         __ckSaas.pending. A microtask, not a timer: it still resolves before
         any network could. */
      try { global.Promise.resolve().then(function () { onFail('fetch unsupported'); }); }
      catch (e) { onFail('fetch unsupported'); }
      return;
    }
    var ctrl = null, timer = null;
    try { ctrl = new global.AbortController(); } catch (e) { ctrl = null; }
    var opts = { method: 'GET', credentials: 'omit', mode: 'cors' };
    if (cacheMode) { opts.cache = cacheMode; }
    if (etag) { opts.headers = { 'If-None-Match': etag }; }
    if (ctrl) { opts.signal = ctrl.signal; }
    try {
      timer = global.setTimeout(function () { try { ctrl && ctrl.abort(); } catch (e) {} }, CFG_TIMEOUT_MS);
    } catch (e) { /* noop */ }

    var done = false;
    function finish(fn, arg) {
      if (done) { return; }
      done = true;
      try { timer && global.clearTimeout(timer); } catch (e) {}
      fn(arg);
    }

    global.fetch(configUrl(), opts).then(function (res) {
      storeGeo(res);
      if (res.status === 304) { finish(onOk, { notModified: true }); return; }
      if (res.status === 404) { finish(onFail, 'site not found (404)'); return; }
      if (!res.ok) { finish(onFail, 'HTTP ' + res.status); return; }
      var newEtag = null;
      try { newEtag = res.headers && res.headers.get ? res.headers.get('etag') : null; } catch (e) { /* noop */ }
      res.json().then(function (cfg) {
        if (!cfg || typeof cfg !== 'object') { finish(onFail, 'malformed config body'); return; }
        finish(onOk, { config: cfg, etag: newEtag });
      }, function () { finish(onFail, 'config is not valid JSON'); });
    }, function (err) {
      var aborted = err && (err.name === 'AbortError');
      finish(onFail, aborted ? 'timeout after ' + CFG_TIMEOUT_MS + 'ms' : 'network error');
    });
  }

  var cached = readCache();
  if (cached) {
    // Cache hit: init synchronously, then revalidate in the background.
    initWith(cached.config, 'cache');
    // cache:'no-cache' is REQUIRED here and deliberately differs from the cold
    // path below. The server sends `Cache-Control: public, max-age=300`, so a
    // plain fetch is answered by the browser's HTTP cache for five minutes and
    // never reaches the origin — a freshly published config would stay
    // invisible until that expired, and this revalidation would be a no-op.
    // 'no-cache' means "always ask the origin, but a conditional request is
    // fine": unchanged -> 304 (cheap), changed -> 200 with the new body.
    // Do not "unify" the two modes: on the cold path the HTTP cache is a
    // legitimate saving, because there is nothing cached to go stale against.
    fetchConfig(cached.etag, 'no-cache', function (r) {
      if (r.notModified) { return; }
      // Fresh config is cached but NOT applied now: init() is idempotent and
      // re-initialising would swap ConsentKit.config identity mid-session.
      // It takes effect on the next page load.
      writeCache(r.etag, r.config);
      // `hostdb` is the deliberate exception. Extending the map has exactly the
      // semantics _extendHostDb documents for a call after init(): nothing
      // already inserted is re-evaluated, but everything inserted from now on
      // is classified against the new overrides. Waiting a whole page load to
      // start blocking a newly classified tracker would be worse, and unlike
      // the rest of the config this cannot change ConsentKit.config identity.
      applyHostDb(r.config);
    }, function (reason) {
      warn('background revalidation failed (' + reason + '); continuing with cached config.');
    });
  } else {
    // Cold path: no cached config exists, so the HTTP cache cannot serve a
    // stale one. Default caching is the right economy here.
    fetchConfig(null, null, function (r) {
      // An empty 304 without a cache to satisfy it is a failure like any other,
      // and now goes through the same arbitration: another snippet may still be
      // holding a usable config.
      if (r.notModified || !r.config) { settleFail('empty response without cache'); return; }
      writeCache(r.etag, r.config);
      initWith(r.config, 'network');
    }, settleFail);
  }

  // ---------------------------------------------------------------------------
  // Consent journal (POST /v1/consent)
  // ---------------------------------------------------------------------------
  var pending = [];   // payloads not yet confirmed delivered
  var seen = {};      // dedupe key -> true, per page load

  function logTarget() {
    var log = activeConfig && activeConfig.log;
    if (!log || !log.endpoint) { return null; }
    return log;
  }

  function resolvedLang() {
    try {
      var l = activeConfig && activeConfig.language;
      if (l && l !== 'auto') { return String(l).slice(0, 8); }
      var n = global.navigator && global.navigator.language;
      return n ? String(n).slice(0, 8) : undefined;
    } catch (e) { return undefined; }
  }

  function resolvedLayout() {
    try {
      var t = activeConfig && activeConfig.layout && activeConfig.layout.type;
      return (t === 'bar' || t === 'box' || t === 'modal') ? t : undefined;
    } catch (e) { return undefined; }
  }

  // Builds the §5 payload. Closed field list: anything extra is a 400.
  function buildPayload(state, isWithdraw) {
    var log = logTarget();
    if (!log) { return null; }
    var c = (state && state.categories) || {};
    var body = {
      siteId: siteId,
      key: log.key,
      cfg: activeConfig && activeConfig.v,
      // Withdraw arrives with id/ts/method nulled by core, and needs a FRESH
      // uuid: reusing the withdrawn record's PK would be swallowed server-side
      // by ON CONFLICT DO NOTHING.
      id: (!isWithdraw && state && state.id) ? state.id : uuid(),
      ts: (!isWithdraw && state && state.ts) ? state.ts : new Date().toISOString(),
      // Exactly three keys: 'necessary' is not part of the closed schema.
      categories: {
        functional: c.functional === true,
        analytics: c.analytics === true,
        marketing: c.marketing === true
      },
      method: isWithdraw ? 'withdraw' : (state && state.method) || 'custom'
    };
    var lang = resolvedLang();
    if (lang) { body.lang = lang; }
    var layout = resolvedLayout();
    if (layout) { body.layout = layout; }

    /* SPEC V1.12 §3 — the optional `services` field: the ids the visitor
       switched off, «только при method: 'custom'».

       Three guards, all of them load-bearing against a 400 from a closed
       schema: only on a 'custom' decision (an accept_all or reject_all has no
       per-service refusals to report and a withdraw is not a choice about
       services at all), only when the list is non-empty (an empty array is a
       field the server did not need to receive), and capped at 50 ids of at
       most 64 characters each — the same bounds §2 puts on the config. */
    if (body.method === 'custom') {
      var denied = deniedServices();
      if (denied.length) { body.services = denied; }
    }
    return body;
  }

  // Read from the core, which normalised and bounded the ids already; re-checked
  // here anyway, because this is the last place before the wire.
  function deniedServices() {
    var out = [];
    try {
      var ck = global.ConsentKit;
      if (!ck || typeof ck._deniedServices !== 'function') { return out; }
      var list = ck._deniedServices();
      if (!list || typeof list.length !== 'number') { return out; }
      for (var i = 0; i < list.length && out.length < 50; i++) {
        var id = list[i];
        if (typeof id === 'string' && id && id.length <= 64 && out.indexOf(id) === -1) {
          out.push(id);
        }
      }
    } catch (e) { /* noop */ }
    return out;
  }

  function drop(payload) {
    var i = pending.indexOf(payload);
    if (i > -1) { pending.splice(i, 1); }
  }

  // fetch(keepalive) with exactly one retry after 2s on network failure.
  function send(payload, isRetry) {
    var log = logTarget();
    if (!log || typeof global.fetch !== 'function') { return; }
    try {
      global.fetch(log.endpoint, {
        method: 'POST',
        mode: 'cors',
        credentials: 'omit',
        keepalive: true,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      }).then(function (res) {
        // 4xx is terminal: retrying a rejected body cannot help.
        if (res && (res.ok || (res.status >= 400 && res.status < 500))) { drop(payload); return; }
        if (!isRetry) { scheduleRetry(payload); } else { drop(payload); }
      }, function () {
        if (!isRetry) { scheduleRetry(payload); } else { drop(payload); }
      });
    } catch (e) {
      if (!isRetry) { scheduleRetry(payload); }
    }
  }

  function scheduleRetry(payload) {
    // The SAME payload object is resent: regenerating id/ts would create a new
    // row instead of hitting the server's idempotency conflict.
    try { global.setTimeout(function () { send(payload, true); }, RETRY_DELAY_MS); } catch (e) { /* noop */ }
  }

  function record(state, isWithdraw) {
    try {
      if (!logTarget()) { return; }
      var payload = buildPayload(state, isWithdraw);
      if (!payload) { return; }
      // ck:consent and ck:change both fire for a first decision with identical
      // (id, ts) — send once.
      var k = payload.id + '|' + payload.ts + '|' + payload.method;
      if (seen[k]) { return; }
      seen[k] = true;
      pending.push(payload);
      send(payload, false);
    } catch (e) { /* never break the host page */ }
  }

  try {
    doc.addEventListener('ck:consent', function (e) {
      var s = (e && e.detail && e.detail.state) || null;
      if (s && s.decided) { record(s, false); }
    }, false);

    doc.addEventListener('ck:change', function (e) {
      var s = (e && e.detail && e.detail.state) || null;
      if (!s) { return; }
      // decided === false on a change means withdraw (core nulls id/ts/method).
      record(s, !s.decided);
    }, false);
  } catch (e) { error('could not subscribe to consent events.'); }

  // Page unload: flush anything still pending via sendBeacon.
  function flush() {
    try {
      var log = logTarget();
      if (!log || !pending.length) { return; }
      var nav = global.navigator;
      if (!nav || typeof nav.sendBeacon !== 'function') { return; }
      var list = pending.slice();
      for (var i = 0; i < list.length; i++) {
        var body = JSON.stringify(list[i]);
        // text/plain keeps sendBeacon a CORS-simple request (no preflight,
        // which beacons cannot perform). The server must accept this type.
        var ok = false;
        try { ok = nav.sendBeacon(log.endpoint, new global.Blob([body], { type: 'text/plain;charset=UTF-8' })); } catch (e2) { ok = false; }
        if (ok) { drop(list[i]); }
      }
    } catch (e) { /* noop */ }
  }

  try {
    global.addEventListener && global.addEventListener('pagehide', flush, false);
  } catch (e) { /* noop */ }

  /* Minimal surface for the demo status panel; not a public API.

     With two loaders this is assigned twice and the last one wins, so nothing
     that must survive may be read out of this closure: `siteIds` comes from the
     DOM and `strictFallback` from the shared object, both of which every loader
     agrees on. `pending()` still reports the BEACON queue — a different counter
     from __ckSaas.pending, and the one the demo page and the panel already
     read. */
  CK._saas = {
    siteId: siteId,
    api: apiBase,
    siteIds: allIds.slice(),
    strictFallback: shared.strictFallback === true,
    pending: function () { return pending.length; },
    config: function () { return activeConfig; }
  };
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : this));
