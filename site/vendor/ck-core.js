/*!
 * ConsentKit Core — consent state + storage + blocking engine + Google Consent Mode v2.
 * Vanilla ES2020, zero dependencies, no build step.
 * Blocking activates at parse time, before ConsentKit.init().
 *
 * Copyright (c) 2026 E-COM CONSULT PLUS. MIT License — see LICENSE.
 */
(function (global) {
  'use strict';

  if (!global) { return; }
  var doc = global.document;

  // ---------------------------------------------------------------------------
  // Natives captured before any patching, so unblocking never re-enters patches.
  // ---------------------------------------------------------------------------
  var nativeCreateElement = doc && doc.createElement ? doc.createElement.bind(doc) : null;
  var nativeSetAttribute = (global.Element && global.Element.prototype && global.Element.prototype.setAttribute) || null;
  var nativeScriptSrcDesc = null;
  try {
    if (global.HTMLScriptElement && global.HTMLScriptElement.prototype) {
      nativeScriptSrcDesc = Object.getOwnPropertyDescriptor(global.HTMLScriptElement.prototype, 'src');
    }
  } catch (e) { /* noop */ }

  // Internal flag: while true, patches let everything through (used when we
  // re-create previously blocked scripts after consent).
  var bypass = false;

  // ---------------------------------------------------------------------------
  // Constants
  // ---------------------------------------------------------------------------
  var STORAGE_KEY = 'ck_consent';
  var CATEGORIES = ['necessary', 'functional', 'analytics', 'marketing'];
  var OPT_IN = ['functional', 'analytics', 'marketing'];

  // Domain database: host -> category. Matching is suffix-based (see
  // categoryForUrl), so a bare registrable domain also covers its subdomains.
  // Bare entries are used ONLY for domains dedicated entirely to tracking;
  // where a parent domain also serves ordinary site assets (CDNs, fonts,
  // images) the specific tracking subdomain is listed instead.
  // Snapshot: 2026-08. Not exhaustive — extended as new trackers appear.
  var HOST_DB = {
    // --- analytics -----------------------------------------------------
    'google-analytics.com': 'analytics',
    'ssl.google-analytics.com': 'analytics',
    'analytics.google.com': 'analytics',      // subdomain only: google.com is not a tracker
    'mc.yandex.ru': 'analytics',
    'mc.yandex.com': 'analytics',
    'hotjar.com': 'analytics',                // static./script./vars. subdomains
    'hotjar.io': 'analytics',
    'clarity.ms': 'analytics',                // Microsoft Clarity
    'matomo.cloud': 'analytics',              // Matomo Cloud tenants
    'mixpanel.com': 'analytics',              // cdn.mxpnl.com below
    'mxpnl.com': 'analytics',
    'amplitude.com': 'analytics',
    'segment.com': 'analytics',
    'segment.io': 'analytics',
    'heap.io': 'analytics',
    'heapanalytics.com': 'analytics',
    'fullstory.com': 'analytics',
    'mouseflow.com': 'analytics',
    'smartlook.com': 'analytics',
    'smartlook.cloud': 'analytics',
    'plausible.io': 'analytics',
    'crazyegg.com': 'analytics',
    'logrocket.com': 'analytics',
    'lr-ingest.io': 'analytics',              // LogRocket ingest
    'newrelic.com': 'analytics',              // browser agent
    'nr-data.net': 'analytics',               // New Relic beacon
    'datadoghq.com': 'analytics',             // RUM
    'datadoghq-browser-agent.com': 'analytics',

    // --- marketing -----------------------------------------------------
    'connect.facebook.net': 'marketing',
    'facebook.net': 'marketing',              // connect.facebook.net covered above
    'analytics.tiktok.com': 'marketing',
    'googleadservices.com': 'marketing',
    'doubleclick.net': 'marketing',
    'googlesyndication.com': 'marketing',
    'criteo.com': 'marketing',
    'criteo.net': 'marketing',
    'taboola.com': 'marketing',
    'outbrain.com': 'marketing',
    'snap.licdn.com': 'marketing',            // subdomain: licdn.com serves LinkedIn assets
    'ads.linkedin.com': 'marketing',
    'static.ads-twitter.com': 'marketing',
    'ads-twitter.com': 'marketing',
    'ct.pinterest.com': 'marketing',          // subdomain: pinterest.com is a normal site
    'sc-static.net': 'marketing',             // Snapchat pixel CDN
    'bat.bing.com': 'marketing',              // subdomain: bing.com is a normal site
    'adroll.com': 'marketing',
    'hs-analytics.net': 'marketing',          // HubSpot tracking
    'hs-scripts.com': 'marketing',
    'hsadspixel.net': 'marketing',
    'chimpstatic.com': 'marketing',           // Mailchimp connected sites
    'list-manage.com': 'marketing',
    'redditstatic.com': 'marketing',
    'q.quora.com': 'marketing',               // subdomain: quora.com is a normal site
    'amazon-adsystem.com': 'marketing',

    // --- functional ----------------------------------------------------
    'intercom.io': 'functional',
    'intercomcdn.com': 'functional',
    'zopim.com': 'functional',                // Zendesk Chat
    'zdassets.com': 'functional',             // Zendesk widget
    'crisp.chat': 'functional',
    'tawk.to': 'functional',
    'livechatinc.com': 'functional',
    'drift.com': 'functional',
    'driftt.com': 'functional',
    'jivosite.com': 'functional',
    'jivo.chat': 'functional',
    'tidio.co': 'functional',
    'tidiochat.com': 'functional'
  };

  // Path-fragment database: URL substring -> category. Matched against the full
  // resolved URL, so it can distinguish two very different scripts served from
  // the SAME host (googletagmanager.com).
  //
  // WHY THE GTM CONTAINER IS NOT BLOCKED (do not "fix" this by putting
  // googletagmanager.com back into HOST_DB):
  //   gtm.js is a CONTAINER, not a tracker. Google's consent model is that the
  //   container always loads and the tags INSIDE it wait — Google tags obey
  //   Consent Mode (our 'default: denied' is pushed at parse time, before any
  //   tag can fire), and everything else can hang off our ck_consent_* trigger
  //   events. Blocking the container breaks that model for every GTM site: the
  //   tags never get the chance to see consent at all.
  //   gtag.js is the opposite case — a direct GA4/Ads install with no container
  //   in front of it — so it stays blocked by path.
  var PATH_DB = {
    '/gtag/js': 'analytics',            // googletagmanager.com/gtag/js?id=G-XXXX
    '/trackers/ga.js': 'analytics',
    '/trackers/pixel.js': 'marketing',
    '/trackers/chat.js': 'functional'
  };

  // Cookie masks cleared on reject/withdraw, grouped by the category that owns
  // them, so a partial accept only clears the categories that stay denied.
  //
  // Scope note: only FIRST-PARTY cookies (written on the host site's domain) can
  // be removed via document.cookie. Cookies a vendor sets on its own domain
  // (e.g. LinkedIn's bcookie on .linkedin.com) are out of reach and deliberately
  // not listed. Exact names are preferred over prefixes; prefixes are used only
  // where the suffix is dynamic (a property/site id) and the stem is distinctive
  // enough not to collide with unrelated cookies. Snapshot: 2026-08.
  var COOKIE_EXACT = {
    analytics: [
      '_ga', '_gid', '_gat',
      '_clck', '_clsk',                       // Clarity (NOT a _cl prefix: too broad)
      '_hjSessionUser', '_hjSession', '_hjIncludedInSessionSample',
      '_fs_uid',                              // FullStory
      'mf_user',                              // Mouseflow
      'ajs_user_id', 'ajs_anonymous_id',      // Segment
      'is_returning',                         // Crazy Egg
      'demo_ga'
    ],
    marketing: [
      '_fbp', '_fbc', '_ttp', '_gcl_au', '_gcl_aw',
      '_scid', '_scid_r',                     // Snapchat
      '_uetsid', '_uetvid',                   // Microsoft/Bing Ads
      '_rdt_uuid',                            // Reddit
      '_pin_unauth',                          // Pinterest
      'li_fat_id',                            // LinkedIn Insight (first-party)
      '__adroll', '__adroll_fpc',
      'demo_fbp'
    ],
    functional: [
      'demo_chat'
    ]
  };
  var COOKIE_PREFIX = {
    analytics: [
      '_ga_',                                 // GA4 per-property
      '_ym_',                                 // Yandex Metrica
      '_hj',                                  // Hotjar (vendor-owned stem)
      '_pk_',                                 // Matomo
      'ajs_',                                 // Segment
      '_dd_'                                  // Datadog RUM
    ],
    marketing: [
      '_gac_',                                // Google Ads per-campaign
      '_ttp_',
      'cto_',                                 // Criteo
      'hubspotutk', '__hstc', '__hssrc', '__hssc'
    ],
    functional: [
      'intercom-',                            // Intercom widget state
      'drift_', 'driftt_',
      'crisp-client',
      '__tawkuuid'
    ]
  };
  // demo_* cookies not matched above are only cleared on a full purge.
  var FULL_PURGE_PREFIX = ['demo_'];

  var DEFAULT_CONFIG = {
    policyVersion: '1',
    language: 'auto',
    layout: { type: 'bar', position: 'bottom' },
    theme: { accent: '#2B50D8', radius: '10px' },
    categories: {
      functional: { enabled: true },
      analytics: { enabled: true },
      marketing: { enabled: true }
    },
    consentTtlDays: 365,
    integrations: { gcm: true, gtmDataLayer: true },
    cookieTable: []
  };

  // ---------------------------------------------------------------------------
  // Small utilities (all defensive — core must never throw)
  // ---------------------------------------------------------------------------
  function noop() {}

  function clone(o) {
    try { return JSON.parse(JSON.stringify(o)); } catch (e) { return {}; }
  }

  function isPlainObject(v) {
    return !!v && typeof v === 'object' && !Array.isArray(v);
  }

  // Shallow merge one level deep so partial nested config keeps sibling defaults.
  function mergeConfig(base, patch) {
    var out = clone(base);
    if (!isPlainObject(patch)) { return out; }
    Object.keys(patch).forEach(function (k) {
      var v = patch[k];
      if (isPlainObject(v) && isPlainObject(out[k])) {
        Object.keys(v).forEach(function (k2) {
          if (isPlainObject(v[k2]) && isPlainObject(out[k][k2])) {
            var inner = out[k][k2];
            Object.keys(v[k2]).forEach(function (k3) { inner[k3] = v[k2][k3]; });
          } else {
            out[k][k2] = v[k2];
          }
        });
      } else {
        out[k] = v;
      }
    });
    return out;
  }

  function uuid() {
    try {
      if (global.crypto && typeof global.crypto.randomUUID === 'function') {
        return global.crypto.randomUUID();
      }
      if (global.crypto && typeof global.crypto.getRandomValues === 'function') {
        var b = new Uint8Array(16);
        global.crypto.getRandomValues(b);
        b[6] = (b[6] & 0x0f) | 0x40;
        b[8] = (b[8] & 0x3f) | 0x80;
        var hex = [];
        for (var i = 0; i < 16; i++) { hex.push((b[i] + 0x100).toString(16).slice(1)); }
        return hex.slice(0, 4).join('') + '-' + hex.slice(4, 6).join('') + '-' +
               hex.slice(6, 8).join('') + '-' + hex.slice(8, 10).join('') + '-' +
               hex.slice(10, 16).join('');
      }
    } catch (e) { /* fall through */ }
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
      var r = (Math.random() * 16) | 0;
      return (c === 'x' ? r : ((r & 0x3) | 0x8)).toString(16);
    });
  }

  function b64encode(str) {
    try {
      if (typeof global.btoa === 'function') {
        return global.btoa(unescape(encodeURIComponent(str)));
      }
      if (typeof global.Buffer === 'function') {
        return global.Buffer.from(str, 'utf8').toString('base64');
      }
    } catch (e) { /* noop */ }
    return '';
  }

  function b64decode(str) {
    try {
      if (typeof global.atob === 'function') {
        return decodeURIComponent(escape(global.atob(str)));
      }
      if (typeof global.Buffer === 'function') {
        return global.Buffer.from(str, 'base64').toString('utf8');
      }
    } catch (e) { /* noop */ }
    return '';
  }

  function emptyCategories() {
    return { necessary: true, functional: false, analytics: false, marketing: false };
  }

  // ---------------------------------------------------------------------------
  // Cookie helpers
  // ---------------------------------------------------------------------------
  function readCookie(name) {
    try {
      var raw = doc && typeof doc.cookie === 'string' ? doc.cookie : '';
      var parts = raw.split(';');
      for (var i = 0; i < parts.length; i++) {
        var p = parts[i].trim();
        var eq = p.indexOf('=');
        if (eq > -1 && p.slice(0, eq) === name) { return p.slice(eq + 1); }
      }
    } catch (e) { /* noop */ }
    return null;
  }

  function writeCookie(name, value, days) {
    try {
      var exp = new Date(Date.now() + days * 864e5).toUTCString();
      doc.cookie = name + '=' + value + '; expires=' + exp + '; path=/; SameSite=Lax';
    } catch (e) { /* noop */ }
  }

  function hostname() {
    try { return (global.location && global.location.hostname) || ''; } catch (e) { return ''; }
  }

  // Delete on no-domain, host and .host variants — localhost rejects domain=.
  function deleteCookie(name) {
    var h = hostname();
    var variants = ['', h ? '; domain=' + h : '', h ? '; domain=.' + h : ''];
    // Also try the registrable parent (a.b.example.com -> .example.com).
    var labels = h ? h.split('.') : [];
    if (labels.length > 2) { variants.push('; domain=.' + labels.slice(-2).join('.')); }
    for (var i = 0; i < variants.length; i++) {
      try {
        doc.cookie = name + '=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/' + variants[i];
      } catch (e) { /* noop */ }
    }
  }

  function listCookieNames() {
    var names = [];
    try {
      var raw = doc && typeof doc.cookie === 'string' ? doc.cookie : '';
      raw.split(';').forEach(function (p) {
        var t = p.trim();
        if (!t) { return; }
        var eq = t.indexOf('=');
        names.push(eq > -1 ? t.slice(0, eq) : t);
      });
    } catch (e) { /* noop */ }
    return names;
  }

  // Purges cookies owned by the given categories. `full` also sweeps the
  // catch-all demo_* prefix (used by rejectAll/withdraw).
  function purgeCookies(cats, full) {
    var exact = [];
    var prefixes = full ? FULL_PURGE_PREFIX.slice() : [];
    cats.forEach(function (c) {
      exact = exact.concat(COOKIE_EXACT[c] || []);
      prefixes = prefixes.concat(COOKIE_PREFIX[c] || []);
    });

    listCookieNames().forEach(function (n) {
      if (n === STORAGE_KEY) { return; }
      var hit = exact.indexOf(n) > -1;
      if (!hit) {
        for (var i = 0; i < prefixes.length; i++) {
          if (n.indexOf(prefixes[i]) === 0) { hit = true; break; }
        }
      }
      if (hit) { deleteCookie(n); }
    });
    // Masks may name cookies invisible to document.cookie: try them anyway.
    exact.forEach(deleteCookie);
  }

  // Clears every known tracker cookie (reject / withdraw).
  function purgeKnownCookies() {
    purgeCookies(OPT_IN, true);
  }

  // ---------------------------------------------------------------------------
  // Storage
  // ---------------------------------------------------------------------------
  function lsGet(k) {
    try { return global.localStorage ? global.localStorage.getItem(k) : null; } catch (e) { return null; }
  }
  function lsSet(k, v) {
    try { if (global.localStorage) { global.localStorage.setItem(k, v); } } catch (e) { /* noop */ }
  }
  function lsDel(k) {
    try { if (global.localStorage) { global.localStorage.removeItem(k); } } catch (e) { /* noop */ }
  }

  function saveRecord(rec) {
    var payload = b64encode(JSON.stringify(rec));
    if (!payload) { return; }
    writeCookie(STORAGE_KEY, payload, ttlDays());
    lsSet(STORAGE_KEY, payload);
  }

  function clearRecord() {
    deleteCookie(STORAGE_KEY);
    lsDel(STORAGE_KEY);
  }

  function ttlDays() {
    var d = config && Number(config.consentTtlDays);
    return (isFinite(d) && d > 0) ? d : 365;
  }

  function parseRecord(payload) {
    if (!payload) { return null; }
    var json = b64decode(payload);
    if (!json) { return null; }
    var rec;
    try { rec = JSON.parse(json); } catch (e) { return null; }
    if (!rec || typeof rec !== 'object' || !rec.categories) { return null; }
    return rec;
  }

  // Reads cookie first, falls back to localStorage. Returns null when invalid,
  // stale (policyVersion mismatch) or expired.
  function loadRecord() {
    var rec = parseRecord(readCookie(STORAGE_KEY)) || parseRecord(lsGet(STORAGE_KEY));
    if (!rec) { return null; }
    if (String(rec.policyVersion) !== String(config.policyVersion)) {
      clearRecord();
      return null;
    }
    var t = Date.parse(rec.ts);
    if (!isFinite(t) || (Date.now() - t) > ttlDays() * 864e5) {
      clearRecord();
      return null;
    }
    var cats = emptyCategories();
    CATEGORIES.forEach(function (c) {
      if (c === 'necessary') { return; }
      cats[c] = rec.categories[c] === true;
    });
    return {
      id: rec.id || uuid(),
      ts: rec.ts,
      policyVersion: String(rec.policyVersion),
      categories: cats,
      method: rec.method || 'custom'
    };
  }

  // ---------------------------------------------------------------------------
  // State
  // ---------------------------------------------------------------------------
  var config = clone(DEFAULT_CONFIG);
  var initialized = false;
  var state = {
    decided: false,
    id: null,
    ts: null,
    policyVersion: String(config.policyVersion),
    categories: emptyCategories(),
    method: null
  };

  function publicState() {
    return {
      decided: state.decided,
      id: state.id,
      ts: state.ts,
      policyVersion: state.policyVersion,
      categories: {
        necessary: true,
        functional: !!state.categories.functional,
        analytics: !!state.categories.analytics,
        marketing: !!state.categories.marketing
      },
      method: state.method
    };
  }

  function dispatch(name, detail) {
    try {
      if (!doc || typeof doc.dispatchEvent !== 'function') { return; }
      var ev;
      if (typeof global.CustomEvent === 'function') {
        ev = new global.CustomEvent(name, { detail: detail, bubbles: false, cancelable: false });
      } else if (doc.createEvent) {
        ev = doc.createEvent('CustomEvent');
        ev.initCustomEvent(name, false, false, detail);
      } else {
        return;
      }
      doc.dispatchEvent(ev);
    } catch (e) { /* UI layer absent or event system unavailable */ }
  }

  // ---------------------------------------------------------------------------
  // Google Consent Mode v2
  // ---------------------------------------------------------------------------
  function dataLayerPush(args) {
    try {
      global.dataLayer = global.dataLayer || [];
      global.dataLayer.push(args);
    } catch (e) { /* noop */ }
  }

  // Internal gtag shim; never clobbers a host-page window.gtag.
  function ckGtag() { dataLayerPush(arguments); }

  // Pushed exactly once, at parse time — before init() reveals
  // integrations.gcm, and before any tag can load. Consent Mode expects a
  // single 'default'; every later change goes through gcmUpdate().
  function gcmDefault() {
    var signals = gcmSignals(emptyCategories());
    signals.wait_for_update = 500;
    ckGtag('consent', 'default', signals);
  }

  // Maps consent categories onto GCM v2 signals. Shared by 'default' and
  // 'update' pushes so the mapping lives in exactly one place.
  function gcmSignals(c) {
    var g = function (b) { return b ? 'granted' : 'denied'; };
    return {
      ad_storage: g(c.marketing),
      analytics_storage: g(c.analytics),
      ad_user_data: g(c.marketing),
      ad_personalization: g(c.marketing),
      functionality_storage: g(c.functional),
      personalization_storage: g(c.functional),
      security_storage: 'granted'
    };
  }

  // Pushes the current state to both integrations. Withdraw relies on this too:
  // it resets state.categories to all-false first, so every signal goes denied.
  //
  // The two gates are independent by design: Consent Mode signals answer to
  // integrations.gcm, the ck_consent_update event answers to gtmDataLayer.
  // A {gcm:false, gtmDataLayer:true} config must still populate the GTM
  // ck_consent.* variables.
  function gcmUpdate() {
    try {
      var integrations = config.integrations || {};
      var c = state.categories;

      if (integrations.gcm !== false) {
        ckGtag('consent', 'update', gcmSignals(c));
      }

      if (integrations.gtmDataLayer !== false) {
        dataLayerPush({
          event: 'ck_consent_update',
          ck_consent: {
            necessary: true,
            functional: !!c.functional,
            analytics: !!c.analytics,
            marketing: !!c.marketing
          },
          ck_method: state.method
        });
      }
    } catch (e) { /* noop */ }
  }

  // Categories that already emitted a ck_consent_<cat> event on this page load.
  // Never cleared: GTM cannot unload a tag that has already fired, so a second
  // event for the same category would double-count. A fresh page load is the
  // only reset boundary — withdraw/reject deliberately leave this set intact.
  var firedCatEvents = {};

  // Pushes { event: 'ck_consent_<category>' } for each granted opt-in category,
  // once per page load. Gated on gtmDataLayer only: these drive GTM triggers and
  // must fire even when Consent Mode is switched off.
  function pushCategoryEvents() {
    try {
      if (config.integrations && config.integrations.gtmDataLayer === false) { return; }
      OPT_IN.forEach(function (cat) {
        if (!state.categories[cat] || firedCatEvents[cat]) { return; }
        firedCatEvents[cat] = true;
        dataLayerPush({ event: 'ck_consent_' + cat });
      });
    } catch (e) { /* noop */ }
  }

  // ---------------------------------------------------------------------------
  // Blocking engine — URL classification
  // ---------------------------------------------------------------------------
  function categoryForUrl(src) {
    if (!src || typeof src !== 'string') { return null; }
    var s = src;
    var host = '';
    try {
      var base = (global.location && global.location.href) || 'http://localhost/';
      var u = new URL(s, base);
      host = (u.hostname || '').toLowerCase();
      s = u.href;
    } catch (e) {
      var m = /^(?:[a-z]+:)?\/\/([^/?#]+)/i.exec(src);
      host = m ? m[1].toLowerCase().replace(/:\d+$/, '') : '';
    }
    if (host) {
      var keys = Object.keys(HOST_DB);
      for (var i = 0; i < keys.length; i++) {
        var e2 = keys[i];
        if (host === e2 || host.length > e2.length && host.slice(-(e2.length + 1)) === '.' + e2) {
          return HOST_DB[e2];
        }
      }
    }
    var low = String(s).toLowerCase();
    var pkeys = Object.keys(PATH_DB);
    for (var j = 0; j < pkeys.length; j++) {
      if (low.indexOf(pkeys[j]) > -1) { return PATH_DB[pkeys[j]]; }
    }
    return null;
  }

  function allowed(cat) {
    if (cat === 'necessary' || !cat) { return true; }
    if (CATEGORIES.indexOf(cat) === -1) { return true; }
    return state.categories[cat] === true;
  }

  // True when the URL is a known tracker whose category is not (yet) granted.
  function shouldBlock(src) {
    if (bypass) { return false; }
    var cat = categoryForUrl(src);
    if (!cat) { return false; }
    return !allowed(cat);
  }

  function markBlocked(el, src, cat) {
    try {
      if (nativeSetAttribute) {
        nativeSetAttribute.call(el, 'data-ck-blocked', '1');
        nativeSetAttribute.call(el, 'data-ck-src', src);
        nativeSetAttribute.call(el, 'data-ck', cat || 'marketing');
      }
      // Remember the real type (e.g. "module") so revival can restore it.
      var origType = el.getAttribute ? el.getAttribute('type') : null;
      if (origType && origType !== 'text/plain' && nativeSetAttribute) {
        nativeSetAttribute.call(el, 'data-ck-type', origType);
      }
      if (el.type !== 'text/plain') {
        try { el.type = 'text/plain'; } catch (e2) { /* noop */ }
      }
    } catch (e) { /* noop */ }
  }

  // ---------------------------------------------------------------------------
  // Blocking engine — patches (installed at parse time)
  // ---------------------------------------------------------------------------
  function installPatches() {
    // 1. HTMLScriptElement.prototype.src setter.
    try {
      if (nativeScriptSrcDesc && nativeScriptSrcDesc.set && nativeScriptSrcDesc.configurable !== false) {
        Object.defineProperty(global.HTMLScriptElement.prototype, 'src', {
          configurable: true,
          enumerable: nativeScriptSrcDesc.enumerable,
          get: function () {
            try { return nativeScriptSrcDesc.get.call(this); } catch (e) { return ''; }
          },
          set: function (v) {
            if (shouldBlock(v)) {
              markBlocked(this, String(v), categoryForUrl(v));
              return;
            }
            try { nativeScriptSrcDesc.set.call(this, v); } catch (e) { /* noop */ }
          }
        });
      }
    } catch (e) { /* noop */ }

    // 2. Element.prototype.setAttribute — covers setAttribute('src', ...).
    try {
      if (nativeSetAttribute && global.Element && global.Element.prototype) {
        global.Element.prototype.setAttribute = function (name, value) {
          try {
            if (!bypass && typeof name === 'string' && name.toLowerCase() === 'src' &&
                this && this.tagName && String(this.tagName).toUpperCase() === 'SCRIPT' &&
                shouldBlock(value)) {
              markBlocked(this, String(value), categoryForUrl(value));
              return undefined;
            }
          } catch (e) { /* fall through to native */ }
          return nativeSetAttribute.apply(this, arguments);
        };
      }
    } catch (e) { /* noop */ }

    // 3. document.createElement — pre-neutralize dynamically created scripts.
    try {
      if (nativeCreateElement && doc) {
        doc.createElement = function (tag) {
          var el = nativeCreateElement.apply(null, arguments);
          try {
            if (!bypass && typeof tag === 'string' && tag.toLowerCase() === 'script' &&
                nativeScriptSrcDesc && nativeScriptSrcDesc.set) {
              // Own-property guard so the element is covered even if the
              // prototype patch was reverted by another library.
              Object.defineProperty(el, 'src', {
                configurable: true,
                enumerable: false,
                get: function () {
                  try { return nativeScriptSrcDesc.get.call(this); } catch (e) { return ''; }
                },
                set: function (v) {
                  if (shouldBlock(v)) {
                    markBlocked(this, String(v), categoryForUrl(v));
                    return;
                  }
                  try { nativeScriptSrcDesc.set.call(this, v); } catch (e) { /* noop */ }
                }
              });
            }
          } catch (e) { /* noop */ }
          return el;
        };
      }
    } catch (e) { /* noop */ }
  }

  // 4. MutationObserver on documentElement — catches markup-inserted scripts.
  var observer = null;
  function installObserver() {
    try {
      if (typeof global.MutationObserver !== 'function' || !doc || !doc.documentElement) { return; }
      observer = new global.MutationObserver(function (records) {
        if (bypass) { return; }
        try {
          for (var i = 0; i < records.length; i++) {
            var added = records[i].addedNodes || [];
            for (var j = 0; j < added.length; j++) { inspectNode(added[j]); }
          }
        } catch (e) { /* noop */ }
      });
      observer.observe(doc.documentElement, { childList: true, subtree: true });
    } catch (e) { /* noop */ }
  }

  function inspectNode(node) {
    try {
      if (!node || node.nodeType !== 1) { return; }
      var tag = node.tagName ? String(node.tagName).toUpperCase() : '';
      if (tag === 'SCRIPT') { inspectScript(node); }
      if (typeof node.querySelectorAll === 'function') {
        var kids = node.querySelectorAll('script');
        for (var i = 0; i < kids.length; i++) { inspectScript(kids[i]); }
      }
    } catch (e) { /* noop */ }
  }

  function inspectScript(el) {
    try {
      if (!el || el.getAttribute === undefined) { return; }
      if (el.getAttribute('data-ck-blocked')) { return; }
      var type = el.getAttribute('type');
      if (type === 'text/plain' && el.getAttribute('data-ck')) { return; } // manual markup
      var src = el.getAttribute('src');
      if (!src) { return; }
      if (shouldBlock(src)) {
        var cat = categoryForUrl(src);
        markBlocked(el, src, cat);
        // Clear the attribute. Note: if the element was already connected the
        // request may already be in flight — the createElement/src patches are
        // the reliable path; this is a late net for markup-inserted scripts.
        try { if (nativeSetAttribute) { nativeSetAttribute.call(el, 'src', ''); } } catch (e2) { /* noop */ }
        try { if (nativeSetAttribute) { nativeSetAttribute.call(el, 'data-ck-src', src); } } catch (e3) { /* noop */ }
      }
    } catch (e) { /* noop */ }
  }

  // ---------------------------------------------------------------------------
  // Blocking engine — unblocking after consent
  // ---------------------------------------------------------------------------
  var SKIP_ATTRS = { type: 1, src: 1, 'data-src': 1, 'data-ck': 1, 'data-ck-src': 1, 'data-ck-blocked': 1 };

  function reviveScript(old) {
    if (!nativeCreateElement || !old || !old.parentNode) { return; }
    var prev = bypass;
    bypass = true;
    try {
      var fresh = nativeCreateElement('script');
      // Copy attributes, minus our own bookkeeping.
      var attrs = old.attributes || [];
      for (var i = 0; i < attrs.length; i++) {
        var a = attrs[i];
        if (SKIP_ATTRS[String(a.name).toLowerCase()]) { continue; }
        try { nativeSetAttribute.call(fresh, a.name, a.value); } catch (e) { /* noop */ }
      }
      var realType = old.getAttribute('data-ck-type');
      if (realType) {
        try { nativeSetAttribute.call(fresh, 'type', realType); } catch (e) { /* noop */ }
      }
      var src = old.getAttribute('data-src') || old.getAttribute('data-ck-src') || '';
      if (src) {
        // Preserve document order for external scripts.
        try { fresh.async = false; } catch (e) { /* noop */ }
        if (nativeScriptSrcDesc && nativeScriptSrcDesc.set) {
          nativeScriptSrcDesc.set.call(fresh, src);
        } else {
          nativeSetAttribute.call(fresh, 'src', src);
        }
      } else {
        try { fresh.text = old.text || old.textContent || ''; } catch (e) { /* noop */ }
      }
      try { nativeSetAttribute.call(fresh, 'data-ck-restored', '1'); } catch (e) { /* noop */ }
      old.parentNode.insertBefore(fresh, old);
      try { old.parentNode.removeChild(old); } catch (e) { /* noop */ }
    } catch (e) {
      /* noop */
    } finally {
      bypass = prev;
    }
  }

  function qsa(sel) {
    try {
      if (!doc || typeof doc.querySelectorAll !== 'function') { return []; }
      return Array.prototype.slice.call(doc.querySelectorAll(sel));
    } catch (e) { return []; }
  }

  // Applies the current consent state to the DOM: revives newly-allowed scripts
  // and iframes, in document order.
  function applyConsentToDom() {
    // Manual markup + auto-blocked scripts, one ordered pass.
    var scripts = qsa('script[type="text/plain"][data-ck], script[data-ck-blocked]');
    scripts.forEach(function (el) {
      try {
        if (el.getAttribute('data-ck-restored')) { return; }
        var cat = el.getAttribute('data-ck');
        if (!cat) { cat = categoryForUrl(el.getAttribute('data-src') || el.getAttribute('data-ck-src') || ''); }
        if (!allowed(cat)) { return; }
        reviveScript(el);
      } catch (e) { /* noop */ }
    });

    // Iframes: set src from data-src once the category is granted.
    qsa('iframe[data-ck][data-src]').forEach(function (el) {
      try {
        var cat = el.getAttribute('data-ck');
        if (!allowed(cat)) { return; }
        if (el.getAttribute('src')) { return; }
        var src = el.getAttribute('data-src');
        if (!src) { return; }
        var prev = bypass;
        bypass = true;
        try { nativeSetAttribute.call(el, 'src', src); } finally { bypass = prev; }
      } catch (e) { /* noop */ }
    });
  }

  // Initial sweep for scripts already parsed before the observer attached.
  function initialScan() {
    qsa('script[src]').forEach(inspectScript);
  }

  // ---------------------------------------------------------------------------
  // Decisions
  // ---------------------------------------------------------------------------
  function commit(categories, method) {
    var wasDecided = state.decided;
    state.categories = {
      necessary: true,
      functional: categories.functional === true,
      analytics: categories.analytics === true,
      marketing: categories.marketing === true
    };
    state.decided = true;
    state.method = method;
    state.id = state.id || uuid();
    state.ts = new Date().toISOString();
    state.policyVersion = String(config.policyVersion);

    saveRecord({
      id: state.id,
      ts: state.ts,
      policyVersion: state.policyVersion,
      categories: {
        necessary: true,
        functional: state.categories.functional,
        analytics: state.categories.analytics,
        marketing: state.categories.marketing
      },
      method: state.method
    });

    gcmUpdate();
    pushCategoryEvents();

    // Clear cookies of the categories that stay denied; a full reject sweeps
    // the catch-all demo_* prefix too.
    var denied = OPT_IN.filter(function (c) { return !state.categories[c]; });
    if (denied.length) { purgeCookies(denied, denied.length === OPT_IN.length); }

    applyConsentToDom();

    if (!wasDecided) { dispatch('ck:consent', { state: publicState() }); }
    dispatch('ck:change', { state: publicState() });
  }

  // Only categories enabled in config can be granted.
  function filterByConfig(cats) {
    var out = { functional: false, analytics: false, marketing: false };
    OPT_IN.forEach(function (c) {
      var cfg = config.categories && config.categories[c];
      var enabled = !cfg || cfg.enabled !== false;
      out[c] = enabled && cats[c] === true;
    });
    return out;
  }

  function accept(arg) {
    try {
      var cats, method;
      if (arg === 'all' || arg === undefined || arg === null) {
        cats = { functional: true, analytics: true, marketing: true };
        method = 'accept_all';
      } else if (isPlainObject(arg)) {
        cats = { functional: arg.functional === true, analytics: arg.analytics === true, marketing: arg.marketing === true };
        method = 'custom';
      } else {
        cats = { functional: true, analytics: true, marketing: true };
        method = 'accept_all';
      }
      commit(filterByConfig(cats), method);
    } catch (e) { /* noop */ }
    return publicState();
  }

  function rejectAll() {
    try {
      commit({ functional: false, analytics: false, marketing: false }, 'reject_all');
    } catch (e) { /* noop */ }
    return publicState();
  }

  function withdraw() {
    try {
      state.decided = false;
      state.id = null;
      state.ts = null;
      state.method = null;
      state.categories = emptyCategories();
      state.policyVersion = String(config.policyVersion);

      clearRecord();
      purgeKnownCookies();
      // 'update' with everything denied, not a second 'default': Consent Mode
      // accepts only one default, set before tags load. State was reset above,
      // so gcmUpdate() emits all-denied and honours integrations.gcm.
      gcmUpdate();
      // Loaded scripts are not unloaded; a fresh page load starts clean.
      dispatch('ck:change', { state: publicState() });
    } catch (e) { /* noop */ }
    return publicState();
  }

  // ---------------------------------------------------------------------------
  // Public API
  // ---------------------------------------------------------------------------
  var ConsentKit = {
    version: '0.3.4',
    config: config,

    init: function (userConfig) {
      try {
        config = mergeConfig(config, userConfig);
        ConsentKit.config = config;

        if (initialized) {
          // Idempotent: merge config, no re-restore, no duplicate ck:init.
          return publicState();
        }
        initialized = true;

        var rec = loadRecord();
        if (rec) {
          state.decided = true;
          state.id = rec.id;
          state.ts = rec.ts;
          state.policyVersion = rec.policyVersion;
          state.categories = rec.categories;
          state.method = rec.method;
          gcmUpdate();
          // Return visit: GTM triggers must fire for the restored categories.
          pushCategoryEvents();
        } else {
          state.policyVersion = String(config.policyVersion);
        }

        initialScan();
        applyConsentToDom();

        dispatch('ck:init', { state: publicState(), config: config });
      } catch (e) { /* core must never throw */ }
      return publicState();
    },

    allowed: function (cat) {
      try { return allowed(cat); } catch (e) { return false; }
    },

    getState: function () {
      try { return publicState(); } catch (e) {
        return { decided: false, id: null, ts: null, policyVersion: '1', categories: emptyCategories(), method: null };
      }
    },

    accept: accept,
    rejectAll: rejectAll,
    withdraw: withdraw,

    show: function () { dispatch('ck:ui:open-preferences', { state: publicState(), config: config }); },
    hide: function () { dispatch('ck:ui:close', { state: publicState() }); },

    // Introspection helpers for the demo status panel (read-only).
    _categoryForUrl: categoryForUrl,
    _categories: CATEGORIES.slice()
  };

  // ---------------------------------------------------------------------------
  // Bootstrap — runs at parse time, before init().
  // ---------------------------------------------------------------------------
  // Each step is isolated: a failure in one (or a double-load re-patching an
  // already-patched document) must never stop the API from being published.
  try { gcmDefault(); } catch (e) { /* noop */ }
  try { installPatches(); } catch (e) { /* noop */ }
  try { installObserver(); } catch (e) { /* noop */ }
  try { initialScan(); } catch (e) { /* noop */ }

  try {
    if (doc && typeof doc.addEventListener === 'function') {
      doc.addEventListener('DOMContentLoaded', function () {
        try { initialScan(); applyConsentToDom(); } catch (e) { /* noop */ }
      }, false);
    }
  } catch (e) { /* noop */ }

  global.ConsentKit = ConsentKit;
  if (typeof module === 'object' && module && module.exports) { module.exports = ConsentKit; }
  void noop;
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : this));
