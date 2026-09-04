/* ConsentKit public page — language switch, pricing render, live demo.
 *
 * No frameworks, no build step, and only our own API: the page that argues for
 * privacy must not itself load a third-party font, script or beacon. Its one
 * off-origin request is GET {API_BASE}/v1/public/pricing, for the prices.
 *
 * Load order matters. index.html loads vendor/ck-core.js, ck-locales.js and
 * ck-ui.js before this file, so ConsentKit.init() below runs before the UI's
 * setTimeout(...,0) fallback mount — the first render already uses the demo
 * config instead of the core's parse-time defaults.
 */
(function () {
  'use strict';

  /* ══════════════════════════════════════════════════════════════════
     OWNER-EDITABLE CONSTANTS — the only place each value appears.
     ══════════════════════════════════════════════════════════════════ */

  // Agency enquiries. Replace CONTACT_EMAIL with the real address; the
  // Agency column's mailto: button is built from this and nothing else.
  var CONTACT_EMAIL = 'info@ecomconsult.net';

  // The API this page reads prices from. The ONLY external request the page
  // makes, and it is our own API — see PLAN_LIMITS below and loadPricing() for
  // what happens when it is slow, down or answers with something malformed.
  var API_BASE = 'https://consent.ecomconsult.net';

  // Monthly price in EUR. Rendered into both the RU and EN pricing tables,
  // so the number itself lives here once and never in the copy.
  var PRICES = { free: 0, starter: 9, business: 69 };

  // Sites included per plan (null = negotiated).
  var SITE_LIMITS = { free: 1, starter: 1, business: 10, agency: null };

  var CABINET_URL = 'https://app.ecomconsult.net';

  // The remaining per-plan limits, in the shape GET /v1/public/pricing returns
  // them (SPEC-V1.4 §2). Together with PRICES / SITE_LIMITS this is the
  // fallback the page renders when the API cannot be reached — so these
  // numbers live here as data rather than baked into the RU and EN sentences
  // twice over, and one code path renders both sources.
  var PLAN_ORDER = ['free', 'starter', 'business', 'agency'];

  var PRICE_UNITS = { free: 'month', starter: 'site_month', business: 'month', agency: 'month' };

  var PLAN_LIMITS = {
    free:     { scansManualPerDay: 1,  scheduledScans: false, alerts: false, brandingOff: false, journalCsv: false, journalRetentionDays: 30 },
    starter:  { scansManualPerDay: 5,  scheduledScans: true,  alerts: true,  brandingOff: true,  journalCsv: true,  journalRetentionDays: 365 },
    business: { scansManualPerDay: 30, scheduledScans: true,  alerts: true,  brandingOff: true,  journalCsv: true,  journalRetentionDays: 730 },
    agency:   { scansManualPerDay: 30, scheduledScans: true,  alerts: true,  brandingOff: true,  journalCsv: true,  journalRetentionDays: 1095 }
  };

  /* ══════════════════════════════════════════════════════════════════
     i18n dictionary — INLINED BY THE BUILD, not fetched and not switchable.

     tools/build-site.mjs renders one page per language from
     site/src/index.template.html + site/src/i18n/<lang>.json, writes the whole
     dictionary into a <script> block ahead of this file, and stamps
     <html lang>. So the copy in the markup and the copy this file reads for
     the JS-rendered parts (pricing, FAQ, the demo selects) are the same
     object, and there is no runtime language switch to keep them in step.

     The language is read from the document, never from a stored preference
     or the browser's own setting: the URL already decides it, and remembering
     a choice would make /ru render English for a returning visitor.
     ══════════════════════════════════════════════════════════════════ */

  var I18N = (typeof window !== 'undefined' && window.__CK_SITE_I18N) || {};

  /* ══════════════════════════════════════════════════════════════════
     Language state
     ══════════════════════════════════════════════════════════════════ */

  /* The page language, from the document the build stamped. Not a preference
     and not negotiable at runtime: /ru is Russian because it is /ru. Used for
     the plural rules below and for the demo banner's default language. */
  var lang = (function () {
    var l = '';
    try { l = String(document.documentElement.lang || '').toLowerCase(); } catch (e) {}
    return (l === 'ru' || l === 'ro') ? l : 'en';
  })();

  /* I18N is one flat dictionary — the build inlined the language this page
     was rendered in, so there is nothing to index by language here. A missing
     key returns the key itself, which is loud in the UI rather than silent. */
  function t(key) {
    var v = I18N[key];
    return (typeof v === 'string') ? v : key;
  }

  /* ══════════════════════════════════════════════════════════════════
     Small DOM helpers
     ══════════════════════════════════════════════════════════════════ */

  function $(sel, root) { return (root || document).querySelector(sel); }
  function $$(sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); }

  function el(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    // textContent throughout: every string in the dictionary is plain text and
    // some of them legitimately contain "<script src>", which must never be
    // parsed as markup.
    if (text != null) n.textContent = text;
    return n;
  }

  /* ══════════════════════════════════════════════════════════════════
     Pricing

     Two sources, one renderer. GET /v1/public/pricing (SPEC-V1.4 §2) is the
     truth when it answers in time; the constants above are the fallback when
     it does not. Both are normalised into the same array of plan descriptors
     BEFORE anything is drawn, so the section can never show a mix of the two
     and can never be empty — the constants paint on the first frame and a
     good response replaces the whole block at once.

     Numbers come from the descriptor; every word around them comes from I18N.
     ══════════════════════════════════════════════════════════════════ */

  /* Three plural systems, one dictionary shape (One/Few/Many in every language,
     so the key sets stay identical and the parity test is a real invariant).

     en  — singular/plural; Few carries the same text as Many. Applying the
           Slavic rule here would produce "31 day" and "21 month" for numbers
           an admin can legitimately set.
     ru  — three forms chosen off the last digit, with the 11–19 exception.
     ro  — 1 / 2–19 / 20+ , and from 20 up the noun takes the «de» linker
           ("20 de zile"), which is why unit*Many carries it in ro.json.
           The rule repeats per hundred: 101 is singular, 120 takes «de».  */
  function plural(n, base) {
    var abs = Math.abs(n);
    var form;

    if (lang === 'ru') {
      var r100 = abs % 100;
      var r10 = r100 % 10;
      if (r100 > 10 && r100 < 20) form = 'Many';
      else if (r10 === 1) form = 'One';
      else if (r10 >= 2 && r10 <= 4) form = 'Few';
      else form = 'Many';
    } else if (lang === 'ro') {
      var m100 = abs % 100;
      if (abs === 1) form = 'One';
      else if (m100 === 0 || (m100 >= 20 && m100 <= 99)) form = 'Many';
      else form = 'Few';
    } else {
      form = (abs === 1) ? 'One' : 'Many';
    }

    return t(base + form).replace('{n}', String(n));
  }

  function fill(key, n) {
    return t(key).replace('{n}', String(n));
  }

  /* The descriptor a card is drawn from. `limits` is the payload shape. */
  function planDescriptor(plan, priceEur, priceUnit, limits) {
    return { plan: plan, priceEur: priceEur, priceUnit: priceUnit, limits: limits };
  }

  function fallbackPlans() {
    return PLAN_ORDER.map(function (plan) {
      var limits = PLAN_LIMITS[plan];
      return planDescriptor(
        plan,
        // Agency is «по договору» — no number in the constants either.
        plan === 'agency' ? null : PRICES[plan],
        PRICE_UNITS[plan],
        {
          sites: SITE_LIMITS[plan],
          scansManualPerDay: limits.scansManualPerDay,
          scheduledScans: limits.scheduledScans,
          alerts: limits.alerts,
          brandingOff: limits.brandingOff,
          journalCsv: limits.journalCsv,
          journalRetentionDays: limits.journalRetentionDays
        }
      );
    });
  }

  function isNum(v) { return typeof v === 'number' && isFinite(v); }
  function isBool(v) { return typeof v === 'boolean'; }

  /* All-or-nothing: one malformed plan discards the whole response, because a
     per-plan fallback is exactly the mix of sources this must never show. */
  function normalisePayload(data) {
    if (!data || Object.prototype.toString.call(data.plans) !== '[object Array]') return null;

    var byId = {};
    for (var i = 0; i < data.plans.length; i++) {
      var p = data.plans[i];
      if (!p || typeof p !== 'object') return null;
      // A plan the dictionary has no name, note or CTA for cannot be drawn
      // without inventing copy, so it is skipped rather than guessed at.
      if (PLAN_ORDER.indexOf(p.plan) === -1) continue;
      if (p.public === false) continue;

      var l = p.limits;
      if (!l || typeof l !== 'object') return null;
      if (!(p.priceEur === null || isNum(p.priceEur))) return null;
      if (p.priceUnit !== 'month' && p.priceUnit !== 'site_month') return null;
      if (!(l.sites === null || isNum(l.sites))) return null;
      if (!isNum(l.scansManualPerDay) || !isNum(l.journalRetentionDays)) return null;
      if (!isBool(l.scheduledScans) || !isBool(l.alerts) ||
          !isBool(l.brandingOff) || !isBool(l.journalCsv)) return null;

      byId[p.plan] = planDescriptor(p.plan, p.priceEur, p.priceUnit, {
        sites: l.sites,
        scansManualPerDay: l.scansManualPerDay,
        scheduledScans: l.scheduledScans,
        alerts: l.alerts,
        brandingOff: l.brandingOff,
        journalCsv: l.journalCsv,
        journalRetentionDays: l.journalRetentionDays
      });
    }

    // Canonical order, not the array's: the featured card and the column
    // layout must not move because the API reordered its rows.
    var out = PLAN_ORDER.filter(function (id) { return byId[id]; })
      .map(function (id) { return byId[id]; });
    return out.length ? out : null;
  }

  // What renderPricing() draws. Replaced wholesale, never patched per plan.
  var plans = fallbackPlans();

  function priceCell(d) {
    // A span, not a <p>: this now lives inside a <td>, where a block-level
    // paragraph would inherit the cell's own margins twice over.
    var box = el('span', 'plan-price');
    if (d.priceEur === null) {
      box.appendChild(el('span', 'plan-price__agreement', t('byAgreement')));
      return box;
    }
    box.appendChild(el('span', 'plan-price__num', '€' + d.priceEur));
    // Free carries no unit: «€0 / мес» reads like a bill.
    if (d.priceEur !== 0) {
      box.appendChild(el('span', 'plan-price__unit',
        d.priceUnit === 'site_month' ? t('perSitePerMonth') : t('perMonth')));
    }
    return box;
  }

  function sitesText(d) {
    // Order matters. Starter is sold per site and the API sends sites: null
    // for it (plans.ts: the real ceiling is orgs.paid_sites, not the table),
    // so the per-site unit must be read BEFORE null is taken as "unlimited" —
    // otherwise the card would promise unlimited sites at a per-site price.
    if (d.priceUnit === 'site_month') return t('sitesOneEach');
    if (d.limits.sites === null) return t('sitesUnlimited');
    if (d.limits.sites === 1) return t('sitesOne');
    return fill('sitesUpTo', d.limits.sites);
  }

  function scansText(d) {
    var n = d.limits.scansManualPerDay;
    // RU keeps the bare number («5 в день вручную»); EN needs the noun to
    // agree, so the count goes through plural() in both and the dictionary
    // decides whether a word is attached to it.
    if (d.limits.scheduledScans) return fill('scansScheduled', n);
    return t('scansManualOnly').replace('{n}', plural(n, 'unitScan'));
  }

  function logText(d) {
    var days = d.limits.journalRetentionDays;
    // Whole months once past a year, days below it — 365/730/1095 land on
    // 12/24/36 exactly, and plural() picks the right form for each.
    var months = days >= 365 ? Math.round(days / 365 * 12) : 0;
    var amount = months ? plural(months, 'unitMonth') : plural(days, 'unitDay');
    var key = months
      ? (d.limits.journalCsv ? 'logMonthsCsv' : 'logMonths')
      : (d.limits.journalCsv ? 'logDaysCsv' : 'logDays');
    return t(key).replace('{n}', amount);
  }

  var PLAN_ROWS = [
    ['rowSites',    sitesText],
    ['rowBranding', function (d) { return t(d.limits.brandingOff ? 'brandingOptional' : 'brandingRequired'); }],
    ['rowScans',    scansText],
    ['rowLog',      logText],
    ['rowAlerts',   function (d) { return t(d.limits.alerts ? 'yes' : 'no'); }],
    // Not in the payload — the same for every plan, so it stays dictionary-only.
    ['rowLangs',    function () { return t('langsAll'); }],
    ['rowSupport',  function (d) { return t('support' + cap(d.plan)); }]
  ];

  function cap(s) { return s.charAt(0).toUpperCase() + s.slice(1); }

  var FEATURED = 'business';

  /* The CTA that used to sit at the foot of each card. Same three cases, and
     the agency one is still the only link that leaves for mailto:. */
  function ctaLink(d) {
    var a = el('a', 'btn btn--sm ' + (d.plan === FEATURED ? 'btn--primary' : 'btn--ghost'));
    if (d.priceEur === null) {
      a.href = 'mailto:' + CONTACT_EMAIL;
      a.textContent = t('planCtaAgency');
    } else {
      a.href = CABINET_URL;
      a.textContent = d.priceEur === 0 ? t('planCtaFree') : t('planCtaPaid');
    }
    return a;
  }

  /* One <td>/<th> per plan, with the featured column's class stamped on every
     cell. A <col> could paint the background but cannot carry the side borders
     that make the column read as one highlighted block, so the class goes on
     the cells — which are generated here anyway. */
  function planCell(tag, d, cls) {
    var c = el(tag, (cls ? cls + ' ' : '') + (d.plan === FEATURED ? 'is-featured' : ''));
    return c;
  }

  /* P3-8: one comparison table instead of four cards, so a reader compares
     along a row instead of re-reading four columns for the same seven labels.
     A real <table> with <caption> and <th scope> in both directions: the row
     labels are row headers, the plan names are column headers, so a screen
     reader announces "Business, Scans, weekly + 30 per day manually" for any
     cell the visitor lands on. */
  function renderPricing() {
    var host = $('#plans');
    if (!host) return;
    host.textContent = '';

    var table = el('table', 'plan-table');

    var caption = el('caption', 'plan-table__caption', t('priceTableCaption'));
    table.appendChild(caption);

    /* ---- head: plan name, the «most popular» flag and the per-plan note --- */
    var thead = el('thead');
    var hrow = el('tr');
    // The corner cell labels the column of row labels below it.
    hrow.appendChild(el('th', 'plan-table__corner', t('rowPlan')));

    plans.forEach(function (d) {
      var th = planCell('th', d, 'plan-col');
      th.scope = 'col';
      if (d.plan === FEATURED) {
        th.appendChild(el('span', 'plan-flag', t('recommended')));
      }
      th.appendChild(el('span', 'plan-name', t('plan' + cap(d.plan))));
      th.appendChild(el('span', 'plan-note', t('plan' + cap(d.plan) + 'Note')));
      hrow.appendChild(th);
    });
    thead.appendChild(hrow);
    table.appendChild(thead);

    /* ---- body: price first, then the seven feature rows ------------------ */
    var tbody = el('tbody');

    var prow = el('tr', 'plan-table__row plan-table__row--price');
    var plabel = el('th', null, t('rowPrice'));
    plabel.scope = 'row';
    prow.appendChild(plabel);
    plans.forEach(function (d) {
      var td = planCell('td', d);
      td.appendChild(priceCell(d));
      prow.appendChild(td);
    });
    tbody.appendChild(prow);

    PLAN_ROWS.forEach(function (row) {
      var tr = el('tr', 'plan-table__row');
      var label = el('th', null, t(row[0]));
      label.scope = 'row';
      tr.appendChild(label);
      plans.forEach(function (d) {
        tr.appendChild(planCell('td', d, null)).textContent = row[1](d);
      });
      tbody.appendChild(tr);
    });
    table.appendChild(tbody);

    /* ---- foot: the buttons, one per column ------------------------------- */
    var tfoot = el('tfoot');
    var frow = el('tr', 'plan-table__row plan-table__row--cta');
    var flabel = el('th', null, t('rowCta'));
    flabel.scope = 'row';
    frow.appendChild(flabel);
    plans.forEach(function (d) {
      var td = planCell('td', d);
      td.appendChild(ctaLink(d));
      frow.appendChild(td);
    });
    tfoot.appendChild(frow);
    table.appendChild(tfoot);

    /* The table is wider than a phone. It scrolls inside its own wrapper —
       never the page — and the wrapper is a focusable labelled region so the
       scroll is reachable from the keyboard, which `overflow:auto` alone is
       not. The hint below it is visible copy, not a decoration. */
    var scroller = el('div', 'plan-scroll');
    scroller.tabIndex = 0;
    scroller.setAttribute('role', 'region');
    scroller.setAttribute('aria-label', t('priceTableCaption'));
    scroller.appendChild(table);

    host.appendChild(scroller);

    /* The hint is a fact about the current layout, not about the viewport: it
       is shown when the table really does overflow its wrapper and hidden when
       it does not, so a wide window is never told to scroll something that
       fits — and a narrow one, or a large browser font, still gets told. */
    var hint = el('p', 'plan-scroll__hint', t('priceScrollHint'));
    host.appendChild(hint);

    var syncHint = function () {
      var overflows = scroller.scrollWidth > scroller.clientWidth + 1;
      hint.hidden = !overflows;
      // A region with nothing to scroll should not be a tab stop of its own.
      scroller.tabIndex = overflows ? 0 : -1;
    };
    syncHint();
    if (typeof ResizeObserver === 'function') {
      new ResizeObserver(syncHint).observe(scroller);
    } else if (window.addEventListener) {
      window.addEventListener('resize', syncHint);
    }
  }

  /* The page's only external request, and it is our own API. Two seconds, no
     custom headers (so no preflight) and no cookies; any failure, timeout or
     malformed body leaves the constants on screen. */
  function loadPricing() {
    if (typeof fetch !== 'function' || typeof AbortController !== 'function') return;

    var ctl = new AbortController();
    var timer = setTimeout(function () { ctl.abort(); }, 2000);

    fetch(API_BASE + '/v1/public/pricing', {
      credentials: 'omit',
      signal: ctl.signal
    })
      .then(function (res) { return res.ok ? res.json() : null; })
      .then(function (data) {
        var next = normalisePayload(data);
        if (!next) return;
        plans = next;
        // renderPricing() alone, not renderPage(): re-running the latter would
        // reset the demo the visitor may already be playing with.
        renderPricing();
      })
      .catch(function () { /* offline, timed out, blocked: keep the constants */ })
      .then(function () { clearTimeout(timer); });
  }

  /* ══════════════════════════════════════════════════════════════════
     FAQ — native <details>, so it works with the keyboard for free
     ══════════════════════════════════════════════════════════════════ */

  function renderFaq() {
    var host = $('#faq-list');
    if (!host) return;
    host.textContent = '';
    var items = Array.isArray(I18N.faq) ? I18N.faq : [];
    items.forEach(function (qa, i) {
      var d = el('details', 'qa');
      if (i === 0) d.open = true;
      var s = el('summary', null, qa[0]);
      d.appendChild(s);
      d.appendChild(el('p', null, qa[1]));
      host.appendChild(d);
    });
  }

  /* ══════════════════════════════════════════════════════════════════
     Live demo
     ══════════════════════════════════════════════════════════════════ */

  var CK = null;
  try { CK = window.ConsentKit || null; } catch (e) { CK = null; }

  // 32 external locales from ck-locales.js + the two built into ck-ui.js.
  // Read at runtime so adding a locale to the client shows up here with no edit.
  function bannerLanguages() {
    var ext = [];
    try { ext = Object.keys(window.__ckLocales || {}); } catch (e) { ext = []; }
    var all = ['en', 'ru'].concat(ext).filter(function (v, i, a) { return a.indexOf(v) === i; });
    all.sort();
    return all;
  }

  // Endonyms, so the option list is readable in the language it names.
  var LANG_NAMES = {
    bg: 'Български', ca: 'Català', cs: 'Čeština', da: 'Dansk', de: 'Deutsch',
    el: 'Ελληνικά', en: 'English', es: 'Español', et: 'Eesti', fi: 'Suomi',
    fr: 'Français', ga: 'Gaeilge', hr: 'Hrvatski', hu: 'Magyar', is: 'Íslenska',
    it: 'Italiano', lt: 'Lietuvių', lv: 'Latviešu', mk: 'Македонски', mt: 'Malti',
    nb: 'Norsk bokmål', nl: 'Nederlands', no: 'Norsk', pl: 'Polski',
    pt: 'Português', ro: 'Română', ru: 'Русский', sk: 'Slovenčina',
    sl: 'Slovenščina', sq: 'Shqip', sr: 'Српски', sv: 'Svenska',
    tr: 'Türkçe', uk: 'Українська'
  };

  // resolveLayout() in ck-ui.js accepts only these; anything else silently
  // falls back, so the option list is driven off the layout rather than being
  // a free-form four-way.
  var POSITIONS = {
    bar: [['bottom', 'posBottom'], ['top', 'posTop']],
    box: [['bottom-right', 'posBottomRight'], ['bottom-left', 'posBottomLeft']],
    modal: []
  };

  var demo = {
    layout: 'bar',
    position: 'bottom',
    theme: 'auto',
    bannerLang: 'auto'
  };

  function brandingFor(l) {
    // PLAN-V1.3, owner decision 5: the Russian line for ru, English otherwise.
    // Deliberately NOT localised any further, including for ro — the demo has to
    // show what a real build produces, and tools/build-inline.mjs emits exactly
    // these two variants. A Romanian line here would advertise an attribution
    // the product does not actually ship.
    return {
      poweredBy: {
        text: l === 'ru' ? 'Сделано в E-COM Consult' : 'Made by E-COM Consult',
        url: 'https://ecomconsult.net'
      }
    };
  }

  function demoConfig() {
    var l = demo.bannerLang;
    // 'auto' means "follow the visitor" in a real installation. In the demo it
    // would let the banner speak the browser's language while the page and the
    // branding line speak another — visibly inconsistent on the same screen —
    // so here 'auto' resolves to the page language and the option is labelled
    // accordingly.
    var effective = (l === 'auto') ? lang : l;
    return {
      language: effective,
      layout: { type: demo.layout, position: demo.position },
      theme: { mode: demo.theme, accent: '#2B50D8', radius: '10px' },
      branding: brandingFor(effective),
      // Off, so the demo emits no further Consent Mode updates or GTM events as
      // you click around. Note the core still writes ONE all-denied Consent Mode
      // default into window.dataLayer at parse time — that happens before
      // init() can read this flag. It is an in-memory array on a page with no
      // Google tags, so nothing is sent anywhere; the page still makes only
      // same-origin requests (the document, styles.css, favicon.svg, app.js and
      // the four vendor scripts) and no external ones.
      integrations: { gcm: false, gtmDataLayer: false },
      cookieTable: cookieTable()
    };
  }

  function cookieTable() {
    // Demo rows only — a real installation gets these from the scanner. Picked
    // by page language so the panel reads in the same language as the page.
    var COPY = {
      en: [
        ['Stores the visitor\u2019s choice so the banner does not ask again.', '12 months'],
        ['Example: distinguishes visitors in analytics.', '2 years'],
        ['Example: links the visit to an ad campaign.', '3 months']
      ],
      ru: [
        ['Хранит выбор посетителя, чтобы не спрашивать снова.', '12 месяцев'],
        ['Пример: различает посетителей в статистике.', '2 года'],
        ['Пример: связывает визит с рекламной кампанией.', '3 месяца']
      ],
      ro: [
        ['Păstrează alegerea vizitatorului, ca bannerul să nu întrebe din nou.', '12 luni'],
        ['Exemplu: deosebește vizitatorii în statistici.', '2 ani'],
        ['Exemplu: leagă vizita de o campanie publicitară.', '3 luni']
      ]
    };
    var c = COPY[lang] || COPY.en;
    return [
      { name: 'ck_consent', category: 'necessary', provider: 'ConsentKit',
        purpose: c[0][0], expiry: c[0][1] },
      { name: '_ga', category: 'analytics', provider: 'Google Analytics',
        purpose: c[1][0], expiry: c[1][1] },
      { name: '_fbp', category: 'marketing', provider: 'Meta',
        purpose: c[2][0], expiry: c[2][1] }
    ];
  }

  /* Re-render the banner with a new config.
   *
   * ConsentKit.init() is idempotent: after the first call it merges the config
   * into ConsentKit.config and returns WITHOUT dispatching ck:init, so the UI
   * never hears about the change. The UI's remount path is driven purely by the
   * ck:init document event, so we dispatch it ourselves with the merged config.
   * ck-ui.js then compares signature(cfg) and either remounts (layout, position,
   * language, branding, cookie table) or restyles (palette only).
   */
  function applyDemo() {
    if (!CK) return;
    try {
      CK.init(demoConfig());
      document.dispatchEvent(new CustomEvent('ck:init', {
        detail: { config: CK.config, state: CK.getState() }
      }));
    } catch (e) { /* the demo must never break the page */ }
    updateStatus();
  }

  function updateStatus() {
    var out = $('#d-status');
    if (!out) return;
    if (!CK) { out.textContent = t('statusBroken'); return; }
    var s;
    try { s = CK.getState(); } catch (e) { out.textContent = t('statusBroken'); return; }

    if (!s || !s.decided) { out.textContent = t('statusUndecided'); return; }
    var cats = s.categories || {};
    var on = ['functional', 'analytics', 'marketing'].filter(function (c) { return cats[c] === true; });
    out.textContent = t('statusDecided').replace('{cats}', on.length ? on.join(', ') : t('statusNone'));
  }

  function fillPositionSelect() {
    var sel = $('#d-position');
    var field = $('#d-position-field');
    if (!sel || !field) return;

    var opts = POSITIONS[demo.layout] || [];
    // A centred modal has no position; hiding the control is honest, and
    // [hidden] keeps it out of the accessibility tree too.
    field.hidden = opts.length === 0;
    sel.textContent = '';
    opts.forEach(function (o) {
      var n = el('option', null, t(o[1]));
      n.value = o[0];
      sel.appendChild(n);
    });
    if (opts.length) {
      var valid = opts.some(function (o) { return o[0] === demo.position; });
      if (!valid) demo.position = opts[0][0];
      sel.value = demo.position;
    }
  }

  function fillLanguageSelect() {
    var sel = $('#d-lang');
    if (!sel) return;
    var prev = demo.bannerLang;
    sel.textContent = '';

    var auto = el('option', null, t('langAuto'));
    auto.value = 'auto';
    sel.appendChild(auto);

    bannerLanguages().forEach(function (code) {
      var n = el('option', null, (LANG_NAMES[code] || code) + ' (' + code + ')');
      n.value = code;
      sel.appendChild(n);
    });
    sel.value = prev;
    if (sel.value !== prev) { sel.value = 'auto'; demo.bannerLang = 'auto'; }
  }

  function wireDemo() {
    var layout = $('#d-layout'), pos = $('#d-position'),
        theme = $('#d-theme'), dlang = $('#d-lang'), again = $('#d-again');

    if (layout) layout.addEventListener('change', function () {
      demo.layout = layout.value;
      fillPositionSelect();
      applyDemo();
    });
    if (pos) pos.addEventListener('change', function () { demo.position = pos.value; applyDemo(); });
    if (theme) theme.addEventListener('change', function () { demo.theme = theme.value; applyDemo(); });
    if (dlang) dlang.addEventListener('change', function () { demo.bannerLang = dlang.value; applyDemo(); });

    if (again) again.addEventListener('click', function () {
      if (!CK) return;
      try {
        // withdraw() clears the stored record and dispatches ck:change; the UI's
        // syncFromState() un-hides the banner. No page reload needed.
        CK.withdraw();
      } catch (e) { /* noop */ }
      updateStatus();
    });

    // The client tells us when the visitor decides, so the status line stays true.
    document.addEventListener('ck:change', updateStatus);
    document.addEventListener('ck:consent', updateStatus);
  }

  /* ══════════════════════════════════════════════════════════════════
     Page language application
     ══════════════════════════════════════════════════════════════════ */

  /* Draw the parts of the page that are built in JavaScript rather than by the
     site build: the pricing table, the FAQ list and the demo's select options.
     Everything with a data-i18n attribute is ALREADY translated in the markup
     the build wrote — this file must not touch it, or the page would flicker
     from correct copy to identical copy on every load.

     There is no language switching left to do here. Each language is its own
     URL, and the switcher is three plain links; <title>, the meta description,
     the og: pair and <html lang> are static in each rendered page, so the old
     applyLang() had nothing left to apply. */
  function renderPage() {
    renderPricing();
    renderFaq();
    fillPositionSelect();
    fillLanguageSelect();
    // The demo's cookie table and branding line follow the page language.
    applyDemo();
  }

  /* ══════════════════════════════════════════════════════════════════
     P3-9 — move the floating re-open button off the pricing table

     ck-ui.js mounts everything it draws into the shadow root of #ck-root, and
     its .ck-fab is position:fixed at left:16px/bottom:16px, 48×48. On this page
     that lands on the pricing section's left-hand column — the row labels and
     the leftmost CTA button. A button covering a button is the bad case.

     A rule in site/styles.css cannot fix it: page stylesheets do not cross a
     shadow boundary, so it would be dead CSS that looks like a fix. The root is
     attached mode:'open', though, so the page can append a stylesheet of its
     own into it. That is done here rather than in site/vendor/ck-ui.js, which
     is a byte-for-byte copy of the shipped client (test/site-vendor.test.mjs):
     the button sits at bottom-left for every other site that embeds it, and
     only this page has a reason to move it.

     Specificity, not source order: our block is appended at an unpredictable
     point relative to the vendor's own, so `.ck-fab.ck-fab` outranks it either
     way — no !important needed.
     ══════════════════════════════════════════════════════════════════ */

  var FAB_STYLE_ID = 'ck-site-fab-position';

  function placeFab() {
    var host = document.getElementById('ck-root');
    if (!host || !host.shadowRoot) return false;
    // init() is idempotent and may remount; appending twice would be harmless
    // but untidy, and this also lets the retry below stop at the first success.
    if (host.shadowRoot.getElementById(FAB_STYLE_ID)) return true;

    var style = document.createElement('style');
    style.id = FAB_STYLE_ID;
    style.textContent =
      '.ck-fab.ck-fab{left:auto;right:16px;bottom:16px}' +
      '@media (max-width:560px){.ck-fab.ck-fab{right:12px;bottom:12px}}';
    host.shadowRoot.appendChild(style);
    return true;
  }

  /* The host does not exist yet on the first pass — ck-ui.js creates it when it
     mounts, which happens on ck:init or its own setTimeout(...,0). A rule does
     not need its element to exist, so one successful append covers the button
     whenever it is later built; these few attempts only have to outlast the
     mount itself. */
  function placeFabWhenMounted() {
    if (placeFab()) return;
    var tries = 0;
    var timer = setInterval(function () {
      if (placeFab() || ++tries > 20) clearInterval(timer);
    }, 50);
  }

  /* ══════════════════════════════════════════════════════════════════
     Boot
     ══════════════════════════════════════════════════════════════════ */

  wireDemo();

  // First init before the UI's setTimeout(...,0) fallback mount, so the very
  // first render already uses the demo layout and language.
  if (CK) { try { CK.init(demoConfig()); } catch (e) { /* noop */ } }

  renderPage();

  placeFabWhenMounted();

  // After the first paint, and once. The constants are already on screen, so
  // this only ever replaces them with fresher numbers.
  loadPricing();
})();
