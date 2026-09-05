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
  var nativeIframeSrcDesc = null;
  try {
    if (global.HTMLIFrameElement && global.HTMLIFrameElement.prototype) {
      nativeIframeSrcDesc = Object.getOwnPropertyDescriptor(global.HTMLIFrameElement.prototype, 'src');
    }
  } catch (e) { /* noop */ }
  var nativeRemoveAttribute = (global.Element && global.Element.prototype && global.Element.prototype.removeAttribute) || null;

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
    // Cloudflare Web Analytics. Subdomain only, and deliberately NOT in
    // INFRA_DB: the rest of Cloudflare's edge is infrastructure, but this one
    // beacon is a measurement product (§8 names it by hand for that reason).
    'static.cloudflareinsights.com': 'analytics',

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

  // Runtime overrides fed in by ConsentKit._extendHostDb(map) — the SaaS
  // config's `hostdb`, or a hand call on a standalone page. Kept SEPARATE from
  // HOST_DB on purpose: tools/export-hostdb.mjs extracts the HOST_DB literal
  // out of this file with node:vm, and tools/sync-hostdb.mjs writes into that
  // same literal. A runtime map merged into HOST_DB would be invisible to both
  // (it never exists on disk) yet would blur what "the shipped database" means.
  // Consulted BEFORE HOST_DB, so an override wins over a built-in entry.
  var EXTRA_DB = {};

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
    // 0.5.0: radius/font/buttons are resolved in ck-ui.js, not defaulted here.
    // A concrete default in this object would be merged into every config and
    // would then shadow the UI's own defaults — which is exactly what happened
    // to `radius: '10px'` before 0.5.0: it pinned the pre-reference geometry on
    // every site whether or not the owner had ever set it.
    theme: { accent: '#2B50D8' },
    // 0.5.0 (SPEC V1.6 §2). `detailsAction` is deliberately absent rather than
    // set: its default depends on whether policyUrl is present, and a merged
    // concrete value here would make that URL-sensitive default unreachable.
    texts: {},
    categories: {
      functional: { enabled: true },
      analytics: { enabled: true },
      marketing: { enabled: true }
    },
    consentTtlDays: 365,
    integrations: { gcm: true, gtmDataLayer: true },
    // 'known'  — block what the tracker database recognises (the default, and
    //            everything ConsentKit did before 0.4.0).
    // 'strict' — additionally hold back EVERY third-party script/iframe that is
    //            not same-site, not in `allow` and not in BASE_ALLOW.
    blocking: { mode: 'known', allow: [] },
    cookieTable: []
  };

  // Infrastructure (§8) — NOT a consent category, a CLASS of host.
  //
  // These are the CDNs, static hosts and font services that site builders and
  // hosting platforms serve a site's OWN markup, styles and scripts from. A
  // Tilda page loads its own layout from tildacdn.com; a Wix page loads its own
  // from parastorage.com. Reporting those to the site owner as «сторонние
  // подключения без категории» is noise about something they cannot decide:
  // there is no consent question to answer and no switch to flip. §8 exists to
  // stop the audit spending the owner's attention on them.
  //
  // Two consequences, both of them the point:
  //   - strict mode NEVER intercepts these (a builder's dynamic modules break
  //     without their own CDN, and blocking them breaks the site, not a tracker);
  //   - the scanner flags them `infra: true`, keeps them out of the summary and
  //     never writes them to tracker_observations.
  //
  // Suffix-matched, exactly like HOST_DB. Membership here is not a claim that a
  // host is harmless in general — it is a claim that it serves the site's own
  // assets. Anything that MEASURES belongs in HOST_DB with a real category
  // instead: static.cloudflareinsights.com is the worked example (§8 calls it
  // out by name), and it sits above as `analytics` for that reason. Because
  // categoryForUrl is consulted before the strict allowlist, a host in both
  // places is classified, not waved through — so a bare `cloudflare.com` here
  // would be a bug.
  var INFRA_DB = [
    // --- site builders and hosting platforms ---------------------------
    'tildacdn.com',
    'tildacdn.net',
    'tilda.ws',
    'static.wixstatic.com',
    'parastorage.com',                     // Wix static assets
    'cdn.shopify.com',
    'squarespace-cdn.com',
    'assets.website-files.com',            // Webflow
    // --- general asset CDNs --------------------------------------------
    'cdn.jsdelivr.net',
    'unpkg.com',
    'cdnjs.cloudflare.com',
    'code.jquery.com',
    'ajax.googleapis.com',
    // --- fonts ----------------------------------------------------------
    'fonts.googleapis.com',
    'fonts.gstatic.com',
    // --- captcha ---------------------------------------------------------
    // A page whose form is gated behind a captcha is unusable without it. The
    // Google-hosted halves are path-scoped in BASE_ALLOW_PATH below, since
    // www.google.com and www.gstatic.com cannot be waved through wholesale.
    'hcaptcha.com',
    // --- our own service -------------------------------------------------
    // The consent tool must not report itself as an unnamed third party.
    'consent.ecomconsult.net'
  ];

  // Hosts strict mode never intercepts that are NOT infrastructure: things a
  // page is broken or unusable without, but which are somebody's product
  // rather than the site's own asset delivery. Kept separate from INFRA_DB so
  // that «инфраструктура» in a report means what §8 says it means — a payment
  // form is a third party the owner chose, and calling it infrastructure would
  // hide a real decision. Both lists feed strict mode identically.
  var BASE_ALLOW = [
    'js.stripe.com',
    'pay.google.com',
    'checkout.creem.io'
  ];

  // Path-scoped members of the base allowlist: allowed only on this exact path
  // prefix, because the host at large is not something to wave through.
  //
  // §8 lists these two under infrastructure, and they are — but they cannot
  // live in INFRA_DB, which is a flat list of suffix-matched HOSTS. Allowing
  // `www.google.com` as a host would wave through every Google property, and
  // `_isInfra(host)` has no path to test. So they stay here: strict mode treats
  // them exactly as it treats INFRA_DB, and `_infra()` reports hosts only.
  var BASE_ALLOW_PATH = [
    { host: 'www.google.com', path: '/recaptcha' },
    { host: 'www.gstatic.com', path: '/recaptcha' }
  ];

  // Multi-label public suffixes: without these, `bbc.co.uk` and `itv.co.uk`
  // would share the registrable domain `co.uk` and count as same-site. The list
  // only ever WIDENS the registrable domain (two labels -> three), so a missing
  // entry can only make strict mode treat a sibling as first-party and let it
  // through — never make it block a genuine first-party asset. A full public
  // suffix list is ~10k entries and has no place in a zero-dependency client.
  var PSL_TWO_LABEL = {
    'co.uk': 1, 'org.uk': 1, 'me.uk': 1, 'ac.uk': 1, 'gov.uk': 1, 'net.uk': 1, 'sch.uk': 1,
    'com.au': 1, 'net.au': 1, 'org.au': 1, 'edu.au': 1, 'gov.au': 1,
    'co.nz': 1, 'net.nz': 1, 'org.nz': 1,
    'com.br': 1, 'net.br': 1, 'org.br': 1,
    'co.jp': 1, 'ne.jp': 1, 'or.jp': 1, 'ac.jp': 1,
    'co.za': 1, 'org.za': 1,
    'com.cn': 1, 'net.cn': 1, 'org.cn': 1,
    'co.in': 1, 'net.in': 1, 'org.in': 1,
    'com.tr': 1, 'com.mx': 1, 'com.ar': 1, 'com.sg': 1, 'com.hk': 1,
    'com.ua': 1, 'com.pl': 1, 'com.ru': 1, 'co.il': 1, 'co.kr': 1
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
  // host === key, or host is a subdomain of key. The one matching rule in the
  // engine: HOST_DB, EXTRA_DB and BASE_ALLOW all use it.
  function hostMatches(host, key) {
    if (!host || !key) { return false; }
    return host === key || (host.length > key.length && host.slice(-(key.length + 1)) === '.' + key);
  }

  function lookupHostMap(map, host) {
    var keys = Object.keys(map);
    for (var i = 0; i < keys.length; i++) {
      if (hostMatches(host, keys[i])) { return map[keys[i]]; }
    }
    return null;
  }

  // Splits a URL into { host, url } with the page as the resolution base, so a
  // relative src resolves to the first-party host rather than to nothing.
  function urlParts(src) {
    var s = String(src);
    var host = '';
    try {
      var base = (global.location && global.location.href) || 'http://localhost/';
      var u = new URL(s, base);
      host = (u.hostname || '').toLowerCase();
      s = u.href;
    } catch (e) {
      var m = /^(?:[a-z]+:)?\/\/([^/?#]+)/i.exec(String(src));
      host = m ? m[1].toLowerCase().replace(/:\d+$/, '') : '';
    }
    return { host: host, url: s };
  }

  function categoryForUrl(src) {
    if (!src || typeof src !== 'string') { return null; }
    var parts = urlParts(src);
    var host = parts.host;
    if (host) {
      // Service overrides first: an override exists precisely to correct or
      // extend what the shipped table says about a host.
      var over = lookupHostMap(EXTRA_DB, host);
      if (over) { return over; }
      var built = lookupHostMap(HOST_DB, host);
      if (built) { return built; }
    }
    var low = String(parts.url).toLowerCase();
    var pkeys = Object.keys(PATH_DB);
    for (var j = 0; j < pkeys.length; j++) {
      if (low.indexOf(pkeys[j]) > -1) { return PATH_DB[pkeys[j]]; }
    }
    return null;
  }

  // Merges { host: category } into the runtime database. Safe before and after
  // init(): after init nothing already inserted is re-evaluated (a script that
  // has loaded cannot be unloaded), but every later insertion sees the new map.
  function extendHostDb(map) {
    var added = 0;
    try {
      if (!isPlainObject(map)) { return 0; }
      Object.keys(map).forEach(function (rawHost) {
        // The map arrives over the network in the SaaS path: validate both
        // halves rather than trusting the server's shape.
        if (typeof rawHost !== 'string') { return; }
        var host = rawHost.trim().toLowerCase().replace(/:\d+$/, '').replace(/^\.+|\.+$/g, '');
        if (!host || host.indexOf('.') === -1 || /[^a-z0-9.\-]/.test(host)) { return; }
        var cat = map[rawHost];
        if (typeof cat !== 'string' || CATEGORIES.indexOf(cat) === -1) { return; }
        if (EXTRA_DB[host] === cat) { return; }
        EXTRA_DB[host] = cat;
        added++;
      });
    } catch (e) { /* noop */ }
    return added;
  }

  // ---------------------------------------------------------------------------
  // Blocking engine — strict mode (§2)
  // ---------------------------------------------------------------------------
  // Everything strict intercepts is filed under the strictest category, so it
  // is released only by a consent that covers marketing.
  var STRICT_CATEGORY = 'marketing';

  // Registrable domain, best effort: last two labels, or last three when the
  // last two form a known multi-label public suffix.
  function registrable(host) {
    if (!host) { return ''; }
    var labels = String(host).split('.');
    if (labels.length <= 2) { return host; }
    var lastTwo = labels.slice(-2).join('.');
    if (PSL_TWO_LABEL[lastTwo] && labels.length >= 3) { return labels.slice(-3).join('.'); }
    return lastTwo;
  }

  // Conservative on purpose: whenever the answer is not clearly "third party",
  // this says same-site. A wrong "third party" verdict breaks a live site in
  // strict mode; a wrong "same-site" verdict merely lets one unknown script
  // through, which is exactly what every version before 0.4.0 did.
  function isSameSite(host) {
    if (!host) { return true; }              // unparseable -> do not intercept
    var page = hostname().toLowerCase();
    if (!page) { return true; }              // no location (SSR/about:blank) -> strict is inert
    if (host === page) { return true; }
    var r = registrable(host);
    var pr = registrable(page);
    return !!r && r === pr;
  }

  // Is this host infrastructure (§8)? Suffix-matched, like everything else.
  //
  // `ConsentKitDebugUrl` is resolved HERE rather than being baked into
  // INFRA_DB, because it is a runtime window global a site sets to point the
  // debug panel at its own mirror. Reading it at call time is the only way it
  // can be covered at all; a snapshot taken when this file was evaluated would
  // miss every page that sets it after the core loads.
  function isInfraHost(host) {
    if (!host) { return false; }
    for (var i = 0; i < INFRA_DB.length; i++) {
      if (hostMatches(host, INFRA_DB[i])) { return true; }
    }
    try {
      var dbg = global.ConsentKitDebugUrl;
      if (typeof dbg === 'string' && dbg) {
        var dh = urlParts(dbg).host;
        if (dh && dh === host) { return true; }
      }
    } catch (e) { /* noop */ }
    return false;
  }

  function baseAllowed(host, url) {
    // §8: infrastructure is never intercepted by strict mode. Checked first —
    // it is the larger list and the commoner case on a builder-hosted site.
    if (isInfraHost(host)) { return true; }
    for (var i = 0; i < BASE_ALLOW.length; i++) {
      if (hostMatches(host, BASE_ALLOW[i])) { return true; }
    }
    for (var j = 0; j < BASE_ALLOW_PATH.length; j++) {
      var e = BASE_ALLOW_PATH[j];
      if (host !== e.host) { continue; }
      var path = '';
      try { path = new URL(String(url), 'http://localhost/').pathname || ''; } catch (e2) { path = ''; }
      if (path.indexOf(e.path) === 0) { return true; }
    }
    return false;
  }

  function siteAllowed(host) {
    try {
      var list = config.blocking && config.blocking.allow;
      if (!list || typeof list.length !== 'number') { return false; }
      for (var i = 0; i < list.length; i++) {
        var entry = list[i];
        if (typeof entry !== 'string') { continue; }
        var key = entry.trim().toLowerCase().replace(/^\.+/, '');
        if (key && hostMatches(host, key)) { return true; }
      }
    } catch (e) { /* noop */ }
    return false;
  }

  function strictMode() {
    try { return !!(config.blocking && config.blocking.mode === 'strict'); } catch (e) { return false; }
  }

  // True when strict mode should hold this URL back. Reached only for URLs the
  // tracker database does NOT recognise: a known host has a real category and
  // is decided by allowed() long before this runs, which is why a HOST_DB
  // `necessary` or `functional` host passes strict without a special case.
  function strictBlocks(src) {
    if (!strictMode()) { return false; }
    var s = String(src || '');
    // Non-network schemes carry no third party. A bare "//host/x" has no scheme
    // and is protocol-relative, so it is deliberately not caught here.
    if (/^\s*(?:data|blob|javascript|about|mailto|tel):/i.test(s)) { return false; }
    var parts = urlParts(s);
    var host = parts.host;
    if (!host) { return false; }
    if (isSameSite(host)) { return false; }
    if (baseAllowed(host, parts.url)) { return false; }
    if (siteAllowed(host)) { return false; }
    // Intercepted unknowns are treated as marketing — the strictest category —
    // so they come back only when the visitor accepts marketing.
    return !allowed(STRICT_CATEGORY);
  }

  function allowed(cat) {
    if (cat === 'necessary' || !cat) { return true; }
    if (CATEGORIES.indexOf(cat) === -1) { return true; }
    return state.categories[cat] === true;
  }

  // True when the URL must be held back: a known tracker whose category is not
  // yet granted, or — in strict mode — an unknown third party.
  function shouldBlock(src) {
    if (bypass) { return false; }
    var cat = categoryForUrl(src);
    if (cat) { return !allowed(cat); }
    return strictBlocks(src);
  }

  // The category an interception is filed under. Known hosts keep their own;
  // a strict interception is marketing.
  function blockCategory(src) {
    return categoryForUrl(src) || STRICT_CATEGORY;
  }

  // Was this particular interception a strict-mode one (i.e. the URL is not in
  // the tracker database at all)? Drives the «strict» label in the debug panel.
  function isStrictHit(src) {
    return !categoryForUrl(src) && strictMode();
  }

  // Registry of everything the engine intercepted, for the debug panel (§8.1
  // item 3). Kept deliberately small: host + path only, никаких query strings —
  // a tracker URL's query carries ids and, on badly built sites, PII.
  // Capped so a page that injects trackers in a loop cannot grow it without
  // bound; the panel shows the first BLOCKED_MAX, which is always enough to see
  // what is happening.
  var BLOCKED_MAX = 200;
  var blockedLog = [];

  // host + path, query and fragment dropped.
  function safeUrlParts(src) {
    var host = '';
    var path = '';
    try {
      var base = (global.location && global.location.href) || 'http://localhost/';
      var u = new URL(String(src), base);
      host = (u.hostname || '').toLowerCase();
      path = u.pathname || '';
    } catch (e) {
      var s = String(src || '');
      var m = /^(?:[a-z]+:)?\/\/([^/?#]+)([^?#]*)/i.exec(s);
      if (m) {
        host = m[1].toLowerCase().replace(/:\d+$/, '');
        path = m[2] || '';
      } else {
        path = s.split('?')[0].split('#')[0];
      }
    }
    return { host: host, path: path };
  }

  function noteBlocked(el, src, cat, origin, strict) {
    try {
      if (blockedLog.length >= BLOCKED_MAX) { return; }
      var kind = 'script';
      try {
        var tag = el && el.tagName ? String(el.tagName).toLowerCase() : '';
        if (tag) { kind = tag === 'img' ? 'img' : tag; }
      } catch (e2) { /* noop */ }
      var parts = safeUrlParts(src);
      for (var i = 0; i < blockedLog.length; i++) {
        var p = blockedLog[i];
        if (p.host === parts.host && p.path === parts.path && p.kind === kind) { return; }
      }
      blockedLog.push({
        host: parts.host,
        path: parts.path,
        kind: kind,
        category: cat || null,
        origin: origin || 'engine',
        strict: strict === true,
        // Flipped by noteRevived() when applyConsentToDom() actually brings the
        // element back. An entry that never flips is one the visitor consented
        // to and that still did not load — worth showing in the debug panel.
        revived: false
      });
    } catch (e) { /* noop */ }
  }

  function markBlocked(el, src, cat) {
    noteBlocked(el, src, cat, 'engine', isStrictHit(src));
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

  // An intercepted iframe is left in EXACTLY the shape applyConsentToDom()
  // already revives — data-ck + data-src and NO src attribute — so revival is
  // the one code path for hand-marked, plugin-rewritten and engine-blocked
  // iframes alike. `type="text/plain"` is script-only and must not be set here.
  // data-ck-blocked also keeps _blocked()'s markup sweep from listing this
  // element a second time: it matches iframe[data-ck][data-src] too.
  // Flags the registry entry for this URL+kind as revived, so _blocked() can
  // tell "came back after consent" from "was intercepted and never returned".
  function noteRevived(src, kind) {
    try {
      var parts = safeUrlParts(src);
      for (var i = 0; i < blockedLog.length; i++) {
        var b = blockedLog[i];
        if (b.host === parts.host && b.path === parts.path && b.kind === kind) { b.revived = true; }
      }
    } catch (e) { /* noop */ }
  }

  function markBlockedIframe(el, src, cat) {
    noteBlocked(el, src, cat, 'engine', isStrictHit(src));
    try {
      if (!nativeSetAttribute) { return; }
      nativeSetAttribute.call(el, 'data-ck-blocked', '1');
      nativeSetAttribute.call(el, 'data-src', src);
      nativeSetAttribute.call(el, 'data-ck', cat || STRICT_CATEGORY);
      // Any src already on the element must go, or revival skips it.
      try { if (nativeRemoveAttribute) { nativeRemoveAttribute.call(el, 'src'); } } catch (e2) { /* noop */ }
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

    // 1b. HTMLIFrameElement.prototype.src setter. Strict mode holds back
    // third-party frames too (§2), and a known tracker embedded as an iframe
    // was never caught before either.
    try {
      if (nativeIframeSrcDesc && nativeIframeSrcDesc.set && nativeIframeSrcDesc.configurable !== false) {
        Object.defineProperty(global.HTMLIFrameElement.prototype, 'src', {
          configurable: true,
          enumerable: nativeIframeSrcDesc.enumerable,
          get: function () {
            try { return nativeIframeSrcDesc.get.call(this); } catch (e) { return ''; }
          },
          set: function (v) {
            if (shouldBlock(v)) {
              markBlockedIframe(this, String(v), blockCategory(v));
              return;
            }
            try { nativeIframeSrcDesc.set.call(this, v); } catch (e) { /* noop */ }
          }
        });
      }
    } catch (e) { /* noop */ }

    // 2. Element.prototype.setAttribute — covers setAttribute('src', ...) on
    // both scripts and iframes.
    try {
      if (nativeSetAttribute && global.Element && global.Element.prototype) {
        global.Element.prototype.setAttribute = function (name, value) {
          try {
            if (!bypass && typeof name === 'string' && name.toLowerCase() === 'src' && this && this.tagName) {
              var t = String(this.tagName).toUpperCase();
              if ((t === 'SCRIPT' || t === 'IFRAME') && shouldBlock(value)) {
                if (t === 'IFRAME') {
                  markBlockedIframe(this, String(value), blockCategory(value));
                } else {
                  markBlocked(this, String(value), blockCategory(value));
                }
                return undefined;
              }
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
            var name = (!bypass && typeof tag === 'string') ? tag.toLowerCase() : '';
            // Own-property guard so the element is covered even if the
            // prototype patch was reverted by another library.
            if (name === 'script' && nativeScriptSrcDesc && nativeScriptSrcDesc.set) {
              Object.defineProperty(el, 'src', {
                configurable: true,
                enumerable: false,
                get: function () {
                  try { return nativeScriptSrcDesc.get.call(this); } catch (e) { return ''; }
                },
                set: function (v) {
                  if (shouldBlock(v)) {
                    markBlocked(this, String(v), blockCategory(v));
                    return;
                  }
                  try { nativeScriptSrcDesc.set.call(this, v); } catch (e) { /* noop */ }
                }
              });
            } else if (name === 'iframe' && nativeIframeSrcDesc && nativeIframeSrcDesc.set) {
              Object.defineProperty(el, 'src', {
                configurable: true,
                enumerable: false,
                get: function () {
                  try { return nativeIframeSrcDesc.get.call(this); } catch (e) { return ''; }
                },
                set: function (v) {
                  if (shouldBlock(v)) {
                    markBlockedIframe(this, String(v), blockCategory(v));
                    return;
                  }
                  try { nativeIframeSrcDesc.set.call(this, v); } catch (e) { /* noop */ }
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
      if (tag === 'IFRAME') { inspectIframe(node); }
      if (typeof node.querySelectorAll === 'function') {
        var kids = node.querySelectorAll('script');
        for (var i = 0; i < kids.length; i++) { inspectScript(kids[i]); }
        var frames = node.querySelectorAll('iframe');
        for (var j = 0; j < frames.length; j++) { inspectIframe(frames[j]); }
      }
    } catch (e) { /* noop */ }
  }

  // Late net for iframes that arrived as markup. Same honesty as inspectScript:
  // once the element is connected the request may already be in flight — the
  // src/createElement patches are the reliable path.
  function inspectIframe(el) {
    try {
      if (!el || el.getAttribute === undefined) { return; }
      if (el.getAttribute('data-ck-blocked')) { return; }
      if (el.getAttribute('data-ck') && el.getAttribute('data-src')) { return; } // manual markup
      var src = el.getAttribute('src');
      if (!src) { return; }
      if (shouldBlock(src)) { markBlockedIframe(el, src, blockCategory(src)); }
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
        var cat = blockCategory(src);
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
      if (src) { noteRevived(src, 'script'); }
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
        noteRevived(src, 'iframe');
      } catch (e) { /* noop */ }
    });
  }

  // Initial sweep for scripts already parsed before the observer attached.
  function initialScan() {
    qsa('script[src]').forEach(inspectScript);
    qsa('iframe[src]').forEach(inspectIframe);
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
    version: '0.5.0',
    config: config,

    init: function (userConfig) {
      try {
        config = mergeConfig(config, userConfig);
        ConsentKit.config = config;

        // Service / author overrides, merged BEFORE initialScan() below so the
        // scripts already in the markup are classified against them. In SaaS
        // mode ck-saas.js has usually applied these already; extendHostDb is
        // idempotent, so doing it twice costs nothing.
        if (userConfig && isPlainObject(userConfig.hostdb)) { extendHostDb(userConfig.hostdb); }

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
    _categories: CATEGORIES.slice(),

    // Merges { host: category } into the runtime tracker database (§1.3).
    // Works before AND after init(): after init nothing already inserted is
    // re-evaluated — a script that has loaded cannot be unloaded — but every
    // later insertion is classified against the extended map. Returns the
    // number of entries actually added; unknown categories and malformed hosts
    // are dropped, because this map arrives over the network in the SaaS path.
    _extendHostDb: function (map) {
      try { return extendHostDb(map); } catch (e) { return 0; }
    },

    // The built-in strict-mode allowlist, exported for docs and tests so the
    // list a site owner reads is the list the engine actually uses. Since 0.4.1
    // that is INFRA_DB (§8) plus the payment/captcha set plus the path-scoped
    // entries — everything baseAllowed() consults, in one list, because what a
    // site owner needs to know is «what does strict mode let through», not how
    // the engine files it internally.
    //
    // A GETTER, not a plain array: a plain property is evaluated once, and the
    // single array it produced would be handed to every caller — one
    // `ConsentKit._baseAllow.push(...)` from page code would then silently
    // widen what strict mode lets through for the rest of the page load.
    // Each read returns a fresh copy, so the list is readable and inert.
    get _baseAllow() {
      return INFRA_DB.slice()
        .concat(BASE_ALLOW)
        .concat(BASE_ALLOW_PATH.map(function (e) { return e.host + e.path; }));
    },

    // The infrastructure list (§8): CDNs and static hosts of site builders and
    // hosting platforms, general asset CDNs, fonts and captcha. A CLASS of
    // host, not a consent category — nothing here is a decision the site owner
    // gets to make, which is exactly why the audit stops reporting them.
    //
    // Shared with the SaaS scanner, which loads this core and reads this list
    // to set `thirdParty[].infra`, keep infrastructure out of the summary and
    // out of tracker_observations. Hosts only: the two path-scoped recaptcha
    // entries are infrastructure too, but cannot be expressed as bare hosts —
    // see BASE_ALLOW_PATH. A fresh copy per read, for the same reason as
    // _baseAllow.
    _infra: function () {
      return INFRA_DB.slice();
    },

    // Is this URL infrastructure? Takes a URL, like every other public
    // predicate here, so a caller never has to reimplement host extraction.
    //
    // A BARE HOST is accepted too ('tildacdn.com'), because the scanner works
    // in hosts and would otherwise have to glue a fake scheme on every call.
    // It needs its own branch: urlParts resolves a relative string against the
    // page, so a bare host arrives as a PATH on the first-party origin and
    // would answer false. The test is deliberately narrow — a string with no
    // scheme, no slash, no query and at least one dot is a hostname and cannot
    // be anything else.
    _isInfra: function (url) {
      try {
        if (!url || typeof url !== 'string') { return false; }
        var s = url.trim();
        if (!s) { return false; }
        if (/^[a-z0-9.\-]+\.[a-z0-9\-]+$/i.test(s)) {
          return isInfraHost(s.toLowerCase().replace(/^\.+|\.+$/g, ''));
        }
        var host = urlParts(s).host;
        if (!host) { return false; }
        return isInfraHost(host);
      } catch (e) { return false; }
    },

    // What is being held back until consent: everything the engine intercepted
    // (origin 'engine') plus what the site author marked up by hand (origin
    // 'markup'), which never goes through markBlocked. Read-only, host+path
    // only — no query strings, so no ids and no PII. Used by src/ck-debug.js.
    _blocked: function () {
      var out = [];
      var seen = {};
      function add(rec) {
        var key = rec.kind + '|' + rec.host + '|' + rec.path;
        if (seen[key]) { return; }
        seen[key] = 1;
        out.push(rec);
      }
      try {
        for (var i = 0; i < blockedLog.length; i++) {
          var b = blockedLog[i];
          // Interceptions are kept for the life of the page. Once the category
          // is granted the element has USUALLY been revived and is no longer
          // held back, so reporting it as blocked would be false — but not
          // always: applyConsentToDom() can only revive an element that is in
          // the document, and a script created and given a src without ever
          // being appended stays dead for the life of the page.
          //
          // That case is exactly the strict-mode support ticket ("my widget did
          // not come back after I accepted"), and both README and INSTALL.ru
          // send the site owner to this panel to diagnose it. So an entry is
          // dropped only when something on the page actually came back for it;
          // otherwise it stays, marked `revived: false`.
          if (allowed(b.category) && b.revived !== false) { continue; }
          add({
            host: b.host, path: b.path, kind: b.kind,
            category: b.category, origin: b.origin, strict: b.strict === true,
            revived: b.revived !== false
          });
        }
      } catch (e) { /* noop */ }
      // Hand-marked tags still waiting for their category.
      try {
        // Only what applyConsentToDom() can actually revive. An img is never
        // revived by the core, so listing hand-marked images here would show a
        // pending state that never clears after the visitor accepts.
        qsa('script[type="text/plain"][data-ck], iframe[data-ck][data-src]')
          .forEach(function (el) {
            try {
              if (el.getAttribute('data-ck-restored')) { return; }
              if (el.getAttribute('data-ck-blocked')) { return; } // already in the registry
              var tag = String(el.tagName || '').toLowerCase();
              if (tag === 'iframe' && el.getAttribute('src')) { return; }
              var src = el.getAttribute('data-src') || el.getAttribute('data-ck-src') || '';
              if (!src) { return; }
              var cat = el.getAttribute('data-ck') || categoryForUrl(src);
              if (allowed(cat)) { return; }
              var parts = safeUrlParts(src);
              add({
                host: parts.host, path: parts.path,
                kind: tag === 'iframe' ? 'iframe' : 'script',
                // revived: true means "not applicable" here, not "came back":
                // this sweep only ever lists hand-marked tags still waiting for
                // their category, so none of them can be a failed revival.
                category: cat || null, origin: 'markup', strict: false, revived: true
              });
            } catch (e2) { /* noop */ }
          });
      } catch (e3) { /* noop */ }
      return out;
    }
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
