/* ConsentKit public page — language switch, pricing render, live demo.
 *
 * No frameworks, no build step, and only our own API: the page that argues for
 * privacy must not itself load a third-party font, script or beacon. Its three
 * off-origin requests all go to {API_BASE}, which is ours: GET /v1/public/pricing
 * for the prices, GET /v1/public/stats for the «Цифры» block, and the
 * POST /v1/public/site-check the «Проверить сайт» form sends.
 *
 * The file is also loaded by the law pages under /law/<slug>, which carry the
 * header, the footer and one check form but none of the demo, pricing or FAQ
 * markup. Every renderer below therefore returns early when its host element is
 * absent, and the vendor client is optional — CK is null there.
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
    free:     { scansManualPerDay: 1,  scheduledScans: false, alerts: false, brandingOff: false, journalCsv: false, journalRetentionDays: 30,   team: { members: 1 } },
    starter:  { scansManualPerDay: 5,  scheduledScans: true,  alerts: true,  brandingOff: true,  journalCsv: true,  journalRetentionDays: 365,  team: { members: 1 } },
    business: { scansManualPerDay: 30, scheduledScans: true,  alerts: true,  brandingOff: true,  journalCsv: true,  journalRetentionDays: 730,  team: { members: 5 } },
    agency:   { scansManualPerDay: 30, scheduledScans: true,  alerts: true,  brandingOff: true,  journalCsv: true,  journalRetentionDays: 1095, team: { members: null } }
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
          journalRetentionDays: limits.journalRetentionDays,
          team: limits.team
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
        journalRetentionDays: l.journalRetentionDays,
        // V1.17: optional — an API older than the team wave sends none, and
        // teamText() reads a missing key as «only you». Anything but an object
        // with a null-or-number `members` is dropped rather than trusted.
        team: (l.team && typeof l.team === 'object' && (l.team.members === null || isNum(l.team.members)))
          ? { members: l.team.members } : undefined
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
      // V1.23 §4: Business's figure is the price of ONE PACK, so «/ мес» alone
      // would read as the price of the whole plan however many packs are
      // bought. Same id branch and same reason as sitesText(): the payload has
      // no pack unit to key on.
      box.appendChild(el('span', 'plan-price__unit',
        d.plan === 'business' ? t('perPackPerMonth')
          : d.priceUnit === 'site_month' ? t('perSitePerMonth') : t('perMonth')));
    }
    return box;
  }

  function sitesText(d) {
    // Order matters. Starter is sold per site and the API sends sites: null
    // for it (plans.ts: the real ceiling is orgs.paid_sites, not the table),
    // so the per-site unit must be read BEFORE null is taken as "unlimited" —
    // otherwise the card would promise unlimited sites at a per-site price.
    if (d.priceUnit === 'site_month') return t('sitesOneEach');
    // SPEC-V1.23 §4: Business is sold in packs of ten and «до 10» is now
    // wrong — the ceiling moves in tens, up to a hundred.
    //
    // Branched on the plan ID and not on a unit, deliberately. There is no
    // pack unit to read: `priceUnit` is a stored enum with exactly two values
    // ('month' | 'site_month'), pinned by the zod schema on PUT
    // /v1/admin/plans and by the all-or-nothing reject in normalisePayload
    // above, and adding a third would need a migration that V1.23 §7 rules
    // out. The id also covers the fallbackPlans() path, where there is no API
    // answer to carry a unit at all.
    if (d.plan === 'business') return t('sitesPack');
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
    // V1.8-C: on every plan with scheduled scans the scanner appends the cookies
    // it finds to the PUBLISHED banner and switches the category on — the same
    // gate as the scans row above, and a bigger deal than the letter below it.
    ['rowAutoUpdate', function (d) { return t(d.limits.scheduledScans ? 'yes' : 'no'); }],
    ['rowAlerts',   function (d) { return t(d.limits.alerts ? 'yes' : 'no'); }],
    // SPEC-V1.17: colleagues in the cabinet. `members` counts the owner too,
    // so 1 means «only you»; null is the agency's «no limit». A payload from
    // an API older than V1.17 has no `team` at all and reads as «only you».
    ['rowTeam',     teamText],
    // Not in the payload — the same for every plan, so it stays dictionary-only.
    ['rowLangs',    function () { return t('langsAll'); }],
    ['rowSupport',  function (d) { return t('support' + cap(d.plan)); }]
  ];

  function teamText(d) {
    var team = d.limits && d.limits.team;
    var members = team && typeof team === 'object' ? team.members : 1;
    if (members === null) return t('teamUnlimited');
    if (typeof members === 'number' && members > 1) return t('teamUpTo').replace('{n}', String(members));
    return t('no');
  }

  function cap(s) { return s.charAt(0).toUpperCase() + s.slice(1); }

  /* Starter, not Business: the critique noted the highlighted column was the
     one almost nobody enters on. Starter is the first paid step for the owner
     of a single site, which is who this page is written for. */
  var FEATURED = 'starter';

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

  /* ══════════════════════════════════════════════════════════════════
     SPEC V1.14 §2.7 — Starter on its own card, above the table

     Reads the SAME `plans` array renderPricing() draws from — the live
     GET /v1/public/pricing payload when it answers, the PRICES/SITE_LIMITS
     constants when it does not — so the card and the Starter column of the
     table cannot show different money. loadPricing() re-runs both.

     §2.7 asks for a testimonial beside it. There is none, and §3 forbids
     inventing one, so the second column is three facts instead — and they are
     the numbers «Цифры» already carries, read from the same dictionary keys,
     so the two blocks cannot disagree either.
     ══════════════════════════════════════════════════════════════════ */

  function renderStarter() {
    var host = $('#starter');
    if (!host) return;
    host.textContent = '';

    var d = null;
    for (var i = 0; i < plans.length; i++) {
      if (plans[i].plan === 'starter') { d = plans[i]; break; }
    }
    // No Starter in the payload: leave the block empty. `.starter:empty` is
    // display:none, so the section closes up rather than showing a hole.
    if (!d || d.priceEur === null) return;

    /* ---- the card ---- */
    var card = el('div', 'starter__card');
    card.appendChild(el('h3', 'starter__name', t('starterTitle')));

    var price = el('p', 'starter__price');
    price.appendChild(el('span', 'starter__num', '\u20AC' + d.priceEur));
    // The unit comes from the payload, not from a literal: Starter is the one
    // plan sold per site, and priceUnit is what says so.
    price.appendChild(el('span', 'starter__unit',
      d.priceUnit === 'site_month' ? t('starterPriceUnit') : t('perMonth')));
    card.appendChild(price);

    var points = el('ul', 'starter__points');
    ['starterPoint1', 'starterPoint2', 'starterPoint3'].forEach(function (k) {
      points.appendChild(el('li', '', t(k)));
    });
    card.appendChild(points);

    // §2.7: this card's button is the dashboard, not the check — it is the
    // one place on the page where «Открыть кабинет» is the next real step.
    var cta = el('a', 'btn btn--primary');
    cta.href = CABINET_URL;
    cta.textContent = t('ctaCabinet');
    card.appendChild(cta);

    /* ---- the three facts ---- */
    var facts = el('div', 'starter__facts');
    facts.appendChild(el('h3', 'starter__facts-head', t('factsTitle')));

    // The services count comes from the «Цифры» block's data-services, which
    // the build filled from site/src/stats.json — never a literal here: the
    // literal «64» this replaces was two releases behind the tile above it.
    var statsHost = $('#stats');
    var services = statsHost && statsHost.getAttribute('data-services');
    [
      ['34', t('statsLanguages')],
      [services || '', t('statsServices')],
      [t('factCheckFreeNum'), t('factCheckFree')]
    ].forEach(function (row) {
      if (!row[0]) return;
      var f = el('div', 'starter__fact');
      f.appendChild(el('span', 'starter__fact-num', row[0]));
      f.appendChild(el('span', 'starter__fact-label', row[1]));
      facts.appendChild(f);
    });

    host.appendChild(card);
    host.appendChild(facts);
  }

  /* ══════════════════════════════════════════════════════════════════
     SPEC V1.14 §2.2 — the before / after handle

     All the real work is the <input type=range> in the markup: it brings
     keyboard support (arrows, Home/End), a focus ring and aria-valuenow with
     it, which is exactly what §2.2 asks for. This function does one thing —
     mirror its value onto the --ba-pos custom property that clips the top
     pane and positions the visible handle. Mouse, touch and pen drags are the
     input's own behaviour, so there is no pointer code here at all.
     ══════════════════════════════════════════════════════════════════ */

  function wireBeforeAfter() {
    var stages = document.querySelectorAll('[data-ba]');
    for (var i = 0; i < stages.length; i++) {
      (function (root) {
        var range = root.querySelector('[data-ba-range]');
        var stage = root.querySelector('.ba__stage');
        if (!range || !stage) return;

        function sync() {
          stage.style.setProperty('--ba-pos', range.value + '%');
          // aria-valuenow is maintained by the input itself; what a screen
          // reader still needs is the value in words rather than "50".
          range.setAttribute('aria-valuetext', range.value + '%');
        }

        range.addEventListener('input', sync);
        range.addEventListener('change', sync);
        sync();
      }(stages[i]));
    }
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
        // renderPricing() and the Starter card alone, not renderPage():
        // re-running the latter would reset the demo the visitor may already
        // be playing with. Both read `plans`, so both have to follow it.
        renderPricing();
        renderStarter();
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
      // SPEC V1.11 §3: every answer gets its own anchor, so a support reply can
      // link to one question rather than to the section. The id is positional
      // (q1..qN) and therefore identical on all three language pages — the same
      // fragment works whichever URL it was copied from. The build's
      // faqAnchor() in tools/build-site.mjs produces the same string for the
      // FAQPage markup, so the two cannot drift.
      d.id = 'q' + (i + 1);
      var s = el('summary', null, qa[0]);
      d.appendChild(s);
      d.appendChild(el('p', null, qa[1]));
      host.appendChild(d);
    });

    // A visitor arriving on /#q7 must land with that answer open: <details>
    // ignores the fragment, so nothing would scroll to a collapsed element.
    openFaqFromHash();

    // And again on every later hash change. Following a #q7 link from
    // elsewhere on the same page is a same-document navigation: nothing
    // reloads, this file does not run again, and without this the answer the
    // link points at stays collapsed.
    if (window.addEventListener) window.addEventListener('hashchange', openFaqFromHash);
  }

  function openFaqFromHash() {
    var id = '';
    try { id = (window.location.hash || '').replace(/^#/, ''); } catch (e) { return; }
    if (!/^q\d+$/.test(id)) return;
    var d = document.getElementById(id);
    if (!d) return;
    d.open = true;
    try { d.scrollIntoView(); } catch (e) { /* noop */ }
  }

  /* ══════════════════════════════════════════════════════════════════
     «Цифры» — GET /v1/public/stats

     SPEC V1.11 §3. Two rules do the work here:

     — Never show a zero. The block starts from the static fallback below and
       loadStats() only ever REPLACES it, so a slow or failed request leaves
       plausible copy on screen rather than an empty <dl> or a row of noughts.

     — While `sites` is under ten, the counts are not drawn at all: only the
       language count and «работаем с …». A service that advertises "3 sites
       connected" is arguing against itself, and the honest way to say "we are
       new" is to say what does not depend on being big.
     ══════════════════════════════════════════════════════════════════ */

  var STATS_MIN_SITES = 10;

  // Below this, «M согласий записано» stays off: a four-figure number is the
  // point of the tile, and «60 согласий» argues against itself exactly the way
  // «3 сайта» does.
  var STATS_MIN_CONSENTS = 1000;

  // What is true regardless of uptake. The fourth tile — the banner version
  // and its build date — is rendered by tools/build-site.mjs and needs nothing
  // from here unless there are enough sites to replace it.
  var STATS_FALLBACK = { sites: 0, consents: 0, languages: 34 };

  var stats = STATS_FALLBACK;

  /* «1 234» — a thin non-breaking space every three digits, which is the
     grouping all three languages use and the one that never reads as a decimal
     point. toLocaleString would follow the BROWSER's locale, not the page's. */
  function groupDigits(n) {
    var s = String(Math.max(0, Math.floor(n)));
    var out = '';
    for (var i = 0; i < s.length; i++) {
      if (i > 0 && (s.length - i) % 3 === 0) out += ' ';
      out += s.charAt(i);
    }
    return out;
  }

  /* Overwrite one tile in place — the number and its label together, because a
     tile showing a new count under an old label is worse than either.

     The version tile carries a second line («обновлено 6 сентября 2026»)
     that captions the version and nothing else. When that tile is replaced by
     a live count the line has to go with it, or «N сайтов подключено» ends up
     captioned with the build date. */
  function setStat(i, value, label, small) {
    var host = $('#stats');
    if (!host) return;
    var tile = host.children[i];
    if (!tile) return;
    var dt = $('.stat__num', tile);
    var dd = $('.stat__label', tile);
    if (!dt || !dd) return;
    dt.textContent = value;
    dt.className = 'stat__num' + (small ? ' stat__num--sm' : '');
    dd.textContent = label;
    dd.hidden = false;
    var sub = $('.stat__sub', tile);
    if (sub) sub.hidden = true;
  }

  /* SPEC V1.13 §2.5 and owner remark 3 — the two swap rules, and nothing else.
   *
   * The version tile is the DEFAULT fourth tile: it is true on day one, needs
   * no API and is rendered by the build. The live counts take tiles in the
   * order the owner set — «10 минут» goes first, to «M согласий записано» at
   * four figures; only then does the version tile give way to «N сайтов
   * подключено» at ten sites. So a service with sites but few consents shows
   * the sites count and keeps the version; one with both shows both counts.
   * Four tiles are filled in every one of those states. */
  function renderStats() {
    if (!$('#stats')) return;

    if (isNum(stats.consents) && stats.consents >= STATS_MIN_CONSENTS) {
      setStat(2, groupDigits(stats.consents), t('statsConsents'), false);
    }
    if (isNum(stats.sites) && stats.sites >= STATS_MIN_SITES) {
      setStat(3, groupDigits(stats.sites), t('statsSites'), false);
    }
  }

  function loadStats() {
    if (!$('#stats') || typeof fetch !== 'function') return;

    var ctl = typeof AbortController === 'function' ? new AbortController() : null;
    var timer = setTimeout(function () { if (ctl) ctl.abort(); }, 2000);

    fetch(API_BASE + '/v1/public/stats', {
      method: 'GET',
      credentials: 'omit',
      signal: ctl ? ctl.signal : undefined
    })
      .then(function (res) { return res.ok ? res.json() : null; })
      .then(function (data) {
        if (!data || typeof data !== 'object') return;
        // Field by field: a payload missing one number must not blank the
        // others, and a string where a number belongs must not reach the page.
        var next = {
          sites:      isNum(data.sites) ? data.sites : stats.sites,
          consents:   isNum(data.consents) ? data.consents : stats.consents,
          languages:  isNum(data.languages) ? data.languages : stats.languages
        };
        stats = next;
        renderStats();
      })
      .catch(function () { /* offline, timed out, blocked: keep the fallback */ })
      .then(function () { clearTimeout(timer); });
  }

  /* ══════════════════════════════════════════════════════════════════
     «Проверить сайт» — the two-step flow of SPEC V1.13 §2.2

     Step 1  POST /v1/public/site-check   {domain, lang, agree, hp}
                 202 {queued:true, checkId}      -> poll
                 200 {queued:false, reason:'recent', checkId} -> poll too:
                     the existing check may already be done, and its teaser is
                     exactly what this visitor asked for.
                 429 -> the limit message.
     Step 2  GET  /v1/public/site-check/:id      every 5s, up to 10 minutes
                 {status, hasEmail, teaser?}
                 done -> show the numbers and ask for an e-mail, unless
                         hasEmail already said the result is on its way.
     Step 3  POST /v1/public/site-check/:id/email {email, hp}
                 204 -> «письмо придёт»
                 409 check_mailed / 429 check_limit -> their own messages.

     The e-mail is asked for LAST and never before there is something to send.
     One form authored once in site/src/index.template.html and reused at the
     foot of every law page, so the honeypot, the consent wording and every
     result state are identical wherever the form appears.
     ══════════════════════════════════════════════════════════════════ */

  var CHECK_PATH = '/v1/public/site-check';

  // Every 5 seconds for at most 10 minutes — SPEC V1.13 §2.2. The cap is what
  // stops a tab left open overnight polling a check that will never finish.
  var POLL_MS = 5000;
  var POLL_MAX_MS = 10 * 60 * 1000;

  var checkSeq = 0;

  /* The template carries no id= anywhere — the form is cloned onto five pages
     and five instances of one id would be invalid, with every label[for]
     binding to whichever field parsed first. Ids are stamped here, per
     instance, and the labels wired to them. */
  function wireLabels(form) {
    var n = ++checkSeq;
    $$('.check__field', form).forEach(function (p, i) {
      var input = $('input', p);
      var label = $('label', p);
      if (!input || !label) return;
      var id = 'ck-check-' + n + '-' + i;
      input.id = id;
      label.htmlFor = id;
    });
    // The consent checkbox is already wrapped by its <label>, so it needs no
    // for= — but the state line is announced for the whole form.
    var state = $('.check__state', form);
    if (state) state.id = 'ck-check-state-' + n;
  }

  /* ok / wait / warn drive nothing but colour. The text carries the meaning,
     which is what the aria-live region hands to a screen reader. */
  var STATE_TONE = {
    checkSending: 'wait',
    checkRunning: 'wait',
    checkMailQueued: 'ok',
    checkDone: 'ok'
  };

  function setState(form, key, vars) {
    var out = $('.check__state', form);
    if (!out) return;
    var msg = t(key);
    if (vars) {
      Object.keys(vars).forEach(function (k) {
        msg = msg.split('{' + k + '}').join(vars[k]);
      });
    }
    out.textContent = msg;
    out.className = 'check__state check__state--' + (STATE_TONE[key] || 'warn');

    // The «обычно занимает пару минут» line belongs to exactly one state.
    var wait = $('[data-check-wait]', form);
    if (wait) wait.hidden = (key !== 'checkRunning');
  }

  /* Trim what people actually paste. "https://Example.COM/pricing?x=1" is the
     same site as "example.com", and a visitor who copies from the address bar
     should not be told their own domain is invalid. The server normalises
     again — this is for the message, not for security. */
  function cleanDomain(raw) {
    var s = String(raw || '').trim().toLowerCase();
    s = s.replace(/^[a-z][a-z0-9+.-]*:\/\//, '');
    s = s.replace(/^www\./, '');
    s = s.split('/')[0].split('?')[0].split('#')[0];
    s = s.replace(/:\d+$/, '');
    return s;
  }

  function looksLikeDomain(s) {
    return /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/.test(s);
  }

  function looksLikeEmail(s) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(s || '').trim());
  }

  function hpValue(form) {
    var hp = $('input[name="hp"]', form);
    return hp ? String(hp.value || '') : '';
  }

  /* One JSON request, with a timeout, resolving to {status, data} and never
     rejecting on a malformed body — every caller below branches on the status
     first and only then looks at the payload. */
  function askJson(url, opts, ms) {
    var ctl = typeof AbortController === 'function' ? new AbortController() : null;
    var timer = setTimeout(function () { if (ctl) ctl.abort(); }, ms || 10000);
    var o = { credentials: 'omit', signal: ctl ? ctl.signal : undefined };
    if (opts) { for (var k in opts) if (Object.prototype.hasOwnProperty.call(opts, k)) o[k] = opts[k]; }
    return fetch(url, o)
      .then(function (res) {
        return res.json().catch(function () { return null; }).then(function (data) {
          return { status: res.status, data: data };
        });
      })
      .then(function (r) { clearTimeout(timer); return r; },
            function (e) { clearTimeout(timer); throw e; });
  }

  /* Step 2's panel. `hidden` rather than a class, so while there is nothing
     to send the fields are out of the accessibility tree and out of the tab
     order too. */
  function showStep2(form, on) {
    var step2 = $('.check__step--2', form);
    if (step2) step2.hidden = !on;
  }

  function setStep1Disabled(form, on) {
    var b = $('.check__step--1 button[type="submit"]', form);
    if (b) b.disabled = !!on;
  }

  /* The teaser sentence: «Готово: N сторонних сервисов, K из них до согласия,
     M cookie.» Numbers from the server, every word from the dictionary. */
  function renderTeaser(form, teaser) {
    var out = $('[data-check-teaser]', form);
    if (!out) return;
    var s = teaser || {};
    out.textContent = t('checkDone')
      .split('{services}').join(groupDigits(isNum(s.services) ? s.services : 0))
      .split('{before}').join(groupDigits(isNum(s.beforeConsent) ? s.beforeConsent : 0))
      .split('{cookies}').join(groupDigits(isNum(s.cookies) ? s.cookies : 0));
  }

  /* Poll one check to completion.
   *
   * `started` is captured once so the 10-minute cap measures the wait the
   * visitor actually experienced, not the time since the last response — a
   * slow server must not be able to extend its own deadline. */
  function pollCheck(form, checkId, domain, announce) {
    var started = Date.now();

    // Step 3 reads the id back off the form: the e-mail button is wired once,
    // at boot, and must work for whichever check this instance is currently
    // showing — including a second check the visitor starts on the same page.
    form.setAttribute('data-check-id', checkId);

    var tick = function () {
      askJson(API_BASE + CHECK_PATH + '/' + encodeURIComponent(checkId), null, 10000)
        .then(function (r) {
          if (r.status === 404) { setState(form, 'checkScanError'); return; }
          if (r.status === 429) { setState(form, 'checkLimit'); return; }
          if (r.status !== 200 || !r.data) { again(); return; }

          var st = r.data.status;

          if (st === 'done') {
            // hasEmail: the address was given with the first request, or on an
            // earlier visit. There is nothing to ask for, so step 2 stays shut
            // and the visitor is told the mail is already on its way.
            if (r.data.hasEmail) {
              renderTeaser(form, r.data.teaser);
              showStep2(form, false);
              // `repeat` is set when THIS visit was told «уже проверяли»: the
              // mail went out earlier, so «придёт в несколько минут» would be
              // a promise about a letter that has already been delivered.
              setState(form, form.getAttribute('data-check-repeat')
                ? 'checkRecentMailed' : 'checkMailQueued');
              return;
            }
            renderTeaser(form, r.data.teaser);
            showStep2(form, true);
            setState(form, 'checkDone', {
              services: groupDigits(isNum((r.data.teaser || {}).services) ? r.data.teaser.services : 0),
              before: groupDigits(isNum((r.data.teaser || {}).beforeConsent) ? r.data.teaser.beforeConsent : 0),
              cookies: groupDigits(isNum((r.data.teaser || {}).cookies) ? r.data.teaser.cookies : 0)
            });
            var mail = $('input[name="email"]', form);
            if (mail) { try { mail.focus(); } catch (e) { /* noop */ } }
            return;
          }

          if (st === 'error') { setState(form, 'checkScanError'); return; }

          // queued | running | anything unexpected: keep waiting.
          again();
        })
        .catch(function () { again(); });
    };

    var again = function () {
      if (Date.now() - started >= POLL_MAX_MS) { setState(form, 'checkScanError'); return; }
      setTimeout(tick, POLL_MS);
    };

    // Only when the caller has nothing better to say. The «recent» branch has
    // already told the visitor something true and more specific, and replacing
    // it with «Проверяем…» would hide the one message SPEC V1.13 §2.2 asks
    // that path to show.
    if (announce !== false) setState(form, 'checkRunning', { domain: domain });
    setTimeout(tick, POLL_MS);
  }

  /* Step 1 — the address alone. */
  function submitCheck(form) {
    var domainEl = $('input[name="domain"]', form);
    var agreeEl = $('input[name="agree"]', form);
    if (!domainEl || !agreeEl) return;

    var domain = cleanDomain(domainEl.value);

    // Checked here rather than left to the browser: novalidate is set so the
    // messages are ours, in the page language, in the same aria-live region
    // as the server's answers.
    if (!domain || !looksLikeDomain(domain)) { setState(form, 'checkNeedDomain'); domainEl.focus(); return; }
    if (!agreeEl.checked) { setState(form, 'checkNeedAgree'); agreeEl.focus(); return; }

    if (typeof fetch !== 'function') { setState(form, 'checkError'); return; }

    setState(form, 'checkSending');
    setStep1Disabled(form, true);

    askJson(API_BASE + CHECK_PATH, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        domain: domain,
        lang: lang,
        agree: true,
        // Always sent, always empty for a real visitor: the server decides
        // what a filled honeypot means, and a missing field would tell it
        // nothing. No e-mail here — that is step 3.
        hp: hpValue(form)
      })
    }, 10000)
      .then(function (r) {
        var id = r.data && r.data.checkId;

        if (r.status === 202 && id) {
          form.removeAttribute('data-check-repeat');
          pollCheck(form, id, domain, true);
          return;
        }

        // 200 = «этот сайт сегодня уже проверяли». The existing check is very
        // likely finished already, so its id is polled exactly like a fresh
        // one: one GET turns the message into real numbers plus the e-mail
        // field. Without an id there is nothing to poll, so the message is
        // all the visitor gets.
        if (r.status === 200) {
          // Two different 200s, told apart by `reason`. 'registered' is a
          // domain already connected to a cabinet: it carries no checkId,
          // there is nothing to scan or send, and the useful answer is the
          // dashboard rather than a lead form.
          if (r.data && r.data.reason === 'registered') {
            setState(form, 'checkRegistered');
            return;
          }
          form.setAttribute('data-check-repeat', '1');
          setState(form, 'checkRecent');
          if (id) pollCheck(form, id, domain, false);
          return;
        }

        if (r.status === 429) { setState(form, 'checkLimit'); return; }
        if (r.status === 400) { setState(form, 'checkInvalid'); return; }
        setState(form, 'checkError');
      })
      .catch(function () { setState(form, 'checkError'); })
      .then(function () { setStep1Disabled(form, false); });
  }

  /* Step 3 — the address to send the full result to. */
  function submitEmail(form) {
    var emailEl = $('input[name="email"]', form);
    var button = $('[data-check-email]', form);
    var checkId = form.getAttribute('data-check-id');
    if (!emailEl || !checkId) return;

    var email = String(emailEl.value || '').trim();
    if (!email || !looksLikeEmail(email)) { setState(form, 'checkNeedEmail'); emailEl.focus(); return; }
    if (typeof fetch !== 'function') { setState(form, 'checkError'); return; }

    setState(form, 'checkSending');
    if (button) button.disabled = true;

    askJson(API_BASE + CHECK_PATH + '/' + encodeURIComponent(checkId) + '/email', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: email, hp: hpValue(form) })
    }, 10000)
      .then(function (r) {
        // 204 carries no body, so askJson's data is null — the status alone
        // is the answer, which is why every branch here reads r.status only.
        if (r.status === 204 || r.status === 200) {
          setState(form, 'checkMailQueued');
          showStep2(form, false);
          return;
        }
        if (r.status === 409) { setState(form, 'checkMailed'); showStep2(form, false); return; }
        if (r.status === 429) { setState(form, 'checkMailLimit'); return; }
        if (r.status === 404) { setState(form, 'checkScanError'); return; }
        setState(form, 'checkError');
      })
      .catch(function () { setState(form, 'checkError'); })
      .then(function () { if (button) button.disabled = false; });
  }

  function wireCheckForms() {
    $$('form[data-check-form]').forEach(function (form) {
      if (form.getAttribute('data-check-wired')) return;
      form.setAttribute('data-check-wired', '1');
      wireLabels(form);

      form.addEventListener('submit', function (ev) {
        ev.preventDefault();
        submitCheck(form);
      });

      var mailBtn = $('[data-check-email]', form);
      if (mailBtn) mailBtn.addEventListener('click', function () { submitEmail(form); });

      // Enter inside the e-mail field means «прислать», not «проверить заново».
      var mailField = $('input[name="email"]', form);
      if (mailField) mailField.addEventListener('keydown', function (ev) {
        if (ev.key === 'Enter') { ev.preventDefault(); submitEmail(form); }
      });
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

  /* resolveLayout() in ck-ui.js decides what a position means per layout: a bar
     is top or bottom, a box is bottom-left or bottom-right, and a modal is
     always centred. The select is repopulated from this table on every layout
     change, so it can never offer a position the client would silently ignore.

     SPEC V1.13 §2.4 puts position back under the visitor's control, so it is
     state now rather than a constant derived from the layout. */
  var POSITIONS_FOR = {
    bar: [['bottom', 'posBottom'], ['top', 'posTop']],
    box: [['bottom-right', 'posBottomRight'], ['bottom-left', 'posBottomLeft']],
    modal: [['', 'posCenter']]
  };

  /* Five accents. SPEC V1.14 §1 puts the brand red first and makes it the
     default the demo opens on; the other four are far enough apart in hue to
     be told apart at swatch size, and all five carry enough contrast against
     white for the banner's own button text.

     This is a CLIENT's banner colour, not one of ours: nothing here is
     imposed on anyone, and a real installation takes the colours of the site
     it sits on. */
  var ACCENTS = [
    ['#E63939', 'accentRed'],
    ['#2B50D8', 'accentBlue'],
    ['#127C56', 'accentGreen'],
    ['#6B3FCB', 'accentViolet'],
    ['#C2570C', 'accentOrange']
  ];

  var demo = {
    layout: 'bar',
    position: 'bottom',
    theme: 'auto',
    accent: ACCENTS[0][0],
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
      // The same accent in dark mode: the client deliberately does not carry a
      // light-only accent into dark (its default there is a blue), which left
      // the site's own banner off-brand in dark theme. Derived text colours
      // still pass the client's contrast rule.
      theme: { mode: demo.theme, accent: demo.accent, dark: { accent: demo.accent }, radius: '10px' },
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

  /* The state line, in words: what the visitor chose. */
  function updateStatus() {
    var out = $('#d-status');
    if (!out) { updateGcm(null); return; }
    if (!CK) { out.textContent = t('statusBroken'); updateGcm(null); return; }
    var s;
    try { s = CK.getState(); } catch (e) { out.textContent = t('statusBroken'); updateGcm(null); return; }

    if (!s || !s.decided) {
      out.textContent = t('statusUndecided');
    } else {
      var cats = s.categories || {};
      var on = ['functional', 'analytics', 'marketing'].filter(function (c) { return cats[c] === true; });
      out.textContent = t('statusDecided').replace('{cats}', on.length ? on.join(', ') : t('statusNone'));
    }
    updateGcm(s);
  }

  /* «Что увидит Google: analytics_storage — denied, ad_storage — denied.»
   *
   * DERIVED from the consent state, not read back from dataLayer: demoConfig()
   * sets integrations.gcm = false precisely so the demo emits no Consent Mode
   * updates as the visitor clicks around, which means dataLayer holds only the
   * core's one parse-time default and would never move. The mapping is the one
   * the client itself applies (docs/CONSENT-MODE-NOTES-2026-09.md §2):
   * analytics -> analytics_storage, marketing -> ad_storage.
   *
   * Both are denied until the visitor decides, which is the honest reading of
   * a banner that has not been answered yet. */
  function updateGcm(state) {
    var out = $('#d-gcm');
    if (!out) return;
    var cats = (state && state.decided && state.categories) || {};
    var v = function (on) { return t(on === true ? 'gcmGranted' : 'gcmDenied'); };
    out.textContent = t('gcmLine')
      .split('{analytics}').join(v(cats.analytics))
      .split('{ads}').join(v(cats.marketing));
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

  /* The position select, rebuilt for the current layout — see POSITIONS_FOR.
     The previously chosen position is kept when the new layout still offers
     it, and otherwise the layout's first (conventional) position is taken, so
     switching bar -> box never leaves the select showing an option the client
     would ignore. */
  function fillPositionSelect() {
    var sel = $('#d-position');
    if (!sel) return;
    var opts = POSITIONS_FOR[demo.layout] || POSITIONS_FOR.bar;

    var keep = null;
    for (var i = 0; i < opts.length; i++) if (opts[i][0] === demo.position) keep = demo.position;
    if (keep === null) demo.position = opts[0][0];

    sel.textContent = '';
    opts.forEach(function (o) {
      var n = el('option', null, t(o[1]));
      n.value = o[0];
      sel.appendChild(n);
    });
    sel.value = demo.position;
    // A modal has exactly one position, so the control has nothing to offer.
    sel.disabled = opts.length < 2;
  }

  /* Five swatches, drawn as real radios so one tab stop and the arrow keys
     come for free. The colour is on the label, not the input: a styled
     appearance:none radio disappears in forced-colours mode, and the visible
     swatch has to survive that. */
  function fillAccentSwatches() {
    var host = $('#d-accent');
    if (!host) return;
    host.textContent = '';

    ACCENTS.forEach(function (a, i) {
      var id = 'ck-accent-' + i;
      var label = el('label', 'swatch');
      label.htmlFor = id;
      label.title = t(a[1]);

      var input = document.createElement('input');
      input.type = 'radio';
      input.name = 'ck-demo-accent';
      input.id = id;
      input.value = a[0];
      input.className = 'swatch__input';
      input.checked = (a[0] === demo.accent);

      var dot = el('span', 'swatch__dot');
      dot.style.background = a[0];
      // The colour name is the accessible name; the dot itself is decorative.
      var sr = el('span', 'swatch__name', t(a[1]));

      input.addEventListener('change', function () {
        if (!input.checked) return;
        demo.accent = input.value;
        // A palette-only change: ck-ui's signature() treats accent as a
        // restyle, so the banner is repainted where it stands rather than
        // remounted — a dismissed banner does NOT come back, which is why
        // «Показать снова» is the only control that calls withdraw().
        applyDemo();
      });

      label.appendChild(input);
      label.appendChild(dot);
      label.appendChild(sr);
      host.appendChild(label);
    });
  }

  function wireDemo() {
    var layout = $('#d-layout'), position = $('#d-position'), theme = $('#d-theme'),
        dlang = $('#d-lang'), again = $('#d-again');

    if (layout) layout.addEventListener('change', function () {
      demo.layout = layout.value;
      // The position list depends on the layout, so it is rebuilt before the
      // config that reads demo.position is handed to the client.
      fillPositionSelect();
      applyDemo();
    });

    if (position) position.addEventListener('change', function () {
      demo.position = position.value;
      applyDemo();
    });

    if (theme) theme.addEventListener('change', function () {
      demo.theme = theme.value;
      applyDemo();
    });

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
    renderStarter();
    renderFaq();
    renderStats();
    wireCheckForms();
    fillLanguageSelect();
    fillPositionSelect();
    fillAccentSwatches();
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
     The capsule menu (SPEC V1.14.3 §1)

     A disclosure, not a dialog: the panel drops from the capsule and the page
     behind it stays usable, so it does not trap focus and does not lock the
     scroll. What it does owe the visitor is the four things a disclosure
     always owes — the button states its own state, Esc closes it, a click
     outside closes it, and focus goes into the panel on open and comes back
     to the button on close.

     The panel is authored OPEN in the template and closed by an inline script
     before first paint (see index.template.html): that is what keeps every
     link reachable with JavaScript switched off. Everything here is the
     enhancement on top, and it starts from whatever state that script left.
     ══════════════════════════════════════════════════════════════════ */

  function wireMenu() {
    var btn = $('.capsule-menu');
    var panel = document.getElementById('site-menu');
    // The law pages carry the same header, so this is never absent there —
    // but app.js is also loaded by pages under construction, and a missing
    // panel must not throw before loadPricing() below ever runs.
    if (!btn || !panel) return;

    function isOpen() { return btn.getAttribute('aria-expanded') === 'true'; }

    function open() {
      panel.hidden = false;
      btn.setAttribute('aria-expanded', 'true');
      // Into the panel, onto the first link — not onto the panel itself,
      // which would need a tabindex and would announce nothing.
      var first = panel.querySelector('a[href], button:not([disabled])');
      if (first) first.focus();
    }

    function close(refocus) {
      if (!isOpen()) return;
      panel.hidden = true;
      btn.setAttribute('aria-expanded', 'false');
      // Only when the close was the visitor's doing — after following a link
      // the focus belongs where the link sent it, not back on the button.
      if (refocus) btn.focus();
    }

    btn.addEventListener('click', function () {
      if (isOpen()) close(true); else open();
    });

    // Esc from anywhere inside, and from the button itself.
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' || e.key === 'Esc') close(true);
    });

    // Outside click. `contains` covers the capsule too, so clicking the
    // button does not close-then-reopen through this handler.
    document.addEventListener('click', function (e) {
      if (!isOpen()) return;
      if (panel.contains(e.target) || btn.contains(e.target)) return;
      close(false);
    });

    // After choosing a link. The language links are real navigations and the
    // page is replaced anyway; the #anchors are not, and leaving the panel
    // open over the section it just scrolled to is the bug this closes.
    panel.addEventListener('click', function (e) {
      var a = e.target.closest ? e.target.closest('a[href]') : null;
      if (a) close(false);
    });

    // Focus leaving the panel by Tab closes it: the disclosure has done its
    // job once the visitor has tabbed past the last link.
    document.addEventListener('focusin', function (e) {
      if (!isOpen()) return;
      if (panel.contains(e.target) || btn.contains(e.target)) return;
      close(false);
    });
  }

  /* ══════════════════════════════════════════════════════════════════
     The theme switch — «Тема» in the menu panel
     ══════════════════════════════════════════════════════════════════

     Three states, and the third one is the absence of a state: `system` means
     no data-theme attribute at all, so the CSS falls through to
     prefers-color-scheme exactly as it did before this control existed.

     The stored choice was already applied by the inline script in <head> —
     that is what stops the flash — so this function only has to reflect the
     current value in the buttons and write the new one when a button is
     pressed. It deliberately does NOT close the panel: comparing two themes
     means pressing two buttons, and a panel that shut after the first would
     make the second a two-click job.

     Every localStorage access is wrapped: a browser set to block site data
     throws on read AND on write, and neither is worth an exception that would
     stop the rest of the boot sequence below from running. */

  var THEME_KEY = 'ck-site-theme';

  function wireTheme() {
    var group = $('.theme-group');
    if (!group) return;
    var buttons = group.querySelectorAll('.theme-btn');
    if (!buttons.length) return;

    function stored() {
      var t = null;
      try { t = localStorage.getItem(THEME_KEY); } catch (e) { /* blocked */ }
      return (t === 'dark' || t === 'light') ? t : 'system';
    }

    function reflect(choice) {
      for (var i = 0; i < buttons.length; i++) {
        var b = buttons[i];
        b.setAttribute('aria-pressed',
          b.getAttribute('data-theme-choice') === choice ? 'true' : 'false');
      }
    }

    function apply(choice) {
      if (choice === 'system') {
        document.documentElement.removeAttribute('data-theme');
      } else {
        document.documentElement.setAttribute('data-theme', choice);
      }
      try {
        if (choice === 'system') localStorage.removeItem(THEME_KEY);
        else localStorage.setItem(THEME_KEY, choice);
      } catch (e) { /* blocked — the choice still holds for this page */ }
      reflect(choice);
    }

    // The markup is authored with «Как в системе» pressed (the no-JS truth);
    // straighten it to whatever the visitor actually chose last time.
    reflect(stored());

    group.addEventListener('click', function (e) {
      var btn = e.target.closest ? e.target.closest('.theme-btn') : null;
      if (!btn) return;
      var choice = btn.getAttribute('data-theme-choice');
      if (choice) apply(choice);
    });
  }

  /* ══════════════════════════════════════════════════════════════════
     Boot
     ══════════════════════════════════════════════════════════════════ */

  wireTheme();
  wireMenu();
  wireDemo();
  wireBeforeAfter();

  // First init before the UI's setTimeout(...,0) fallback mount, so the very
  // first render already uses the demo layout and language.
  if (CK) { try { CK.init(demoConfig()); } catch (e) { /* noop */ } }

  renderPage();

  placeFabWhenMounted();

  // After the first paint, and once each. The constants and the fallback
  // numbers are already on screen, so these only ever replace them with
  // fresher values — neither request can leave the page emptier than it was.
  loadPricing();
  loadStats();
})();
