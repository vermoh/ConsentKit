/*!
 * ConsentKit debug panel (opt-in) — shows what the banner actually did on this
 * page. Off by default: without activation this file creates no DOM, installs
 * no observers and touches nothing.
 *
 * Activation (this browser only, nothing is sent anywhere):
 *   ?ck_debug=1  or  #ck_debug   — turns it on and remembers it (localStorage)
 *   ?ck_debug=0                  — turns it off and forgets it
 *   localStorage.ck_debug = '1'  — same as the query parameter
 *
 * Load order: ck-core.js -> ck-locales.js -> ck-ui.js -> [ck-saas.js] -> ck-debug.js
 *
 * Copyright (c) 2026 E-COM CONSULT PLUS. MIT License — see LICENSE.
 */
(function (global) {
  'use strict';

  if (!global || typeof global !== 'object') { return; }

  var LS_KEY = 'ck_debug';

  // ---------------------------------------------------------------------------
  // Activation (pure, testable: no DOM, no storage)
  // ---------------------------------------------------------------------------
  // Returns { active, persist } where persist is 'on' | 'off' | null:
  // the query/hash form is sticky so the panel survives navigation, the bare
  // localStorage form changes nothing.
  function isOffValue(v) {
    return v === '0' || v === 'false' || v === 'no' || v === '';
  }

  function parseActivation(search, hash, stored) {
    var on = null;

    var q = String(search || '');
    if (q.charAt(0) === '?') { q = q.slice(1); }
    var pairs = q ? q.split('&') : [];
    for (var i = 0; i < pairs.length; i++) {
      var eq = pairs[i].indexOf('=');
      var k = eq === -1 ? pairs[i] : pairs[i].slice(0, eq);
      if (k !== LS_KEY) { continue; }
      // ?ck_debug (no "="), ?ck_debug=1, =true, =yes -> on
      // ?ck_debug=0, =false, =no, =(empty) -> off. The empty value is treated
      // as off deliberately: a form or a link builder that drops the value is
      // far more likely to mean "not set" than "switch the panel on".
      on = eq === -1 ? true : !isOffValue(pairs[i].slice(eq + 1));
    }

    if (on === null) {
      var h = String(hash || '');
      if (h.charAt(0) === '#') { h = h.slice(1); }
      // #ck_debug or #ck_debug=1 (a plain fragment id, not a query)
      if (h === LS_KEY) { on = true; }
      else if (h.indexOf(LS_KEY + '=') === 0) { on = !isOffValue(h.slice(LS_KEY.length + 1)); }
    }

    if (on === null) {
      return { active: String(stored || '') === '1', persist: null };
    }
    return { active: on, persist: on ? 'on' : 'off' };
  }

  // ---------------------------------------------------------------------------
  // Report (pure, testable: takes plain data, returns plain data)
  // ---------------------------------------------------------------------------
  // No PII by construction: cookie names only (never values), host + path only
  // (never query strings — tracker URLs carry ids there).
  function stripUrl(url) {
    var s = String(url || '');
    var host = '';
    var path = '';
    var m = /^(?:[a-z]+:)?\/\/([^/?#]+)([^?#]*)/i.exec(s);
    if (m) {
      host = m[1].toLowerCase().replace(/:\d+$/, '');
      path = m[2] || '';
    } else {
      path = s.split('?')[0].split('#')[0];
    }
    return { host: host, path: path };
  }

  // entries: PerformanceResourceTiming-like [{ name, startTime, initiatorType }]
  // consentAtMs: performance-clock ms of the decision, or null when undecided
  // classify: url -> category | null (ConsentKit._categoryForUrl)
  function buildRequests(entries, consentAtMs, classify) {
    var out = [];
    var list = entries || [];
    var seen = {};
    for (var i = 0; i < list.length; i++) {
      var e = list[i];
      if (!e || !e.name) { continue; }
      var cat = null;
      try { cat = classify ? classify(e.name) : null; } catch (err) { cat = null; }
      if (!cat) { continue; }                       // only known trackers
      var p = stripUrl(e.name);
      var t = Number(e.startTime) || 0;
      var when = consentAtMs === null || consentAtMs === undefined
        ? 'before' : (t >= consentAtMs ? 'after' : 'before');
      var key = p.host + '|' + p.path + '|' + when;
      if (seen[key]) { seen[key].count++; continue; }
      var rec = {
        host: p.host, path: p.path, category: cat, when: when,
        at: Math.round(t), kind: String((e && e.initiatorType) || ''), count: 1
      };
      seen[key] = rec;
      out.push(rec);
    }
    return out;
  }

  function buildReport(input) {
    var d = input || {};
    var st = d.state || {};
    var cats = st.categories || {};
    return {
      generatedAt: d.now || null,
      client: {
        version: d.version || null,
        source: d.siteId ? 'saas' : 'inline',
        siteId: d.siteId || null,
        policyVersion: st.policyVersion || (d.config && d.config.policyVersion) || null,
        etag: d.etag || null
      },
      consent: {
        status: !st.decided ? 'none'
          : (cats.functional && cats.analytics && cats.marketing) ? 'accepted'
          : (!cats.functional && !cats.analytics && !cats.marketing) ? 'rejected'
          : 'partial',
        categories: {
          necessary: true,
          functional: !!cats.functional,
          analytics: !!cats.analytics,
          marketing: !!cats.marketing
        },
        decidedAt: st.ts || null,
        method: st.method || null,
        ttlDays: d.ttlDays == null ? null : Number(d.ttlDays)
      },
      blocked: (d.blocked || []).map(function (b) {
        // `strict` marks an entry the engine held back only because strict mode
        // is on and the host is an unknown third party — not because the
        // tracker database recognised it.
        return {
          host: b.host, path: b.path, kind: b.kind,
          category: b.category, origin: b.origin, strict: b.strict === true,
          // false when the visitor granted the category but the element never
          // loaded — usually a script that was created and never appended.
          revived: b.revived !== false
        };
      }),
      requests: buildRequests(d.entries, d.consentAtMs, d.classify),
      consentMode: (d.consentMode || []).slice(),
      // Names only — a consent debug panel must never leak cookie contents.
      cookieNames: (d.cookieNames || []).slice(),
      note: NOTE_EN
    };
  }

  var NOTE_RU = 'Запросы, ушедшие до загрузки ConsentKit (обычный <script src> ' +
    'в разметке), видны в этом списке, но заблокировать их клиент не может — ' +
    'такие теги размечают вручную.';
  var NOTE_EN = 'Requests that left before ConsentKit loaded (a plain <script src> ' +
    'written into the HTML) show up here but cannot be blocked — mark such tags up manually.';

  // ---------------------------------------------------------------------------
  // Panel language (pure; the JSON report stays language-neutral either way)
  // ---------------------------------------------------------------------------
  // The panel is read by whoever is debugging the site, so it follows the same
  // language the banner resolved for this visitor rather than a build flag.
  // Only ru and en exist: this is an internal diagnostic surface, and a
  // half-translated one is worse than an English one.
  var STRINGS = {
    ru: {
      regionLabel: 'ConsentKit — режим отладки',
      collapse: 'Свернуть',
      expand: 'Развернуть',
      closeLabel: 'Закрыть и выключить режим отладки',
      secClient: 'Клиент',
      version: 'версия',
      source: 'источник',
      srcSaas: 'SaaS',
      srcInline: 'инлайн',
      secConsent: 'Согласие',
      decidedAt: 'решение',
      method: 'способ',
      ttl: 'срок cookie',
      days: ' дн.',
      status: { none: 'нет решения', accepted: 'принято', rejected: 'отклонено', partial: 'частично' },
      secBlocked: 'Заблокировано до согласия',
      noBlocked: 'ничего не перехвачено',
      markup: ' (разметка)',
      strict: 'strict',
      notRevived: ' — не ожил после согласия',
      secRequests: 'Запросы к трекерам',
      noRequests: 'запросов к известным трекерам не было',
      after: 'после согласия',
      before: 'до согласия',
      ms: ' мс',
      note: NOTE_RU,
      secConsentMode: 'Consent Mode / dataLayer',
      noEvents: 'событий не было',
      secTheme: 'Оформление',
      themeMode: 'тема',
      themeModeLight: 'светлая',
      themeModeDark: 'тёмная',
      themeFont: 'шрифт',
      themeFontInherit: 'как на сайте',
      themeFontSystem: 'системный',
      themeRadius: 'скругления',
      themeCard: 'карточка',
      themeBtn: 'кнопки',
      themeLink: 'Ссылки',
      btnAccept: 'Принять всё',
      btnReject: 'Отклонить всё',
      btnSettings: 'Настроить',
      btnFilled: 'залитая',
      btnOutline: 'обводка',
      btnText: 'текст',
      btnBorder: 'обводка',
      btnOn: 'на',
      btnAdjusted: 'исправлено автоматически',
      btnOk: 'AA',
      btnFail: 'ниже AA',
      secActions: 'Действия',
      reset: 'Сбросить согласие',
      showPrefs: 'Показать настройки',
      copy: 'Скопировать отчёт',
      copied: 'Скопировано',
      copyFailed: 'Не вышло',
      footer: 'Панель видна только в этом браузере. Выключить: добавьте ?ck_debug=0 к адресу.'
    },
    en: {
      regionLabel: 'ConsentKit — debug mode',
      collapse: 'Collapse',
      expand: 'Expand',
      closeLabel: 'Close and turn debug mode off',
      secClient: 'Client',
      version: 'version',
      source: 'source',
      srcSaas: 'SaaS',
      srcInline: 'inline',
      secConsent: 'Consent',
      decidedAt: 'decided',
      method: 'method',
      ttl: 'cookie lifetime',
      days: ' days',
      status: { none: 'no decision', accepted: 'accepted', rejected: 'rejected', partial: 'partial' },
      secBlocked: 'Blocked until consent',
      noBlocked: 'nothing intercepted',
      markup: ' (markup)',
      strict: 'strict',
      notRevived: ' — did not come back after consent',
      secRequests: 'Tracker requests',
      noRequests: 'no requests to known trackers',
      after: 'after consent',
      before: 'before consent',
      ms: ' ms',
      note: NOTE_EN,
      secConsentMode: 'Consent Mode / dataLayer',
      noEvents: 'no events',
      secTheme: 'Appearance',
      themeMode: 'theme',
      themeModeLight: 'light',
      themeModeDark: 'dark',
      themeFont: 'font',
      themeFontInherit: 'site font',
      themeFontSystem: 'system',
      themeRadius: 'radii',
      themeCard: 'card',
      themeBtn: 'buttons',
      themeLink: 'Links',
      btnAccept: 'Accept all',
      btnReject: 'Reject all',
      btnSettings: 'Customize',
      btnFilled: 'filled',
      btnOutline: 'outline',
      btnText: 'text',
      btnBorder: 'border',
      btnOn: 'on',
      btnAdjusted: 'adjusted automatically',
      btnOk: 'AA',
      btnFail: 'below AA',
      secActions: 'Actions',
      reset: 'Reset consent',
      showPrefs: 'Show preferences',
      copy: 'Copy report',
      copied: 'Copied',
      copyFailed: 'Failed',
      footer: 'This panel is visible in this browser only. To turn it off, add ?ck_debug=0 to the URL.'
    }
  };

  // banner language (ConsentKit config) -> navigator.language -> en.
  // `cfgLang` is ConsentKit.config.language, which may be 'auto'.
  function pickLang(cfgLang, navLang) {
    var raw = String(cfgLang || '').toLowerCase();
    if (!raw || raw === 'auto') { raw = String(navLang || '').toLowerCase(); }
    return raw.slice(0, 2) === 'ru' ? 'ru' : 'en';
  }

  // Testable surface. Published before the activation check so the inactive
  // path is testable too; it is not a public API.
  var API = {
    parseActivation: parseActivation,
    buildReport: buildReport,
    buildRequests: buildRequests,
    stripUrl: stripUrl,
    pickLang: pickLang,
    strings: STRINGS,
    active: false
  };
  try {
    if (global.ConsentKit) { global.ConsentKit._debug = API; }
    global.__ckDebug = API;
  } catch (e) { /* noop */ }

  // ---------------------------------------------------------------------------
  // Everything below runs only when activated.
  // ---------------------------------------------------------------------------
  var doc = global.document;
  var loc = global.location;

  function lsGet(k) {
    try { return global.localStorage ? global.localStorage.getItem(k) : null; } catch (e) { return null; }
  }
  function lsSet(k, v) {
    try { if (global.localStorage) { global.localStorage.setItem(k, v); } } catch (e) { /* noop */ }
  }
  function lsDel(k) {
    try { if (global.localStorage) { global.localStorage.removeItem(k); } } catch (e) { /* noop */ }
  }

  var act = parseActivation(loc && loc.search, loc && loc.hash, lsGet(LS_KEY));
  if (act.persist === 'on') { lsSet(LS_KEY, '1'); }
  if (act.persist === 'off') { lsDel(LS_KEY); }
  if (!act.active) { return; }
  if (!doc || typeof doc.createElement !== 'function') { return; }
  API.active = true;

  var CK = global.ConsentKit;

  // ---------------------------------------------------------------------------
  // Observation (installed only when active)
  // ---------------------------------------------------------------------------
  var resources = [];
  var consentAtMs = null;          // performance clock, set when consent is given
  var consentMode = [];            // last ck_* dataLayer events and gtag consent calls
  var CM_MAX = 20;

  function nowMs() {
    try {
      if (global.performance && typeof global.performance.now === 'function') {
        return global.performance.now();
      }
    } catch (e) { /* noop */ }
    return 0;
  }

  // A decision restored from a previous page load happened before this page
  // started, so every request on this load counts as "after".
  function seedConsentTime() {
    try {
      var st = CK && CK.getState ? CK.getState() : null;
      if (st && st.decided && consentAtMs === null) { consentAtMs = 0; }
    } catch (e) { /* noop */ }
  }

  // Stamp the moment the visitor decides, BEFORE the core acts on it.
  //
  // This cannot wait for ck:change: accept() revives the blocked scripts
  // synchronously and dispatches ck:change afterwards, so by the time the event
  // fires those scripts have already issued their requests. Stamping on the
  // event would then place them *before* the cutoff and the panel would report
  // "до согласия" for the very requests the consent just released — exactly
  // backwards, and on the one line an owner reads most carefully.
  //
  // Wrapping is observe-only: the original method is called with the original
  // arguments and its return value passed straight back.
  function stampOnDecision() {
    try {
      if (!CK) { return; }
      ['accept', 'rejectAll'].forEach(function (name) {
        var orig = CK[name];
        if (typeof orig !== 'function' || orig.__ckDebugWrapped) { return; }
        var wrapped = function () {
          try { consentAtMs = nowMs(); } catch (e) { /* noop */ }
          return orig.apply(CK, arguments);
        };
        wrapped.__ckDebugWrapped = true;
        CK[name] = wrapped;
      });
      // withdraw() puts the page back to "no decision yet".
      var w = CK.withdraw;
      if (typeof w === 'function' && !w.__ckDebugWrapped) {
        var wrappedW = function () {
          try { consentAtMs = null; } catch (e) { /* noop */ }
          return w.apply(CK, arguments);
        };
        wrappedW.__ckDebugWrapped = true;
        CK.withdraw = wrappedW;
      }
    } catch (e) { /* noop */ }
  }

  function collectResources() {
    try {
      var perf = global.performance;
      if (!perf) { return; }
      if (typeof perf.getEntriesByType === 'function') {
        var buffered = perf.getEntriesByType('resource') || [];
        for (var i = 0; i < buffered.length; i++) { resources.push(buffered[i]); }
      }
      if (typeof global.PerformanceObserver === 'function') {
        var po = new global.PerformanceObserver(function (list) {
          try {
            var got = list.getEntries() || [];
            for (var j = 0; j < got.length; j++) { resources.push(got[j]); }
            schedule();
          } catch (e2) { /* noop */ }
        });
        // buffered:true re-delivers what happened before we attached; harmless
        // duplicates are deduped when the list is rendered.
        try { po.observe({ type: 'resource', buffered: true }); }
        catch (e3) { try { po.observe({ entryTypes: ['resource'] }); } catch (e4) { /* noop */ } }
      }
    } catch (e) { /* noop */ }
  }

  // Observe only: the existing dataLayer.push is called first and its return
  // value passed through, so a GTM/other wrapper keeps working.
  function watchDataLayer() {
    try {
      var dl = global.dataLayer;
      if (!dl) { global.dataLayer = dl = []; }
      if (typeof dl.push !== 'function' || dl.__ckDebugWatched) { return; }
      // Whatever is already in the queue counts too.
      for (var i = 0; i < dl.length; i++) { noteDataLayer(dl[i]); }
      var prev = dl.push;
      dl.push = function () {
        try {
          for (var j = 0; j < arguments.length; j++) { noteDataLayer(arguments[j]); }
        } catch (e) { /* never break the host page */ }
        return prev.apply(this, arguments);
      };
      dl.__ckDebugWatched = true;
    } catch (e) { /* noop */ }
  }

  function noteDataLayer(arg) {
    try {
      var rec = null;
      // gtag() pushes an arguments object: ['consent', 'default'|'update', {...}]
      if (arg && typeof arg === 'object' && typeof arg.length === 'number' && arg[0] === 'consent') {
        var signals = {};
        var payload = arg[2];
        if (payload && typeof payload === 'object') {
          for (var k in payload) {
            if (Object.prototype.hasOwnProperty.call(payload, k)) { signals[k] = payload[k]; }
          }
        }
        rec = { type: 'gtag consent ' + String(arg[1] || ''), signals: signals, at: Math.round(nowMs()) };
      } else if (arg && typeof arg === 'object' && typeof arg.event === 'string' &&
                 arg.event.indexOf('ck_') === 0) {
        rec = { type: arg.event, signals: null, at: Math.round(nowMs()) };
      }
      if (!rec) { return; }
      consentMode.push(rec);
      if (consentMode.length > CM_MAX) { consentMode.shift(); }
      schedule();
    } catch (e) { /* noop */ }
  }

  function cookieNames() {
    var names = [];
    try {
      var raw = typeof doc.cookie === 'string' ? doc.cookie : '';
      var parts = raw.split(';');
      for (var i = 0; i < parts.length; i++) {
        var t = parts[i].trim();
        if (!t) { continue; }
        var eq = t.indexOf('=');
        names.push(eq === -1 ? t : t.slice(0, eq));   // name only, never the value
      }
    } catch (e) { /* noop */ }
    return names;
  }

  function saasInfo() {
    var out = { siteId: null, etag: null };
    try {
      if (CK && CK._saas) {
        out.siteId = CK._saas.siteId || null;
        var cached = null;
        try {
          var raw = lsGet('ck_cfg_' + out.siteId);
          cached = raw ? JSON.parse(raw) : null;
        } catch (e2) { cached = null; }
        out.etag = cached && cached.etag ? cached.etag : null;
      }
    } catch (e) { /* noop */ }
    return out;
  }

  function reportInput() {
    var s = saasInfo();
    var cfg = (CK && CK.config) || {};
    return {
      now: new Date().toISOString(),
      version: CK ? CK.version : null,
      state: CK && CK.getState ? CK.getState() : {},
      config: cfg,
      siteId: s.siteId,
      etag: s.etag,
      ttlDays: cfg.consentTtlDays == null ? null : cfg.consentTtlDays,
      blocked: (CK && typeof CK._blocked === 'function') ? CK._blocked() : [],
      entries: resources,
      consentAtMs: consentAtMs,
      classify: CK ? CK._categoryForUrl : null,
      consentMode: consentMode,
      cookieNames: cookieNames()
    };
  }

  // ---------------------------------------------------------------------------
  // Panel (own Shadow DOM host, own styles)
  // ---------------------------------------------------------------------------
  var CSS = [
    ':host{all:initial;position:fixed;right:12px;bottom:12px;z-index:2147483646;',
    'font:12px/1.45 ui-monospace,SFMono-Regular,Menlo,Consolas,"Liberation Mono",monospace}',
    '*{box-sizing:border-box}',
    '.w{width:min(360px,calc(100vw - 24px));background:#12151c;color:#dfe3ea;',
    'border:1px solid #2b3040;border-radius:8px;box-shadow:0 6px 24px rgba(0,0,0,.4);overflow:hidden}',
    '.hd{display:flex;align-items:center;gap:8px;padding:7px 9px;background:#1a1f2a;',
    'border-bottom:1px solid #2b3040}',
    '.hd b{font-weight:600;color:#fff;font-size:12px}',
    '.hd .sp{flex:1}',
    'button{font:inherit;color:#dfe3ea;background:#232936;border:1px solid #39415400;',
    'border-color:#394154;border-radius:5px;padding:3px 8px;cursor:pointer}',
    'button:hover{background:#2c3444}',
    'button:focus-visible{outline:2px solid #7aa2ff;outline-offset:1px}',
    '.bd{max-height:min(60vh,460px);overflow:auto;padding:2px 9px 9px}',
    '.bd[hidden]{display:none}',
    'section{border-top:1px solid #232936;padding:7px 0}',
    'section:first-child{border-top:0}',
    'h2{margin:0 0 4px;font-size:11px;font-weight:600;color:#8d96ab;text-transform:uppercase;',
    'letter-spacing:.04em}',
    'dl{margin:0;display:grid;grid-template-columns:auto 1fr;gap:1px 8px}',
    'dt{color:#8d96ab}',
    'dd{margin:0;overflow-wrap:anywhere}',
    'ul{margin:0;padding:0;list-style:none}',
    'li{padding:2px 0;border-top:1px dotted #262c3a;overflow-wrap:anywhere}',
    'li:first-child{border-top:0}',
    '.t{display:inline-block;padding:0 5px;border-radius:3px;font-size:10px;',
    'background:#2a3142;color:#a9b3c9;margin-right:4px}',
    '.t.on{background:#173a24;color:#7ee2a0}',
    '.t.off{background:#3a1a1d;color:#ff9aa2}',
    '.mut{color:#8d96ab}',
    '.note{margin:6px 0 0;color:#8d96ab;font-size:11px;line-height:1.4}',
    '.row{display:flex;gap:6px;flex-wrap:wrap;margin-top:8px}',
    '@media (prefers-reduced-motion:no-preference){button{transition:background-color .12s ease}}'
  ].join('');

  var host = null, root = null, body = null, toggleBtn = null, collapsed = false;
  var frame = 0;

  function el(tag, attrs, text) {
    var n = doc.createElement(tag);
    if (attrs) {
      for (var k in attrs) {
        if (Object.prototype.hasOwnProperty.call(attrs, k)) { n.setAttribute(k, attrs[k]); }
      }
    }
    if (text != null) { n.textContent = String(text); }
    return n;
  }

  function section(title) {
    var s = doc.createElement('section');
    s.appendChild(el('h2', null, title));
    return s;
  }

  function defs(pairs) {
    var dl = doc.createElement('dl');
    for (var i = 0; i < pairs.length; i++) {
      dl.appendChild(el('dt', null, pairs[i][0]));
      dl.appendChild(el('dd', null, pairs[i][1] == null || pairs[i][1] === '' ? '—' : pairs[i][1]));
    }
    return dl;
  }

  function tag(text, cls) { return el('span', { class: 't' + (cls ? ' ' + cls : '') }, text); }

  // A contrast ratio the way WCAG tools quote it. null when the colour could
  // not be measured (a colour name, an rgb() string) — shown as "?" rather
  // than a made-up number.
  function fmtRatio(r) {
    return typeof r === 'number' && isFinite(r) ? (Math.round(r * 100) / 100) + ':1' : '?';
  }

  // Resolved lazily, not at parse time: this file runs before ConsentKit.init()
  // has merged the site's config, so asking for the language now would always
  // read the built-in default. Re-resolved on every render so a page that
  // switches language at runtime switches the panel too.
  var T = STRINGS.en;
  function refreshLang() {
    var nav = global.navigator;
    T = STRINGS[pickLang(
      (CK && CK.config && CK.config.language) || '',
      (nav && (nav.language || nav.userLanguage)) || ''
    )] || STRINGS.en;
    return T;
  }

  function render() {
    if (!body) { return; }
    refreshLang();
    var r = buildReport(reportInput());
    body.textContent = '';

    // 1. Client
    var s1 = section(T.secClient);
    s1.appendChild(defs([
      [T.version, r.client.version],
      [T.source, r.client.source === 'saas' ? T.srcSaas : T.srcInline],
      ['siteId', r.client.siteId],
      ['policyVersion', r.client.policyVersion],
      ['ETag', r.client.etag]
    ]));
    body.appendChild(s1);

    // 2. Consent
    var s2 = section(T.secConsent);
    var line = el('div');
    line.appendChild(tag(T.status[r.consent.status] || r.consent.status,
      r.consent.status === 'accepted' ? 'on' : r.consent.status === 'rejected' ? 'off' : ''));
    s2.appendChild(line);
    var cl = doc.createElement('div');
    ['necessary', 'functional', 'analytics', 'marketing'].forEach(function (c) {
      cl.appendChild(tag((r.consent.categories[c] ? '✓ ' : '✗ ') + c,
        r.consent.categories[c] ? 'on' : 'off'));
    });
    s2.appendChild(cl);
    s2.appendChild(defs([
      [T.decidedAt, r.consent.decidedAt],
      [T.method, r.consent.method],
      [T.ttl, r.consent.ttlDays == null ? null : r.consent.ttlDays + T.days]
    ]));
    body.appendChild(s2);

    // 3. Blocked until consent
    var s3 = section(T.secBlocked + ' (' + r.blocked.length + ')');
    if (!r.blocked.length) {
      s3.appendChild(el('div', { class: 'mut' }, T.noBlocked));
    } else {
      var u3 = doc.createElement('ul');
      r.blocked.forEach(function (b) {
        var li = doc.createElement('li');
        li.appendChild(tag(b.kind));
        li.appendChild(tag(b.category || '?'));
        if (b.strict) { li.appendChild(tag(T.strict, 'off')); }
        li.appendChild(doc.createTextNode(b.host + b.path +
          (b.origin === 'markup' ? T.markup : '') +
          (b.revived === false ? T.notRevived : '')));
        u3.appendChild(li);
      });
      s3.appendChild(u3);
    }
    body.appendChild(s3);

    // 4. Tracker requests
    var s4 = section(T.secRequests + ' (' + r.requests.length + ')');
    if (!r.requests.length) {
      s4.appendChild(el('div', { class: 'mut' }, T.noRequests));
    } else {
      var u4 = doc.createElement('ul');
      r.requests.forEach(function (q) {
        var li = doc.createElement('li');
        li.appendChild(tag(q.when === 'after' ? T.after : T.before,
          q.when === 'after' ? 'on' : 'off'));
        li.appendChild(tag(q.category));
        li.appendChild(doc.createTextNode(q.host + q.path + ' · ' + q.at + T.ms +
          (q.count > 1 ? ' ×' + q.count : '')));
        u4.appendChild(li);
      });
      s4.appendChild(u4);
    }
    s4.appendChild(el('p', { class: 'note' }, T.note));
    body.appendChild(s4);

    // 5. Consent Mode
    var s5 = section(T.secConsentMode + ' (' + r.consentMode.length + ')');
    if (!r.consentMode.length) {
      s5.appendChild(el('div', { class: 'mut' }, T.noEvents));
    } else {
      var u5 = doc.createElement('ul');
      r.consentMode.slice().reverse().forEach(function (c) {
        var li = doc.createElement('li');
        li.appendChild(tag(c.at + T.ms));
        var txt = c.type;
        if (c.signals) {
          var bits = [];
          for (var k in c.signals) {
            if (Object.prototype.hasOwnProperty.call(c.signals, k)) {
              bits.push(k + '=' + c.signals[k]);
            }
          }
          if (bits.length) { txt += ': ' + bits.join(', '); }
        }
        li.appendChild(doc.createTextNode(txt));
        u5.appendChild(li);
      });
      s5.appendChild(u5);
    }
    body.appendChild(s5);

    // 6. Appearance (SPEC V1.6 §1) — the three buttons' RESOLVED colours and
    // their contrast ratios, read straight off ConsentKit._contrast rather than
    // recomputed here: the banner, this panel and the cabinet's theme editor
    // must all quote the same numbers. The mode is named explicitly because
    // light and dark resolve differently and only one of them is on screen.
    var contrast = CK && CK._contrast;
    if (contrast && typeof contrast.buildThemeCss === 'function') {
      var sT = section(T.secTheme);
      try {
        var built = contrast.buildThemeCss((CK && CK.config) || {});
        // Which palette the visitor is actually looking at right now.
        var dark = built.mode === 'dark';
        if (built.mode === 'auto') {
          try {
            dark = !!(global.matchMedia && global.matchMedia('(prefers-color-scheme: dark)').matches);
          } catch (e) { dark = false; }
        }
        var resolved = dark ? built.dark : built.light;

        // Fourth row: --ck-link, the accent as TEXT on the card. It is a
        // separate number from every button's, because it is measured against
        // the card rather than against a button fill — a brand accent can pass
        // as a filled button's background and still be unreadable as a link.
        var lk = resolved.link;
        var lkTxt = '—';
        if (lk) {
          lkTxt = lk.color + ' ' + T.btnOn + ' ' + lk.against +
            ' · ' + fmtRatio(lk.ratio) +
            ' ' + ((typeof lk.ratio === 'number' && lk.ratio >= 4.5) ? T.btnOk : T.btnFail) +
            (lk.adjusted ? ' · ' + T.btnAdjusted : '');
        }

        sT.appendChild(defs([
          [T.themeMode, (dark ? T.themeModeDark : T.themeModeLight) +
            (built.mode === 'auto' ? ' (auto)' : '')],
          [T.themeFont, built.font === 'inherit' ? T.themeFontInherit : T.themeFontSystem],
          [T.themeRadius, T.themeCard + ' ' + built.radius.card + 'px · ' +
            T.themeBtn + ' ' + built.radius.button + 'px'],
          [T.themeLink, lkTxt]
        ]));

        var labels = { accept: T.btnAccept, reject: T.btnReject, settings: T.btnSettings };
        var uT = doc.createElement('ul');
        ['accept', 'reject', 'settings'].forEach(function (role) {
          var b = resolved.buttons[role];
          if (!b) { return; }
          var li = doc.createElement('li');
          li.appendChild(tag(b.variant === 'filled' ? T.btnFilled : T.btnOutline));
          var ok = typeof b.ratio === 'number' && b.ratio >= 4.5;
          li.appendChild(tag(fmtRatio(b.ratio) + ' ' + (ok ? T.btnOk : T.btnFail),
            ok ? 'on' : 'off'));
          li.appendChild(doc.createTextNode(labels[role] + ' — ' +
            T.btnText + ' ' + b.fg + ' ' + T.btnOn + ' ' + b.against +
            (b.variant === 'outline'
              ? ' · ' + T.btnBorder + ' ' + b.border + ' (' + fmtRatio(b.borderRatio) + ')'
              : '')));
          if (b.adjusted) {
            li.appendChild(el('span', { class: 'mut' }, ' · ' + T.btnAdjusted));
          }
          uT.appendChild(li);
        });
        sT.appendChild(uT);
      } catch (e) {
        sT.appendChild(el('div', { class: 'mut' }, '—'));
      }
      body.appendChild(sT);
    }

    // 7. Buttons
    var s6 = section(T.secActions);
    var row = el('div', { class: 'row' });
    var bReset = el('button', { type: 'button' }, T.reset);
    bReset.addEventListener('click', resetConsent);
    var bShow = el('button', { type: 'button' }, T.showPrefs);
    bShow.addEventListener('click', showBanner);
    var bCopy = el('button', { type: 'button' }, T.copy);
    bCopy.addEventListener('click', function () { copyReport(bCopy); });
    row.appendChild(bReset); row.appendChild(bShow); row.appendChild(bCopy);
    s6.appendChild(row);
    s6.appendChild(el('p', { class: 'note' }, T.footer));
    body.appendChild(s6);
  }

  function schedule() {
    if (frame) { return; }
    frame = 1;
    var run = function () { frame = 0; try { render(); } catch (e) { /* noop */ } };
    try {
      if (typeof global.requestAnimationFrame === 'function') { global.requestAnimationFrame(run); }
      else { global.setTimeout(run, 50); }
    } catch (e) { run(); }
  }

  // ---------------------------------------------------------------------------
  // Buttons
  // ---------------------------------------------------------------------------
  function resetConsent() {
    try { if (CK && CK.withdraw) { CK.withdraw(); } } catch (e) { /* noop */ }
    // withdraw() already clears the record; belt and braces for a page whose
    // cookie was written on a parent domain.
    try {
      var h = global.location && global.location.hostname ? global.location.hostname : '';
      var variants = ['', h ? '; domain=' + h : '', h ? '; domain=.' + h : ''];
      var labels = h ? h.split('.') : [];
      if (labels.length > 2) { variants.push('; domain=.' + labels.slice(-2).join('.')); }
      for (var i = 0; i < variants.length; i++) {
        doc.cookie = 'ck_consent=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/' + variants[i];
      }
    } catch (e) { /* noop */ }
    lsDel('ck_consent');
    try { global.location.reload(); } catch (e) { /* noop */ }
  }

  function showBanner() {
    // Non-destructive on purpose: this opens the preferences panel and leaves
    // the stored decision alone. Erasing consent is the other button's job, and
    // on a live site a "show banner" click must never wipe the owner's record.
    try { if (CK && CK.show) { CK.show(); } } catch (e) { /* noop */ }
    schedule();
  }

  function copyReport(btn) {
    var text = '';
    try { text = JSON.stringify(buildReport(reportInput()), null, 2); } catch (e) { text = '{}'; }
    var done = function (ok) {
      try {
        btn.textContent = ok ? T.copied : T.copyFailed;
        global.setTimeout(function () { btn.textContent = T.copy; }, 1500);
      } catch (e2) { /* noop */ }
    };
    try {
      if (global.navigator && global.navigator.clipboard && global.navigator.clipboard.writeText) {
        global.navigator.clipboard.writeText(text).then(function () { done(true); },
          function () { done(fallbackCopy(text)); });
        return;
      }
    } catch (e) { /* noop */ }
    done(fallbackCopy(text));
  }

  function fallbackCopy(text) {
    try {
      var ta = doc.createElement('textarea');
      ta.value = text;
      ta.setAttribute('style', 'position:fixed;top:-9999px;left:-9999px');
      doc.body.appendChild(ta);
      ta.select();
      var ok = doc.execCommand ? doc.execCommand('copy') : false;
      doc.body.removeChild(ta);
      return !!ok;
    } catch (e) { return false; }
  }

  // ---------------------------------------------------------------------------
  // Mount
  // ---------------------------------------------------------------------------
  // The banner's bar layout sits at bottom:16 across the full width and the UI's
  // floating button at bottom-left; lift the panel above whatever is at the
  // bottom right now so its buttons stay clickable.
  function avoidBanner() {
    if (!host) { return; }
    var bottom = 12;
    try {
      var ckRoot = doc.getElementById('ck-root');
      var sr = ckRoot && ckRoot.shadowRoot;
      // The bar spans the width at bottom:16; the box-right card sits exactly
      // where this panel does. Both must be cleared (the UI's floating button
      // is bottom-left and never collides).
      var banner = sr && sr.querySelector(
        '.ck-banner--bar.ck-pos-bottom, .ck-banner--box.ck-pos-bottom-right');
      if (banner && banner.getBoundingClientRect) {
        var r = banner.getBoundingClientRect();
        if (r.height > 0 && r.bottom > (global.innerHeight || 0) - r.height - 40) {
          bottom = Math.round(r.height) + 24;
        }
      }
    } catch (e) { /* noop */ }
    try { host.style.bottom = bottom + 'px'; } catch (e2) { /* noop */ }
  }

  function mount() {
    if (host || !doc.body) { return; }
    // A page can carry the loader (inline block) AND a manual <script> tag for
    // the panel: the second copy must not mount a second panel.
    if (doc.querySelector('ck-debug')) { return; }
    refreshLang();
    host = doc.createElement('ck-debug');
    host.setAttribute('aria-live', 'off');
    root = host.attachShadow ? host.attachShadow({ mode: 'open' }) : null;
    if (!root) { host = null; return; }

    var style = doc.createElement('style');
    style.textContent = CSS;
    root.appendChild(style);

    var wrap = el('div', { class: 'w', role: 'region', 'aria-label': T.regionLabel });
    var head = el('div', { class: 'hd' });
    head.appendChild(el('b', null, 'ConsentKit debug'));
    head.appendChild(el('span', { class: 'sp' }));

    toggleBtn = el('button', { type: 'button', 'aria-expanded': 'true' }, T.collapse);
    toggleBtn.addEventListener('click', function () {
      collapsed = !collapsed;
      body.hidden = collapsed;
      toggleBtn.textContent = collapsed ? T.expand : T.collapse;
      toggleBtn.setAttribute('aria-expanded', collapsed ? 'false' : 'true');
      if (!collapsed) { schedule(); }
    });
    head.appendChild(toggleBtn);

    var closeBtn = el('button', { type: 'button', 'aria-label': T.closeLabel }, '×');
    closeBtn.addEventListener('click', function () {
      lsDel(LS_KEY);
      try { host.parentNode.removeChild(host); } catch (e) { /* noop */ }
      host = null;
      API.active = false;
    });
    head.appendChild(closeBtn);

    wrap.appendChild(head);
    body = el('div', { class: 'bd' });
    wrap.appendChild(body);
    root.appendChild(wrap);
    doc.body.appendChild(host);

    render();
    avoidBanner();
  }

  function boot() {
    seedConsentTime();
    stampOnDecision();
    collectResources();
    watchDataLayer();
    mount();

    try {
      doc.addEventListener('ck:change', function () {
        // Fallback for a decision made through some other path than
        // accept()/rejectAll() (a host page calling into the core directly).
        // stampOnDecision() has usually set this already, and its stamp is the
        // accurate one — do not overwrite it here: entry.startTime is on the
        // performance clock, and by now the revived scripts have already run.
        try {
          var st = CK && CK.getState ? CK.getState() : null;
          if (st && st.decided) { if (consentAtMs === null) { consentAtMs = nowMs(); } }
          else { consentAtMs = null; }
        } catch (e2) { /* noop */ }
        schedule();
        global.setTimeout(avoidBanner, 60);
      }, false);
      doc.addEventListener('ck:init', function () { schedule(); global.setTimeout(avoidBanner, 60); }, false);
    } catch (e) { /* noop */ }

    // Late trackers and revived scripts keep arriving after the first render.
    try { global.setInterval(schedule, 3000); } catch (e) { /* noop */ }
    try { global.addEventListener('resize', avoidBanner, false); } catch (e) { /* noop */ }
  }

  try {
    if (doc.readyState === 'loading') {
      doc.addEventListener('DOMContentLoaded', function () { try { boot(); } catch (e) { /* noop */ } }, false);
    } else { boot(); }
  } catch (e) { /* noop */ }
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : this));
