/*!
 * ConsentKit debug loader — the activation switch for the debug panel.
 *
 * The panel itself (src/ck-debug.js) is ~30 KB and useful to exactly one
 * person on the page: the site owner, once, while diagnosing something. This
 * loader ships instead of it in the inline blocks and in the WordPress plugin,
 * and fetches the panel only when the visitor asks for it. Without activation
 * it creates no DOM, installs no observers and makes no network request.
 *
 * Activation (?ck_debug=1 / #ck_debug / localStorage) and the three-step
 * resolution order for the panel URL are documented in README «Debug mode».
 * Two things are worth knowing while reading this file:
 *
 *   - The off switch has to work even though the panel is not loaded, so the
 *     loader — not the panel — owns the stored flag. ck-debug.js keeps its own
 *     identical copy of parseActivation() because it is loaded directly on our
 *     demo page and must stay self-contained; writing the flag twice is
 *     idempotent, and test/debug-loader.test.mjs asserts the two agree.
 *   - Nothing here runs before activation. No DOM, no request, no observers.
 *
 * Load order: ck-core.js -> ck-locales.js -> ck-ui.js -> [ck-saas.js] -> this.
 *
 * Copyright (c) 2026 E-COM CONSULT PLUS. MIT License — see LICENSE.
 */
(function (global) {
  'use strict';

  if (!global || typeof global !== 'object') { return; }

  var LS_KEY = 'ck_debug';
  var CDN = 'https://cdn.jsdelivr.net/npm/@ecomconsult/consentkit@';

  function isOffValue(v) {
    return v === '0' || v === 'false' || v === 'no' || v === '';
  }

  // Identical to src/ck-debug.js parseActivation(). Pure: no DOM, no storage.
  function parseActivation(search, hash, stored) {
    var on = null;

    var q = String(search || '');
    if (q.charAt(0) === '?') { q = q.slice(1); }
    var pairs = q ? q.split('&') : [];
    for (var i = 0; i < pairs.length; i++) {
      var eq = pairs[i].indexOf('=');
      var k = eq === -1 ? pairs[i] : pairs[i].slice(0, eq);
      if (k !== LS_KEY) { continue; }
      on = eq === -1 ? true : !isOffValue(pairs[i].slice(eq + 1));
    }

    if (on === null) {
      var h = String(hash || '');
      if (h.charAt(0) === '#') { h = h.slice(1); }
      if (h === LS_KEY) { on = true; }
      else if (h.indexOf(LS_KEY + '=') === 0) { on = !isOffValue(h.slice(LS_KEY.length + 1)); }
    }

    if (on === null) {
      return { active: String(stored || '') === '1', persist: null };
    }
    return { active: on, persist: on ? 'on' : 'off' };
  }

  // Pure: takes what the page happens to expose, returns the URL to load.
  // `explicit` is window.ConsentKitDebugUrl, `saas` is ConsentKit._saas.
  // Order: explicit URL -> SaaS API origin -> jsDelivr pinned to the running
  // core version. See README «Debug mode».
  function resolveUrl(explicit, saas, version) {
    var pinned = String(explicit || '').trim();
    if (pinned) { return pinned; }

    if (saas && saas.siteId && saas.api) {
      var base = String(saas.api).replace(/\/+$/, '');
      if (base) { return base + '/client/ck-debug.js'; }
    }

    return CDN + encodeURIComponent(String(version || 'latest')) + '/src/ck-debug.js';
  }

  var API = {
    parseActivation: parseActivation,
    resolveUrl: resolveUrl,
    active: false,
    url: null
  };
  try {
    if (global.ConsentKit) { global.ConsentKit._debugLoader = API; }
    global.__ckDebugLoader = API;
  } catch (e) { /* noop */ }

  function lsGet(k) {
    try { return global.localStorage ? global.localStorage.getItem(k) : null; } catch (e) { return null; }
  }
  function lsSet(k, v) {
    try { if (global.localStorage) { global.localStorage.setItem(k, v); } } catch (e) { /* noop */ }
  }
  function lsDel(k) {
    try { if (global.localStorage) { global.localStorage.removeItem(k); } } catch (e) { /* noop */ }
  }

  var loc = global.location;
  var act = parseActivation(loc && loc.search, loc && loc.hash, lsGet(LS_KEY));
  // Persist BEFORE the early return: ?ck_debug=0 has to clear the stored flag
  // even though nothing is loaded afterwards, or the panel could never be
  // switched off again once it had been switched on.
  if (act.persist === 'on') { lsSet(LS_KEY, '1'); }
  if (act.persist === 'off') { lsDel(LS_KEY); }
  if (!act.active) { return; }

  var doc = global.document;
  if (!doc || typeof doc.createElement !== 'function') { return; }

  // Already loaded (the panel published its surface, or this ran twice).
  if (global.__ckDebug) { API.active = true; return; }

  var CK = global.ConsentKit;
  var url = resolveUrl(
    global.ConsentKitDebugUrl,
    CK && CK._saas,
    (CK && CK.version) || ''
  );
  API.active = true;
  API.url = url;

  try {
    var s = doc.createElement('script');
    s.src = url;
    s.async = true;
    // No opt-out attribute is needed: the blocking engine matches a fixed list
    // of tracker hosts, and neither jsDelivr nor a ConsentKit API host is on
    // it — test/debug-loader.test.mjs asserts that.
    (doc.head || doc.body || doc.documentElement).appendChild(s);
  } catch (e) { /* noop */ }
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : this));
