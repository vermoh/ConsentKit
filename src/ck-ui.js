/* ConsentKit UI layer. Shadow DOM banner, preferences panel, floating button.
   Talks to the core only through the public API and ck:* events. No imports, no external assets.

   Copyright (c) 2026 E-COM CONSULT PLUS. MIT License — see LICENSE. */
(function () {
  'use strict';

  /* SPEC §1.9 — the second copy of ck.js on the page draws nothing.
     Two snippets each load the whole bundle, so this file runs twice. Every
     copy is its own IIFE with its own `mounted` flag, so a second copy would
     register a second set of ck:* listeners and mount a second banner into the
     same #ck-root — the first copy's, which it cannot see. ck-core.js stands
     down for the same reason; this is the UI half of it.
     SSR-safe: with no window we behave exactly as before and fall through. The
     flag is claimed further down, after the `typeof document` guard, so a copy
     that only ever published the pure `_contrast` helpers into a DOM-less
     context does not lock out a later copy that could actually render. */
  if (typeof window !== 'undefined' && window.__ckUiLoaded) { return; }

  var OPT_IN = ['functional', 'analytics', 'marketing'];
  var ALL_CATS = ['necessary'].concat(OPT_IN);

  /* ---------------------------------------------------------------- i18n */

  var DICT = {
    en: {
      bannerTitle: 'Cookies on this site',
      bannerText: 'Necessary cookies keep the site working. The rest are used only if you allow them. You can change your choice at any time.',
      more: 'Learn more',
      acceptAll: 'Accept all',
      rejectAll: 'Reject all',
      customize: 'Customize',
      bannerLabel: 'Cookie consent',
      panelTitle: 'Cookie settings',
      panelIntro: 'Choose what to allow. By default only the necessary ones are on.',
      /* SPEC V1.16 §1.2 — the «Additional information» card at the foot of the
         panel: who the operator is, where to write, how long an answer takes,
         where to complain. The HEADING has a real translation in every locale;
         the BODY is deliberately empty in every dictionary, because the block
         renders only when the site actually supplies text. A default sentence
         here would put an empty operator card on every site that never
         configured one. */
      extraTitle: 'Additional information',
      extraText: '',
      save: 'Save choices',
      close: 'Close',
      alwaysOn: 'always on',
      cookiesIn: 'Which cookies',
      noCookies: 'No cookies declared for this group.',
      colName: 'Name',
      colVendor: 'Who sets it',
      colPurpose: 'What for',
      colExpiry: 'Expires',
      /* SPEC V1.18.1 §1.2 — the «Expires» cell, computed rather than quoted.
         `cookieTable[].expiryDays` is a NUMBER, so the cell can be written in
         the banner's language instead of carrying whatever single string the
         config was filled with (which, before 0.5.16, was Russian on every
         site the scanner had touched).

         `expirySession` is the word for a cookie that dies with the tab;
         `expiryDays` is a PLURAL table like svcCount/ckCount below. */
      expirySession: 'session',
      expiryDays: ['{n} day', '{n} days'],
      floating: 'Cookie settings',
      poweredBy: 'Powered by ConsentKit',
      // SPEC V1.12 §3 — services inside a category group.
      //
      // `svcCount`/`ckCount` are PLURAL FORMS, not plain strings: «1 сервис»,
      // «2 сервиса», «5 сервисов». Each is an array read by plural() below, and
      // each language supplies as many forms as its own grammar needs — one for
      // English, three for Russian. {n} is the number.
      svcCount: ['{n} service', '{n} services'],
      ckCount: ['{n} cookie', '{n} cookies'],
      svcPolicy: 'Privacy policy',
      // The service's own cookies, listed under it rather than in the group's
      // «Which cookies» table.
      svcCookies: 'Cookies it sets',
      // 0.5.12 — the per-row disclosure. A row is one line until this is opened;
      // the purpose, the policy link and the service's cookie table live behind
      // it. NOT `more`: that string is the banner's «Подробнее» and reads
      // «Aflați mai multe» in ro, which is a sentence, not a row control.
      svcDetails: 'Details',
      // The group's own disclosure: how many services are hidden behind the
      // «N services · M cookies» button. Only ever read by a screen reader.
      svcListLabel: 'Services and cookies in this group',
      // SPEC V1.10 §2 — the blocked-embed placeholder. {host} is the vendor
      // label when the database knows one and the bare host otherwise; {cat} is
      // the localized category title, taken from cat.<name>.title below, so the
      // name in the placeholder is the name on the switch in the panel.
      phText: 'Content from {host} goes here. It will load once you allow «{cat}».',
      phAllow: 'Allow and show',
      phSettings: 'Cookie settings',
      phLabel: 'Blocked content',
      cat: {
        necessary: {
          title: 'Necessary',
          desc: 'Needed for the site to work: signing in, security, remembering your choice. They cannot be turned off.'
        },
        functional: {
          title: 'Functional',
          desc: 'Remember your choices: language, basket, chat.'
        },
        analytics: {
          title: 'Analytics',
          desc: 'Help us understand what works well on the site and what does not.'
        },
        marketing: {
          title: 'Marketing',
          desc: 'Match ads to your interests on other sites.'
        }
      }
    },
    ru: {
      bannerTitle: 'Cookie на этом сайте',
      bannerText: 'Необходимые cookie нужны, чтобы сайт работал. Остальные включаются только с вашего согласия. Решение можно изменить в любой момент.',
      more: 'Подробнее',
      acceptAll: 'Принять всё',
      rejectAll: 'Отклонить всё',
      customize: 'Настроить',
      bannerLabel: 'Согласие на cookie',
      panelTitle: 'Настройки cookie',
      panelIntro: 'Выберите, что разрешить. По умолчанию включено только необходимое.',
      // SPEC V1.16 §1.2. Заголовок переведён везде, тело пустое везде — см.
      // комментарий у en выше.
      extraTitle: 'Дополнительно',
      extraText: '',
      save: 'Сохранить выбор',
      close: 'Закрыть',
      alwaysOn: 'всегда активны',
      cookiesIn: 'Какие cookie',
      noCookies: 'Для этой группы cookie не заявлены.',
      colName: 'Название',
      colVendor: 'Кто ставит',
      colPurpose: 'Зачем',
      colExpiry: 'Срок',
      /* SPEC V1.18.1 §1.2. Одна форма намеренно: «{n} дн.» — это сокращение,
         которое кабинет уже показывает владельцу, и оно верно для 1, 2 и 5.
         plural() зажимает индекс по длине массива, поэтому один элемент —
         честный ответ «в этом языке здесь одна форма», а не недосмотр. */
      expirySession: 'сессия',
      expiryDays: ['{n} дн.'],
      floating: 'Настройки cookie',
      poweredBy: 'Работает на ConsentKit',
      // SPEC V1.12 §3. Три формы: 1 сервис, 2 сервиса, 5 сервисов.
      svcCount: ['{n} сервис', '{n} сервиса', '{n} сервисов'],
      ckCount: ['{n} cookie', '{n} cookie', '{n} cookie'],
      svcPolicy: 'Политика',
      svcCookies: 'Какие cookie ставит',
      svcDetails: 'Подробнее',
      svcListLabel: 'Сервисы и cookie этой группы',
      phText: 'Здесь содержимое от {host}. Оно загрузится после согласия на «{cat}».',
      phAllow: 'Разрешить и показать',
      phSettings: 'Настроить cookie',
      phLabel: 'Заблокированное содержимое',
      cat: {
        necessary: {
          title: 'Необходимые',
          desc: 'Нужны, чтобы сайт работал: вход, безопасность, память о вашем выборе. Отключить нельзя.'
        },
        functional: {
          title: 'Функциональные',
          desc: 'Запоминают ваш выбор: язык, корзину, чат.'
        },
        analytics: {
          title: 'Аналитика',
          desc: 'Помогают нам понять, что на сайте удобно, а что нет.'
        },
        marketing: {
          title: 'Маркетинг',
          desc: 'Подбирают рекламу под ваши интересы на других сайтах.'
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
    'poweredBy',
    // SPEC V1.10 §2. Present in ck-locales.js for ro only; every other external
    // locale falls back to DICT.en through buildStrings(), which is what §2
    // asks for («остальные языки — en»).
    'phText', 'phAllow', 'phSettings', 'phLabel',
    // SPEC V1.12 §3. svcPolicy/svcCookies are plain strings and belong here;
    // svcCount/ckCount are ARRAYS of plural forms and are filled by their own
    // branch in buildStrings() — listing them here would be a bug, because this
    // loop only copies values that are `typeof === 'string'` and would leave
    // every external locale on the English plurals.
    'svcPolicy', 'svcCookies',
    // 0.5.12 — the per-row «Подробнее» disclosure and the accessible name of the
    // group's own one. Both are plain strings, so they belong here: a key left
    // out of this list is `undefined` for all 32 external locales and renders
    // the literal word "undefined" on the card.
    'svcDetails', 'svcListLabel',
    /* SPEC V1.16 §1.2 — the «Дополнительно» card. Both belong here for the
       usual reason (a DICT key missing from this list is `undefined` for all 32
       external locales), but they behave differently on purpose:

         extraTitle — translated everywhere, so every locale has a heading.
         extraText  — '' in every dictionary. The merge line below keeps '' when
                      the locale supplies nothing, and the panel treats '' as
                      «no block». Only config.texts.<lang>.extraText fills it. */
    'extraTitle', 'extraText',
    /* SPEC V1.18.1 §1.2 — the word for a session cookie. A plain string, so it
       belongs here; its companion `expiryDays` is an ARRAY of plural forms and
       belongs in PLURAL_KEYS below, for the same reason svcCount does. */
    'expirySession'
  ];

  // Plural-form keys, filled separately from STR_KEYS (see above).
  var PLURAL_KEYS = ['svcCount', 'ckCount', 'expiryDays'];

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

  /* SPEC V1.25 §1 — «'mo' → ro в обоих путях».

     'mo' is the legacy Moldovan tag, retired from BCP 47 in favour of 'ro' but
     still sent by some browsers and still written into `<html lang>` by some
     Moldovan sites. It is NORMALISED before the lookup rather than returned
     outright: a build that bundles no Romanian then falls through to the next
     source, instead of naming a locale the table does not carry. pluralIndex()
     below already treats mo as ro, so this only makes the two agree. */
  var LANG_ALIAS = { mo: 'ro' };

  // One lookup: exact lowercase match -> first two letters (pt-BR -> pt) ->
  // nothing. Returns '' rather than 'en' so the caller can tell «this source
  // had no usable language» from «this source said English», which is the
  // whole difference between the two steps of 'page' below.
  function matchLang(raw, table) {
    var code = String(raw || '').toLowerCase();
    if (!code) return '';
    if (LANG_ALIAS[code]) code = LANG_ALIAS[code];
    if (table[code]) return code;
    var short = code.slice(0, 2);
    if (LANG_ALIAS[short]) short = LANG_ALIAS[short];
    if (table[short]) return short;
    return '';
  }

  /* SPEC V1.25 §1 — the first path segment, when it names a language.

     `/ru/`, `/ro`, `/en/about` — the single most common way a site without a
     CMS does multilingual, and (0.5.24) the reason 'page' failed on a real
     client site: a bare `<html>` with no `lang` at all, one Russian and one
     Romanian page, distinguished ONLY by the path.

     Why the segment is not simply handed to matchLang(): that function falls
     back to the first two letters, so `/ruby/` would resolve to ru and
     `/engineering/` to en — a blog category silently deciding the banner's
     language. So the segment is accepted only when it is a plain two-letter
     code, or when the table carries it verbatim (`pt-br`). Everything that
     passes that gate still goes THROUGH matchLang, so 'mo' becomes ro and a
     two-letter code with no locale ('xx') is no answer and falls to the next
     source rather than to English. */
  var PATH_SEG_RE = /^[a-z]{2}$/;
  function pathLangSeg(path, table) {
    var raw = String(path || '');
    // The first non-empty segment, query and hash already excluded by
    // location.pathname; split copes with '', '/' and '//ru/' alike.
    var parts = raw.split('/');
    var seg = '';
    for (var i = 0; i < parts.length; i++) {
      if (parts[i]) { seg = parts[i].toLowerCase(); break; }
    }
    if (!seg) return '';
    if (!PATH_SEG_RE.test(seg) && !table[seg]) return '';
    return matchLang(seg, table);
  }

  /* SPEC V1.25 §1 — `<meta property="og:locale" content="ro_RO">`.

     The one language declaration a CMS-less site usually DOES carry, because
     Facebook asks for it: underscore-separated, so it is normalised to the
     BCP 47 hyphen before the lookup and then resolves through matchLang's own
     two-letter fallback (ro_RO -> ro-ro -> ro). */
  function ogLangTag(ogLocale, table) {
    var raw = String(ogLocale || '').replace(/_/g, '-');
    return matchLang(raw, table);
  }

  /* SPEC V1.25 §1 — three modes, and the reason there are three rather than two.

     'auto'  — navigator.language, exactly as since 0.1. It deliberately does
               NOT look at any page signal, and that is not an oversight: on
               builder-made sites `<html lang>` is routinely wrong (Tilda writes
               one template `lang` onto every page, so a Romanian page announces
               itself as Russian). Teaching `auto` to read the page would
               silently change the language on every site already running —
               including the ones that are correct today — so `auto` keeps its
               meaning.
     'page'  — the PAGE decides, through four sources in falling order of how
               deliberate they are (0.5.24):

                 1. `<html lang>`      — the explicit declaration, always wins
                 2. the first path segment, when it names a language — `/ro/`
                 3. `<meta property="og:locale">` — `ro_RO` -> ro
                 4. navigator.language
                 5. en

               Steps 2 and 3 exist because 0.5.21's two-step order fell straight
               through to the browser on a site whose pages switch language by
               path and carry no `lang` attribute at all: a Russian browser got
               a Russian banner on the Romanian page, which is the exact bug
               'page' was introduced to prevent.

               EVERY step goes through matchLang, so a source naming a language
               this build has no locale for is no answer at all and falls to the
               NEXT source — never straight to English. That is the whole reason
               matchLang returns '' rather than 'en'.
     a code  — that language, always.

     `signals` is an object — `{ docLang, path, ogLocale, navLang }` — rather
     than four positional arguments, and deliberately so: this file already
     carries a note about `docLang` being APPENDED rather than inserted because
     positional call sites silently reinterpret when an argument moves. Four
     more slots would make that trap four times as likely; a named bag cannot be
     passed in the wrong order. The rule stays pure — the call sites read
     document/navigator/location and pass them in.

     The 2-argument call is still supported and still reads the globals itself,
     because ck-debug.js calls resolveLang(cfg.language, table) from langRow and
     textsRow and must resolve 'page' exactly the way the banner did.

     Note for the server: 'page' sent to a client older than 0.5.21 is not
     recognised as a mode, is treated as a language code, matches no locale and
     therefore renders en. That is handled by pinning the version server-side
     (§2); nothing here can detect it. */
  function resolveLang(cfgLang, table, signals) {
    var mode = String(cfgLang == null ? '' : cfgLang).toLowerCase();

    // 'auto' and a fixed code read no page signal at all, so the globals are
    // not even touched for them.
    if (!mode || mode === 'auto') {
      var navOnly = (arguments.length > 2 && signals) ? signals.navLang : navLangNow();
      return matchLang(navOnly, table) || 'en';
    }
    if (mode !== 'page') {
      return matchLang(mode, table) || 'en';
    }

    var s = (arguments.length > 2 && signals) ? signals : pageSignals();
    return matchLang(s.docLang, table)
      || pathLangSeg(s.path, table)
      || ogLangTag(s.ogLocale, table)
      || matchLang(s.navLang, table)
      || 'en';
  }

  // The globals resolveLang() needs, read HERE rather than inside it, so the
  // rule itself stays pure. Each is wrapped: `document.documentElement` is
  // absent in a worker, `navigator.language` throws in a few hardened
  // embeddings, and none of it is worth losing the banner over.
  function docLangNow() {
    try {
      return (typeof document !== 'undefined' && document.documentElement &&
        document.documentElement.lang) || '';
    } catch (e) { return ''; }
  }
  function navLangNow() {
    try {
      return (typeof navigator !== 'undefined' &&
        (navigator.language || navigator.userLanguage)) || '';
    } catch (e) { return ''; }
  }
  function pathNow() {
    try {
      return (typeof location !== 'undefined' && location.pathname) || '';
    } catch (e) { return ''; }
  }
  /* The og:locale meta, read at resolve time rather than cached: a SPA can
     rewrite it on a route change, and this is read once per mount anyway.
     querySelector rather than a loop over document.getElementsByTagName so the
     property/content pair is matched by the engine; `property` is the Open
     Graph spelling (`name` is the HTML one and some CMSs emit that instead, so
     both are accepted). */
  function ogLocaleNow() {
    try {
      if (typeof document === 'undefined' || !document.querySelector) return '';
      var m = document.querySelector('meta[property="og:locale"]') ||
        document.querySelector('meta[name="og:locale"]');
      return (m && (m.content || m.getAttribute('content'))) || '';
    } catch (e) { return ''; }
  }
  // The four page signals in one object, so resolveLang's caller and its own
  // default read exactly the same set.
  function pageSignals() {
    return {
      docLang: docLangNow(),
      path: pathNow(),
      ogLocale: ogLocaleNow(),
      navLang: navLangNow()
    };
  }
  // The config-reading resolve, in one place: all call sites (signature(),
  // mount() and the 'page'-mode observer) must read the same sources, or the
  // banner could remount in a language the signature never noticed changing.
  function resolveCfgLang(cfg, table) {
    return resolveLang(cfg && cfg.language, table, pageSignals());
  }

  /* SPEC V1.12 §3 — plural forms.

     Validated as a WHOLE: an array of at least one non-empty string, or null.
     A locale that supplies `['{n} сервис']` alone is honest — it says «this
     language has one form» — and plural() below simply always picks it. */
  function pluralForms(v) {
    if (!v || !Array.isArray(v) || !v.length) return null;
    var out = [];
    for (var i = 0; i < v.length && i < 3; i++) {
      if (typeof v[i] !== 'string' || !v[i]) return null;
      out.push(v[i]);
    }
    return out;
  }

  /* Picks the form for `n` and substitutes it in.

     Three families, chosen by the language code rather than by
     Intl.PluralRules: Intl is present in every browser this client supports,
     but its category NAMES ('one'|'few'|'many'|'other') vary per language, and
     mapping them onto a positional array is more code and more failure modes
     than the two rules that actually matter here.

       ru/uk/sr/hr/…  1, 21, 31 -> [0];  2-4, 22-24 -> [1];  0, 5-20 -> [2]
       ro             1 -> [0];  0 and 2-19 -> [1];  20+ -> [2] («20 de servicii»)
       everything else  1 -> [0];  otherwise -> [1]

     A locale with fewer forms than the rule asks for clamps to its last one, so
     a single-form array can never index past its end. */
  var SLAVIC_PLURAL = { ru: 1, uk: 1, sr: 1, hr: 1, cs: 1, sk: 1, pl: 1, be: 1, bs: 1 };

  function pluralIndex(lang, n) {
    var code = String(lang || 'en').slice(0, 2).toLowerCase();
    var mod10 = n % 10, mod100 = n % 100;
    if (SLAVIC_PLURAL[code]) {
      if (mod10 === 1 && mod100 !== 11) return 0;
      if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return 1;
      return 2;
    }
    if (code === 'ro' || code === 'mo') {
      if (n === 1) return 0;
      if (n === 0 || (mod100 >= 1 && mod100 <= 19)) return 1;
      return 2;
    }
    return n === 1 ? 0 : 1;
  }

  function plural(forms, n, lang) {
    var list = pluralForms(forms) || ['{n}'];
    var idx = pluralIndex(lang, n);
    if (idx >= list.length) idx = list.length - 1;
    return list[idx].replace('{n}', String(n));
  }

  /* SPEC V1.16 §1.1 — per-language dictionary overrides from the CONFIG.

     `config.texts` is a mixed bag: it has carried `policyUrl`, `detailsAction`,
     `declarationUrl` and `cabinetUrl` since 0.5.0, and 0.5.15 adds `links`. So a
     key is a language dictionary only when it LOOKS like a language tag — that
     regex is the whole separation, and it is why no future scalar setting under
     `texts` can ever be mistaken for one (none of them is two letters).

     Own properties only, and the value must be a plain object: `texts` is
     author-supplied JSON that may have been merged over a prototype, and
     reading an inherited key would hand the merge below a function. */
  var LANG_KEY_RE = /^[a-z]{2}(-[a-z]{2})?$/;

  function configTexts(cfg, code) {
    var texts = (cfg && cfg.texts && typeof cfg.texts === 'object' && !Array.isArray(cfg.texts))
      ? cfg.texts : null;
    if (!texts) return null;
    var k = String(code || '').toLowerCase();
    if (!LANG_KEY_RE.test(k)) return null;
    if (!Object.prototype.hasOwnProperty.call(texts, k)) return null;
    var v = texts[k];
    return (v && typeof v === 'object' && !Array.isArray(v)) ? v : null;
  }

  /* The keys an override may reach. A WHITELIST, not «whatever the object
     carries»: an operator writing their own banner copy has no business
     rewriting «Принять всё» (the button labels are what a visitor recognises
     across sites) or the plural tables (an array here would break plural()).
     `cat.<name>.title/desc` is handled separately below, one level deeper. */
  var OVERRIDE_KEYS = [
    'bannerTitle', 'bannerText', 'panelTitle', 'panelIntro', 'extraTitle', 'extraText'
  ];

  // A non-empty string wins; empty or missing falls through to the layer below.
  // That is what makes an empty field in the cabinet mean «take the dictionary»
  // rather than «render nothing».
  function pickOverride(src, key) {
    if (!src) return null;
    if (!Object.prototype.hasOwnProperty.call(src, key)) return null;
    var v = src[key];
    return (typeof v === 'string' && v) ? v : null;
  }

  /* Deep two-level fill from en: a partial locale must never yield undefined,
     which would render the literal string "undefined".

     Three layers as of 0.5.15: builtin DICT <- window.__ckLocales (both already
     folded into `table`) <- config.texts[lang]. `cfg` is OPTIONAL on purpose —
     placeholderText() and the cabinet's own calls ask for the plain dictionary,
     and an absent third argument must build exactly what 0.5.14 built. */
  function buildStrings(lang, table, cfg) {
    var src = table[lang] || {};
    var base = DICT.en;
    var out = {};
    var i, c;

    /* Exact code first, then the two-letter base of the RESOLVED language:
       a banner that resolved to `pt-br` takes `texts['pt-br']` over
       `texts['pt']`, and a site that only wrote `texts.pt` still reaches it.
       Same shape as resolveLang(), so the override follows the banner. */
    var code = String(lang || '').toLowerCase();
    var ov = configTexts(cfg, code);
    var ovBase = (code.length > 2) ? configTexts(cfg, code.slice(0, 2)) : null;

    function override(key) {
      return pickOverride(ov, key) || pickOverride(ovBase, key);
    }

    for (i = 0; i < STR_KEYS.length; i++) {
      var k = STR_KEYS[i];
      out[k] = (typeof src[k] === 'string' && src[k]) ? src[k] : base[k];
    }
    /* SPEC V1.12 §3 — plural forms. An array of 1..3 strings, taken from the
       locale only when it is a non-empty array of strings; anything else falls
       back to English wholesale rather than per-slot, because a half-filled
       plural table produces «2 services» inside a Russian sentence. */
    for (i = 0; i < PLURAL_KEYS.length; i++) {
      var pk = PLURAL_KEYS[i];
      out[pk] = pluralForms(src[pk]) || base[pk].slice();
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

    /* SPEC V1.16 §1.1 — the config layer, applied LAST so it wins over both the
       builtin dictionary and __ckLocales. Only the whitelisted keys, and only
       non-empty strings: an override that is absent, empty or not a string
       leaves whatever the two lower layers produced.

       Nothing here is ever treated as HTML. These strings go through el()'s
       textContent and (for extraText) renderRich(), which builds nodes with
       createElement/createTextNode — an author who writes «<b>» sees the
       characters «<b>», which is the contract the server's validator mirrors. */
    if (ov || ovBase) {
      for (i = 0; i < OVERRIDE_KEYS.length; i++) {
        var ok = OVERRIDE_KEYS[i];
        var hit = override(ok);
        if (hit) out[ok] = hit;
      }
      // cat.<name>.title / cat.<name>.desc, one level deeper. Read from a
      // `cat` object on the override, with the same exact-then-base chain.
      var ovCat = (ov && ov.cat && typeof ov.cat === 'object') ? ov.cat : null;
      var ovBaseCat = (ovBase && ovBase.cat && typeof ovBase.cat === 'object') ? ovBase.cat : null;
      for (i = 0; i < ALL_CATS.length; i++) {
        c = ALL_CATS[i];
        var oe = (ovCat && ovCat[c] && typeof ovCat[c] === 'object') ? ovCat[c] : null;
        var obe = (ovBaseCat && ovBaseCat[c] && typeof ovBaseCat[c] === 'object') ? ovBaseCat[c] : null;
        var t = pickOverride(oe, 'title') || pickOverride(obe, 'title');
        var d = pickOverride(oe, 'desc') || pickOverride(obe, 'desc');
        if (t) out.cat[c].title = t;
        if (d) out.cat[c].desc = d;
      }
    }
    return out;
  }

  /* ------------------------------------------ rich text (SPEC V1.16 §1.2) */

  /* The tiny markup subset the «Дополнительно» block accepts. It exists because
     an operator block is genuinely structured text — two or three paragraphs, a
     bold e-mail address, a link to the supervisory authority — and because the
     alternative (accepting HTML) would mean sanitising author HTML in the
     browser, which is a class of bug we are not going to own.

     THE RULES, in the order they are applied. The server's validator mirrors
     this exactly, so the order is part of the contract, not an implementation
     detail:

       1. A blank line (two newlines, any surrounding spaces) splits paragraphs.
          Each paragraph becomes one <p>.
       2. Inside a paragraph, a single newline becomes <br>.
       3. LINKS ARE TOKENISED FIRST, before anything else looks at the text:
            [label](URL)   with URL http(s):// or mailto:
            a bare https?:// URL
            a bare e-mail address
          Link-first is not a preference — it is what stops the bare-URL rule
          from eating the address inside «[Центр](https://datepersonale.md)»
          and stops the bare-e-mail rule from firing inside a mailto: label.
       4. `**bold**` is applied only to the TEXT RUNS BETWEEN links. So bold does
          not nest inside a link label and a link does not appear inside bold —
          one pass, no nesting, nothing recursive to get wrong.
       5. Any other URL scheme in [label](…) — javascript:, data:, file: — is
          NOT a link. The WHOLE literal «[label](javascript:…)» is rendered as
          plain text: visibly wrong to whoever wrote it, rather than silently
          dropping the address and leaving a label that looks like a link.
       6. There is no HTML. «<b>» is five characters of text, always.

     Returns an ARRAY of nodes, so the caller decides where they go. Pure apart
     from document.createElement, which is what makes «no innerHTML» mechanical
     rather than a promise. */

  // [label](url) — the label may not contain brackets, the url may not contain
  // whitespace or a closing paren. Deliberately strict: an address that needs
  // an escaped paren is an address that belongs in a plain bare-URL run.
  var MD_LINK_RE = /\[([^\]\[]+)\]\(([^()\s]+)\)/;
  var BARE_URL_RE = /https?:\/\/[^\s<>()\[\]"']+[^\s<>()\[\]"'.,;:!?]/;
  // Simple on purpose: an address that this misses renders as plain text, which
  // is a worse link, not a security hole. Anything clever here is a false
  // positive waiting to turn a sentence into a mailto:.
  var BARE_MAIL_RE = /[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)+/;

  // http(s) for an outbound link, mailto: for an address. Everything else is
  // refused — a javascript: or data: URL in a control the visitor is invited to
  // click is the XSS vector resolveDetails() already refuses for policyUrl.
  function richHref(url) {
    var u = str(url);
    if (!u) return null;
    if (/^https?:\/\//i.test(u)) return u;
    if (/^mailto:[^\s]+@[^\s]+$/i.test(u)) return u;
    return null;
  }

  function richLink(label, href) {
    var a = el('a', 'ck-rich__link', label);
    a.href = href;
    a.target = '_blank';
    a.rel = 'noopener';
    return a;
  }

  /* `**bold**` over a plain run. Non-greedy and never across a newline, so an
     unclosed «**» is two literal asterisks rather than a bold tail that
     swallows the rest of the paragraph. */
  var BOLD_RE = /\*\*([^*\n]+)\*\*/;

  /* PASS 3 — bare addresses inside one run of plain text. Runs LAST, on text
     that no longer contains any [label](url), so it cannot reach inside one. */
  function richBare(text, out) {
    var rest = String(text);
    while (rest) {
      var url = BARE_URL_RE.exec(rest);
      var mail = BARE_MAIL_RE.exec(rest);
      // Whichever address starts first. A URL wins a tie: «https://a@b.md» is
      // an address with a userinfo part, not an e-mail sitting after a scheme.
      var m = null, isMail = false;
      if (url) { m = url; }
      if (mail && (!m || mail.index < m.index)) { m = mail; isMail = true; }
      if (!m) { out.push(document.createTextNode(rest)); return; }
      if (m.index > 0) out.push(document.createTextNode(rest.slice(0, m.index)));
      out.push(richLink(m[0], isMail ? ('mailto:' + m[0]) : m[0]));
      rest = rest.slice(m.index + m[0].length);
    }
  }

  /* PASS 2 — `**bold**` over one run of text, then PASS 3 inside each half.

     Bold has to come BEFORE the bare-address rules, not after: «**mail@x.md**»
     is one bold run containing an address, and a pass that linked the address
     first would split the run in three and leave BOLD_RE looking at «**» and
     «**» separately — the asterisks would survive on screen. That is the whole
     reason these are three ordered passes rather than one left-to-right walk. */
  function richBold(text, out) {
    var rest = String(text);
    var m;
    while ((m = BOLD_RE.exec(rest))) {
      if (m.index > 0) richBare(rest.slice(0, m.index), out);
      var strong = el('strong', null);
      var inner = [];
      richBare(m[1], inner);            // an address inside bold is still a link
      for (var i = 0; i < inner.length; i++) strong.appendChild(inner[i]);
      out.push(strong);
      rest = rest.slice(m.index + m[0].length);
    }
    if (rest) richBare(rest, out);
  }

  /* PASS 1 — one line of a paragraph -> nodes.

     `[label](url)` is tokenised first and its pieces never reach passes 2 and 3:
     that is what stops the bare-URL rule from eating the address inside the
     parens, stops the bare-e-mail rule from firing inside a mailto: label, and
     leaves a label's own «**» literal (rule 4 of the contract). The text
     BETWEEN markdown links goes through richBold(), which then runs richBare()
     inside and outside each bold span. */
  function richLine(line, out) {
    var rest = String(line);
    var m;
    while ((m = MD_LINK_RE.exec(rest))) {
      if (m.index > 0) richBold(rest.slice(0, m.index), out);
      var href = richHref(m[2]);
      // Rule 5: a refused scheme is the whole literal, verbatim and unbolded,
      // so «[x](javascript:alert(1))» reads as exactly what was written.
      if (href) out.push(richLink(m[1], href));
      else out.push(document.createTextNode(m[0]));
      rest = rest.slice(m.index + m[0].length);
    }
    if (rest) richBold(rest, out);
  }

  /* text -> array of <p> nodes. Empty (or non-string) input gives an empty
     array, which is what lets the caller say «no text, no block» by asking for
     the length rather than by re-testing the string. */
  function renderRich(text) {
    var s = (typeof text === 'string') ? text : '';
    if (!s.trim()) return [];
    // \r\n and \r normalised first: a value pasted from Windows or copied out of
    // a textarea must split into the same paragraphs as one typed here.
    var paras = s.replace(/\r\n?/g, '\n').split(/\n[ \t]*\n+/);
    var out = [];
    for (var i = 0; i < paras.length; i++) {
      var para = paras[i].replace(/^\n+|\n+$/g, '');
      if (!para.trim()) continue;
      var p = el('p', 'ck-rich__p');
      var lines = para.split('\n');
      for (var j = 0; j < lines.length; j++) {
        if (j > 0) p.appendChild(el('br'));       // rule 2: a single newline
        var nodes = [];
        richLine(lines[j], nodes);
        for (var k = 0; k < nodes.length; k++) p.appendChild(nodes[k]);
      }
      out.push(p);
    }
    return out;
  }

  /* ------------------------------------------ banner links (SPEC V1.16 §1.3) */

  /* `texts.links` — up to three of the operator's own addresses, rendered under
     the banner buttons and at the foot of the settings panel. The obvious pair
     is «Политика конфиденциальности» and «Политика cookie», which a Moldovan
     site is required to publish and which have nowhere else to go on the card.

     Deliberately NOT tangled with `detailsAction`: «Подробнее» keeps doing
     exactly what it did in 0.5.14, because a site that gains a link row must
     not silently lose the link it already had.

     A row is skipped, never faked, when its address is not http(s) or when no
     label resolves for the banner's language — a link with no words on it is
     not a link. The cap is applied to the SURVIVORS: one malformed row must not
     cost a good one its place. */
  function linkLabel(labels, lang) {
    if (!labels || typeof labels !== 'object' || Array.isArray(labels)) return null;
    var code = (typeof lang === 'string') ? lang.toLowerCase() : '';
    // Own properties only, exactly as branding's pickPoweredByText does it and
    // for the same reason: `labels` is author-supplied JSON, and an inherited
    // key would hand str() a function instead of a missing line.
    function own(k) {
      return (k && Object.prototype.hasOwnProperty.call(labels, k)) ? str(labels[k]) : null;
    }
    var hit = own(code);
    if (!hit && code.length > 2) hit = own(code.slice(0, 2));       // ru-RU -> ru
    return hit || own('en');
  }

  /* ------------------------------------------- cookie rows (SPEC V1.18.1 §1) */

  /* §1.1 — `cookieTable[].purpose` as `{ ru?, ro?, en?, <lang>? }`.

     The reason this exists: before 0.5.16 a purpose was ONE string, and the
     server's scanner wrote it in Russian. A Romanian visitor to a Moldovan
     shop therefore read a Russian sentence in the «Pentru ce» column. The
     object form lets the server ship all three at once and the banner pick.

     Deliberately its OWN function rather than a call into linkLabel():

       - linkLabel() stops at `en` and returns null, and that null is load-
         bearing there — §1.3 SKIPS a link with no label for this language,
         because a link with no words on it is not a link. A cookie row is not
         skippable: the visitor is being told which cookies the site sets, and
         dropping the row because the purpose is only in German would hide the
         cookie itself. So this chain has a fourth step — FIRST NON-EMPTY —
         and shows the operator's own words in whatever language they exist,
         which is more honest than an empty cell.

       - servicePurpose() is a third chain again (base code only, then en) and
         is about a SERVICE's description, not a cookie row. Left alone.

     Own properties only, same reason as everywhere else in this file: `purpose`
     is author-supplied JSON that may have been merged over a prototype, and an
     inherited key would hand str() a function instead of a missing line.

     Returns '' — never null — for absent, malformed (a number, an array, a
     string of spaces) or empty-in-every-language input, so the one caller has
     one thing to test. The RENDERER decides what an empty cell looks like. */
  function cookiePurpose(purpose, lang) {
    if (typeof purpose === 'string') return str(purpose) || '';
    if (!purpose || typeof purpose !== 'object' || Array.isArray(purpose)) return '';
    var code = (typeof lang === 'string') ? lang.toLowerCase() : '';

    function own(k) {
      return (k && Object.prototype.hasOwnProperty.call(purpose, k)) ? str(purpose[k]) : null;
    }

    var hit = own(code);
    if (!hit && code.length > 2) hit = own(code.slice(0, 2));       // pt-br -> pt
    if (!hit) hit = own('en');
    if (hit) return hit;

    /* Last resort: the first language the object actually carries. Key order is
       insertion order for the string keys the server writes, so this is stable
       for a given config rather than arbitrary. */
    for (var k in purpose) {
      if (!Object.prototype.hasOwnProperty.call(purpose, k)) continue;
      var v = str(purpose[k]);
      if (v) return v;
    }
    return '';
  }

  /* §1.2 — the «Expires» cell.

     `expiryDays` is a NUMBER of days, so the cell is WRITTEN here in the
     banner's language rather than quoted from a config string the scanner
     filled in Russian. The contract, in precedence order:

       null | 0        -> T.expirySession   («сессия» / «sesiune» / «session»)
       integer > 0     -> plural(T.expiryDays, n, lang)
       absent          -> the legacy `expiry` string, exactly as 0.5.15 rendered it
       anything else   -> treated as absent

     The last line is the defensive one. The server validates «целое ≥ 0 или
     null» (§2.1), so a negative, fractional, NaN or non-numeric value can only
     arrive from a hand-written config — and falling through to `expiry` shows
     the operator's own words instead of «-3 дн.» or «NaN дн.».

     `expiryDays` WINS over `expiry` when both are present, which is the live
     migration case: §2.2 has the server keep writing `expiry` as a ru string
     for older clients inlined in WordPress, so from 0.5.16 on every row will
     carry both and the localised one must be the one that shows.

     Returns '' when there is nothing to say, like cookiePurpose(). */
  function cookieExpiry(row, T2, lang) {
    if (!row || typeof row !== 'object') return '';
    var d = row.expiryDays;
    if (d === null) return (T2 && T2.expirySession) || '';
    if (typeof d === 'number' && isFinite(d) && Math.floor(d) === d && d >= 0) {
      if (d === 0) return (T2 && T2.expirySession) || '';
      return plural(T2 && T2.expiryDays, d, lang);
    }
    return str(row.expiry) || '';
  }

  var MAX_LINKS = 3;

  function resolveLinks(cfg, lang) {
    var texts = (cfg && cfg.texts && typeof cfg.texts === 'object') ? cfg.texts : null;
    var list = texts && texts.links;
    if (!list || !Array.isArray(list)) return [];
    var out = [];
    for (var i = 0; i < list.length && out.length < MAX_LINKS; i++) {
      var row = list[i];
      if (!row || typeof row !== 'object') continue;
      var url = str(row.url);
      if (!url || !/^https?:\/\//i.test(url)) continue;
      var label = linkLabel(row.label, lang);
      if (!label) continue;
      out.push({ id: str(row.id) || ('link' + i), url: url, label: label });
    }
    return out;
  }

  /* SPEC V1.16 §1.3, last sentence — the one place where the link row DOES
     touch «Подробнее»: when the address it would send the visitor to is
     already one of the rows under the buttons, the banner shows the same
     address twice. The second copy is not more information, it is noise, so
     the in-text link is dropped and the banner renders as `detailsAction:
     'hide'` for that render — the link row keeps the address, with a label the
     operator wrote, which is the better of the two.

     Only 'policy' and 'declaration' can duplicate anything: 'settings' opens
     the panel and has no address to collide with, and 'hide' is already gone.

     Comparison is deliberately narrow. Trimming and a trailing slash are
     typography, not identity — `https://shop.md/cookies` and
     `…/cookies/` are the same page — and so is the case of the HOST, which
     DNS does not distinguish. The PATH is left alone: `/Cookies` and
     `/cookies` are genuinely two addresses on a case-sensitive server, and
     suppressing a real «Подробнее» link over that guess is the worse error. */
  function normHref(v) {
    var s = str(v);
    if (!s) return null;
    var m = /^(https?:\/\/[^\/?#]*)([\s\S]*)$/i.exec(s);
    if (!m) return null;
    return (m[1].toLowerCase() + m[2]).replace(/\/$/, '');
  }

  function detailsDuplicatesLink(details, links) {
    if (!details) return false;
    if (details.kind !== 'policy' && details.kind !== 'declaration') return false;
    var href = normHref(details.href);
    if (!href || !links || !Array.isArray(links)) return false;
    for (var i = 0; i < links.length; i++) {
      if (links[i] && normHref(links[i].url) === href) return true;
    }
    return false;
  }

  /* Which of the three shapes the banner will actually draw, duplicate rule
     applied — so buildBanner() and signature() cannot disagree about it.
     `lang` is the code the banner resolved to; signature() passes the config's
     own so both sides of a comparison are read in the same language. */
  function detailsKind(cfg, lang) {
    var det = resolveDetails(cfg);
    var code = (typeof lang === 'string' && lang) ? lang :
      resolveCfgLang(cfg, localeTable());
    return detailsDuplicatesLink(det, resolveLinks(cfg, code)) ? 'hide' : det.kind;
  }

  // The row itself, or null when there is nothing to draw — so both call sites
  // (banner and panel) are one `if` rather than two.
  function buildLinksRow(cfg, cls) {
    var links = resolveLinks(cfg, LANG);
    if (!links.length) return null;
    var row = el('div', 'ck-links' + (cls ? ' ' + cls : ''));
    for (var i = 0; i < links.length; i++) {
      var a = el('a', 'ck-links__a', links[i].label);
      a.href = links[i].url;
      a.target = '_blank';
      a.rel = 'noopener';
      row.appendChild(a);
    }
    return row;
  }

  /* ------------------------------------------- blocked-embed placeholder (§2) */

  /* The one piece of the placeholder that is worth testing without a DOM: which
     sentence a visitor reads. PURE — takes a host (or vendor label), a category
     name and a language, returns the finished string.

     `host` is used verbatim: the core has no vendor-label table (only the SaaS
     scanner's VENDOR_DB does, server-side), so §2's «ярлык хоста; без ярлыка —
     содержимое с <host>» collapses to the host here. When a label lookup is
     added to the core later, this signature already accepts it — pass the label
     instead of the host and nothing else changes.

     The category name is resolved through the SAME buildStrings() the panel
     uses, so «Маркетинг» in the placeholder is «Маркетинг» on the switch. An
     unknown language falls back to en, an unknown category to marketing — the
     category a strict-mode interception is filed under. */
  /* SPEC V1.12 §3 — «заглушки iframe — по сервису».

     `subject` names what the visitor has to agree to for this frame to appear.
     Left out, it is the category, exactly as in 0.5.7. Passed, it is the
     SERVICE name — which is the only honest sentence in the state this wave
     introduces: analytics granted, one service refused, the frame still held.
     Naming the category there would read «загрузится после согласия на
     "Аналитика"» to a visitor who has already agreed to analytics. */
  function placeholderText(host, category, lang, subject) {
    var table = localeTable();
    var T2 = buildStrings(resolveLang(lang, table), table);
    var cat = (category && T2.cat[category]) ? category : 'marketing';
    var name = String(host || '').trim();
    var label = (typeof subject === 'string' && subject.trim())
      ? subject.trim() : T2.cat[cat].title;
    return T2.phText
      .replace('{host}', name || T2.phLabel)
      .replace('{cat}', label);
  }

  /* Which service, if any, is what is actually holding this frame back? Null
     when the frame is held by its category alone — the ordinary 0.5.7 case. */
  function holdingService(src) {
    var ck = api();
    if (!ck || typeof ck._serviceForUrl !== 'function') return null;
    try {
      var svc = ck._serviceForUrl(src);
      if (!svc) return null;
      // Only when the SERVICE is the reason: with the category still denied the
      // category is the honest thing to name, because granting the service
      // alone would not bring the frame back.
      if (typeof ck.allowed === 'function' && !ck.allowed(svc.category)) return null;
      if (typeof ck.allowedService !== 'function') return null;
      return ck.allowedService(svc.id) ? null : svc;
    } catch (e) { return null; }
  }

  /* Hostname of a blocked frame's real address, for the sentence above. The
     data-src is whatever the page asked for, which may be protocol-relative or
     relative, so it is resolved against the page like the core does it. */
  function hostOf(src) {
    var s = String(src || '');
    try {
      var base = (typeof location !== 'undefined' && location.href) || 'http://localhost/';
      var h = new URL(s, base).hostname || '';
      return h.toLowerCase().replace(/^www\./, '');
    } catch (e) {
      var m = /^(?:[a-z]+:)?\/\/([^/?#]+)/i.exec(s);
      return m ? m[1].toLowerCase().replace(/:\d+$/, '').replace(/^www\./, '') : '';
    }
  }

  /* --------------------------------------------------------------- styles */

  var CSS = [
    ':host{all:initial}',
    '*,*::before,*::after{box-sizing:border-box}',
    /* Palette tokens live in a second, generated stylesheet (see buildThemeCss).
       They must NOT be inline host styles: an inline value outbeats every :host
       rule, which would make the dark media query and the forced-mode class dead. */
    /* font-FAMILY only, never the `font` shorthand: theme.font:'inherit' must
       take the host page's typeface without also taking its size, weight and
       line-height, which are what hold the fixed geometry together. */
    ':host{',
    'font-family:var(--ck-font);',
    'font-size:15px;line-height:1.5;color:var(--ck-ink);',
    '-webkit-font-smoothing:antialiased}',

    '.ck-hidden{display:none !important}',

    'button{font:inherit;color:inherit;margin:0;cursor:pointer}',
    /* --ck-link, not --ck-accent: every accent-coloured TEXT on the card goes
       through the same >= 4.5:1 rule the filled buttons' labels do. A brand
       accent picked to be legible as a BUTTON FILL (white text on it) can be
       far too pale to read as text ON the card — a yellow accent gives a
       perfectly good button and an invisible «Подробнее». --ck-accent stays
       the raw brand colour and is still what paints backgrounds (the switch)
       and the focus ring, which are non-text and answer to 3:1, not 4.5. */
    'a{color:var(--ck-link)}',
    /* «Подробнее» as a settings-opening button must read as the link it
       replaces, not as a third action button. */
    '.ck-linkbtn{background:none;border:0;padding:0;font:inherit;font-size:inherit;',
    'color:var(--ck-link);text-decoration:underline;cursor:pointer}',
    ':focus-visible{outline:2px solid var(--ck-accent);outline-offset:2px;border-radius:4px}',

    /* ---- banner ---- */
    '.ck-scrim{position:fixed;inset:0;background:rgba(16,20,30,.28);z-index:2147483000;pointer-events:none}',
    '.ck-banner{position:fixed;z-index:2147483001;background:var(--ck-bg);color:var(--ck-ink);',
    'border:1px solid var(--ck-line);border-radius:var(--ck-radius-card);pointer-events:auto}',
    '.ck-banner--bar{left:16px;right:16px;padding:18px 20px;',
    'display:flex;gap:20px;align-items:center;flex-wrap:wrap}',
    '.ck-banner--bar.ck-pos-bottom{bottom:16px}',
    '.ck-banner--bar.ck-pos-top{top:16px}',
    '.ck-banner--modal{top:50%;left:50%;transform:translate(-50%,-50%);',
    'width:min(560px,calc(100vw - 32px));max-height:calc(100vh - 32px);overflow:auto;padding:24px}',

    /* box: the SPEC V1.6 reference card — max 540 wide, 24px padding, corner
       anchored, no scrim. */
    '.ck-banner--box{width:min(540px,calc(100vw - 32px));max-height:calc(100vh - 32px);',
    'overflow:auto;padding:24px;display:block}',
    '.ck-banner--box.ck-pos-bottom-right{bottom:16px;right:16px}',
    '.ck-banner--box.ck-pos-bottom-left{bottom:16px;left:16px}',
    /* Vertical layouts: the copy ends with the "learn more" link, so the gap
       below it has to clear a text baseline, not just a block edge — 16px
       reads as attached to the buttons. */
    '.ck-banner.ck-banner--box p,.ck-banner.ck-banner--modal p{margin-bottom:22px}',
    /* Reference row: three equal buttons, 8px gap, wrapping to a column under
       560px (the media query below). Keyed off the ROLE classes, never the
       variant ones — since 0.5.0 `settings` may itself be filled. */
    '.ck-banner--box .ck-actions{display:flex;gap:8px;flex-wrap:wrap}',
    '.ck-banner--box .ck-btn{min-width:0;flex:1 1 0}',
    '.ck-banner__body{flex:1 1 320px;min-width:0}',
    '.ck-banner h2{margin:0 0 6px;font-size:17px;font-weight:600;letter-spacing:-.01em}',
    '.ck-banner p{margin:0;color:var(--ck-muted);font-size:14px}',
    /* Box overrides sit AFTER the generic .ck-banner rules on purpose: the two
       selectors have equal specificity, so source order is what decides, and
       placing these with the rest of the box block silently lost. The SPEC
       V1.6 reference calls for a 20/700 heading here. */
    '.ck-banner--box h2{font-size:20px;font-weight:700;margin:0 0 8px}',
    '.ck-banner--modal p{margin-bottom:20px}',
    '.ck-banner__more{white-space:nowrap}',

    /* ---- equal-weight action row ---- */
    '.ck-actions{display:flex;gap:10px;flex-wrap:wrap;flex:0 1 auto}',
    '.ck-banner--modal .ck-actions{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr))}',
    '.ck-btn{display:inline-flex;align-items:center;justify-content:center;text-align:center;',
    'min-width:150px;min-height:44px;padding:11px 18px;font-size:14px;font-weight:600;line-height:1.2;',
    'border-radius:var(--ck-radius-btn);border:1px solid transparent;background:transparent;flex:1 1 auto}',
    /* Role classes read their own resolved tokens, so filled/outline is a VALUE
       change, not a class swap — a theme.buttons edit restyles in place and
       needs no remount. box-sizing:border-box is global, so borderWidth:2 does
       not change the outer size: the equal-buttons invariant survives it. */
    '.ck-btn--accept{background:var(--ck-accept-bg);color:var(--ck-accept-fg);',
    'border-color:var(--ck-accept-bd);border-width:var(--ck-accept-bw)}',
    '.ck-btn--reject{background:var(--ck-reject-bg);color:var(--ck-reject-fg);',
    'border-color:var(--ck-reject-bd);border-width:var(--ck-reject-bw)}',
    '.ck-btn--settings{background:var(--ck-settings-bg);color:var(--ck-settings-fg);',
    'border-color:var(--ck-settings-bd);border-width:var(--ck-settings-bw)}',
    /* Unused by the UI since 0.5.11: the preferences panel's footer moved to
       the accept/settings role classes above, so it follows the banner. Kept
       as a compatibility shim for integrator CSS and older inline blocks that
       still name these classes — nothing in this file emits them any more. */
    '.ck-btn--filled{background:var(--ck-accent);border-color:var(--ck-accent);color:var(--ck-on-accent)}',
    '.ck-btn--outline{background:transparent;border-color:var(--ck-accent);color:var(--ck-link)}',
    '.ck-btn--ghost{min-width:0;border-color:var(--ck-line);color:var(--ck-ink);font-weight:500}',

    /* ---- panel ---- */
    '.ck-panel-scrim{position:fixed;inset:0;background:rgba(16,20,30,.34);z-index:2147483002;pointer-events:none}',
    '.ck-panel{position:fixed;z-index:2147483003;top:50%;left:50%;transform:translate(-50%,-50%);',
    'width:min(620px,calc(100vw - 32px));max-height:calc(100vh - 48px);',
    'display:flex;flex-direction:column;background:var(--ck-bg);color:var(--ck-ink);',
    'border:1px solid var(--ck-line);border-radius:var(--ck-radius-card);overflow:hidden}',
    '.ck-panel__head{display:flex;align-items:flex-start;gap:16px;padding:22px 24px 14px;',
    'border-bottom:1px solid var(--ck-line)}',
    // The text block takes the width and the close button sits at the padding
    // edge, flush with the switches below it: without flex:1 the button
    // followed the text's own wrapped width and floated short of the edge.
    '.ck-panel__head>div{flex:1 1 auto;min-width:0}',
    '.ck-panel__head h2{margin:0 0 4px;font-size:18px;font-weight:600;letter-spacing:-.01em}',
    '.ck-panel__head p{margin:0;font-size:14px;color:var(--ck-muted)}',
    '.ck-x{flex:none;margin-left:auto;width:36px;height:36px;border-radius:var(--ck-radius-btn);border:1px solid var(--ck-line);',
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
    /* SPEC V1.12 §3 — «N сервисов · M cookie». --ck-muted, like every other
       secondary label on the card, and it is measured for AA against the card
       background by the same rule the description above answers to. */
    /* 0.5.12 — the counter is now the group's disclosure BUTTON. It keeps the
       muted label's size and colour (it is still a secondary label, measured
       for AA against the card background by the same rule as the description),
       and gains a caret and a hit area. `border:0;background:transparent` is
       needed because the panel's reset styles buttons, not because a link is
       being faked — it is a real button and the global :focus-visible rule
       gives it a visible ring. */
    '.ck-cat__count{font-size:12px;font-weight:500;color:var(--ck-muted)}',
    '.ck-cat__toggle{border:0;background:transparent;padding:2px 0;cursor:pointer;',
    'display:inline-flex;align-items:center;gap:5px;font-family:inherit;text-align:left}',
    '.ck-cat__caret{width:0;height:0;flex:none;border:4px solid transparent;',
    'border-left-color:currentColor;border-right:0}',
    '.ck-cat__toggle[aria-expanded="true"] .ck-cat__caret{transform:rotate(90deg)}',

    /* ---- services inside a group (SPEC V1.12 §3, compacted in 0.5.12) ---- */
    /* Indented and rule-separated so the nesting reads without colour: a
       service belongs to the group above it, and its own cookie table belongs
       to it. The left border is the only decoration; everything else is
       spacing, which survives forced-colours mode intact. */
    '.ck-cat__region{margin-top:12px}',
    '.ck-svcs{padding-left:12px;border-left:2px solid var(--ck-line)}',
    '.ck-svc{padding:8px 0;border-bottom:1px solid var(--ck-line)}',
    '.ck-svc:first-child{padding-top:2px}',
    '.ck-svc:last-child{border-bottom:0;padding-bottom:2px}',
    /* One line: name, vendor, then the switch pinned to the right. `center`
       rather than flex-start, because the row is a single line of text now and
       the switch reads as belonging to it. */
    '.ck-svc__top{display:flex;gap:10px;align-items:center}',
    '.ck-svc__txt{flex:1 1 auto;min-width:0}',
    /* The name and the vendor share a line and WRAP rather than truncate: at
       320px a long «Google Analytics · Google Ireland Limited» becomes two
       lines and the switch stays where it is, still reachable. */
    '.ck-svc__name{display:flex;align-items:baseline;gap:6px;flex-wrap:wrap;',
    'font-size:14px;font-weight:600;line-height:1.35}',
    '.ck-svc__vendor{margin:0;font-size:12.5px;font-weight:400;color:var(--ck-muted)}',
    /* «всегда активны» on a necessary service's row, where its switch used to
       be: the same pill the group header wears, one step smaller. */
    '.ck-svc__badge{font-size:11px;font-weight:500;color:var(--ck-muted);',
    'border:1px solid var(--ck-line);border-radius:999px;padding:0 7px}',
    /* The row's own «Подробнее». Tighter than a group's <details> — it sits
       inside a row, not between two of them. */
    '.ck-svc__det{margin-top:2px}',
    '.ck-svc__det>summary{font-size:12.5px}',
    '.ck-svc__body{padding:2px 0 4px}',
    '.ck-svc__desc{margin:4px 0 0;font-size:13px;color:var(--ck-muted)}',
    /* --ck-link, not --ck-accent: accent-coloured TEXT goes through the same
       >= 4.5:1 rule as «Подробнее» — see the note on the `a{}` rule above. */
    '.ck-svc__policy{display:inline-block;margin-top:4px;font-size:12.5px;color:var(--ck-link)}',

    /* ---- «Дополнительно» card (SPEC V1.16 §1.2) ---- */
    /* A card, not another category row: it carries no switch and answers a
       different question — who the operator is and how to reach them. So it
       gets the soft fill and the rounded border the cookie table wears, which
       reads as «a panel of reference text» rather than «a fifth thing you can
       turn off».

       It is appended AFTER the categories, which means the last .ck-cat is no
       longer `:last-child` and keeps its bottom rule — that is wanted here: the
       rule is what separates the last category from this block. The rule below
       restores the old look for the category above it only in the sense that
       the separator now belongs to the boundary rather than to the group. */
    '.ck-extra{margin:16px 0 4px;padding:14px 16px;background:var(--ck-soft);',
    'border:1px solid var(--ck-line);border-radius:var(--ck-radius-card)}',
    '.ck-extra__title{margin:0 0 6px;font-size:15px;font-weight:600}',
    /* Same size and colour as .ck-cat__desc: this is secondary reference text,
       and it is measured for AA against the card by the same rule. */
    '.ck-extra__body p{margin:0 0 8px;font-size:13.5px;color:var(--ck-muted);line-height:1.5}',
    '.ck-extra__body p:last-child{margin-bottom:0}',
    /* --ck-link, not --ck-accent — accent-coloured TEXT answers to 4.5:1
       against the card; see the note on the `a{}` rule above. */
    '.ck-extra__body a{color:var(--ck-link)}',

    /* ---- link row under the buttons (SPEC V1.16 §1.3) ---- */
    /* One row, wrapping. `width:100%` matters in the bar layout, whose banner is
       a flex row: without it the row would try to sit BESIDE the buttons on a
       wide screen instead of under them. */
    '.ck-links{display:flex;gap:14px;flex-wrap:wrap;width:100%;margin-top:12px;font-size:13px}',
    '.ck-links__a{color:var(--ck-link)}',
    /* The panel foot is a flex row of buttons that each take `flex:1 1 150px`;
       a full-width row forced onto its own line keeps the links under the
       buttons rather than wedged between two of them. */
    '.ck-links--panel{flex-basis:100%;margin-top:2px}',

    /* ---- switch ---- */
    '.ck-switch{flex:none;width:46px;height:27px;padding:0;border-radius:999px;',
    'border:1px solid var(--ck-line);background:var(--ck-soft);position:relative}',
    '.ck-switch::after{content:"";position:absolute;top:2px;left:2px;width:21px;height:21px;',
    'border-radius:50%;background:var(--ck-bg);border:1px solid var(--ck-line)}',
    '.ck-switch[aria-checked="true"]{background:var(--ck-accent);border-color:var(--ck-accent)}',
    '.ck-switch[aria-checked="true"]::after{left:auto;right:2px;border-color:transparent}',
    '.ck-switch[disabled]{cursor:not-allowed;opacity:.55}',
    /* The service switch: the same control, smaller. Still 27px of vertical
       hit area at the row level and a real <button role="switch">, so the
       keyboard and screen-reader behaviour is identical to the group's. */
    '.ck-switch--sm{width:38px;height:22px}',
    '.ck-switch--sm::after{width:16px;height:16px}',

    /* ---- cookie table ---- */
    '.ck-det{margin-top:12px}',
    '.ck-det>summary{cursor:pointer;font-size:13px;color:var(--ck-link);',
    'list-style:none;display:inline-flex;align-items:center;gap:6px;padding:2px 0}',
    '.ck-det>summary::-webkit-details-marker{display:none}',
    '.ck-det>summary::before{content:"";width:0;height:0;border:4px solid transparent;',
    'border-left-color:currentColor;border-right:0}',
    '.ck-det[open]>summary::before{transform:rotate(90deg)}',
    '.ck-tablewrap{margin-top:8px;overflow-x:auto;border:1px solid var(--ck-line);border-radius:var(--ck-radius-card)}',
    'table{border-collapse:collapse;width:100%;font-size:13px;min-width:420px}',
    'th,td{text-align:left;padding:8px 10px;border-bottom:1px solid var(--ck-line);vertical-align:top}',
    'thead th{background:var(--ck-soft);font-weight:600;font-size:12px;color:var(--ck-muted);white-space:nowrap}',
    'tbody tr:last-child td{border-bottom:0}',
    'td.ck-mono{font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace}',
    '.ck-empty{margin:8px 0 0;font-size:13px;color:var(--ck-muted)}',

    /* ---- floating button ---- */
    /* 0.5.11 — the floating button wears the ACCEPT button's colours, so the
       one control that outlives the banner still reads as the owner's brand.
       Both tokens are resolved once in resolveButtonStyles (`fab`) and only
       read here — «один код — одни числа». */
    '.ck-fab{position:fixed;left:16px;bottom:16px;z-index:2147482999;width:48px;height:48px;',
    'border-radius:50%;border:1px solid var(--ck-line);background:var(--ck-fab-bg);color:var(--ck-fab-fg);',
    'display:inline-flex;align-items:center;justify-content:center;padding:0}',
    '.ck-fab svg{width:24px;height:24px;display:block}',

    '@media (max-width:560px){',
    '.ck-banner--bar{left:8px;right:8px;bottom:8px;padding:16px}',
    '.ck-actions{width:100%}.ck-btn{min-width:0;flex:1 1 100%}',
    '.ck-banner.ck-banner--bar p{margin-bottom:22px}',
    '.ck-banner--bar{flex-direction:column;align-items:stretch}',
    '.ck-banner--bar .ck-banner__body{display:contents}',
    '.ck-banner--bar .ck-banner__body>*{order:1}',
    '.ck-banner--bar .ck-actions{order:2}',
    // SPEC V1.16 §1.3 — the link row is `order:3` so it stays under the buttons
    // in the bar's mobile column, where every child's position is explicit.
    '.ck-banner--bar .ck-links{order:3}',
    /* Reference: the box's button row becomes a column under 560px. */
    '.ck-banner--box .ck-actions{flex-direction:column}',
    '.ck-banner--box .ck-btn{flex:1 1 auto;width:100%}}',

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

  /* LANG travels with T: an extension that renders language-dependent text of
     its own (branding.poweredBy.texts) needs the code the banner resolved to,
     which only this file knows — the config may say 'auto' and the answer then
     comes from the visitor's browser at mount time. */
  function extHost() {
    return { el: el, str: str, T: T, lang: LANG };
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
  var LANG = 'en';             // the code T was built from, reassigned per mount
  var nodes = {};              // banner/panel/fab refs
  var switches = {};           // category -> button
  var serviceSwitches = {};    // category -> [button], SPEC V1.12 §3
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

  /* ------------------------------------------------------- services (§3) */

  /* The services of one category, as the CORE normalised them.

     Read through ConsentKit._services() rather than off config.services
     directly: the core drops rows with `enabled: false`, a malformed id or an
     unknown category, and the panel must list exactly the set the engine
     blocks by. A config the core has not seen (no init(), or a core too old to
     know about services) yields nothing, and the panel renders as it did in
     0.5.7 — which is what «старый конфиг рендерится как раньше» asks for. */
  function servicesFor(cat) {
    var ck = api();
    var list = null;
    try {
      if (ck && typeof ck._services === 'function') list = ck._services();
    } catch (e) { list = null; }
    if (!list || !Array.isArray(list)) return [];
    var out = [];
    for (var i = 0; i < list.length; i++) {
      if (list[i] && list[i].category === cat) out.push(list[i]);
    }
    return out;
  }

  /* The service's one-line purpose, in the banner's language.

     §3 asks for «одна строка purpose на языке баннера» and §2 ships
     `purpose: { ru?, ro?, en? }`. Falls back to en, then to nothing at all —
     an empty purpose renders no paragraph rather than the string "undefined"
     or a stray language. LANG is the resolved banner code, so a `pt-BR`
     banner asks for `pt` and lands on en, which is the honest answer. */
  function servicePurpose(svc, lang) {
    var p = (svc && svc.purpose) || {};
    var code = String(lang == null ? LANG : lang || 'en').slice(0, 2).toLowerCase();
    var v = p[code] || p.en;
    return (typeof v === 'string' && v.trim()) ? v.trim() : '';
  }

  /* The cookieTable rows this service claims, by name.

     §3: «под сервисом его cookie (имя · срок · назначение)» drawn «from
     cookieTable rows whose name is in service.cookies». A name the service
     declares but the table does not describe is NOT invented here: the panel
     shows what the owner wrote down, and the declaration page is where the
     full list lives. */
  function cookieRowsForService(rows, svc) {
    var names = (svc && svc.cookies) || [];
    if (!names.length) return [];
    var out = [];
    for (var i = 0; i < rows.length; i++) {
      var n = rows[i] && rows[i].name;
      if (typeof n === 'string' && names.indexOf(n) > -1) out.push(rows[i]);
    }
    return out;
  }

  /* SPEC V1.12 §3 — «N сервисов · M cookie» on the group header. Pure, so the
     wording in each of the three languages is testable without a DOM.

     The cookie half counts the WHOLE group, services and loose rows alike: the
     line answers «сколько cookie в этой группе», which is the question a
     visitor scanning the header is actually asking. */
  function groupCountLabel(serviceCount, cookieCount, strings, lang) {
    return plural(strings.svcCount, serviceCount, lang) + ' · ' +
           plural(strings.ckCount, cookieCount, lang);
  }

  /* Rows left over once every service has taken its own — «Cookie в этой
     группе (N)» keeps meaning «the rest», exactly as it did before services
     existed. With no services at all this returns the whole list unchanged. */
  function looseCookies(rows, svcs) {
    if (!svcs.length) return rows;
    var claimed = {};
    for (var i = 0; i < svcs.length; i++) {
      var names = svcs[i].cookies || [];
      for (var j = 0; j < names.length; j++) claimed[names[j]] = true;
    }
    var out = [];
    for (var k = 0; k < rows.length; k++) {
      var n = rows[k] && rows[k].name;
      if (typeof n === 'string' && claimed[n]) continue;
      out.push(rows[k]);
    }
    return out;
  }

  /* ----------------------------------------------------------------- theme */

  // Built-in palettes. Dark values are picked for >= 4.5:1 text contrast.
  // Card backgrounds follow SPEC V1.6 §1: light #ffffff, dark #1c1c1e. The dark
  // card is a NEUTRAL grey, so line/soft/muted below are neutral too — the old
  // blue-tinted #333C4F/#232B3A were derived from the old blue-tinted #1A202D
  // and would read as a colour cast against #1c1c1e.
  var DEFAULT_RADIUS = { card: 16, button: 8 };
  var RADIUS_MIN = 0, RADIUS_MAX = 32;
  var SYSTEM_FONT = 'system-ui,-apple-system,"Segoe UI",Roboto,sans-serif';

  var LIGHT = {
    bg: '#ffffff', ink: '#1B2437', accent: '#2B50D8', onAccent: '#ffffff',
    muted: '#5b6478', line: '#dfe3ea', soft: '#f4f6f9'
  };
  var DARK = {
    bg: '#1c1c1e', ink: '#E9E9EB', accent: '#7B96F0', onAccent: '#12182A',
    muted: '#A0A0A8', line: '#3A3A3C', soft: '#2C2C2E'
  };

  function str(v) {
    return (typeof v === 'string' && v.trim()) ? v.trim() : null;
  }

  /* ------------------------------------------------------------- contrast */

  /* WCAG 2.1 relative luminance and contrast ratio. Pure, hex-only: everything
     that reaches them has already passed sanitizeCssValue(), and a value that
     is not a hex triple (a colour name, an rgb() string, a color-mix()) simply
     cannot be measured here — those return null and every caller then leaves
     the colour exactly as the author wrote it rather than guessing. Silently
     "fixing" a colour we cannot read would be worse than not fixing it. */

  // '#abc' | '#aabbcc' | '#aabbccdd' -> [r,g,b] 0..255, or null.
  function parseHex(hex) {
    var s = str(hex);
    if (!s || s.charAt(0) !== '#') return null;
    s = s.slice(1);
    if (s.length === 3 || s.length === 4) {
      s = s.charAt(0) + s.charAt(0) + s.charAt(1) + s.charAt(1) + s.charAt(2) + s.charAt(2);
    } else if (s.length === 6 || s.length === 8) {
      s = s.slice(0, 6);
    } else {
      return null;
    }
    if (!/^[0-9a-fA-F]{6}$/.test(s)) return null;
    return [
      parseInt(s.slice(0, 2), 16),
      parseInt(s.slice(2, 4), 16),
      parseInt(s.slice(4, 6), 16)
    ];
  }

  function toHex(rgb) {
    var out = '#';
    for (var i = 0; i < 3; i++) {
      var v = Math.round(rgb[i]);
      if (v < 0) v = 0; else if (v > 255) v = 255;
      out += (v + 0x100).toString(16).slice(1);
    }
    return out;
  }

  // WCAG 2.1: L = 0.2126R + 0.7152G + 0.0722B over linearised channels.
  function relativeLuminance(hex) {
    var rgb = parseHex(hex);
    if (!rgb) return null;
    var lin = [];
    for (var i = 0; i < 3; i++) {
      var c = rgb[i] / 255;
      lin.push(c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));
    }
    return 0.2126 * lin[0] + 0.7152 * lin[1] + 0.0722 * lin[2];
  }

  // (L1 + 0.05) / (L2 + 0.05), lighter first. null when either side is unreadable.
  function contrastRatio(a, b) {
    var la = relativeLuminance(a);
    var lb = relativeLuminance(b);
    if (la === null || lb === null) return null;
    var hi = la > lb ? la : lb;
    var lo = la > lb ? lb : la;
    return (hi + 0.05) / (lo + 0.05);
  }

  var WHITE = '#ffffff';
  var NEAR_BLACK = '#161616';   // SPEC §1: white or #161616, whichever contrasts more

  /* SPEC §1, the TEXT rule: keep `fg` when it clears `min` against bg;
     otherwise swap to white or #161616 — whichever wins. Unreadable input
     (a colour name, rgb(), a missing value) is returned untouched with
     adjusted:false rather than guessed at.

     Since 0.5.10 this is only ever handed a DERIVED colour — resolveButtonStyles
     keeps an explicitly set one out of here entirely — so the swap can no longer
     overwrite something the owner chose. */
  function ensureContrast(fg, bg, min) {
    var floor = typeof min === 'number' && min > 0 ? min : 4.5;
    var have = contrastRatio(fg, bg);
    if (have === null) return { color: fg, adjusted: false, ratio: have };
    if (have >= floor) return { color: fg, adjusted: false, ratio: have };
    var rw = contrastRatio(WHITE, bg);
    var rb = contrastRatio(NEAR_BLACK, bg);
    var pick = (rw !== null && rb !== null && rw >= rb) ? WHITE : NEAR_BLACK;
    return { color: pick, adjusted: true, ratio: contrastRatio(pick, bg) };
  }

  /* SPEC §1, the BORDER rule: an outline button's border must clear >= 3:1
     against the CARD background, so the button is visible as a button at all.
     Stepwise rather than a jump to black/white: a brand colour that is only
     slightly too pale should stay recognisably the brand colour. Direction is
     chosen by which way there is room to move — away from the card.

     Since 0.5.10 only a DERIVED border reaches this: a border the owner set is
     painted as set and merely measured. */
  function stepToContrast(color, bg, min) {
    var floor = typeof min === 'number' && min > 0 ? min : 3;
    var have = contrastRatio(color, bg);
    if (have === null) return { color: color, adjusted: false, ratio: have };
    if (have >= floor) return { color: color, adjusted: false, ratio: have };

    var rgb = parseHex(color);
    var bgLum = relativeLuminance(bg);
    // Light card -> darken the border; dark card -> lighten it.
    var darken = bgLum > 0.5;
    var cur = [rgb[0], rgb[1], rgb[2]];
    // 5% steps of the remaining range; 40 steps always reaches pure black/white.
    for (var i = 0; i < 40; i++) {
      for (var c = 0; c < 3; c++) {
        cur[c] = darken ? cur[c] - (cur[c] * 0.06) - 2 : cur[c] + ((255 - cur[c]) * 0.06) + 2;
        if (cur[c] < 0) cur[c] = 0; else if (cur[c] > 255) cur[c] = 255;
      }
      var next = toHex(cur);
      var r = contrastRatio(next, bg);
      if (r !== null && r >= floor) return { color: next, adjusted: true, ratio: r };
    }
    var last = toHex(cur);
    return { color: last, adjusted: true, ratio: contrastRatio(last, bg) };
  }

  /* ------------------------------------------------------- config grammar */

  /* Config values are interpolated into the TEXT of a generated stylesheet, so
     an unvalidated value can close the declaration and open rules of its own
     ("10px;}.ck-btn--reject{display:none" hides "Reject all"). config.theme is
     not trusted input: in standalone mode it comes straight from the embedding
     page or an integrator's admin panel, with no server-side validation
     anywhere in the path. So every value is matched against a strict grammar
     for its kind and silently replaced by the token default when it does not
     fit — a broken colour is a cosmetic bug, an injected rule is a defacement
     and can strip the reject button, which is a consent-validity problem.

     Sanitising happens at the entry points (the config reads in
     resolveButtonStyles and buildThemeCss), not in tokenBlock(): by the time
     values reach derive() and color-mix() they are already clean, and the
     built-in constants and generated color-mix()/hex strings must not be
     re-validated by this grammar. */
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

  // theme.radius: {card,button} in px, clamped 0..32. A bare string or number
  // is the pre-0.5.0 form and still works: it sets the CARD radius, the button
  // keeps its own default. Anything unreadable falls back to the default.
  function clampRadius(v, fallback) {
    var n;
    if (typeof v === 'number') n = v;
    else if (typeof v === 'string' && /^\d+(\.\d+)?(px)?$/.test(v.trim())) n = parseFloat(v);
    else return fallback;
    if (!isFinite(n)) return fallback;
    if (n < RADIUS_MIN) n = RADIUS_MIN;
    if (n > RADIUS_MAX) n = RADIUS_MAX;
    return Math.round(n);
  }

  function resolveRadius(theme) {
    var r = theme && theme.radius;
    if (r && typeof r === 'object') {
      return {
        card: clampRadius(r.card, DEFAULT_RADIUS.card),
        button: clampRadius(r.button, DEFAULT_RADIUS.button)
      };
    }
    // Legacy scalar ('10px'): card only.
    if (typeof r === 'string' || typeof r === 'number') {
      return { card: clampRadius(r, DEFAULT_RADIUS.card), button: DEFAULT_RADIUS.button };
    }
    return { card: DEFAULT_RADIUS.card, button: DEFAULT_RADIUS.button };
  }

  // theme.font: 'system' keeps the pre-0.5.0 stack; anything else (including the
  // default) inherits the host page's family. Sizes stay explicit either way —
  // this is font-FAMILY, deliberately not the `font` shorthand, which would drag
  // in the page's size, weight and line-height and break the fixed geometry.
  function resolveFont(theme) {
    return (theme && theme.font === 'system') ? SYSTEM_FONT : 'inherit';
  }

  /* CSS `inherit` on the shadow root takes the family of the HOST <div>, which
     hangs off <body>. On a site that sets its typeface on inner blocks and not
     on body/html, body's computed family IS the browser default (Times), so the
     banner came out in Times on a page that is entirely sans-serif. Reading the
     family off real page TEXT instead is what «как на сайте» was always meant
     to mean.

     Split in two: pickPageFont is pure arithmetic over already-collected
     samples (unit-testable in node, published on _contrast), resolvePageFont
     does the DOM reading. */

  // Families are compared as CSS grammar, not as strings: '"Google Sans"' and
  // 'google sans' name the same face, and only the UA default must be rejected.
  function normFamily(v) {
    if (typeof v !== 'string') return '';
    return v.replace(/["']/g, '').replace(/\s*,\s*/g, ',').trim().toLowerCase();
  }

  /* First sample whose family differs from the UA default wins; null when the
     page never states a family of its own (the caller then keeps `inherit`).
     `samples` is [{ family }] in priority order. */
  function pickPageFont(samples, uaDefault) {
    if (!samples || typeof samples.length !== 'number') return null;
    var ua = normFamily(uaDefault);
    for (var i = 0; i < samples.length; i++) {
      var s = samples[i];
      var fam = s && typeof s.family === 'string' ? s.family.trim() : '';
      if (!fam) continue;                       // unstyled / detached element
      var norm = normFamily(fam);
      if (!norm) continue;
      if (ua && norm === ua) continue;          // still the browser default
      // The value lands in a generated stylesheet. getComputedStyle normalises,
      // but a family that could close the declaration is never worth the risk.
      if (/[;{}]|\/\*/.test(fam)) continue;
      return fam;
    }
    return null;
  }

  /* One probe at mount is not enough. On a page whose stylesheets are injected
     by script (Tilda is the reported case) a CACHED reload mounts the banner
     BEFORE those sheets apply, so every sample still computes to the UA default
     and the probe returns null — the banner stays in Times and nothing looks
     again. So the mount probe is only the first look: re-probes are scheduled
     until the answer stops changing.

     Both halves of that schedule are pure arithmetic, published on _contrast so
     the behaviour is testable without timers or a DOM.

     The timed ladder, in ms after mount. Deliberately front-loaded: a page that
     styles itself quickly is corrected before a visitor can read the banner,
     and the 4 s tail catches a slow webfont-driven sheet. `window.load` and
     `document.fonts.ready` fire on their own and are NOT part of this ladder. */
  var REPROBE_DELAYS = [500, 1500, 4000];

  // Attempt is 1-based over the TIMED probes only; null means "no more timers".
  function nextProbeDelay(attempt) {
    if (typeof attempt !== 'number' || !isFinite(attempt) || attempt < 1) return null;
    var i = Math.floor(attempt) - 1;
    return i < REPROBE_DELAYS.length ? REPROBE_DELAYS[i] : null;
  }

  /* Should a freshly probed family replace what the banner is painting?
     `current` is the applied value (null while the page still states nothing).
     Only a non-null find is ever worth applying — a later null means the page
     got LESS specific, which never happens for real and would otherwise throw
     away a good answer. */
  function shouldReprobe(current, found) {
    if (typeof found !== 'string' || !found) return false;
    if (typeof current !== 'string' || !current) return true;   // null -> found
    return normFamily(current) !== normFamily(found);
  }

  // Ordered so the first hit is the most representative body text on the page.
  var FONT_PROBES = ['main p', 'article p', '[role=main] p', 'p', 'h1', 'h2', 'a', 'button', 'li'];

  function visibleOutsideHost(el) {
    if (!el) return false;
    if (host && (el === host || (host.contains && host.contains(el)))) return false;
    try {
      if (el.offsetParent !== null) return true;
      return !!(el.getClientRects && el.getClientRects().length > 0);
    } catch (e) { return false; }
  }

  // The UA default is whatever an element states no opinion about, measured
  // INSIDE the shadow root so `:host{all:initial}` is already in force.
  function uaDefaultFamily() {
    if (!root || typeof document === 'undefined') return '';
    var probe = null;
    try {
      probe = document.createElement('span');
      probe.style.setProperty('font-family', 'initial');
      root.appendChild(probe);
      return window.getComputedStyle(probe).fontFamily || '';
    } catch (e) {
      return '';
    } finally {
      try { if (probe && probe.parentNode) probe.parentNode.removeChild(probe); } catch (e2) { /* noop */ }
    }
  }

  // Cached at applyTheme time so the debug panel (which may open long before or
  // after a remount) quotes the value the banner actually painted.
  var pageFont = null;

  /* How many times the SCHEDULER has looked, for the debug panel's «попытка N».
     Counted here and not inside resolvePageFont() on purpose: _resolvePageFont()
     re-runs the whole probe on every debug-panel render, and counting there would
     report «попытка 14» after a few renders and exhaust the cap on nothing. */
  var fontProbeCount = 1;          // the mount probe is attempt 1

  function resolvePageFont() {
    if (typeof document === 'undefined') return pageFont;
    try {
      var ua = uaDefaultFamily();
      var samples = [];
      var body = document.body;
      if (body) {
        try { samples.push({ family: window.getComputedStyle(body).fontFamily }); } catch (e) { /* noop */ }
      }
      for (var i = 0; i < FONT_PROBES.length; i++) {
        // First VISIBLE match, not the first match if it happens to be visible:
        // the leading <p> on a real page is often hidden a11y text, a template
        // or an inert modal, and skipping straight to the next selector would
        // throw away the page's body copy. Capped so a long article does not
        // cost a layout read per node.
        var el = null, list = null;
        try { list = document.querySelectorAll(FONT_PROBES[i]); } catch (e) { list = null; }
        if (!list) continue;
        for (var j = 0; j < list.length && j < 5; j++) {
          if (visibleOutsideHost(list[j])) { el = list[j]; break; }
        }
        if (!el) continue;
        try { samples.push({ family: window.getComputedStyle(el).fontFamily }); } catch (e) { /* noop */ }
      }
      pageFont = pickPageFont(samples, ua);
    } catch (e) {
      pageFont = null;
    }
    return pageFont;
  }

  /* ------------------------------------------------ page-font re-probing */

  /* Live timers, so remount() can cancel a schedule that belongs to the DOM it
     is about to throw away. Everything here is guarded and only ever RUNS after
     mount(), so the parse-time SSR context below never reaches it. */
  var fontTimers = [];
  var fontStable = false;          // a non-null value survived one extra probe
  var fontScheduled = false;

  // Cap on SCHEDULED probes (the mount probe is not one of them): the three
  // timed rungs plus window.load plus fonts.ready.
  var MAX_REPROBES = 5;

  function clearFontTimers() {
    for (var i = 0; i < fontTimers.length; i++) {
      try { clearTimeout(fontTimers[i]); } catch (e) { /* noop */ }
    }
    fontTimers = [];
  }

  /* One look. Re-applies the theme when the family changed, and reports whether
     the answer has now held still for a whole extra probe — which is the only
     thing that stops the ladder early. Applying and stopping are deliberately
     separate: a first non-null find is painted IMMEDIATELY (the visitor must not
     wait out the confirmation), the confirmation only decides about timers. */
  function probeFontOnce() {
    var before = pageFont;
    var found = resolvePageFont();               // rewrites the pageFont cache
    if (shouldReprobe(before, found)) {
      // applyTheme() rewrites themeStyle.textContent wholesale, so the --ck-font
      // rule is REPLACED rather than appended a second time.
      try { applyTheme(safeConfig()); } catch (e) { /* noop */ }
      fontStable = false;
      return false;
    }
    // Unchanged. Stable only once we have an actual family in hand: a page that
    // keeps answering null is exactly the case that has to keep looking.
    if (found) { fontStable = true; return true; }
    return false;
  }

  /* Run a scheduled probe. Every trigger — window.load, fonts.ready and each
     rung of the timed ladder — funnels through here so the cap and the counter
     are counted in one place. */
  function runScheduledProbe() {
    if (!mounted || fontStable) return;
    if (fontProbeCount >= 1 + MAX_REPROBES) return;
    fontProbeCount++;
    if (probeFontOnce()) clearFontTimers();      // settled: drop the rest
  }

  /* Called once from the end of mount(). Not from applyTheme(): that runs again
     on every palette-only ck:init, which would restart the whole ladder. */
  function scheduleFontProbes(cfg) {
    if (typeof window === 'undefined' || typeof document === 'undefined') return;
    if (fontScheduled) return;
    // theme.font:'system' is a fixed stack — there is nothing to sample.
    try {
      var t = (cfg && cfg.theme) || {};
      if (resolveFont(t) !== 'inherit') return;
    } catch (e) { return; }

    fontScheduled = true;
    try {
      for (var a = 1; ; a++) {
        var d = nextProbeDelay(a);
        if (d === null) break;
        fontTimers.push(setTimeout(runScheduledProbe, d));
      }
    } catch (e) { /* noop */ }

    // A cached reload's mount can precede the page's own stylesheets; `load`
    // is the first moment every <link> in the document has definitely applied.
    try {
      if (document.readyState === 'complete') {
        // Already past it — the ladder covers this case on its own.
      } else {
        window.addEventListener('load', function () { runScheduledProbe(); }, { once: true });
      }
    } catch (e) { /* noop */ }

    // A webfont swapping in can change the computed family outright.
    try {
      if (document.fonts && typeof document.fonts.ready === 'object' &&
          document.fonts.ready && typeof document.fonts.ready.then === 'function') {
        document.fonts.ready.then(function () { runScheduledProbe(); },
                                  function () { /* noop */ });
      }
    } catch (e) { /* noop */ }
  }

  /* --------------------------------------------------- button resolution */

  var BTN_ROLES = ['accept', 'reject', 'settings'];
  var DEFAULT_VARIANT = { accept: 'filled', reject: 'filled', settings: 'outline' };

  var warnedVariant = false;
  // Debug-only, once per page: a config error worth surfacing to whoever is
  // looking, but never console noise on a visitor's production page. Checked
  // lazily because ck-debug.js loads AFTER this file and flips `active` later.
  function warnVariantMismatch() {
    if (warnedVariant) return;
    var dbg = (typeof window !== 'undefined') && window.__ckDebug;
    if (!dbg || dbg.active !== true) return;
    warnedVariant = true;
    try {
      console.warn('[ConsentKit] theme.buttons.accept.variant and .reject.variant differ. ' +
        'Accept and reject must look identical (equal-buttons invariant, SPEC §1) — ' +
        'accept\'s variant is used for both.');
    } catch (e) { /* noop */ }
  }

  /* Resolve the three buttons for ONE mode into concrete, contrast-checked
     colours. Pure: takes the theme object and 'light'|'dark', returns plain
     data. This is the single source of truth the generated stylesheet, the
     debug panel and (per SPEC §3) the cabinet all read — "один код — одни
     числа": nothing recomputes these numbers a second time.

     `palette` is optional and lets buildThemeCss pass the ALREADY-RESOLVED
     accent/card colours for the mode, so a theme.dark.accent is honoured.

     OWNER'S RULE (0.5.10): a colour the owner EXPLICITLY SET is painted as set.
     The >= 4.5 text rule and the >= 3 border rule may only decide colours the
     owner did NOT choose — the automatic text on a filled button, the border
     and text derived from the accent on an outline one. A typed colour that
     falls short is reported (`low` / `borderLow`) so the debug panel and the
     cabinet can WARN about it, never corrected behind the owner's back. */
  function resolveButtonStyles(theme, mode, palette) {
    var t = (theme && typeof theme === 'object') ? theme : {};
    var base = mode === 'dark' ? DARK : LIGHT;
    var pal = (palette && typeof palette === 'object') ? palette : {};

    var cardBg = sanitizeCssValue('color', pal.bg, base.bg);
    var accent = sanitizeCssValue('color', pal.accent, base.accent);
    // theme.dark.onAccent / theme.light.onAccent is the GIVEN fg for filled
    // buttons in that mode. When the owner set it, it counts as an explicit
    // colour and is painted as set; the built-in default is derived and stays
    // subject to the >= 4.5 rule.
    var onAccent = sanitizeCssValue('color', pal.onAccent, base.onAccent);
    var onAccentExplicit = pal.onAccentExplicit === true;

    var cfg = (t.buttons && typeof t.buttons === 'object') ? t.buttons : {};

    // Equal-buttons invariant (SPEC §1): accept and reject share size and
    // weight, so they must share the variant too. When they disagree, accept
    // wins — silently for a visitor, loudly in debug mode.
    function variantOf(role) {
      var c = cfg[role];
      var v = c && c.variant;
      return (v === 'filled' || v === 'outline') ? v : DEFAULT_VARIANT[role];
    }
    var acceptVariant = variantOf('accept');
    var rejectVariant = variantOf('reject');
    if (acceptVariant !== rejectVariant) warnVariantMismatch();

    var variants = {
      accept: acceptVariant,
      reject: acceptVariant,          // invariant: always accept's
      settings: variantOf('settings')
    };

    /* The accent as TEXT on the card. Same >= 4.5 rule, same function, one
       number: links, «Подробнее» and the cookie-table summary all read the
       token this produces, so none of them can drift from what the debug
       panel and the cabinet quote. (The floating button left this token in
       0.5.11 — it now follows the accept button; see `fab` below.) Note the
       measurement is against cardBg — an accent that is fine inside a filled
       button can still be unreadable on the card behind it.

       Still corrected in 0.5.10, deliberately: the ACCENT is the owner's, but
       the LINK colour is derived from it — nobody typed "links are this
       colour". The accent itself is never repainted, so the owner still sees
       the brand colour everywhere they actually chose it. */
    var linkRes = ensureContrast(accent, cardBg, 4.5);

    var out = {
      mode: mode,
      cardBg: cardBg,
      accent: accent,
      link: {
        color: linkRes.color,
        ratio: linkRes.ratio,
        adjusted: linkRes.adjusted,
        // A link is always derived, so this is normally false — the rule
        // already lifted it. It can still be true on a mid-tone custom card
        // where even the better of white and #161616 falls short of 4.5.
        low: (typeof linkRes.ratio === 'number' && linkRes.ratio < 4.5),
        against: cardBg
      },
      buttons: {}
    };

    /* "Did the owner explicitly set this colour?" — the gate on the whole
       0.5.10 rule, and it cannot be a plain `str(c.fg)` test. sanitizeCssValue
       silently returns the FALLBACK for a hostile or malformed value, so a
       value that failed the grammar would otherwise be painted as "the owner's
       choice" with no correction at all — the injected-colour case would lose
       its contrast check as well as its value. Sanitising against a sentinel
       tells the two apart: a value that survives is the owner's, anything else
       falls through to the derived path exactly as before 0.5.10. */
    var NOT_SET = '\x00';
    function explicitColor(v) {
      var got = sanitizeCssValue('color', v, NOT_SET);
      return got === NOT_SET ? null : got;
    }
    // A measured ratio is `null` for a colour the arithmetic cannot read (a CSS
    // name, an rgb() string). That is "no verdict", not "below the floor", so it
    // must not raise the warning flag — the panel would print a note with no number.
    function below(ratio, floor) {
      return typeof ratio === 'number' && ratio < floor;
    }

    for (var i = 0; i < BTN_ROLES.length; i++) {
      var role = BTN_ROLES[i];
      var c = (cfg[role] && typeof cfg[role] === 'object') ? cfg[role] : {};
      var variant = variants[role];

      var bw = (c.borderWidth === 2 || c.borderWidth === '2') ? 2 : 1;
      var rec;

      if (variant === 'filled') {
        // bg: author's, else the accent — always painted as given either way.
        var bg = sanitizeCssValue('color', c.bg, accent);
        var bd = sanitizeCssValue('color', c.border, bg);
        // fg: an EXPLICIT colour (the button's own, or an owner-set onAccent
        // for the mode) is painted as set and only measured. Only the derived
        // default goes through the >= 4.5 rule.
        var setFg = explicitColor(c.fg) || (onAccentExplicit ? onAccent : null);
        var fgColor, fgRatio, fgAdjusted;
        if (setFg) {
          fgColor = setFg;
          fgRatio = contrastRatio(setFg, bg);
          fgAdjusted = false;
        } else {
          var fgRes = ensureContrast(onAccent, bg, 4.5);
          fgColor = fgRes.color;
          fgRatio = fgRes.ratio;
          fgAdjusted = fgRes.adjusted;
        }
        rec = {
          variant: 'filled',
          bg: bg,
          fg: fgColor,
          border: bd,
          borderWidth: bw,
          ratio: fgRatio,
          adjusted: fgAdjusted,
          // Warn-only: true when the PAINTED text falls under 4.5:1 —
          // usually a typed colour (the owner's own trade-off), but also a
          // CORRECTED one on a mid-tone fill near #767676, where neither
          // white nor #161616 reaches 4.5 and the better of the two still fails.
          low: below(fgRatio, 4.5),
          against: bg
        };
      } else {
        // outline: transparent fill, so everything is measured against the CARD.
        // A border the owner TYPED is painted as typed and only measured; one
        // DERIVED from the accent is still stepped to >= 3:1 so a default-themed
        // button cannot vanish into the card.
        var setBd = explicitColor(c.border);
        var bdColor, bdRatio, bdAdjusted;
        if (setBd) {
          bdColor = setBd;
          bdRatio = contrastRatio(setBd, cardBg);
          bdAdjusted = false;
        } else {
          var bdRes = stepToContrast(accent, cardBg, 3);
          bdColor = bdRes.color;
          bdRatio = bdRes.ratio;
          bdAdjusted = bdRes.adjusted;
        }
        // Text: the owner's when set, otherwise the resolved border colour put
        // through the >= 4.5 rule — that text is derived even when the border
        // it came from was typed, so it is still corrected.
        var setTx = explicitColor(c.fg);
        var txColor, txRatio, txAdjusted;
        if (setTx) {
          txColor = setTx;
          txRatio = contrastRatio(setTx, cardBg);
          txAdjusted = false;
        } else {
          var txRes = ensureContrast(bdColor, cardBg, 4.5);
          txColor = txRes.color;
          txRatio = txRes.ratio;
          txAdjusted = txRes.adjusted;
        }
        rec = {
          variant: 'outline',
          bg: sanitizeCssValue('color', c.bg, 'transparent'),
          fg: txColor,
          border: bdColor,
          borderWidth: bw,
          ratio: txRatio,
          // `adjusted` now tracks the TEXT alone. A typed border that was kept
          // must not make the row say «исправлено» about a colour nobody
          // touched; the border reports itself through borderAdjusted.
          adjusted: txAdjusted,
          low: below(txRatio, 4.5),
          borderRatio: bdRatio,
          borderAdjusted: bdAdjusted,
          borderLow: below(bdRatio, 3),
          against: cardBg
        };
      }
      out.buttons[role] = rec;
    }

    /* The floating button (0.5.11). It is a filled circle that outlives the
       banner, and the owner's rule is that it wears the ACCEPT button's
       colours — no setting of its own.

       accept FILLED: take its bg/fg verbatim. That inherits the 0.5.10 rule
       for free — a typed low-contrast fg stays exactly as typed here too, and
       is reported through `low` rather than corrected.

       accept OUTLINE: there is no fill to borrow, so the button's BORDER
       colour becomes the circle and the CARD colour becomes the icon — the
       outline button's two real colours, swapped. Both are derived for the
       fab (nobody typed "the floating button is this colour"), so the icon
       goes through the >= 4.5 rule; ensureContrast picks the readable member
       of the pair, which on a dark border is the card itself and on a pale
       one steps away from it. When accept's border is itself derived it is
       already the accent stepped to 3:1, so this is also the accent/on-accent
       fallback the brief describes. */
    var acc = out.buttons.accept;
    if (acc.variant === 'filled') {
      out.fab = {
        bg: acc.bg,
        fg: acc.fg,
        ratio: acc.ratio,
        adjusted: acc.adjusted,
        low: acc.low,
        against: acc.bg
      };
    } else {
      var fabBg = acc.border;
      var fabRes = ensureContrast(cardBg, fabBg, 4.5);
      out.fab = {
        bg: fabBg,
        fg: fabRes.color,
        ratio: fabRes.ratio,
        adjusted: fabRes.adjusted,
        low: below(fabRes.ratio, 4.5),
        against: fabBg
      };
    }
    return out;
  }

  /* ------------------------------------------------------------- stylesheet */

  // One :host{} block of custom properties for a resolved palette.
  function tokenBlock(sel, p, extra) {
    var d = [
      '--ck-bg:' + p.bg,
      '--ck-ink:' + p.ink,
      '--ck-accent:' + p.accent,
      '--ck-on-accent:' + p.onAccent,
      '--ck-muted:' + p.muted,
      '--ck-line:' + p.line,
      '--ck-soft:' + p.soft
    ];
    // Per-button tokens: the ROLE classes in the static sheet read these, so a
    // filled/outline change is a value change and never a class swap. That is
    // what keeps a theme.buttons edit on the applyTheme()-only path — no
    // remount, and signature() need not know about buttons at all.
    // Resolved by resolveButtonStyles alongside the buttons, threaded in the
    // same way as __buttons: one pass per mode, so the light and dark blocks
    // each carry their own contrast-checked link colour.
    if (p.__link) d.push('--ck-link:' + p.__link.color);
    // The floating button's pair, resolved from the accept button in the same
    // pass, so light and dark each carry their own (0.5.11).
    if (p.__fab) {
      d.push('--ck-fab-bg:' + p.__fab.bg);
      d.push('--ck-fab-fg:' + p.__fab.fg);
    }
    var btns = p.__buttons;
    if (btns) {
      for (var i = 0; i < BTN_ROLES.length; i++) {
        var role = BTN_ROLES[i];
        var b = btns[role];
        d.push('--ck-' + role + '-bg:' + b.bg);
        d.push('--ck-' + role + '-fg:' + b.fg);
        d.push('--ck-' + role + '-bd:' + b.border);
        d.push('--ck-' + role + '-bw:' + b.borderWidth + 'px');
      }
    }
    if (extra) {
      for (var k = 0; k < extra.length; k++) d.push(extra[k]);
    }
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
    // theme.light is the mirror of theme.dark and exists for one value: an
    // onAccent the owner set for the light mode. Without it a light-mode
    // filled button had no way to state its text colour once for all three
    // buttons, and theme.dark could do what theme.light could not.
    var lt = (theme.light && typeof theme.light === 'object') ? theme.light : {};

    var radius = resolveRadius(theme);
    var font = resolveFont(theme);

    // Light: config overrides on top of the built-in light palette.
    var light = derive(LIGHT,
      sanitizeCssValue('color', theme.bg, LIGHT.bg),
      sanitizeCssValue('color', theme.ink, LIGHT.ink));
    if (str(theme.accent)) light.accent = sanitizeCssValue('color', theme.accent, LIGHT.accent);
    // An onAccent that SURVIVES the grammar is the owner's word on the filled
    // buttons' text and is painted as given; one that fails it falls back to
    // the built-in default, which is derived and still gets corrected.
    var ltOn = sanitizeCssValue('color', lt.onAccent, null);
    if (ltOn) { light.onAccent = ltOn; light.onAccentExplicit = true; }

    // Dark: theme.dark overrides on top of the built-in dark palette.
    // A light-only theme.accent deliberately does NOT carry into dark — the
    // default #2B50D8 on #1c1c1e is ~2.4:1 and would fail AA.
    var dark = derive(DARK,
      sanitizeCssValue('color', dk.bg, DARK.bg),
      sanitizeCssValue('color', dk.ink, DARK.ink));
    if (str(dk.accent)) dark.accent = sanitizeCssValue('color', dk.accent, DARK.accent);
    var dkOn = sanitizeCssValue('color', dk.onAccent, null);
    if (dkOn) { dark.onAccent = dkOn; dark.onAccentExplicit = true; }

    // Buttons are resolved per mode against that mode's real card colour, so a
    // custom dark card changes the outline border the same way a custom light
    // one does.
    var lightBtn = resolveButtonStyles(theme, 'light', light);
    var darkBtn = resolveButtonStyles(theme, 'dark', dark);
    light.__buttons = lightBtn.buttons;
    dark.__buttons = darkBtn.buttons;

    // `--ck-on-accent` paints the text of the remaining filled surfaces that
    // are not banner buttons — since 0.5.11 that is the blocked-embed
    // placeholder's button, the panel foot and the floating button having
    // moved onto the accept button's own tokens. A derived onAccent still has
    // to pass the >= 4.5 rule against the accent, or a white accent gets white
    // text (the owner saw exactly that). Done AFTER the buttons are resolved, so
    // the accept button still records `adjusted:true` for the same correction.
    // An onAccent the owner set is painted as set — the 0.5.10 rule.
    if (!light.onAccentExplicit) light.onAccent = ensureContrast(light.onAccent, light.accent, 4.5).color;
    if (!dark.onAccentExplicit) dark.onAccent = ensureContrast(dark.onAccent, dark.accent, 4.5).color;
    light.__link = lightBtn.link;
    dark.__link = darkBtn.link;
    light.__fab = lightBtn.fab;
    dark.__fab = darkBtn.fab;

    var mode = theme.mode;
    if (mode !== 'light' && mode !== 'dark') mode = 'auto';

    // Geometry and family are mode-independent, so they ride on the base block.
    var rootExtra = [
      '--ck-radius-card:' + radius.card + 'px',
      '--ck-radius-btn:' + radius.button + 'px',
      // Kept as an alias so any integrator CSS (and older builds' rules) that
      // reads --ck-radius still lands on the card radius.
      '--ck-radius:' + radius.card + 'px',
      '--ck-font:' + font
    ];

    var out = [tokenBlock(':host', light, rootExtra)];
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

    return { css: out.join('\n'), mode: mode, radius: radius, font: font,
             light: lightBtn, dark: darkBtn };
  }

  function applyTheme(cfg) {
    if (!host || !nodes.themeStyle) return;
    var built = buildThemeCss(cfg);
    // `inherit` would take the family of the host <div> — i.e. of <body>, which
    // on many sites still carries the browser default. Overwrite the token with
    // the family real page text is set in. Appended AFTER built.css so the two
    // equal-specificity :host rules resolve in source order; buildThemeCss stays
    // pure and DOM-free (the theme editor and the debug panel both call it).
    var fontCss = '';
    if (built.font === 'inherit') {
      var page = resolvePageFont();
      // Owner rule (2026-09-06): the page's font when it can be read, the
      // system stack when it cannot — never a bare `inherit`, which on Tilda
      // and friends resolves to <body>'s browser default (Times). A later
      // re-probe that finds the page font swaps the system stack out again.
      fontCss = '\n:host{--ck-font:' + (page || SYSTEM_FONT) + '}';
    } else {
      pageFont = null;                          // theme.font:'system' opts out
    }
    // Brand rules ride along in the same sheet: the dark/light logo swap depends
    // on theme.mode, so it must be rebuilt whenever the palette is.
    nodes.themeStyle.textContent = built.css + fontCss + '\n' + buildBrandCss(cfg);  // replace, never append
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
        /* SPEC V1.12 §3 — the group switch is the master:
             off -> every service of the group goes off and is blocked;
             on  -> the services come back, EXCEPT the ones turned off by hand.
           The hand-set state is kept on the service switch itself (dataset.man)
           rather than being read back off the group, which is what lets a
           manual refusal survive the group being toggled off and on again. */
        syncGroup(cat);
      });
    }
    return b;
  }

  /* SPEC V1.12 §3 — one service, with its own switch, its purpose, its policy
     link and the cookies it sets. */
  function makeServiceSwitch(svc, cat) {
    var b = el('button', 'ck-switch ck-switch--sm');
    b.type = 'button';
    b.setAttribute('role', 'switch');
    b.setAttribute('aria-checked', 'false');
    b.dataset.svc = svc.id;
    b.dataset.cat = cat;
    // '1' once the visitor has switched this service off by hand. Read by
    // syncGroup() when the group comes back on, and cleared when they switch it
    // on again — a service the visitor re-enables is no longer «отключён вручную».
    b.dataset.man = '';
    /* A service switch is only ever clickable while its group is ON: syncGroup()
       disables it otherwise, and a disabled <button> fires no click. So this
       handler always runs with the group on, and there is no "turn the group
       back on too" case to handle — the visitor reaches a refused group through
       the group's own switch. */
    b.addEventListener('click', function () {
      var on = b.getAttribute('aria-checked') === 'true';
      b.setAttribute('aria-checked', on ? 'false' : 'true');
      // '1' = «switched off by hand». Cleared when it is switched back on, so a
      // re-enabled service is no longer «отключён вручную» and follows its group.
      b.dataset.man = on ? '1' : '';
    });
    return b;
  }

  /* Pushes the group switch's state down onto its services. Called when the
     group is clicked and when the panel is synced from the stored state. */
  function syncGroup(cat) {
    var on = !!(switches[cat] && switches[cat].getAttribute('aria-checked') === 'true');
    var list = serviceSwitches[cat] || [];
    for (var i = 0; i < list.length; i++) {
      var b = list[i];
      // Group off: everything off. Group on: everything on except what the
      // visitor turned off by hand.
      var want = on && b.dataset.man !== '1';
      b.setAttribute('aria-checked', want ? 'true' : 'false');
      // A service cannot be granted while its group is refused, and a switch
      // that looks operable but changes nothing is worse than a disabled one.
      b.disabled = !on;
      if (!on) b.setAttribute('aria-disabled', 'true');
      else b.removeAttribute('aria-disabled');
    }
  }

  /* SPEC V1.12 §3, reshaped in 0.5.12 — one service, on ONE line.

     0.5.8 rendered the name, the vendor, the purpose paragraph, the policy link
     and a cookie table for every service, all at once. Eight services filled the
     panel and the visitor scrolled past the switches they came for. The row is
     now: name (bold) · vendor (muted) · switch, and nothing else until the row's
     own «Подробнее» is opened — behind which the purpose, the policy link and
     «Какие cookie ставит (N)» live, unchanged.

     `cat === 'necessary'` renders NO switch. The group is always on and cannot
     be refused, so a control that could only ever sit at «off» (which is what
     0.5.11 showed, because syncGroup() only ever ran for the opt-in groups)
     tells the visitor a lie about what they can change. The «всегда активны»
     badge the group header already carries says the true thing instead. */
  function buildService(svc, cat, rows) {
    var locked = cat === 'necessary';

    var wrap = el('div', 'ck-svc');
    var top = el('div', 'ck-svc__top');
    var txt = el('div', 'ck-svc__txt');

    var nameId = 'ck-svc-' + svc.id;
    var name = el('div', 'ck-svc__name');
    var nameSpan = el('span', null, svc.name);
    nameSpan.id = nameId;
    name.appendChild(nameSpan);
    // Vendor on the SAME line as the name now, not a paragraph under it. The
    // row wraps rather than truncates, so a long pair still reads at 320px.
    if (svc.vendor) name.appendChild(el('span', 'ck-svc__vendor', svc.vendor));
    if (locked) name.appendChild(el('span', 'ck-svc__badge', T.alwaysOn));
    txt.appendChild(name);

    top.appendChild(txt);

    /* No switch for a necessary service — and no entry in serviceSwitches[],
       which is what keeps readSwitches() from ever writing such an id into the
       denial map. (It iterates OPT_IN, so it could not today; not registering
       the switch means it still cannot if that loop ever widens.) */
    if (!locked) {
      var sw = makeServiceSwitch(svc, cat);
      /* aria-labelledby only. 0.5.8 also pointed aria-describedby at the purpose
         paragraph; in 0.5.12 that paragraph lives inside a CLOSED <details>, and
         a description a screen reader cannot reach until the visitor opens
         something else is worse than none — the name and the switch's own state
         are what the control has to announce. The purpose is still there, one
         «Подробнее» away, as its own readable text. */
      sw.setAttribute('aria-labelledby', nameId);
      if (!serviceSwitches[cat]) serviceSwitches[cat] = [];
      serviceSwitches[cat].push(sw);
      top.appendChild(sw);
    }

    wrap.appendChild(top);

    /* Everything else goes behind the row's own disclosure. <details>/<summary>
       rather than a button: the keyboard behaviour, the focus ring and the
       expanded state come from the browser, and it is the same control the
       cookie tables have used since 0.5.7. */
    var purpose = servicePurpose(svc);
    var own = cookieRowsForService(rows, svc);
    if (purpose || svc.privacyUrl || own.length) {
      var det = el('details', 'ck-det ck-svc__det');
      var sum = el('summary');
      sum.appendChild(document.createTextNode(T.svcDetails));
      // The word is the same on every row, so a screen reader needs the service
      // name to tell one «Подробнее» from the next.
      sum.setAttribute('aria-label', T.svcDetails + ' — ' + svc.name);
      det.appendChild(sum);

      var body = el('div', 'ck-svc__body');
      if (purpose) body.appendChild(el('p', 'ck-svc__desc', purpose));

      /* «Политика» — target=_blank rel=noopener, per §3. The URL is already
         http(s)-validated by the core's normalizeService(), which is where a
         javascript: address is dropped; nothing unvalidated reaches an href. */
      if (svc.privacyUrl) {
        var a = el('a', 'ck-svc__policy', T.svcPolicy);
        a.href = svc.privacyUrl;
        a.target = '_blank';
        a.rel = 'noopener noreferrer';
        a.setAttribute('aria-label', T.svcPolicy + ' — ' + svc.name);
        body.appendChild(a);
      }

      if (own.length) body.appendChild(cookieTable(own, T.svcCookies + ' (' + own.length + ')'));
      det.appendChild(body);
      wrap.appendChild(det);
    }

    return wrap;
  }

  /* The <details> block a group and a service both use for their cookies:
     same columns, same markup, one summary line apart. */
  function cookieTable(rows, summaryText) {
    var det = el('details', 'ck-det');
    var sum = el('summary');
    sum.appendChild(document.createTextNode(summaryText));
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
      /* SPEC V1.18.1 §1 — both cells are RESOLVED, not quoted: `purpose` may be
         a per-language object and the expiry may be a number of days. The
         em dash stays the empty-cell mark it has been since 0.5.0, so a config
         written before 0.5.16 renders byte for byte what it rendered then:
         a plain-string purpose comes back unchanged, and a row with no
         `expiryDays` falls through to its `expiry` string. */
      tr.appendChild(el('td', null, cookiePurpose(row.purpose, LANG) || '—'));
      tr.appendChild(el('td', null, cookieExpiry(row, T, LANG) || '—'));
      tbody.appendChild(tr);
    }
    table.appendChild(tbody);
    tw.appendChild(table);
    det.appendChild(tw);
    return det;
  }

  /* 0.5.12 — the group's disclosure button.

     «N сервисов · M cookie» was a static label in 0.5.8; it is now the control
     that reveals the group's services and its cookie list, COLLAPSED by default.
     A real <button aria-expanded> rather than a <details>, because the panel
     already owns the region it toggles — the services list and the loose-cookie
     table are siblings that must move together, and wrapping both in a
     <details> would put a second summary line above the one the header already
     has. Keyboard and focus come free with a button; the ring is the panel's
     own :focus-visible rule. */
  function makeGroupToggle(cat, label, regionId) {
    var b = el('button', 'ck-cat__count ck-cat__toggle');
    b.type = 'button';
    b.setAttribute('aria-expanded', 'false');
    b.setAttribute('aria-controls', regionId);
    b.appendChild(el('span', 'ck-cat__caret'));
    b.appendChild(document.createTextNode(label));
    b.dataset.cat = cat;
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

    var rows = cookiesFor(cfg, cat);
    var svcs = servicesFor(cat);

    /* SPEC V1.12 §3 — «N сервисов · M cookie» on the group header.

       Rendered ONLY when the group actually has services. A site whose config
       predates 0.5.8 has none, and must look exactly as it did in 0.5.7 — not
       «0 сервисов · 3 cookie». The cookie half counts the whole group, services
       and loose rows alike: it answers «сколько cookie в этой группе», which is
       the question the line is there to answer. */
    var toggle = null;
    var regionId = nameId + '-svcs';
    if (svcs.length) {
      toggle = makeGroupToggle(cat, groupCountLabel(svcs.length, rows.length, T, LANG), regionId);
      name.appendChild(toggle);
    }

    var sw = makeSwitch(cat, locked);
    sw.setAttribute('aria-labelledby', nameId);
    sw.setAttribute('aria-describedby', descId);
    switches[cat] = sw;

    top.appendChild(txt);
    top.appendChild(sw);
    wrap.appendChild(top);

    // «Cookie в этой группе (N)» keeps its old meaning: what is left once each
    // service has claimed its own. With no services that is the whole table and
    // the summary line is byte-for-byte what 0.5.7 rendered.
    var loose = looseCookies(rows, svcs);

    if (svcs.length) {
      /* Both halves live inside the collapsed region: the services and, at the
         end, the group's own «Какие cookie (N)». `hidden` rather than a class,
         so the region is out of the accessibility tree and out of the tab order
         while collapsed — a class that only sets display:none would leave the
         switches focusable to a keyboard user who cannot see them. */
      var region = el('div', 'ck-cat__region');
      region.id = regionId;
      region.hidden = true;

      var list = el('div', 'ck-svcs');
      // A list, so a screen reader announces «3 items» before reading them.
      list.setAttribute('role', 'list');
      list.setAttribute('aria-label', T.svcListLabel);
      for (var s = 0; s < svcs.length; s++) {
        var item = buildService(svcs[s], cat, rows);
        item.setAttribute('role', 'listitem');
        list.appendChild(item);
      }
      region.appendChild(list);

      if (loose.length) {
        region.appendChild(cookieTable(loose, T.cookiesIn + ' (' + loose.length + ')'));
      }

      toggle.addEventListener('click', function () {
        var open = toggle.getAttribute('aria-expanded') === 'true';
        toggle.setAttribute('aria-expanded', open ? 'false' : 'true');
        region.hidden = open;
      });

      wrap.appendChild(region);
    } else if (loose.length) {
      // No services: the cookie table sits where it always did, top level and
      // never behind a disclosure — a pre-0.5.8 config renders as it did in
      // 0.5.7, which is what «старый конфиг рендерится как раньше» asks for.
      wrap.appendChild(cookieTable(loose, T.cookiesIn + ' (' + loose.length + ')'));
    }

    return wrap;
  }

  /* SPEC V1.6 §2 — what «Подробнее» does.

     Before 0.5.0 the link was rendered with href="#" and NO click handler: it
     did nothing but jump to the top of the page. There are now three honest
     outcomes, and the default depends on whether a policy address exists —
     'settings' without one, 'policy' with one, so an integrator who only
     supplies a URL gets the link they obviously meant. This is why
     detailsAction must NOT carry a default in the core's DEFAULT_CONFIG: a
     merged concrete value would make the URL-sensitive default unreachable.

     'policy' with no usable URL degrades to 'settings' rather than rendering a
     dead link. Only http(s) is accepted — javascript: and data: URLs in a
     link the visitor is invited to click are an XSS vector, and a relative
     path cannot be validated here without a base. */
  function resolveDetails(cfg) {
    var texts = (cfg && cfg.texts && typeof cfg.texts === 'object') ? cfg.texts : {};
    var url = str(texts.policyUrl);
    if (url && !/^https?:\/\//i.test(url)) url = null;

    /* SPEC V1.10 §1 — the third destination: our own cookie declaration page.
       `declarationUrl` is server-owned (the SaaS config injects it, like
       `branding`); the client only reads it and never invents one. It is
       validated exactly like policyUrl — http(s) only, because a link the
       visitor is invited to click must not be able to carry javascript: — and
       it deliberately does NOT influence the default action: the URL-sensitive
       default above stays policyUrl-driven, so a site that gains a declaration
       address does not silently lose its «Подробнее» → политика link. */
    var decl = str(texts.declarationUrl);
    if (decl && !/^https?:\/\//i.test(decl)) decl = null;

    var action = texts.detailsAction;
    if (action !== 'policy' && action !== 'settings' && action !== 'hide' && action !== 'declaration') {
      action = url ? 'policy' : 'settings';
    }
    if (action === 'policy' && !url) action = 'settings';
    // Asked for the declaration with no address to send anyone to: fall back to
    // opening the settings rather than rendering a dead link.
    if (action === 'declaration' && !decl) action = 'settings';

    var href = null;
    if (action === 'policy') href = url;
    else if (action === 'declaration') href = decl;
    return { kind: action, href: href };
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
    var det = resolveDetails(cfg);
    /* SPEC V1.16 §1.3 — «Подробнее» and one of the link rows point at the same
       page: drop the in-text copy rather than print the address twice. Asked
       through detailsKind() so the shape drawn here is the same one signature()
       watches for changes. The links are resolved for THIS render's language,
       exactly as buildLinksRow does below, so a row that no visitor of this
       banner can see (no label in their language) never silences the link
       they can. */
    if (detailsKind(cfg, LANG) === 'hide') det = { kind: 'hide', href: null };
    if (det.kind === 'hide') {
      p.appendChild(document.createTextNode(T.bannerText));
    } else {
      p.appendChild(document.createTextNode(T.bannerText + ' '));
      // 'policy' and 'declaration' are the same DOM shape — an outbound link in
      // a new tab — and differ only in where they point (resolveDetails picked
      // the address). Both must be listed here: a missing branch would silently
      // render 'declaration' as the settings BUTTON instead of the link.
      if (det.kind === 'policy' || det.kind === 'declaration') {
        var link = el('a', 'ck-banner__more', T.more);
        link.href = det.href;
        link.target = '_blank';
        link.rel = 'noopener';          // never hand the linked page window.opener
        p.appendChild(link);
      } else {
        // A control that changes what is on screen is a button, not a link:
        // screen readers announce it correctly and it needs no href to fake.
        var more = el('button', 'ck-banner__more ck-linkbtn', T.more);
        more.type = 'button';
        more.addEventListener('click', function () { openPanel(more); });
        p.appendChild(more);
      }
    }
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
    var accept = el('button', 'ck-btn ck-btn--accept', T.acceptAll);
    accept.type = 'button';
    var reject = el('button', 'ck-btn ck-btn--reject', T.rejectAll);
    reject.type = 'button';
    var custom = el('button', 'ck-btn ck-btn--settings', T.customize);
    custom.type = 'button';

    accept.addEventListener('click', function () { doAcceptAll(); });
    reject.addEventListener('click', function () { doRejectAll(); });
    custom.addEventListener('click', function () { openPanel(custom); });

    actions.appendChild(accept);
    actions.appendChild(reject);
    actions.appendChild(custom);
    b.appendChild(actions);

    /* SPEC V1.16 §1.3 — the link row, under the buttons in all three layouts.
       Appended to the BANNER rather than to the body, so it sits after the
       actions in DOM (and reading) order everywhere: box and modal stack, and
       the bar's `width:100%` on .ck-links forces it onto its own line under
       the row instead of squeezing in beside the buttons.

       The bar's mobile media query re-orders its children explicitly (body
       contents `order:1`, actions `order:2`); the row carries `order:3` there
       so it stays below the buttons rather than jumping above them. */
    var blinks = buildLinksRow(cfg, 'ck-links--banner');
    if (blinks) b.appendChild(blinks);

    // box/modal: the foot follows the buttons (see the note above).
    if (foot && lay.type !== 'bar') b.appendChild(foot);


    nodes.scrim = scrim;
    nodes.banner = b;
    nodes.bannerModal = isModal;
    root.appendChild(scrim);
    root.appendChild(b);
  }

  /* SPEC V1.16 §1.2 — the «Дополнительно» card, or null when the site supplied
     no text for this language. T.extraText has already been through the whole
     merge (dictionary '' <- __ckLocales <- config.texts[lang] <- [base]), so
     the only question left here is whether anything survived it. */
  function buildExtra() {
    var nodes = renderRich(T.extraText);
    if (!nodes.length) return null;
    var box = el('div', 'ck-extra');
    box.appendChild(el('h3', 'ck-extra__title', T.extraTitle));
    var bodyEl = el('div', 'ck-extra__body');
    for (var i = 0; i < nodes.length; i++) bodyEl.appendChild(nodes[i]);
    box.appendChild(bodyEl);
    return box;
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

    /* SPEC V1.16 §1.2 — «Дополнительно», after the categories and their service
       lists, before the buttons. INSIDE .ck-panel__body, which is the scrolling
       region: an operator block runs to a paragraph or three, and put between
       the body and the foot it would be clipped on a short viewport with no way
       to reach the end of it.

       Rendered only when the resolved extraText is a non-empty string — every
       dictionary ships '', so a site that never configured one draws nothing
       and the panel is byte-for-byte what 0.5.14 drew. */
    var extra = buildExtra();
    if (extra) body.appendChild(extra);
    p.appendChild(body);

    var foot = el('div', 'ck-panel__foot');
    /* 0.5.11 — the panel follows the BANNER's buttons, with no setting of its
       own: «Сохранить выбор» is the same role as «Принять всё» and wears the
       accept class, «Принять всё»/«Отклонить всё» here are secondary and wear
       the settings («Настроить») class. Reusing the role classes means the
       filled/outline split stays a VALUE change in the tokens — the panel
       never picks a class from the resolved variant, so a theme.buttons edit
       is still applyTheme()-only and signature() still need not see buttons.
       Panel layout is untouched: `.ck-panel__foot .ck-btn{flex:1 1 150px}`
       (0,2,0) outranks `.ck-btn{flex:1 1 auto}` and the role classes set no
       flex of their own. */
    var save = el('button', 'ck-btn ck-btn--accept', T.save);
    save.type = 'button';
    var acc = el('button', 'ck-btn ck-btn--settings', T.acceptAll);
    acc.type = 'button';
    var rej = el('button', 'ck-btn ck-btn--settings', T.rejectAll);
    rej.type = 'button';

    save.addEventListener('click', function () { doSave(); });
    acc.addEventListener('click', function () { doAcceptAll(); });
    rej.addEventListener('click', function () { doRejectAll(); });

    foot.appendChild(save);
    foot.appendChild(acc);
    foot.appendChild(rej);
    // SPEC V1.16 §1.3 — the operator's own addresses, under the panel's buttons
    // and above the attribution, so the bottom of the panel reads: what you can
    // do, then where to read more, then who made this.
    var plinks = buildLinksRow(cfg, 'ck-links--panel');
    if (plinks) foot.appendChild(plinks);
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
    /* SPEC V1.12 §3 — «хранение: только отказы».

       Read from `dataset.man`, NOT from `aria-checked`. The two answer different
       questions and only one of them is the visitor's decision:

         aria-checked — what the switch currently SHOWS. syncGroup() forces every
                        service of a refused group to `false`, so reading this
                        would record «I refused all six of these» the moment the
                        group went off.
         dataset.man  — «the visitor switched this one off by hand». Set on click,
                        restored from the stored record, and deliberately left
                        alone by syncGroup().

       Getting this backwards loses a denial: refuse Hotjar, later switch
       analytics off and save, and the refusal would be erased — so when
       analytics came back on, Hotjar would run again without ever having been
       re-consented to. */
    var svcs = {};
    for (var c = 0; c < OPT_IN.length; c++) {
      var list = serviceSwitches[OPT_IN[c]] || [];
      for (var j = 0; j < list.length; j++) {
        var b = list[j];
        if (b.dataset.man === '1') svcs[b.dataset.svc] = false;
      }
    }
    out.services = svcs;
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
    /* A visitor who opens the settings long after load is the last chance to
       get the typeface right, and by then the page is certainly styled. Only
       when the banner is still on `inherit` — a resolved family is left alone
       so opening the panel can never restyle a correct banner. Hooked here
       rather than on the ck:ui:open-preferences listener because the banner's
       own «Настроить» button calls openPanel() directly.

       Gated on fontScheduled, which is only ever set for a theme that actually
       samples the page: with theme.font:'system' applyTheme() nulls pageFont on
       every call, so without this the condition would be permanently true and
       every panel open would re-probe the DOM and rewrite the sheet to produce
       byte-identical CSS, forever. */
    if (fontScheduled && !pageFont && !fontStable) {
      try { probeFontOnce(); } catch (e) { /* noop */ }
    }
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

    /* SPEC V1.12 §3 — restore the per-service switches from the stored denials.

       `dataset.man` is set from the record FIRST, then syncGroup() derives what
       each switch shows from it. That ordering is the whole point: a visitor who
       denied Hotjar and left analytics off must still see Hotjar's own switch
       off when they turn analytics back on, and the group→service push is what
       would otherwise light it up again. */
    var denials = (state && state.services) || {};
    for (var c = 0; c < OPT_IN.length; c++) {
      var cat = OPT_IN[c];
      var list = serviceSwitches[cat] || [];
      for (var j = 0; j < list.length; j++) {
        list[j].dataset.man = denials[list[j].dataset.svc] === false ? '1' : '';
      }
      syncGroup(cat);
    }
  }

  // Idempotent: safe to call from ck:init, ck:change and right after our own API calls.
  /* SPEC V1.19 §1.1 — this visitor's country is outside the list the owner
     chose, so the banner must not appear.

     Read from the core rather than from the state: `decided` deliberately stays
     FALSE out of scope (the visitor made no choice and none was saved), so the
     banner/FAB visibility cannot be derived from it. `inScope === false` is
     tested explicitly — an absent or half-written _geo must read as "in scope"
     and show the banner, which is the safe direction. */
  function geoSilent() {
    try {
      var g = api() && api()._geo;
      return !!(g && g.inScope === false);
    } catch (e) { return false; }
  }

  function syncFromState(state) {
    if (!mounted) return;
    var s = state || safeState();
    // Out of scope the banner is hidden and the floating button IS shown: the
    // visitor is never asked, but «изменить выбор cookie» must still be one
    // click away, so they can open the panel and make a real (persisted)
    // decision if they want one.
    var decided = !!s.decided || geoSilent();

    if (nodes.banner) nodes.banner.classList.toggle('ck-hidden', decided);
    if (nodes.scrim) nodes.scrim.classList.toggle('ck-hidden', decided || !nodes.bannerModal);
    if (nodes.fab) nodes.fab.classList.toggle('ck-hidden', !decided);
    if (!panelOpen) syncSwitches(s);

    /* §2 — a consent change is exactly when a card must go: the core's
       applyConsentToDom() has already put the frame's src back by the time
       ck:change reaches us (commit() revives before it dispatches), so the
       sweep sees a frame with a src and retires its placeholder. It runs on
       every sync, which also catches a category the visitor turned back OFF —
       though a frame that already loaded cannot be un-loaded, so that direction
       only matters for frames still held back. */
    try { sweepPlaceholders(); } catch (e) { /* noop */ }
  }

  /* ------------------------------------------- blocked-embed placeholders (§2) */

  /* SPEC V1.10 §2. When the core holds an <iframe> back — a known tracker, or
     any third-party frame in strict mode — it leaves it in one shape:
     `data-ck` + `data-src` and NO src (markBlockedIframe in ck-core.js). This
     module draws a block of the same size in its place, offering the visitor
     the one decision that would make the embed appear.

     WHY A SIBLING, NOT A WRAPPER: sites style embeds through the parent
     (`.video-wrap > iframe`, grid children, aspect-ratio boxes). Wrapping the
     frame inserts a node into that relationship and breaks the layout it was
     meant to preserve. A sibling inserted before the frame inherits the same
     parent context, and removing it later restores the DOM exactly.

     WHO RESTORES THE FRAME: not this file. `Element.prototype.setAttribute` is
     patched by the core, and only applyConsentToDom() may write a blocked
     frame's src — under `bypass`, through the native setter it captured before
     patching. So «Разрешить и показать» grants the category through the normal
     consent path and the CORE brings the frame back; the next sweep sees a
     frame that has a src again and drops the placeholder. One code path for
     the button, the panel's switches and «Принять всё» alike. */

  var PH_ATTR = 'data-ck-ph';            // marks a frame this file hid
  var PH_DISPLAY = 'data-ck-ph-display'; // its previous inline display value
  var placeholders = [];                 // [{ frame, node }]

  function placeholdersEnabled(cfg) {
    // No default in the core's DEFAULT_CONFIG, exactly like detailsAction:
    // absent means on, and only an explicit false opts out.
    try {
      var b = cfg && cfg.blocking;
      return !(b && b.placeholders === false);
    } catch (e) { return true; }
  }

  /* §2: «Не трогать фреймы display:none, 1×1, и те, что не в <body>.»
     Order matters — a frame this file has already hidden reads as display:none,
     which would make it skip its own placeholder and leave it stranded forever.
     Frames we marked are therefore exempted before the display test runs. */
  function frameEligible(frame) {
    try {
      if (!frame || !document.body) return false;
      if (!document.body.contains(frame)) return false;
      if (frame.getAttribute(PH_ATTR)) return true;   // ours: already measured
      var cs = null;
      try { cs = window.getComputedStyle(frame); } catch (e) { cs = null; }
      if (cs && (cs.display === 'none' || cs.visibility === 'hidden')) return false;
      var r = null;
      try { r = frame.getBoundingClientRect(); } catch (e) { r = null; }
      // A 1×1 (or 0×0) frame is a tracking pixel dressed as an embed: there is
      // nothing for a visitor to watch and a card in its place would be noise.
      if (r && r.width <= 1 && r.height <= 1) {
        // Zero-sized because it is not laid out YET (a lazy tab, a collapsed
        // section) is indistinguishable here from a real pixel except via the
        // attributes, which a pixel sets to 1 and a video does not.
        var aw = parseInt(frame.getAttribute('width') || '0', 10);
        var ah = parseInt(frame.getAttribute('height') || '0', 10);
        if (!(aw > 1 || ah > 1)) return false;
      }
      return true;
    } catch (e) { return false; }
  }

  /* Size the card to the hole the frame left. Attributes first (an embed is
     nearly always `width="560" height="315"`), computed size second. Read
     BEFORE the frame is hidden — getComputedStyle on a display:none element
     reports nothing worth copying. */
  function frameSize(frame) {
    var w = '', h = '';
    try {
      var aw = frame.getAttribute('width');
      var ah = frame.getAttribute('height');
      if (aw && /^\d+$/.test(String(aw).trim())) w = String(aw).trim() + 'px';
      if (ah && /^\d+$/.test(String(ah).trim())) h = String(ah).trim() + 'px';
      if (!w || !h) {
        var cs = window.getComputedStyle(frame);
        if (!w && cs && cs.width && cs.width !== 'auto' && cs.width !== '0px') w = cs.width;
        if (!h && cs && cs.height && cs.height !== 'auto' && cs.height !== '0px') h = cs.height;
      }
    } catch (e) { /* fall through to the defaults in PH_CSS */ }
    return { width: w, height: h };
  }

  var PLAY_ICON =
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" ' +
    'stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">' +
    '<rect x="2.5" y="4.5" width="19" height="15" rx="2.5"/>' +
    '<path d="M10.5 9.2v5.6l4.6-2.8-4.6-2.8Z"/></svg>';

  // Own sheet: a placeholder is its own shadow root, so it cannot borrow the
  // banner's. Tokens come from buildThemeCss() (theme.accent, radius, font),
  // which is why a placeholder repaints with the banner.
  var PH_CSS = [
    ':host{all:initial;display:block;max-width:100%}',
    '*,*::before,*::after{box-sizing:border-box}',
    '.ck-ph{width:100%;height:100%;min-height:120px;max-width:100%;',
    'display:flex;flex-direction:column;align-items:center;justify-content:center;',
    'gap:10px;padding:20px;text-align:center;',
    'font-family:var(--ck-font);font-size:14px;line-height:1.5;color:var(--ck-ink);',
    'background:var(--ck-soft);border:1px solid var(--ck-line);',
    'border-radius:var(--ck-radius-card)}',
    '.ck-ph svg{width:32px;height:32px;display:block;color:var(--ck-muted);flex:none}',
    '.ck-ph p{margin:0;color:var(--ck-muted);max-width:44ch}',
    '.ck-ph__row{display:flex;flex-wrap:wrap;gap:8px;align-items:center;justify-content:center}',
    '.ck-ph__btn{font:inherit;font-weight:600;cursor:pointer;padding:9px 16px;',
    'border-radius:var(--ck-radius-btn);border:1px solid var(--ck-accent);',
    'background:var(--ck-accent);color:var(--ck-on-accent)}',
    '.ck-ph__link{font:inherit;background:none;border:0;padding:4px;cursor:pointer;',
    'color:var(--ck-link);text-decoration:underline}',
    ':focus-visible{outline:2px solid var(--ck-accent);outline-offset:2px;border-radius:4px}'
  ].join('\n');

  function categoryEnabled(cfg, cat) {
    try {
      if (cat === 'necessary') return false;         // nothing to grant
      var c = cfg && cfg.categories && cfg.categories[cat];
      return !c || c.enabled !== false;
    } catch (e) { return true; }
  }

  function buildPlaceholder(frame, cat, cfg) {
    var mountEl = document.createElement('div');
    mountEl.setAttribute('data-ck-placeholder', '1');
    var size = frameSize(frame);
    var st = mountEl.style;
    st.setProperty('max-width', '100%');
    if (size.width) st.setProperty('width', size.width);
    if (size.height) st.setProperty('min-height', size.height);

    var sr = mountEl.attachShadow({ mode: 'open' });
    var sheet = document.createElement('style');
    /* buildThemeCss writes :host tokens — the same tokens, in this root, which
       is what makes a placeholder repaint with the banner.

       The font gets applyTheme()'s treatment for the same reason it needs it
       there: `:host{all:initial}` resets the family, so a bare `inherit` in
       this root resolves to the UA default (Times), not to the page's type.
       The probed page font when it can be read, the system stack when it
       cannot — never a bare `inherit`. */
    var built = buildThemeCss(cfg);
    var phFont = '';
    if (built.font === 'inherit') {
      phFont = '\n:host{--ck-font:' + (resolvePageFont() || SYSTEM_FONT) + '}';
    }
    sheet.textContent = PH_CSS + '\n' + built.css + phFont;
    sr.appendChild(sheet);

    var card = el('div', 'ck-ph');
    card.setAttribute('role', 'group');
    card.setAttribute('aria-label', T.phLabel);

    var icon = document.createElement('div');
    icon.innerHTML = PLAY_ICON;
    card.appendChild(icon);

    var frameSrcAttr = frame.getAttribute('data-src') || '';
    var label = hostOf(frameSrcAttr);
    // §3: when a refused SERVICE is what is holding this frame, the sentence
    // must name that service — its category is already granted.
    var held = holdingService(frameSrcAttr);
    card.appendChild(el('p', null,
      placeholderText(label, cat, LANG, held ? held.name : null)));

    var row = el('div', 'ck-ph__row');
    /* Only offer the grant when it can actually take effect: the core's
       filterByConfig() drops a category the site disabled in config, so the
       button would consume the click and change nothing. The panel link stays
       either way — it is always an honest answer. */
    if (categoryEnabled(cfg, cat)) {
      var allow = el('button', 'ck-ph__btn', T.phAllow);
      allow.type = 'button';
      // SPEC V1.12 §3: «кнопка "Разрешить и показать" включает категорию и
      // снимает отказ по этому сервису». The frame's own address decides which
      // service that is — the visitor pressed the button on THIS embed.
      allow.addEventListener('click', function () { grantCategory(cat, frameSrcAttr); });
      row.appendChild(allow);
    }
    var settings = el('button', 'ck-ph__link', T.phSettings);
    settings.type = 'button';
    settings.addEventListener('click', function () { openPanel(settings); });
    row.appendChild(settings);
    card.appendChild(row);

    sr.appendChild(card);
    return mountEl;
  }

  /* «Разрешить и показать» — one category, through the normal consent path.

     MERGE, DO NOT REPLACE: ConsentKit.accept({...}) SETS the whole opt-in set
     from the object it is given, so passing `{marketing:true}` alone would
     silently switch OFF an analytics consent the visitor had already given.
     The current state is read first and only the one category is flipped.

     accept(object) files the decision as method 'custom', which is what §2 asks
     the journal to record, and ck-saas.js logs it off the ck:consent/ck:change
     the core dispatches — so there is no logging code here. The core's
     applyConsentToDom() restores the frame; sweepPlaceholders() then removes
     this card, driven by the ck:change that same commit dispatches. */
  function grantCategory(cat, src) {
    var ck = api();
    if (!ck || typeof ck.accept !== 'function') return;
    var st = safeState();
    var cur = st.categories || {};
    var next = {
      functional: cur.functional === true,
      analytics: cur.analytics === true,
      marketing: cur.marketing === true
    };
    if (cat === 'functional' || cat === 'analytics' || cat === 'marketing') next[cat] = true;

    /* SPEC V1.12 §3 — clear the refusal on THIS frame's service, in the SAME
       accept() call as the category grant.

       One call, not two: the core revives blocked frames inside commit(), so a
       denial still standing at that moment leaves this frame dead until some
       later consent change happens to run applyConsentToDom() again. The whole
       map is passed because accept() replaces it wholesale — every OTHER
       refusal the visitor made is copied across untouched. */
    var denials = denialsWithout(st.services, src);
    if (denials) next.services = denials;

    try { ck.accept(next); } catch (e) { /* noop */ }
    syncFromState();
  }

  /* The stored denial map minus the service that owns `src`, or null when
     nothing would change (no denials, no service for that URL, or that service
     was not refused in the first place). */
  function denialsWithout(stored, src) {
    var ck = api();
    if (!ck || typeof ck._serviceForUrl !== 'function') return null;
    var map = {};
    var any = false;
    try {
      Object.keys(stored || {}).forEach(function (k) {
        if (stored[k] === false) { map[k] = false; any = true; }
      });
    } catch (e) { return null; }
    if (!any) return null;

    var svc = null;
    try { svc = src ? ck._serviceForUrl(src) : null; } catch (e2) { svc = null; }
    if (!svc || map[svc.id] !== false) return null;
    delete map[svc.id];
    return map;
  }

  function hideFrame(frame) {
    try {
      frame.setAttribute(PH_DISPLAY, frame.style.display || '');
      frame.setAttribute(PH_ATTR, '1');
      frame.style.display = 'none';
    } catch (e) { /* noop */ }
  }

  function restoreFrame(frame) {
    try {
      var prev = frame.getAttribute(PH_DISPLAY);
      frame.style.display = prev || '';
      frame.removeAttribute(PH_DISPLAY);
      frame.removeAttribute(PH_ATTR);
    } catch (e) { /* noop */ }
  }

  function dropPlaceholder(entry) {
    try {
      if (entry.node && entry.node.parentNode) entry.node.parentNode.removeChild(entry.node);
    } catch (e) { /* noop */ }
    restoreFrame(entry.frame);
  }

  function clearPlaceholders() {
    for (var i = 0; i < placeholders.length; i++) dropPlaceholder(placeholders[i]);
    placeholders = [];
  }

  /* Idempotent: called from mount() and from every consent change. Adds cards
     for frames still held back, removes them from frames the core revived. */
  function sweepPlaceholders(cfg) {
    if (typeof document === 'undefined' || !document.body) return;
    var c = cfg || safeConfig();

    // Placeholders turned off after some were drawn: take them all down.
    if (!placeholdersEnabled(c)) { clearPlaceholders(); return; }

    // 1. Retire cards whose frame came back (or left the document).
    var kept = [];
    for (var i = 0; i < placeholders.length; i++) {
      var e = placeholders[i];
      var revived = false;
      try {
        revived = !document.body.contains(e.frame) || !!e.frame.getAttribute('src');
      } catch (e2) { revived = true; }
      if (revived) dropPlaceholder(e); else kept.push(e);
    }
    placeholders = kept;

    // 2. Draw cards for frames the core is holding back. The selector is the
    //    core's own revival selector, which is why a frame the SITE allowed can
    //    never match: an allowed frame keeps its src and is never marked.
    var list;
    try { list = document.querySelectorAll('iframe[data-ck][data-src]'); } catch (e3) { return; }
    for (var j = 0; j < list.length; j++) {
      var frame = list[j];
      try {
        if (frame.getAttribute('src')) continue;              // already revived
        if (frame.getAttribute(PH_ATTR)) continue;            // already carded
        if (!frameEligible(frame)) continue;
        var cat = frame.getAttribute('data-ck') || 'marketing';
        var node = buildPlaceholder(frame, cat, c);
        if (frame.parentNode) frame.parentNode.insertBefore(node, frame);
        hideFrame(frame);
        placeholders.push({ frame: frame, node: node });
      } catch (e4) { /* one bad frame must not stop the sweep */ }
    }
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
      // Structural: link / button / nothing are three different DOM shapes,
      // and mount() is one-shot. Buttons and colours are deliberately NOT
      // here — they are token values and restyle in place.
      /* SPEC V1.16 §1.3 — the EFFECTIVE kind, not the configured one: a config
         whose policyUrl grows into (or out of) one of its own link rows flips
         the shape between link and nothing while resolveDetails still answers
         'policy'. Without the fold, a SaaS config arriving after the first
         mount would leave the duplicate on screen. The language is the config's
         own, resolved the way mount() resolves it, so the two sides of a
         comparison are always read in the same language. */
      detailsKind(c),
      /* SPEC V1.12 §3 — services are STRUCTURAL: each one adds a row with its
         own switch to the panel, and mount() is one-shot. Without this a SaaS
         config that arrives after the first mount (the second, idempotent
         init()) would re-run buildServices() in the core — so the engine would
         block per service — while the panel kept showing the service-less
         render, and the visitor would have no way to see or change any of it.

         The COUNT and the ids, not the whole rows: what needs a rebuild is a
         service appearing, disappearing or changing identity. A reworded
         `purpose` is text inside an existing row and does not justify tearing
         the panel down. */
      serviceSignature(c),
      /* SPEC V1.16 §1 — custom texts are STRUCTURAL for the same reason
         services are: the «Дополнительно» card and the link row are DOM nodes
         that appear and disappear, and mount() is one-shot. A SaaS config that
         arrives after the first render (the second, idempotent init()) would
         otherwise leave a panel with no operator block on a site that has one.

         Not the texts themselves, which can be long: the LANGUAGE KEYS that
         carry overrides, whether an extra block would render, and the links'
         identity. A reworded sentence inside a block that is already on screen
         does not justify tearing the panel down mid-decision. */
      textsSignature(c),
      brandSignature(c)
    ].join('|');
  }

  function textsSignature(cfg) {
    var texts = (cfg && cfg.texts && typeof cfg.texts === 'object' && !Array.isArray(cfg.texts))
      ? cfg.texts : null;
    if (!texts) return '0';
    var langs = [];
    for (var k in texts) {
      if (!Object.prototype.hasOwnProperty.call(texts, k)) continue;
      if (LANG_KEY_RE.test(String(k).toLowerCase())) langs.push(String(k).toLowerCase());
    }
    langs.sort();
    var list = texts.links;
    var ids = [];
    if (Array.isArray(list)) {
      for (var i = 0; i < list.length; i++) {
        var row = list[i];
        if (row && typeof row === 'object') ids.push(String(row.id || i) + ':' + String(row.url || ''));
      }
    }
    if (!langs.length && !ids.length) return '0';
    return langs.join(',') + '/' + ids.join(',');
  }

  function serviceSignature(cfg) {
    var list = cfg && cfg.services;
    if (!list || !Array.isArray(list) || !list.length) return '0';
    var ids = [];
    for (var i = 0; i < list.length; i++) {
      var s = list[i];
      if (!s || typeof s !== 'object' || s.enabled === false) continue;
      ids.push(String(s.id || '') + ':' + String(s.category || ''));
    }
    // '0' for «no services», however that came about: an absent key, an empty
    // array, or a list every row of which the core would drop. All three render
    // the same panel, so none of them may differ in the signature.
    if (!ids.length) return '0';
    return ids.length + ',' + ids.join(',');
  }

  /* ------------------------------------------------ SPEC V1.25 §1 — live lang */

  /* 0.5.24 — an SPA that sets `<html lang>` AFTER the banner mounted.

     The second live failure the 'page' order alone does not fix: a React
     cabinet ships `<html lang="ru">` statically and its own language switch
     writes `document.documentElement.lang` later, by which time the banner has
     already painted and mount() is one-shot. Switching the app to Romanian left
     a Russian banner until a reload.

     Why this cannot go through the ck:init path: signature() opens with the
     CONFIG's language string, which is the literal 'page' in this mode and does
     not change when the attribute does. A dispatched ck:init would compare
     equal and take the applyTheme() branch, repainting the palette and no text
     at all. So the decision is made on the RESOLVED code and calls the existing
     remount() — no mount logic is duplicated here.

     'page' only. Under 'auto' the attribute is deliberately not read at all
     (see resolveLang), and under a fixed code nothing about the page can change
     the answer — so in both there is nothing to observe and no observer is
     installed. */
  var langObserver = null;
  var langRemountScheduled = false;

  // The pure half: given the mounted code and the one we would resolve now,
  // should the UI be torn down and rebuilt? Extracted so the decision is
  // testable without a MutationObserver, and so both the guard and the test
  // read the same rule rather than two copies of it.
  function shouldRemountForLang(mountedLang, nextLang) {
    return !!nextLang && !!mountedLang && nextLang !== mountedLang;
  }

  function stopLangObserver() {
    if (langObserver) {
      try { langObserver.disconnect(); } catch (e) { /* noop */ }
      langObserver = null;
    }
    langRemountScheduled = false;
  }

  /* Installed at the end of mount(), disconnected at the top of remount() and
     again here before a new one is made, so there is never more than one
     observer watching the attribute however many times the banner rebuilds.

     Feature-checked rather than assumed: MutationObserver is absent from the
     stub DOMs the suite evaluates this file against, and a missing observer
     costs the live switch, not the banner. */
  function startLangObserver(cfg) {
    stopLangObserver();
    if (String((cfg && cfg.language) || '').toLowerCase() !== 'page') return;
    if (typeof MutationObserver !== 'function') return;
    if (typeof document === 'undefined' || !document.documentElement) return;
    try {
      langObserver = new MutationObserver(function () {
        // Debounced to one remount per tick: a switch that writes `lang` and
        // then rewrites it (or touches it alongside a class) delivers several
        // records, and each would otherwise tear the banner down again. The
        // flag is cleared INSIDE the scheduled callback, not after it, so the
        // next genuine change still schedules one.
        if (langRemountScheduled) return;
        langRemountScheduled = true;
        setTimeout(function () {
          langRemountScheduled = false;
          relangIfNeeded();
        }, 0);
      });
      langObserver.observe(document.documentElement, {
        attributes: true, attributeFilter: ['lang']
      });
    } catch (e) { langObserver = null; }
  }

  // Re-resolve and, only if the answer actually changed, rebuild. Reads the
  // LIVE config rather than the one captured at mount, so a page that changed
  // both its config and its `lang` rebuilds against the current one.
  function relangIfNeeded() {
    if (!mounted) return;
    var cfg = safeConfig();
    if (String((cfg && cfg.language) || '').toLowerCase() !== 'page') return;
    var next = resolveCfgLang(cfg, localeTable());
    if (!shouldRemountForLang(LANG, next)) return;
    // The panel belongs to the render about to be replaced, so «re-render it
    // too» means reopening the fresh one: remount() clears panelOpen on its way
    // through, which is why the flag is captured first. A visitor mid-decision
    // keeps the panel they opened, now in the new language.
    var wasOpen = panelOpen;
    remount(cfg);
    if (wasOpen) openPanel(null);
  }

  function remount(cfg) {
    mounted = false;
    panelOpen = false;
    lastFocus = null;
    // The observer belongs to the render being replaced; mount() installs a
    // fresh one. Without this a remount would leave the old one connected and
    // every rebuild would add another.
    stopLangObserver();
    // The cards belong to the render about to be replaced: their listeners close
    // over the old T and the old shadow root. mount() sweeps again and draws
    // fresh ones in the new language and theme.
    clearPlaceholders();
    // The pending schedule belongs to the shadow root about to be rebuilt; the
    // fresh mount() starts its own ladder from a clean count.
    clearFontTimers();
    fontScheduled = false;
    fontStable = false;
    fontProbeCount = 1;
    mount(cfg);
  }

  function mount(cfg) {
    if (mounted) return;
    if (!document.body) {
      document.addEventListener('DOMContentLoaded', function () { mount(safeConfig()); }, { once: true });
      return;
    }

    var table = localeTable();                       // read at render time
    LANG = resolveCfgLang(cfg, table);
    // SPEC V1.16 §1.1 — the config is the third merge layer, so it must be
    // handed in here: this is the only place that knows which language the
    // banner actually resolved to, which is what the override is keyed by.
    T = buildStrings(LANG, table, cfg);

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
    serviceSwitches = {};
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

    // Only now: scheduleFontProbes() re-applies the theme from a timer, and
    // applyTheme() is a no-op until there is a host and a themeStyle to write.
    scheduleFontProbes(cfg);

    // SPEC V1.10 §2 — заглушки вместо задержанных встраиваний. After the shadow
    // root exists, because a placeholder's «Настроить cookie» calls openPanel().
    sweepPlaceholders(cfg);

    /* SPEC V1.25 §1 — follow a `<html lang>` that changes AFTER this render.
       The single install site: mount() is the only thing that ever produces a
       banner, so an observer started here can never outnumber the renders. */
    startLangObserver(cfg);

    /* SPEC V1.10 §1 — honour a settings request that arrived before there was
       anything to open: either ConsentKit.openSettings() called while this file
       was still loading (the core latches it), or a page opened directly on
       `#ck-settings`. Both end in the same panel. */
    consumePendingOpen();
    openFromHash();
  }

  /* ---------------------------------------------------- settings deep link */

  var SETTINGS_HASH = '#ck-settings';

  // The core latches openSettings() calls made before ck-ui.js was parsed, so a
  // footer link clicked during a slow load still opens the panel once we exist.
  function consumePendingOpen() {
    var ck = api();
    if (!ck || !ck._pendingOpen) return;
    try { ck._pendingOpen = false; } catch (e) { /* noop */ }
    openPanel(null);
  }

  /* `https://site/#ck-settings` — the address the cookie declaration page links
     «Изменить выбор cookie» to. The hash is removed again via replaceState so a
     reload, a shared link or a back-navigation does not re-open the panel, and
     so the address bar does not keep a control fragment in it.

     replaceState is fed pathname+search rather than '' — an empty URL argument
     is a no-op in some engines, which would leave the hash in place and re-open
     the panel on the next hashchange. Everything is guarded: a sandboxed iframe
     throws on replaceState, and a panel that opened is worth more than a tidy
     address bar. */
  function openFromHash() {
    try {
      if (typeof location === 'undefined' || location.hash !== SETTINGS_HASH) return;
    } catch (e) { return; }
    clearSettingsHash();
    openPanel(null);
  }

  function clearSettingsHash() {
    try {
      if (typeof history === 'undefined' || typeof history.replaceState !== 'function') return;
      history.replaceState(null, '', location.pathname + location.search);
    } catch (e) { /* noop */ }
  }

  /* ---------------------------------------------------------------- events */

  /* ------------------------------------------------------- pure exports */

  /* SPEC V1.6 §1: the cabinet's theme editor must show the same numbers the
     banner actually paints — «один код — одни числа». Published BEFORE the
     SSR guard below on purpose: these are pure functions with no DOM in them,
     so they are reachable (and testable in node) on a page or in a process
     that never renders anything.

     Not a stable public API — the underscore says so — but the theme editor
     and the debug panel are both expected to read it rather than reimplement
     the arithmetic and drift. */
  (function () {
    var ck = api();
    if (!ck) return;
    ck._contrast = {
      relativeLuminance: relativeLuminance,
      contrastRatio: contrastRatio,
      ensureContrast: ensureContrast,
      stepToContrast: stepToContrast,
      resolveButtonStyles: resolveButtonStyles,
      resolveRadius: resolveRadius,
      resolveFont: resolveFont,
      pickPageFont: pickPageFont,
      nextProbeDelay: nextProbeDelay,
      shouldReprobe: shouldReprobe,
      resolveDetails: resolveDetails,
      buildThemeCss: buildThemeCss,
      // SPEC V1.10 §2: which sentence a blocked embed shows. Pure, so the
      // wording is testable (and quotable by the cabinet) without a DOM.
      placeholderText: placeholderText,
      placeholdersEnabled: placeholdersEnabled,
      /* SPEC V1.12 §3 — the pure halves of the services panel, so the wording
         and the arithmetic are testable (and quotable by the cabinet) without a
         DOM: which plural form a count takes in each language, how a group
         header reads, and which cookieTable rows sit under which service. */
      plural: plural,
      pluralIndex: pluralIndex,
      buildStrings: buildStrings,
      localeTable: localeTable,
      resolveLang: resolveLang,
      /* SPEC V1.25 §1 — the two page signals 'page' gained in 0.5.24, and the
         observer's decision. Pure and exported for the same reason resolveLang
         is: the path rule («two letters, or a code the table carries») and the
         og:locale normalisation are the parts a site owner gets wrong, and the
         cabinet's preview must answer exactly what the banner will. */
      pathLangSeg: pathLangSeg,
      ogLangTag: ogLangTag,
      shouldRemountForLang: shouldRemountForLang,
      cookieRowsForService: cookieRowsForService,
      looseCookies: looseCookies,
      /* SPEC V1.18.1 §1 — the two cells the cookie table computes rather than
         quotes. Pure, so the cabinet's cookie-table editor can show the visitor
         exactly what the banner will paint for a given language and a given
         number of days, without rebuilding either rule. */
      cookiePurpose: cookiePurpose,
      cookieExpiry: cookieExpiry,
      servicePurpose: servicePurpose,
      groupCountLabel: groupCountLabel,
      serviceSignature: serviceSignature,
      /* SPEC V1.16 §1 — the pure halves of the custom-text feature, so the
         cabinet's live preview quotes the same rules the banner paints and the
         server's validator can be tested against the same contract.

         renderRich() is the exception to «nothing here touches the DOM»: it
         BUILDS nodes, so it needs document.createElement. That is deliberate —
         the whole point of the function is that there is no innerHTML anywhere
         in it, and a version that returned a string could not promise that. It
         is still pure in every other sense: same input, same nodes, no reads of
         module state. In a context with no `document` it is simply not called. */
      renderRich: renderRich,
      resolveLinks: resolveLinks,
      linkLabel: linkLabel,
      detailsDuplicatesLink: detailsDuplicatesLink,
      detailsKind: detailsKind,
      textsSignature: textsSignature,
      signature: signature
    };
    // The page-font probe reads the DOM, so it is not part of the pure block —
    // but the debug panel must be able to quote the family the banner painted
    // rather than guess at it. Safe to call before mount: with no shadow root
    // to measure the UA default against it simply returns the cache (null).
    ck._resolvePageFont = function () {
      return (typeof document === 'undefined' || !root) ? pageFont : resolvePageFont();
    };
    // How many times the SCHEDULER has looked (1 = the mount probe alone). The
    // debug panel prints it: on a Tilda-style page the interesting fact is that
    // the family arrived on the third look, not on the first.
    ck._pageFontAttempt = function () { return fontProbeCount; };
  })();

  // SSR-safe: with no DOM there is nothing to render or listen to, so importing
  // this file in Node is a no-op rather than a throw (mirrors the core).
  if (typeof document === 'undefined') return;

  // Claim the page for this copy (SPEC §1.9, guard at the top of the file).
  // Here rather than at the top: only now does this copy take ownership of the
  // listeners and the mount, and only that ownership is worth locking.
  try { if (typeof window !== 'undefined') { window.__ckUiLoaded = true; } } catch (e) { /* noop */ }

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
    // mount() consumes the core's latch itself; clear it here too so a call
    // made while we were already mounted cannot leave a stale flag behind for
    // a later remount to act on.
    var ck = api();
    if (ck && ck._pendingOpen) { try { ck._pendingOpen = false; } catch (e) { /* noop */ } }
    openPanel(null);
  });

  /* SPEC V1.10 §1 — navigating to `#ck-settings` on a page that is already
     loaded (a footer link, or the declaration page opened in the same tab).
     mount() covers the other half: a page ENTERED on that hash.

     Feature-checked rather than assumed: the SSR guard above only proves there
     is a `document`, and the branding suite evaluates this file against a stub
     window that has none of the event plumbing. A missing hashchange costs the
     deep link, not the banner. */
  if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
    window.addEventListener('hashchange', function () {
      if (!mounted) mount(safeConfig());
      openFromHash();
    });
  }

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
