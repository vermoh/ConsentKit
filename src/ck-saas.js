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
      var all = doc.querySelectorAll('script[data-ck-id]');
      return all && all.length ? all[all.length - 1] : null;
    } catch (e) { return null; }
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
  function initWith(config, why) {
    activeConfig = config;
    try { CK.init(config); } catch (e) { error('init() failed: ' + (e && e.message)); }
    if (why) { /* reserved for diagnostics */ }
  }

  // Strict mode: banner shows, every opt-in category stays off, no journal.
  // policyVersion 'strict-fallback' deliberately mismatches any stored consent,
  // so a previous decision is not silently reused when the server is unreachable.
  function initStrict(reason) {
    warn('config unavailable (' + reason + ') — strict fallback: banner shown, all opt-in categories denied, journal disabled.');
    initWith({ policyVersion: 'strict-fallback' });
  }

  // cacheMode: 'default' lets the HTTP cache answer (cold load); 'no-cache'
  // forces a conditional request to the origin (background revalidation).
  function fetchConfig(etag, cacheMode, onOk, onFail) {
    if (typeof global.fetch !== 'function') { onFail('fetch unsupported'); return; }
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
    }, function (reason) {
      warn('background revalidation failed (' + reason + '); continuing with cached config.');
    });
  } else {
    // Cold path: no cached config exists, so the HTTP cache cannot serve a
    // stale one. Default caching is the right economy here.
    fetchConfig(null, null, function (r) {
      if (r.notModified || !r.config) { initStrict('empty response without cache'); return; }
      writeCache(r.etag, r.config);
      initWith(r.config, 'network');
    }, function (reason) {
      initStrict(reason);
    });
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
    return body;
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

  // Minimal surface for the demo status panel; not a public API.
  CK._saas = {
    siteId: siteId,
    api: apiBase,
    pending: function () { return pending.length; },
    config: function () { return activeConfig; }
  };
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : this));
