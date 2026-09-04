/* ConsentKit UI layer. Shadow DOM banner, preferences panel, floating button.
   Talks to the core only through the public API and ck:* events. No imports, no external assets.

   Copyright (c) 2026 E-COM CONSULT PLUS. MIT License — see LICENSE. */
(function () {
  'use strict';

  var OPT_IN = ['functional', 'analytics', 'marketing'];
  var ALL_CATS = ['necessary'].concat(OPT_IN);

  /* ---------------------------------------------------------------- i18n */

  var DICT = {
    en: {
      bannerTitle: 'We use cookies',
      bannerText: 'Necessary cookies keep the site working. Everything else — analytics, marketing, extra features — runs only if you allow it. You can change your mind at any time.',
      more: 'Learn more',
      acceptAll: 'Accept all',
      rejectAll: 'Reject all',
      customize: 'Customize',
      bannerLabel: 'Cookie consent',
      panelTitle: 'Cookie settings',
      panelIntro: 'Choose which cookies you allow. Nothing optional is on until you turn it on.',
      save: 'Save choices',
      close: 'Close',
      alwaysOn: 'always on',
      cookiesIn: 'Cookies in this group',
      noCookies: 'No cookies declared for this group.',
      colName: 'Name',
      colVendor: 'Provider',
      colPurpose: 'Purpose',
      colExpiry: 'Expires',
      floating: 'Cookie settings',
      poweredBy: 'Powered by ConsentKit',
      cat: {
        necessary: {
          title: 'Necessary',
          desc: 'Needed for the site to work — signing in, security, remembering your consent. They cannot be turned off.'
        },
        functional: {
          title: 'Functional',
          desc: 'Remember your preferences, such as language or chat, so you do not set them up again.'
        },
        analytics: {
          title: 'Analytics',
          desc: 'Help us see which pages people use, so we can fix what is confusing. Numbers only, no names.'
        },
        marketing: {
          title: 'Marketing',
          desc: 'Let us show you ads on other sites and measure whether they were any use.'
        }
      }
    },
    ru: {
      bannerTitle: 'Мы используем cookie',
      bannerText: 'Необходимые cookie нужны, чтобы сайт работал. Всё остальное — аналитика, маркетинг, дополнительные удобства — включается только с вашего согласия. Решение можно изменить в любой момент.',
      more: 'Подробнее',
      acceptAll: 'Принять всё',
      rejectAll: 'Отклонить всё',
      customize: 'Настроить',
      bannerLabel: 'Согласие на cookie',
      panelTitle: 'Настройки cookie',
      panelIntro: 'Выберите, какие cookie вы разрешаете. Ничего необязательного не включено, пока вы сами это не сделаете.',
      save: 'Сохранить выбор',
      close: 'Закрыть',
      alwaysOn: 'всегда активны',
      cookiesIn: 'Cookie в этой группе',
      noCookies: 'Для этой группы cookie не заявлены.',
      colName: 'Имя',
      colVendor: 'Поставщик',
      colPurpose: 'Цель',
      colExpiry: 'Срок',
      floating: 'Настройки cookie',
      poweredBy: 'Работает на ConsentKit',
      cat: {
        necessary: {
          title: 'Необходимые',
          desc: 'Без них сайт не работает: вход, безопасность, память о вашем выборе. Отключить нельзя.'
        },
        functional: {
          title: 'Функциональные',
          desc: 'Запоминают ваши настройки — например язык или чат, — чтобы вы не задавали их заново.'
        },
        analytics: {
          title: 'Аналитика',
          desc: 'Показывают нам, какими страницами вы пользуетесь, чтобы мы исправили неудобное. Только цифры, без имён.'
        },
        marketing: {
          title: 'Маркетинг',
          desc: 'Позволяют показывать вам рекламу на других сайтах и понимать, была ли от неё польза.'
        }
      }
    }
  };

  // Keys an external locale may supply. Kept in sync with DICT.en by shape.
  // A key listed here but missing from an external locale falls back to DICT.en
  // in buildStrings() — that is what keeps the 32 locales in ck-locales.js whole
  // when a new key like poweredBy is added here and not (yet) translated there.
  // Adding a key to DICT without adding it here would leave T.<key> undefined
  // for every external locale and render the literal string "undefined".
  var STR_KEYS = [
    'bannerTitle', 'bannerText', 'more', 'acceptAll', 'rejectAll', 'customize',
    'bannerLabel', 'panelTitle', 'panelIntro', 'save', 'close', 'alwaysOn',
    'cookiesIn', 'noCookies', 'colName', 'colVendor', 'colPurpose', 'colExpiry', 'floating',
    'poweredBy'
  ];

  // builtin(en,ru) <- window.__ckLocales, read at render time so the locales
  // file may load in any order relative to this one.
  function localeTable() {
    var table = {};
    var k;
    for (k in DICT) {
      if (Object.prototype.hasOwnProperty.call(DICT, k)) table[k.toLowerCase()] = DICT[k];
    }
    var ext = (typeof window !== 'undefined') && window.__ckLocales;
    if (!ext || typeof ext !== 'object') return table;
    for (k in ext) {
      if (!Object.prototype.hasOwnProperty.call(ext, k)) continue;
      var v = ext[k];
      if (v && typeof v === 'object') table[String(k).toLowerCase()] = v;
    }
    return table;
  }

  // exact lowercase match -> first two letters (pt-BR -> pt) -> en
  function resolveLang(cfgLang, table) {
    var raw = cfgLang;
    if (!raw || raw === 'auto') {
      raw = (typeof navigator !== 'undefined' && (navigator.language || navigator.userLanguage)) || 'en';
    }
    var code = String(raw).toLowerCase();
    if (table[code]) return code;
    var short = code.slice(0, 2);
    if (table[short]) return short;
    return 'en';
  }

  // Deep two-level fill from en: a partial locale must never yield undefined,
  // which would render the literal string "undefined".
  function buildStrings(lang, table) {
    var src = table[lang] || {};
    var base = DICT.en;
    var out = {};
    var i, c;
    for (i = 0; i < STR_KEYS.length; i++) {
      var k = STR_KEYS[i];
      out[k] = (typeof src[k] === 'string' && src[k]) ? src[k] : base[k];
    }
    out.cat = {};
    var sc = (src.cat && typeof src.cat === 'object') ? src.cat : {};
    for (i = 0; i < ALL_CATS.length; i++) {
      c = ALL_CATS[i];
      var e = (sc[c] && typeof sc[c] === 'object') ? sc[c] : {};
      out.cat[c] = {
        title: (typeof e.title === 'string' && e.title) ? e.title : base.cat[c].title,
        desc: (typeof e.desc === 'string' && e.desc) ? e.desc : base.cat[c].desc
      };
    }
    return out;
  }

  /* --------------------------------------------------------------- styles */

  var CSS = [
    ':host{all:initial}',
    '*,*::before,*::after{box-sizing:border-box}',
    /* Palette tokens live in a second, generated stylesheet (see buildThemeCss).
       They must NOT be inline host styles: an inline value outbeats every :host
       rule, which would make the dark media query and the forced-mode class dead. */
    ':host{',
    'font-family:system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;',
    'font-size:15px;line-height:1.5;color:var(--ck-ink);',
    '-webkit-font-smoothing:antialiased}',

    '.ck-hidden{display:none !important}',

    'button{font:inherit;color:inherit;margin:0;cursor:pointer}',
    'a{color:var(--ck-accent)}',
    ':focus-visible{outline:2px solid var(--ck-accent);outline-offset:2px;border-radius:4px}',

    /* ---- banner ---- */
    '.ck-scrim{position:fixed;inset:0;background:rgba(16,20,30,.28);z-index:2147483000;pointer-events:none}',
    '.ck-banner{position:fixed;z-index:2147483001;background:var(--ck-bg);color:var(--ck-ink);',
    'border:1px solid var(--ck-line);border-radius:var(--ck-radius);pointer-events:auto}',
    '.ck-banner--bar{left:16px;right:16px;padding:18px 20px;',
    'display:flex;gap:20px;align-items:center;flex-wrap:wrap}',
    '.ck-banner--bar.ck-pos-bottom{bottom:16px}',
    '.ck-banner--bar.ck-pos-top{top:16px}',
    '.ck-banner--modal{top:50%;left:50%;transform:translate(-50%,-50%);',
    'width:min(560px,calc(100vw - 32px));max-height:calc(100vh - 32px);overflow:auto;padding:24px}',

    /* box: compact card, corner-anchored, no scrim */
    '.ck-banner--box{width:min(360px,calc(100vw - 32px));max-height:calc(100vh - 32px);',
    'overflow:auto;padding:20px;display:block}',
    '.ck-banner--box.ck-pos-bottom-right{bottom:16px;right:16px}',
    '.ck-banner--box.ck-pos-bottom-left{bottom:16px;left:16px}',
    /* Vertical layouts: the copy ends with the "learn more" link, so the gap
       below it has to clear a text baseline, not just a block edge — 16px
       reads as attached to the buttons. */
    '.ck-banner.ck-banner--box p,.ck-banner.ck-banner--modal p{margin-bottom:22px}',
    /* both filled buttons share one equal row; outline spans the width below */
    '.ck-banner--box .ck-actions{display:grid;grid-template-columns:1fr 1fr;gap:8px}',
    '.ck-banner--box .ck-btn{min-width:0;width:100%}',
    '.ck-banner--box .ck-btn--outline{grid-column:1 / -1}',
    '.ck-banner__body{flex:1 1 320px;min-width:0}',
    '.ck-banner h2{margin:0 0 6px;font-size:17px;font-weight:600;letter-spacing:-.01em}',
    '.ck-banner p{margin:0;color:var(--ck-muted);font-size:14px}',
    '.ck-banner--modal p{margin-bottom:20px}',
    '.ck-banner__more{white-space:nowrap}',

    /* ---- equal-weight action row ---- */
    '.ck-actions{display:flex;gap:10px;flex-wrap:wrap;flex:0 1 auto}',
    '.ck-banner--modal .ck-actions{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr))}',
    '.ck-btn{display:inline-flex;align-items:center;justify-content:center;text-align:center;',
    'min-width:150px;min-height:44px;padding:11px 18px;font-size:14px;font-weight:600;line-height:1.2;',
    'border-radius:var(--ck-radius);border:1px solid transparent;background:transparent;flex:1 1 auto}',
    '.ck-btn--filled{background:var(--ck-accent);border-color:var(--ck-accent);color:var(--ck-on-accent)}',
    '.ck-btn--outline{background:transparent;border-color:var(--ck-accent);color:var(--ck-accent)}',
    '.ck-btn--ghost{min-width:0;border-color:var(--ck-line);color:var(--ck-ink);font-weight:500}',

    /* ---- panel ---- */
    '.ck-panel-scrim{position:fixed;inset:0;background:rgba(16,20,30,.34);z-index:2147483002;pointer-events:none}',
    '.ck-panel{position:fixed;z-index:2147483003;top:50%;left:50%;transform:translate(-50%,-50%);',
    'width:min(620px,calc(100vw - 32px));max-height:calc(100vh - 48px);',
    'display:flex;flex-direction:column;background:var(--ck-bg);color:var(--ck-ink);',
    'border:1px solid var(--ck-line);border-radius:var(--ck-radius);overflow:hidden}',
    '.ck-panel__head{display:flex;align-items:flex-start;gap:16px;padding:22px 24px 14px;',
    'border-bottom:1px solid var(--ck-line)}',
    '.ck-panel__head h2{margin:0 0 4px;font-size:18px;font-weight:600;letter-spacing:-.01em}',
    '.ck-panel__head p{margin:0;font-size:14px;color:var(--ck-muted)}',
    '.ck-x{flex:none;width:36px;height:36px;border-radius:var(--ck-radius);border:1px solid var(--ck-line);',
    'background:transparent;display:inline-flex;align-items:center;justify-content:center;color:var(--ck-muted)}',
    '.ck-panel__body{overflow:auto;padding:6px 24px 10px;-webkit-overflow-scrolling:touch}',
    '.ck-panel__foot{display:flex;gap:10px;flex-wrap:wrap;padding:16px 24px;',
    'border-top:1px solid var(--ck-line);background:var(--ck-soft)}',
    '.ck-panel__foot .ck-btn{flex:1 1 150px}',

    /* ---- category row ---- */
    '.ck-cat{padding:16px 0;border-bottom:1px solid var(--ck-line)}',
    '.ck-cat:last-child{border-bottom:0}',
    '.ck-cat__top{display:flex;gap:16px;align-items:flex-start}',
    '.ck-cat__txt{flex:1 1 auto;min-width:0}',
    '.ck-cat__name{display:flex;align-items:center;gap:8px;flex-wrap:wrap;font-size:15px;font-weight:600}',
    '.ck-cat__badge{font-size:12px;font-weight:500;color:var(--ck-muted);',
    'border:1px solid var(--ck-line);border-radius:999px;padding:1px 8px}',
    '.ck-cat__desc{margin:4px 0 0;font-size:13.5px;color:var(--ck-muted)}',

    /* ---- switch ---- */
    '.ck-switch{flex:none;width:46px;height:27px;padding:0;border-radius:999px;',
    'border:1px solid var(--ck-line);background:var(--ck-soft);position:relative}',
    '.ck-switch::after{content:"";position:absolute;top:2px;left:2px;width:21px;height:21px;',
    'border-radius:50%;background:var(--ck-bg);border:1px solid var(--ck-line)}',
    '.ck-switch[aria-checked="true"]{background:var(--ck-accent);border-color:var(--ck-accent)}',
    '.ck-switch[aria-checked="true"]::after{left:auto;right:2px;border-color:transparent}',
    '.ck-switch[disabled]{cursor:not-allowed;opacity:.55}',

    /* ---- cookie table ---- */
    '.ck-det{margin-top:12px}',
    '.ck-det>summary{cursor:pointer;font-size:13px;color:var(--ck-accent);',
    'list-style:none;display:inline-flex;align-items:center;gap:6px;padding:2px 0}',
    '.ck-det>summary::-webkit-details-marker{display:none}',
    '.ck-det>summary::before{content:"";width:0;height:0;border:4px solid transparent;',
    'border-left-color:currentColor;border-right:0}',
    '.ck-det[open]>summary::before{transform:rotate(90deg)}',
    '.ck-tablewrap{margin-top:8px;overflow-x:auto;border:1px solid var(--ck-line);border-radius:var(--ck-radius)}',
    'table{border-collapse:collapse;width:100%;font-size:13px;min-width:420px}',
    'th,td{text-align:left;padding:8px 10px;border-bottom:1px solid var(--ck-line);vertical-align:top}',
    'thead th{background:var(--ck-soft);font-weight:600;font-size:12px;color:var(--ck-muted);white-space:nowrap}',
    'tbody tr:last-child td{border-bottom:0}',
    'td.ck-mono{font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace}',
    '.ck-empty{margin:8px 0 0;font-size:13px;color:var(--ck-muted)}',

    /* ---- floating button ---- */
    '.ck-fab{position:fixed;left:16px;bottom:16px;z-index:2147482999;width:48px;height:48px;',
    'border-radius:50%;border:1px solid var(--ck-line);background:var(--ck-bg);color:var(--ck-accent);',
    'display:inline-flex;align-items:center;justify-content:center;padding:0}',
    '.ck-fab svg{width:24px;height:24px;display:block}',

    '@media (max-width:560px){',
    '.ck-banner--bar{left:8px;right:8px;bottom:8px;padding:16px}',
    '.ck-actions{width:100%}.ck-btn{min-width:0;flex:1 1 100%}',
    '.ck-banner.ck-banner--bar p{margin-bottom:22px}',
    '.ck-banner--bar{flex-direction:column;align-items:stretch}',
    '.ck-banner--bar .ck-banner__body{display:contents}',
    '.ck-banner--bar .ck-banner__body>*{order:1}',
    '.ck-banner--bar .ck-actions{order:2}}',

    '@media (prefers-reduced-motion: no-preference){',
    '.ck-btn,.ck-x,.ck-fab,.ck-switch,.ck-switch::after{transition:background-color .16s ease,border-color .16s ease,color .16s ease,left .16s ease,right .16s ease}}'
  ].join('\n');

  var COOKIE_ICON =
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" ' +
    'stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">' +
    '<path d="M21 12a9 9 0 1 1-9-9 3.4 3.4 0 0 0 4.2 4.2A3.4 3.4 0 0 0 21 12Z"/>' +
    '<circle cx="9" cy="10" r="1"/><circle cx="14.5" cy="15" r="1"/><circle cx="8.5" cy="15.5" r="1"/>' +
    '</svg>';

  /* --------------------------------------------------------------- helpers */

  function el(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  }

  function api() {
    return (typeof window !== 'undefined' && window.ConsentKit) || null;
  }

  /* ------------------------------------------------- branding (optional file) */

  /* Branding lives in src/ck-ui-branding.js and is OPTIONAL. Everything below
     asks for the extension and does nothing when it is absent, so a build
     without that file draws no logo, no attribution line and no branding CSS —
     and errors nowhere. See that file's header for the load-order contract.

     The extension is handed `host` on every DOM-producing call: ck-ui owns el()
     and the localised strings (T is reassigned per mount), so passing them in
     keeps one dictionary and one set of helpers rather than two copies. */
  function brandingExt() {
    var ck = api();
    var ext = ck && ck._uiExtensions;
    var b = ext && ext.branding;
    return (b && typeof b === 'object') ? b : null;
  }

  function extHost() {
    return { el: el, str: str, T: T };
  }

  function buildBrandLogo(cfg) {
    var b = brandingExt();
    return (b && typeof b.buildBrandLogo === 'function') ? b.buildBrandLogo(cfg, extHost()) : null;
  }

  function buildPoweredBy(cfg) {
    var b = brandingExt();
    return (b && typeof b.buildPoweredBy === 'function') ? b.buildPoweredBy(cfg, extHost()) : null;
  }

  function buildBrandCss(cfg) {
    var b = brandingExt();
    return (b && typeof b.buildBrandCss === 'function') ? (b.buildBrandCss(cfg) || '') : '';
  }

  /* Static branding rules, appended to the base sheet at mount. Empty string
     when the extension is absent — no dead .ck-brand CSS in the build. */
  function brandingCss() {
    var b = brandingExt();
    return (b && typeof b.css === 'function') ? ('\n' + b.css()) : '';
  }

  /* Structural: branding produces DOM, so a config that gains a logo must
     remount. '-' whenever there is no branding at all, which keeps an
     unbranded page's signature identical to what it was before the split. */
  function brandSignature(cfg) {
    var b = brandingExt();
    return (b && typeof b.brandSignature === 'function') ? b.brandSignature(cfg) : '-';
  }

  function safeState() {
    var ck = api();
    var s = null;
    try {
      if (ck && typeof ck.getState === 'function') s = ck.getState();
    } catch (e) { s = null; }
    if (!s || typeof s !== 'object') s = { decided: false, categories: {} };
    if (!s.categories || typeof s.categories !== 'object') s.categories = {};
    return s;
  }

  function safeConfig() {
    var ck = api();
    var c = (ck && ck.config) || {};
    return (c && typeof c === 'object') ? c : {};
  }

  /* ----------------------------------------------------------------- state */

  var mounted = false;
  var mountedSig = null;
  var host = null, root = null;
  var T = DICT.en;
  var nodes = {};              // banner/panel/fab refs
  var switches = {};           // category -> button
  var panelOpen = false;
  var lastFocus = null;

  /* ---------------------------------------------------------------- build */

  function activeOptIn(cfg) {
    var cats = (cfg && cfg.categories) || {};
    var out = [];
    for (var i = 0; i < OPT_IN.length; i++) {
      var k = OPT_IN[i];
      var entry = cats[k];
      // absent -> shown; explicit enabled:false -> hidden
      if (entry && entry.enabled === false) continue;
      out.push(k);
    }
    return out;
  }

  function cookiesFor(cfg, cat) {
    var list = (cfg && cfg.cookieTable) || [];
    if (!Array.isArray(list)) return [];
    var out = [];
    for (var i = 0; i < list.length; i++) {
      var row = list[i];
      if (row && typeof row === 'object' && String(row.category || '') === cat) out.push(row);
    }
    return out;
  }

  /* ----------------------------------------------------------------- theme */

  // Built-in palettes. Dark values are picked for >= 4.5:1 text contrast.
  var LIGHT_RADIUS = '10px';
  var LIGHT = {
    bg: '#fff', ink: '#1B2437', accent: '#2B50D8', onAccent: '#fff',
    muted: '#5b6478', line: '#dfe3ea', soft: '#f4f6f9'
  };
  var DARK = {
    bg: '#1A202D', ink: '#E6EAF4', accent: '#7B96F0', onAccent: '#12182A',
    muted: '#A6B0C6', line: '#333C4F', soft: '#232B3A'
  };

  function str(v) {
    return (typeof v === 'string' && v.trim()) ? v.trim() : null;
  }

  /* Config values are interpolated into the TEXT of a generated stylesheet, so
     an unvalidated value can close the declaration and open rules of its own
     ("10px;}.ck-btn--filled{display:none" hides "Reject all"). config.theme is
     not trusted input: in standalone mode it comes straight from the embedding
     page or an integrator's admin panel, with no server-side validation
     anywhere in the path. So every value is matched against a strict grammar
     for its kind and silently replaced by the token default when it does not
     fit — a broken colour is a cosmetic bug, an injected rule is a defacement
     and can strip the reject button, which is a consent-validity problem.

     Sanitising happens at the entry points in buildThemeCss (the eight
     config reads), not in tokenBlock(): by the time values reach derive() and
     color-mix() they are already clean, and the built-in constants and
     generated color-mix() strings must not be re-validated by this grammar. */
  var RE_CSS = {
    // #RGB / #RRGGBB / #RRGGBBAA (and #RGBA), rgb()/rgba()/hsl()/hsla() with
    // numbers, commas, spaces, %, decimals and slashes, or a bare colour name.
    color: /^(#[0-9a-fA-F]{3,8}|(rgb|rgba|hsl|hsla)\([0-9.,%\s/]+\)|[a-zA-Z]+)$/,
    length: /^\d+(\.\d+)?(px|rem|em|%)$/
  };
  // Belt-and-braces: nothing that passed above may still carry CSS structure.
  var RE_CSS_UNSAFE = /[;{}<>]/;

  function sanitizeCssValue(kind, value, fallback) {
    var v = str(value);
    if (!v) return fallback;
    var re = RE_CSS[kind];
    if (!re || !re.test(v)) return fallback;
    if (RE_CSS_UNSAFE.test(v)) return fallback;
    return v;
  }

  // One :host{} block of custom properties for a resolved palette.
  function tokenBlock(sel, p, radius) {
    var d = [
      '--ck-bg:' + p.bg,
      '--ck-ink:' + p.ink,
      '--ck-accent:' + p.accent,
      '--ck-on-accent:' + p.onAccent,
      '--ck-muted:' + p.muted,
      '--ck-line:' + p.line,
      '--ck-soft:' + p.soft
    ];
    if (radius) d.push('--ck-radius:' + radius);
    return sel + '{' + d.join(';') + '}';
  }

  // Derived tokens follow the explicit bg/ink the caller supplied, so a custom
  // light palette keeps readable muted/line/soft values.
  function derive(base, bg, ink) {
    var p = {
      bg: bg, ink: ink, accent: base.accent, onAccent: base.onAccent,
      muted: base.muted, line: base.line, soft: base.soft
    };
    if (bg !== base.bg || ink !== base.ink) {
      p.muted = 'color-mix(in srgb, ' + ink + ' 62%, ' + bg + ')';
      p.line = 'color-mix(in srgb, ' + ink + ' 14%, ' + bg + ')';
      p.soft = 'color-mix(in srgb, ' + ink + ' 5%, ' + bg + ')';
    }
    return p;
  }

  function buildThemeCss(cfg) {
    var theme = (cfg && cfg.theme) || {};
    var dk = (theme.dark && typeof theme.dark === 'object') ? theme.dark : {};
    // Every value below is interpolated into stylesheet text — see
    // sanitizeCssValue(). A rejected value falls back to the token default, so
    // derive()'s "bg !== base.bg" check collapses to exactly the built-in
    // palette rather than a half-substituted one.
    var radius = sanitizeCssValue('length', theme.radius, LIGHT_RADIUS);

    // Light: config overrides on top of the built-in light palette.
    var light = derive(LIGHT,
      sanitizeCssValue('color', theme.bg, LIGHT.bg),
      sanitizeCssValue('color', theme.ink, LIGHT.ink));
    if (str(theme.accent)) light.accent = sanitizeCssValue('color', theme.accent, LIGHT.accent);

    // Dark: theme.dark overrides on top of the built-in dark palette.
    // A light-only theme.accent deliberately does NOT carry into dark — the
    // default #2B50D8 on #1A202D is ~2.5:1 and would fail AA.
    var dark = derive(DARK,
      sanitizeCssValue('color', dk.bg, DARK.bg),
      sanitizeCssValue('color', dk.ink, DARK.ink));
    if (str(dk.accent)) dark.accent = sanitizeCssValue('color', dk.accent, DARK.accent);
    if (str(dk.onAccent)) dark.onAccent = sanitizeCssValue('color', dk.onAccent, DARK.onAccent);

    var mode = theme.mode;
    if (mode !== 'light' && mode !== 'dark') mode = 'auto';

    var out = [tokenBlock(':host', light, radius)];
    if (mode === 'auto') {
      // forced-light class must still beat a dark system preference
      out.push('@media (prefers-color-scheme: dark){' +
        tokenBlock(':host(:not(.ck-mode-light))', dark, null) + '}');
    }
    out.push(tokenBlock(':host(.ck-mode-dark)', dark, null));

    // color-mix fallback, per context, so a custom palette without color-mix
    // still lands on readable static values rather than transparent.
    out.push('@supports not (color: color-mix(in srgb, #000 50%, #fff)){' +
      ':host{--ck-muted:' + LIGHT.muted + ';--ck-line:' + LIGHT.line + ';--ck-soft:' + LIGHT.soft + '}' +
      (mode === 'auto'
        ? '@media (prefers-color-scheme: dark){:host(:not(.ck-mode-light)){--ck-muted:' + DARK.muted +
          ';--ck-line:' + DARK.line + ';--ck-soft:' + DARK.soft + '}}'
        : '') +
      ':host(.ck-mode-dark){--ck-muted:' + DARK.muted + ';--ck-line:' + DARK.line +
      ';--ck-soft:' + DARK.soft + '}}');

    return { css: out.join('\n'), mode: mode };
  }

  function applyTheme(cfg) {
    if (!host || !nodes.themeStyle) return;
    var built = buildThemeCss(cfg);
    // Brand rules ride along in the same sheet: the dark/light logo swap depends
    // on theme.mode, so it must be rebuilt whenever the palette is.
    nodes.themeStyle.textContent = built.css + '\n' + buildBrandCss(cfg);  // replace, never append
    host.classList.remove('ck-mode-dark', 'ck-mode-light');
    if (built.mode === 'dark') host.classList.add('ck-mode-dark');
    else if (built.mode === 'light') host.classList.add('ck-mode-light');
  }

  function makeSwitch(cat, locked) {
    var b = el('button', 'ck-switch');
    b.type = 'button';
    b.setAttribute('role', 'switch');
    b.setAttribute('aria-checked', locked ? 'true' : 'false');
    b.dataset.cat = cat;
    if (locked) {
      b.disabled = true;
      b.setAttribute('aria-disabled', 'true');
    } else {
      b.addEventListener('click', function () {
        var on = b.getAttribute('aria-checked') === 'true';
        b.setAttribute('aria-checked', on ? 'false' : 'true');
      });
    }
    return b;
  }

  function buildCategory(cfg, cat) {
    var meta = T.cat[cat] || { title: cat, desc: '' };
    var locked = cat === 'necessary';

    var wrap = el('div', 'ck-cat');
    var top = el('div', 'ck-cat__top');
    var txt = el('div', 'ck-cat__txt');

    var nameId = 'ck-cat-' + cat;
    var name = el('div', 'ck-cat__name');
    var nameSpan = el('span', null, meta.title);
    nameSpan.id = nameId;
    name.appendChild(nameSpan);
    if (locked) name.appendChild(el('span', 'ck-cat__badge', T.alwaysOn));
    txt.appendChild(name);

    var descId = nameId + '-desc';
    var desc = el('p', 'ck-cat__desc', meta.desc);
    desc.id = descId;
    txt.appendChild(desc);

    var sw = makeSwitch(cat, locked);
    sw.setAttribute('aria-labelledby', nameId);
    sw.setAttribute('aria-describedby', descId);
    switches[cat] = sw;

    top.appendChild(txt);
    top.appendChild(sw);
    wrap.appendChild(top);

    var rows = cookiesFor(cfg, cat);
    if (rows.length) {
      var det = el('details', 'ck-det');
      var sum = el('summary');
      sum.appendChild(document.createTextNode(T.cookiesIn + ' (' + rows.length + ')'));
      det.appendChild(sum);

      var tw = el('div', 'ck-tablewrap');
      var table = el('table');
      var thead = el('thead');
      var htr = el('tr');
      var heads = [T.colName, T.colVendor, T.colPurpose, T.colExpiry];
      for (var h = 0; h < heads.length; h++) {
        var th = el('th', null, heads[h]);
        th.setAttribute('scope', 'col');
        htr.appendChild(th);
      }
      thead.appendChild(htr);
      table.appendChild(thead);

      var tbody = el('tbody');
      for (var r = 0; r < rows.length; r++) {
        var row = rows[r];
        var tr = el('tr');
        tr.appendChild(el('td', 'ck-mono', String(row.name == null ? '—' : row.name)));
        tr.appendChild(el('td', null, String(row.vendor == null ? '—' : row.vendor)));
        tr.appendChild(el('td', null, String(row.purpose == null ? '—' : row.purpose)));
        tr.appendChild(el('td', null, String(row.expiry == null ? '—' : row.expiry)));
        tbody.appendChild(tr);
      }
      table.appendChild(tbody);
      tw.appendChild(table);
      det.appendChild(tw);
      wrap.appendChild(det);
    }

    return wrap;
  }

  // Unknown type -> bar/bottom. Known type with an unrecognized position ->
  // that type's own default (bar: bottom, box: bottom-left — the side away
  // from the chat widgets and scroll-to-top buttons most sites put on the right).
  function resolveLayout(cfg) {
    var layout = (cfg && cfg.layout) || {};
    var type = layout.type;
    if (type !== 'modal' && type !== 'box') type = 'bar';
    var pos = layout.position;
    if (type === 'bar') pos = (pos === 'top') ? 'top' : 'bottom';
    else if (type === 'box') pos = (pos === 'bottom-right') ? 'bottom-right' : 'bottom-left';
    else pos = null;                                  // modal is centered
    return { type: type, position: pos };
  }

  function buildBanner(cfg) {
    var lay = resolveLayout(cfg);
    var isModal = lay.type === 'modal';

    var scrim = el('div', 'ck-scrim ck-hidden');       // decorative, never blocks scroll
    scrim.setAttribute('aria-hidden', 'true');
    if (!isModal) scrim.classList.add('ck-hidden');

    var b = el('section', 'ck-banner ck-hidden');
    b.className = 'ck-banner ck-hidden ck-banner--' + lay.type +
      (lay.position ? ' ck-pos-' + lay.position : '');
    b.setAttribute('role', 'region');
    b.setAttribute('aria-label', T.bannerLabel);

    var body = el('div', 'ck-banner__body');
    var h = el('h2', null, T.bannerTitle);
    h.id = 'ck-banner-title';
    body.appendChild(h);

    var p = el('p');
    p.appendChild(document.createTextNode(T.bannerText + ' '));
    var link = el('a', 'ck-banner__more', T.more);
    link.href = '#';
    p.appendChild(link);
    body.appendChild(p);

    var pb = buildPoweredBy(cfg);
    var brand = buildBrandLogo(cfg);
    var foot = null;
    if (brand || pb) {
      foot = el('div', 'ck-foot');
      if (brand) foot.appendChild(brand);
      if (pb) foot.appendChild(pb);
    }

    // Where the attribution goes depends on the layout's flow direction.
    // bar: text and actions sit side by side and are centred against each
    // other, so a full-width row underneath would stretch the first row and
    // leave the buttons floating — the foot belongs at the end of the text
    // column instead. box/modal stack vertically, so it simply follows the
    // buttons, which is also the correct reading order there.
    if (foot && lay.type === 'bar') body.appendChild(foot);
    b.appendChild(body);

    var actions = el('div', 'ck-actions');
    var accept = el('button', 'ck-btn ck-btn--filled', T.acceptAll);
    accept.type = 'button';
    var reject = el('button', 'ck-btn ck-btn--filled', T.rejectAll);
    reject.type = 'button';
    var custom = el('button', 'ck-btn ck-btn--outline', T.customize);
    custom.type = 'button';

    accept.addEventListener('click', function () { doAcceptAll(); });
    reject.addEventListener('click', function () { doRejectAll(); });
    custom.addEventListener('click', function () { openPanel(custom); });

    actions.appendChild(accept);
    actions.appendChild(reject);
    actions.appendChild(custom);
    b.appendChild(actions);

    // box/modal: the foot follows the buttons (see the note above).
    if (foot && lay.type !== 'bar') b.appendChild(foot);


    nodes.scrim = scrim;
    nodes.banner = b;
    nodes.bannerModal = isModal;
    root.appendChild(scrim);
    root.appendChild(b);
  }

  function buildPanel(cfg) {
    var scrim = el('div', 'ck-panel-scrim ck-hidden');
    scrim.setAttribute('aria-hidden', 'true');

    var p = el('div', 'ck-panel ck-hidden');
    p.setAttribute('role', 'dialog');
    p.setAttribute('aria-modal', 'true');
    p.setAttribute('aria-label', T.panelTitle);
    p.tabIndex = -1;

    var head = el('div', 'ck-panel__head');
    var htxt = el('div');
    htxt.appendChild(el('h2', null, T.panelTitle));
    htxt.appendChild(el('p', null, T.panelIntro));
    head.appendChild(htxt);

    var x = el('button', 'ck-x');
    x.type = 'button';
    x.setAttribute('aria-label', T.close);
    x.appendChild(document.createTextNode('✕'));
    x.addEventListener('click', function () { closePanel(); });
    head.appendChild(x);
    p.appendChild(head);

    var body = el('div', 'ck-panel__body');
    var cats = ['necessary'].concat(activeOptIn(cfg));
    for (var i = 0; i < cats.length; i++) body.appendChild(buildCategory(cfg, cats[i]));
    p.appendChild(body);

    var foot = el('div', 'ck-panel__foot');
    var save = el('button', 'ck-btn ck-btn--filled', T.save);
    save.type = 'button';
    var acc = el('button', 'ck-btn ck-btn--outline', T.acceptAll);
    acc.type = 'button';
    var rej = el('button', 'ck-btn ck-btn--outline', T.rejectAll);
    rej.type = 'button';

    save.addEventListener('click', function () { doSave(); });
    acc.addEventListener('click', function () { doAcceptAll(); });
    rej.addEventListener('click', function () { doRejectAll(); });

    foot.appendChild(save);
    foot.appendChild(acc);
    foot.appendChild(rej);
    // Same attribution foot as the banner: mark and credit sign the bottom,
    // below the action buttons, never the panel heading.
    var pfoot = buildPoweredBy(cfg);
    var pbrand = buildBrandLogo(cfg);
    if (pbrand || pfoot) {
      var pfootWrap = el('div', 'ck-foot');
      if (pbrand) pfootWrap.appendChild(pbrand);
      if (pfoot) pfootWrap.appendChild(pfoot);
      foot.appendChild(pfootWrap);
    }
    p.appendChild(foot);

    p.addEventListener('keydown', onPanelKeydown);

    nodes.panelScrim = scrim;
    nodes.panel = p;
    root.appendChild(scrim);
    root.appendChild(p);
  }

  function buildFab() {
    var f = el('button', 'ck-fab ck-hidden');
    f.type = 'button';
    f.setAttribute('aria-label', T.floating);
    f.title = T.floating;
    f.innerHTML = COOKIE_ICON;  // static literal, no config data
    f.addEventListener('click', function () { openPanel(f); });
    nodes.fab = f;
    root.appendChild(f);
  }

  /* -------------------------------------------------------------- a11y/trap */

  function focusables() {
    if (!nodes.panel) return [];
    var sel = 'button:not([disabled]),a[href],summary,input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])';
    var all = nodes.panel.querySelectorAll(sel);
    var out = [];
    for (var i = 0; i < all.length; i++) {
      var n = all[i];
      if (n.hasAttribute('disabled')) continue;
      if (n.offsetParent === null && n.getClientRects().length === 0) continue;
      out.push(n);
    }
    return out;
  }

  function onPanelKeydown(e) {
    if (e.key === 'Escape' || e.key === 'Esc') {
      e.preventDefault();
      e.stopPropagation();
      closePanel();
      return;
    }
    if (e.key !== 'Tab') return;
    var list = focusables();               // queried live: <details> changes the set
    if (!list.length) { e.preventDefault(); return; }
    var current = root.activeElement || document.activeElement;
    var idx = list.indexOf(current);
    var next;
    if (e.shiftKey) next = idx <= 0 ? list[list.length - 1] : list[idx - 1];
    else next = (idx === -1 || idx === list.length - 1) ? list[0] : list[idx + 1];
    e.preventDefault();
    next.focus();
  }

  /* ---------------------------------------------------------------- actions */

  function readSwitches() {
    var out = {};
    for (var i = 0; i < OPT_IN.length; i++) {
      var k = OPT_IN[i];
      var sw = switches[k];
      out[k] = !!(sw && sw.getAttribute('aria-checked') === 'true');
    }
    return out;
  }

  function doAcceptAll() {
    var ck = api();
    try { if (ck && typeof ck.accept === 'function') ck.accept('all'); } catch (e) {}
    closePanel(true);
    syncFromState();
  }

  function doRejectAll() {
    var ck = api();
    try { if (ck && typeof ck.rejectAll === 'function') ck.rejectAll(); } catch (e) {}
    closePanel(true);
    syncFromState();
  }

  // Saving without touching anything is a valid refusal of every opt-in category.
  function doSave() {
    var ck = api();
    var choice = readSwitches();
    try { if (ck && typeof ck.accept === 'function') ck.accept(choice); } catch (e) {}
    closePanel(true);
    syncFromState();
  }

  /* ------------------------------------------------------------ open/close */

  function openPanel(invoker) {
    if (!mounted || !nodes.panel) return;
    lastFocus = invoker || root.activeElement || document.activeElement;
    syncSwitches(safeState());
    nodes.panelScrim.classList.remove('ck-hidden');
    nodes.panel.classList.remove('ck-hidden');
    panelOpen = true;
    try { nodes.panel.focus(); } catch (e) {}
  }

  function closePanel(skipRestore) {
    if (!nodes.panel) return;
    var wasOpen = panelOpen;
    nodes.panelScrim.classList.add('ck-hidden');
    nodes.panel.classList.add('ck-hidden');
    panelOpen = false;
    if (wasOpen && !skipRestore && lastFocus && typeof lastFocus.focus === 'function') {
      try { if (lastFocus.isConnected !== false) lastFocus.focus(); } catch (e) {}
    }
    lastFocus = null;
  }

  /* ------------------------------------------------------------------ sync */

  function syncSwitches(state) {
    var cats = (state && state.categories) || {};
    for (var i = 0; i < OPT_IN.length; i++) {
      var k = OPT_IN[i];
      var sw = switches[k];
      if (!sw) continue;
      // before a decision every opt-in switch stays off
      var on = state && state.decided ? cats[k] === true : false;
      sw.setAttribute('aria-checked', on ? 'true' : 'false');
    }
    if (switches.necessary) switches.necessary.setAttribute('aria-checked', 'true');
  }

  // Idempotent: safe to call from ck:init, ck:change and right after our own API calls.
  function syncFromState(state) {
    if (!mounted) return;
    var s = state || safeState();
    var decided = !!s.decided;

    if (nodes.banner) nodes.banner.classList.toggle('ck-hidden', decided);
    if (nodes.scrim) nodes.scrim.classList.toggle('ck-hidden', decided || !nodes.bannerModal);
    if (nodes.fab) nodes.fab.classList.toggle('ck-hidden', !decided);
    if (!panelOpen) syncSwitches(s);
  }

  /* ----------------------------------------------------------------- mount */

  // Structural inputs: a change to any of these needs a rebuild, not a restyle.
  // Branding belongs here because it produces DOM, not just styling: mount() is
  // one-shot, so a config that gains a logo after the first ck:init would
  // otherwise take the applyTheme()-only path and never render it. The signature
  // itself is computed by the branding extension (and is '-' without it), so an
  // unbranded page's signature is byte-identical to what it was before the split.
  function signature(cfg) {
    var c = cfg || {};
    var lay = resolveLayout(c);
    var table = c.cookieTable;
    return [
      String(c.language || 'auto'),
      lay.type, String(lay.position),
      Array.isArray(table) ? table.length : 0,
      brandSignature(c)
    ].join('|');
  }

  function remount(cfg) {
    mounted = false;
    panelOpen = false;
    lastFocus = null;
    mount(cfg);
  }

  function mount(cfg) {
    if (mounted) return;
    if (!document.body) {
      document.addEventListener('DOMContentLoaded', function () { mount(safeConfig()); }, { once: true });
      return;
    }

    var table = localeTable();                       // read at render time
    T = buildStrings(resolveLang(cfg && cfg.language, table), table);

    host = document.getElementById('ck-root');
    if (!host) {
      host = document.createElement('div');
      host.id = 'ck-root';
      document.body.appendChild(host);
    }
    root = host.shadowRoot || host.attachShadow({ mode: 'open' });
    root.innerHTML = '';

    var style = document.createElement('style');
    // Base sheet plus the branding rules, when the branding file is loaded.
    // Without it brandingCss() is '' and the shadow root carries no .ck-brand,
    // .ck-foot or .ck-powered rules at all.
    style.textContent = CSS + brandingCss();
    root.appendChild(style);

    switches = {};
    nodes = {};

    // Palette sheet comes after the base sheet so its :host tokens win.
    nodes.themeStyle = document.createElement('style');
    root.appendChild(nodes.themeStyle);
    applyTheme(cfg);

    buildBanner(cfg);
    buildPanel(cfg);
    buildFab();

    mounted = true;
    mountedSig = signature(cfg);
    syncFromState();
  }

  /* ---------------------------------------------------------------- events */

  // SSR-safe: with no DOM there is nothing to render or listen to, so importing
  // this file in Node is a no-op rather than a throw (mirrors the core).
  if (typeof document === 'undefined') return;

  document.addEventListener('ck:init', function (e) {
    var d = (e && e.detail) || {};
    var cfg = d.config || safeConfig();
    if (!mounted) {
      mount(cfg);
    } else if (signature(cfg) !== mountedSig) {
      remount(cfg);           // language/layout changed since the first render
    } else {
      applyTheme(cfg);        // palette-only changes need no rebuild
    }
    syncFromState(d.state);
  });

  document.addEventListener('ck:change', function (e) {
    var d = (e && e.detail) || {};
    syncFromState(d.state);
  });

  // Insurance: sync is idempotent, so a core that only signals the first choice
  // via ck:consent still updates the UI.
  document.addEventListener('ck:consent', function (e) {
    var d = (e && e.detail) || {};
    syncFromState(d.state);
  });

  document.addEventListener('ck:ui:open-preferences', function () {
    if (!mounted) mount(safeConfig());
    openPanel(null);
  });

  document.addEventListener('ck:ui:close', function () {
    closePanel();
  });

  // Fallback for a missed ck:init (this file loaded after init() already ran).
  // Deferred to a macrotask on purpose: the core publishes a DEFAULT config at
  // parse time, so mounting synchronously here would render with those defaults
  // before the real init() config arrives and — mount() being one-shot — lock in
  // the wrong language and layout. By the time the timeout runs, a normally
  // ordered page has already dispatched ck:init and mounted, so this no-ops;
  // only a genuinely missed ck:init reaches mount(), and by then
  // ConsentKit.config holds the merged real config.
  setTimeout(function () {
    if (!mounted && api() && api().config) mount(safeConfig());
  }, 0);
})();
