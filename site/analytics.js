/* ConsentKit public page — the advertising data layer (SPEC-V1.26 §2).
 *
 * WHAT THIS FILE IS FOR
 * The owner's container measures this site: which visitors scan a domain,
 * which reach the pricing table, which leave for the cabinet and with which
 * click id attached. That is ordinary marketing instrumentation — except that
 * this particular site sells «ничего до согласия», so it has to do it under
 * its own rule. Two constraints shape every line below, and both come from
 * SPEC-V1.26 §0, where the architect put them ABOVE the owner's brief:
 *
 *   R1  The GTM container is not loaded until the banner has been answered.
 *       Accept or reject — either is an answer, and Consent Mode handles the
 *       difference from there. Before that first decision this page requests
 *       nothing from Google at all. `dataLayer` is declared in <head> and the
 *       events queue in it meanwhile, so nothing measured is lost: the
 *       container processes the backlog the moment it is up.
 *
 *   R2  Attribution is not WRITTEN to storage until the visitor has consented
 *       to analytics or marketing. It lives in memory and in the query string
 *       of links leaving for the cabinet (the same trick Consent Mode's own
 *       url_passthrough plays), which needs no storage and therefore needs no
 *       consent. On a refusal nothing is ever persisted.
 *
 * The honest version of «we measure you» is: this page can count a visit it
 * was allowed to count, and carries a click id across a domain boundary
 * without storing it. The FAQ/«Разработчикам» line says so on the page.
 *
 * WHY A SEPARATE FILE AND NOT app.js
 * app.js is under a test that forbids it to touch localStorage with any key
 * but the theme (test/site-build.test.mjs). That test is right, and the
 * attribution record is exactly the kind of thing it exists to keep out. The
 * two concerns also have different lifetimes: app.js renders the page, this
 * file only observes it.
 *
 * LOAD ORDER. Last on the page, after vendor/ck-core.js … app.js, so that
 * ConsentKit exists and the page is wired before anything here reads consent
 * or decorates a link. Everything binds by DELEGATION on document, because
 * app.js replaces the pricing table and the FAQ list wholesale after its own
 * fetches resolve — a listener bound to those nodes at load would be thrown
 * away with them.
 */
(function () {
  'use strict';

  /* ══════════════════════════════════════════════════════════════════
     OWNER-EDITABLE CONSTANTS
     ══════════════════════════════════════════════════════════════════ */

  /* The owner's container. The tags inside it are the owner's business; our
     side is this id, when it loads (R1) and what is in the array when it does.
     Kept here as a constant for the same reason app.js keeps CONTACT_EMAIL and
     CABINET_URL: one place per value the owner may change. */
  var GTM_ID = 'GTM-5Q76HZBB';

  /* Where attribution has to survive to. Links to this host are decorated. */
  var CABINET_HOST = 'app.ecomconsult.net';

  /* The storage key holding the FIRST source a visitor arrived from. */
  var ATTR_KEY = 'ck_attr';

  /* The click ids and campaign fields from the brief (§03), plus the three we
     derive. Order is fixed so a decorated URL is stable and diffable. */
  var ATTR_PARAMS = [
    'gclid', 'wbraid', 'gbraid', 'fbclid', 'msclkid',
    'utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term'
  ];

  var ATTR_DERIVED = ['referrer', 'landing_page', 'first_seen'];

  /* ══════════════════════════════════════════════════════════════════
     dataLayer
     ══════════════════════════════════════════════════════════════════ */

  /* Declared in <head> before any script (tools/build-site.mjs DATALAYER_BOOT),
     so this is a re-assertion for safety, not the declaration itself. */
  window.dataLayer = window.dataLayer || [];

  /* The page language, from the document the build stamped — the same rule
     app.js uses. Every event carries it (§04). */
  var pageLang = (function () {
    var l = '';
    try { l = String(document.documentElement.lang || '').toLowerCase(); } catch (e) {}
    return (l === 'ru' || l === 'ro') ? l : 'en';
  })();

  /* One push, with empty values stripped (§02).
   *
   * GTM variables read `undefined` and `''` as present-but-blank, which is how
   * a «(not set)» row appears in a report for a field that was simply never
   * applicable. Dropping them at the boundary means a dimension is either
   * meaningful or absent. */
  function push(obj) {
    try {
      var out = { page_lang: pageLang };
      for (var k in obj) {
        if (!Object.prototype.hasOwnProperty.call(obj, k)) continue;
        var v = obj[k];
        if (v === '' || v === null || v === undefined) continue;
        out[k] = v;
      }
      window.dataLayer.push(out);
    } catch (e) { /* analytics must never break the page */ }
  }

  /* ══════════════════════════════════════════════════════════════════
     sha256 — the brief's §02 user_hash
     ══════════════════════════════════════════════════════════════════ */

  /* Trim + lowercase before hashing, so «A@B.c» and «a@b.c» are one person:
     the address is a JOIN KEY across our events and the platform's, and a
     capital letter typed into a form field must not split one visitor into
     two. Returns a promise; WebCrypto is unavailable on plain http:// and in
     very old browsers, so every caller tolerates a null. */
  function sha256(str) {
    try {
      var s = String(str == null ? '' : str).trim().toLowerCase();
      if (!s) return Promise.resolve(null);
      var subtle = window.crypto && window.crypto.subtle;
      if (!subtle || typeof TextEncoder !== 'function') return Promise.resolve(null);
      return subtle.digest('SHA-256', new TextEncoder().encode(s)).then(function (buf) {
        var bytes = new Uint8Array(buf);
        var hex = '';
        for (var i = 0; i < bytes.length; i++) {
          hex += (bytes[i] < 16 ? '0' : '') + bytes[i].toString(16);
        }
        return hex;
      }).catch(function () { return null; });
    } catch (e) { return Promise.resolve(null); }
  }

  /* ══════════════════════════════════════════════════════════════════
     Attribution (R2)
     ══════════════════════════════════════════════════════════════════ */

  function readStoredAttr() {
    try {
      var raw = window.localStorage.getItem(ATTR_KEY);
      if (!raw) return null;
      var parsed = JSON.parse(raw);
      return (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) ? parsed : null;
    } catch (e) { return null; }
  }

  /* What the CURRENT address says. Empty for a direct visit. */
  function attrFromUrl() {
    var out = {};
    try {
      var q = new URLSearchParams(window.location.search);
      for (var i = 0; i < ATTR_PARAMS.length; i++) {
        var v = q.get(ATTR_PARAMS[i]);
        if (v) out[ATTR_PARAMS[i]] = String(v).slice(0, 200);
      }
    } catch (e) { /* no URLSearchParams: no attribution, not a broken page */ }
    return out;
  }

  /* The record this page load works from.
   *
   * THE FIRST SOURCE WINS. A stored record is a visitor who already arrived
   * from somewhere — and the campaign that EARNED the visit is the first one,
   * not the last link they happened to click on the way back. So a stored
   * record is returned whole and the current URL is not merged into it.
   *
   * Held in memory either way, which is what makes R2 possible: the links can
   * be decorated on a page load where nothing may be written yet. */
  var ATTR = (function () {
    var stored = readStoredAttr();
    if (stored) return stored;

    var fresh = attrFromUrl();
    try {
      // Only recorded alongside a real source; a bare direct visit stores and
      // decorates nothing, and an empty record must not look like a visit.
      if (Object.keys(fresh).length) {
        // Empty values are dropped for the same reason push() drops them: an
        // empty `referrer=` in a decorated URL is a query parameter that says
        // nothing, and it would travel on every cabinet link forever.
        var ref = String(document.referrer || '').slice(0, 200);
        if (ref) fresh.referrer = ref;
        fresh.landing_page = String(window.location.pathname || '/').slice(0, 200);
        fresh.first_seen = new Date().toISOString();
      }
    } catch (e) { /* noop */ }
    return fresh;
  })();

  function hasAttr() {
    try { return Object.keys(ATTR).length > 0; } catch (e) { return false; }
  }

  /* R2's single write point. Called only from a consent signal. */
  var attrStored = false;

  function storeAttr() {
    if (attrStored) return;
    if (!hasAttr()) return;
    try {
      // Never overwrite: a record already in storage is the first source, and
      // this page load's URL is by definition later. Re-checked here and not
      // only in ATTR above, because a second decision on the same page load
      // would otherwise race a write from another tab.
      if (window.localStorage.getItem(ATTR_KEY)) { attrStored = true; return; }
      window.localStorage.setItem(ATTR_KEY, JSON.stringify(ATTR));
      attrStored = true;
    } catch (e) { /* storage blocked: memory and links still work */ }
  }

  /* ══════════════════════════════════════════════════════════════════
     Carrying attribution to the cabinet (§03 step 2)
     ══════════════════════════════════════════════════════════════════ */

  /* The cabinet is a DIFFERENT ORIGIN: app.ecomconsult.net cannot read this
     page's localStorage, so a click id that is not in the URL does not
     survive the hop. This is the same problem Consent Mode's url_passthrough
     solves for Google, and the same answer — which is why it works for a
     visitor who refused everything and has no storage at all. */
  function isCabinetLink(a) {
    try {
      var href = a.getAttribute('href');
      if (!href) return false;
      // Resolved against the document, so a protocol-relative or absolute
      // href is judged by its real host rather than by string matching.
      return new URL(href, window.location.href).hostname === CABINET_HOST;
    } catch (e) { return false; }
  }

  function decorate(a) {
    if (!hasAttr()) return;
    try {
      var url = new URL(a.getAttribute('href'), window.location.href);
      if (url.hostname !== CABINET_HOST) return;

      var changed = false;
      for (var k in ATTR) {
        if (!Object.prototype.hasOwnProperty.call(ATTR, k)) continue;
        // Existing query and hash are preserved — a link may already carry a
        // plan or a return path, and a decorator that clobbered it would
        // break the destination to measure it. An existing value for the same
        // key wins: whoever authored the link meant it.
        if (url.searchParams.has(k)) continue;
        url.searchParams.set(k, ATTR[k]);
        changed = true;
      }
      if (changed) a.setAttribute('href', url.toString());
    } catch (e) { /* noop */ }
  }

  function decorateAll() {
    if (!hasAttr()) return;
    try {
      var links = document.querySelectorAll('a[href]');
      for (var i = 0; i < links.length; i++) {
        if (isCabinetLink(links[i])) decorate(links[i]);
      }
    } catch (e) { /* noop */ }
  }

  /* ══════════════════════════════════════════════════════════════════
     GTM (R1)
     ══════════════════════════════════════════════════════════════════ */

  var gtmInjected = false;

  /* The standard container snippet, written out rather than pasted, so the
     reason it is NOT in the markup stays visible: putting it in the HTML
     would load Google on page one, for everyone, before any answer — which is
     precisely what this product tells its customers not to do. A test asserts
     no page contains googletagmanager.com anywhere in its markup. */
  function injectGtm() {
    if (gtmInjected) return;
    gtmInjected = true;
    try {
      window.dataLayer.push({
        'gtm.start': new Date().getTime(),
        event: 'gtm.js'
      });
      var s = document.createElement('script');
      s.async = true;
      s.src = 'https://www.googletagmanager.com/gtm.js?id=' + encodeURIComponent(GTM_ID);
      var first = document.getElementsByTagName('script')[0];
      if (first && first.parentNode) first.parentNode.insertBefore(s, first);
      else document.head.appendChild(s);
    } catch (e) { /* noop */ }
  }

  /* ══════════════════════════════════════════════════════════════════
     Consent signals — the trigger for both R1 and R2
     ══════════════════════════════════════════════════════════════════ */

  function ck() {
    try { return window.ConsentKit || null; } catch (e) { return null; }
  }

  function allowed(cat) {
    var K = ck();
    try { return !!(K && K.allowed && K.allowed(cat)); } catch (e) { return false; }
  }

  function decided() {
    var K = ck();
    try {
      var s = K && K.getState && K.getState();
      return !!(s && s.decided);
    } catch (e) { return false; }
  }

  /* One entry from the array, whatever shape it is.
   *
   * dataLayer is NOT homogeneous: the client's Consent Mode pushes go through
   * a gtag shim that pushes `arguments`, so an entry can be an arguments
   * object with no `.event` at all. Reading it defensively is not paranoia —
   * dataLayer[0] on this very page is one of those. */
  function eventName(entry) {
    try { return (entry && typeof entry === 'object' && entry.event) || ''; } catch (e) { return ''; }
  }

  function onConsentEvent(name) {
    if (name === 'ck_consent_update') {
      // Either answer counts: R1 is about the visitor having ANSWERED, and
      // Consent Mode carries the difference from there.
      injectGtm();
      return;
    }
    if (name === 'ck_consent_analytics' || name === 'ck_consent_marketing') {
      storeAttr();
    }
  }

  /* Entries already in the array before this file ran, THEN the wrapper.
   *
   * A returning visitor is the case that makes this necessary: ck-core.js
   * restores the stored decision and pushes ck_consent_update and the
   * ck_consent_<category> events at init — five scripts before this one. A
   * wrapper alone would never see them, and a visitor who consented last week
   * would get no container and no stored attribution this week. */
  function watchDataLayer() {
    try {
      for (var i = 0; i < window.dataLayer.length; i++) {
        onConsentEvent(eventName(window.dataLayer[i]));
      }
      var native = window.dataLayer.push;
      window.dataLayer.push = function () {
        var r = native.apply(window.dataLayer, arguments);
        try {
          for (var j = 0; j < arguments.length; j++) onConsentEvent(eventName(arguments[j]));
        } catch (e) { /* noop */ }
        return r;
      };
    } catch (e) { /* noop */ }
  }

  /* ══════════════════════════════════════════════════════════════════
     Honeypot
     ══════════════════════════════════════════════════════════════════ */

  /* A filled honeypot means a bot filled the form (app.js sends the field to
     the server on every request for the same reason). Its whole session is
     noise, so NOT ONE event is pushed for that form — asserted at push time
     rather than at bind time, because ck_scan_start fires on the first
     keystroke and the bot may fill the trap after it. */
  function hpFilled(form) {
    try {
      var hp = form && form.querySelector('input[name="hp"]');
      return !!(hp && String(hp.value || '').trim());
    } catch (e) { return false; }
  }

  function pushForm(form, obj) {
    if (hpFilled(form)) return;
    push(obj);
  }

  /* ══════════════════════════════════════════════════════════════════
     §04 — the landing page's events
     ══════════════════════════════════════════════════════════════════ */

  function closestSection(node) {
    try {
      var el = node;
      while (el && el !== document.body) {
        if (el.id && (el.tagName === 'SECTION' || el.tagName === 'MAIN')) return el.id;
        el = el.parentNode;
      }
    } catch (e) { /* noop */ }
    return '';
  }

  function cleanDomain(raw) {
    // The same normalisation app.js sends to the server, so the dimension in a
    // report matches the row in the scan log.
    var s = String(raw || '').trim().toLowerCase();
    s = s.replace(/^[a-z]+:\/\//, '').replace(/^www\./, '').replace(/[/?#].*$/, '');
    return s;
  }

  function formDomain(form) {
    try {
      var el = form.querySelector('input[name="domain"]');
      return el ? cleanDomain(el.value) : '';
    } catch (e) { return ''; }
  }

  /* ---- ck_scan_start: the FIRST keystroke in the domain field, once ---- */

  var scanStarted = false;

  function wireScanStart() {
    document.addEventListener('input', function (ev) {
      try {
        var el = ev.target;
        if (!el || el.name !== 'domain') return;
        var form = el.form || el.closest('form[data-check-form]');
        if (!form || scanStarted) return;
        scanStarted = true;
        pushForm(form, { event: 'ck_scan_start' });
      } catch (e) { /* noop */ }
    }, true);
  }

  /* ---- ck_scan_submit / ck_scan_result / ck_scan_error ----
   *
   * These three are SERVER outcomes, and app.js owns the request. Rather than
   * duplicate its fetch logic here (two endpoints, five status branches, a
   * poll loop), this observes the one thing app.js does make public: the
   * status key it writes into the form's live region via setState(), which is
   * already the single funnel every outcome passes through.
   *
   * A MutationObserver on that region is therefore the honest coupling — it
   * reads what the visitor was actually told. The alternative, patching
   * window.fetch, would measure requests the visitor never saw resolve. */
  var STATE_TO_EVENT = {
    // The server accepted the job (202) or answered «уже проверяли» (200):
    // either way the submission happened.
    checkRunning: 'ck_scan_submit',
    checkRecent: 'ck_scan_submit',
    checkRegistered: 'ck_scan_submit',
    // The report is on screen.
    checkDone: 'ck_scan_result',
    checkMailQueued: 'ck_scan_result',
    checkRecentMailed: 'ck_scan_result',
    // Failures, each with its own code.
    checkScanError: 'ck_scan_error',
    checkError: 'ck_scan_error',
    checkLimit: 'ck_scan_error',
    checkInvalid: 'ck_scan_error'
  };

  var scanFired = {};

  /* verdict — DERIVED, not read.
   *
   * SPEC-V1.26 §2 asks for clean|issues|critical «взять из ответа проверки»,
   * but GET /v1/public/site-check/<id> carries no verdict: its `teaser` holds
   * services, beforeConsent and cookies and nothing else (see pollCheck in
   * app.js). Rather than ask the server for a field the owner's container can
   * compute, the three buckets are derived from the numbers that ARE there,
   * using the product's own definition of a problem:
   *
   *   critical — something loaded BEFORE consent. That is the violation.
   *   issues   — third-party services or cookies present, all after consent.
   *   clean    — nothing third-party found.
   *
   * Noted in the release report as a deliberate deviation. */
  function verdictOf(teaser) {
    var t = teaser || {};
    var before = Number(t.beforeConsent) || 0;
    var services = Number(t.services) || 0;
    var cookies = Number(t.cookies) || 0;
    if (before > 0) return 'critical';
    if (services > 0 || cookies > 0) return 'issues';
    return 'clean';
  }

  /* The numbers app.js has just rendered into the teaser line, read back off
     the DOM: the teaser is the one place the payload reaches the page, and it
     is written before the state key that triggers this. */
  function teaserFromDom(form) {
    try {
      var out = form.querySelector('[data-check-teaser]');
      var digits = String(out && out.textContent || '').match(/\d[\d\s ]*/g) || [];
      var n = digits.map(function (d) { return Number(d.replace(/[\s ]/g, '')); });
      // renderTeaser fills «N сервисов, K до согласия, M cookie» in that order.
      return { services: n[0], beforeConsent: n[1], cookies: n[2] };
    } catch (e) { return {}; }
  }

  function onCheckState(form, key) {
    var event = STATE_TO_EVENT[key];
    if (!event) return;

    // Once per outcome per form: the live region is rewritten on every poll
    // tick, and a report that stays on screen must not be counted each time.
    var seen = form.getAttribute('data-ck-ev') || '';
    if (seen.indexOf('|' + key + '|') > -1) return;
    form.setAttribute('data-ck-ev', seen + '|' + key + '|');

    if (event === 'ck_scan_submit') {
      if (scanFired.submit) return;
      scanFired.submit = true;
      var email = '';
      try {
        var el = form.querySelector('input[name="email"]');
        email = el ? String(el.value || '').trim() : '';
      } catch (e) { /* noop */ }

      if (email) {
        sha256(email).then(function (hash) {
          pushForm(form, {
            event: 'ck_scan_submit',
            scan_domain: formDomain(form),
            has_email: true,
            user_hash: hash
          });
        });
        return;
      }
      pushForm(form, {
        event: 'ck_scan_submit',
        scan_domain: formDomain(form),
        has_email: false
      });
      return;
    }

    if (event === 'ck_scan_result') {
      if (scanFired.result) return;
      scanFired.result = true;
      var teaser = teaserFromDom(form);
      pushForm(form, {
        event: 'ck_scan_result',
        services_found: teaser.services,
        cookies_found: teaser.cookies,
        verdict: verdictOf(teaser)
      });
      return;
    }

    pushForm(form, {
      event: 'ck_scan_error',
      error_code: key,
      scan_domain: formDomain(form)
    });
  }

  function wireCheckForms() {
    try {
      if (typeof MutationObserver !== 'function') return;
      var forms = document.querySelectorAll('form[data-check-form]');
      for (var i = 0; i < forms.length; i++) {
        (function (form) {
          // app.js's setState() stamps the state KEY here beside the
          // translated sentence — language-independent, and the same name the
          // rest of app.js uses for the state.
          var region = form.querySelector('.check__state');
          if (!region) return;
          new MutationObserver(function () {
            try {
              var key = region.getAttribute('data-check-state') || '';
              if (key) onCheckState(form, key);
            } catch (e) { /* noop */ }
          }).observe(region, { attributes: true, attributeFilter: ['data-check-state'] });
        }(forms[i]));
      }
    } catch (e) { /* noop */ }
  }

  /* ---- ck_pricing_view: ≥50% visible for >1s, once ---- */

  function wirePricingView() {
    try {
      if (typeof IntersectionObserver !== 'function') return;
      var section = document.getElementById('pricing');
      if (!section) return;

      var timer = null;
      var fired = false;

      /* «≥50% visible» has to mean 50% OF WHAT.
       *
       * The pricing section is a full table plus the Starter card — on a
       * laptop it is roughly three times the height of the viewport, so the
       * fraction of the SECTION that can ever be on screen tops out around a
       * third. A plain `intersectionRatio >= 0.5` therefore never fires on
       * the one section it was written for: the visitor reads the whole
       * price list and the event does not happen. (Found by the browser
       * proof, 11.09.2026 — the vm suite cannot see this.)
       *
       * So for a section taller than the viewport the test becomes «half the
       * SCREEN is filled by it», which is what «looking at the prices»
       * actually means. For a short section the original reading is right
       * and is kept. */
      var meetsThreshold = function (e) {
        if (!e.isIntersecting) return false;
        var box = e.boundingClientRect;
        var view = (e.rootBounds && e.rootBounds.height) || window.innerHeight || 0;
        if (box && view && box.height > view) {
          return e.intersectionRect.height >= view * 0.5;
        }
        return e.intersectionRatio >= 0.5;
      };

      var io = new IntersectionObserver(function (entries) {
        for (var i = 0; i < entries.length; i++) {
          var e = entries[i];
          if (fired) return;
          if (meetsThreshold(e)) {
            // A second of dwell, not a pass: scrolling PAST the prices on the
            // way to the FAQ is not looking at them.
            if (timer === null) timer = window.setTimeout(function () {
              fired = true;
              push({ event: 'ck_pricing_view' });
              io.disconnect();
            }, 1000);
          } else if (timer !== null) {
            window.clearTimeout(timer);
            timer = null;
          }
        }
        // A ladder rather than a single 0.5: a section taller than the
        // viewport never reaches a ratio of 0.5 at all, so the callback has to
        // run at the smaller ratios where meetsThreshold() can judge it by
        // how much of the SCREEN is filled.
      }, { threshold: [0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.75, 1] });
      io.observe(section);
    } catch (e) { /* noop */ }
  }

  /* ---- clicks: plans, cabinet CTAs, docs, language ---- */

  /* app.js renders the plan cards and the table from the same descriptors and
     replaces them wholesale when the pricing API answers, so the plan name and
     price are read off the DOM at click time rather than captured at bind. */
  function planFromNode(node) {
    try {
      var el = node;
      while (el && el !== document.body) {
        if (el.getAttribute && el.getAttribute('data-plan')) {
          return {
            name: el.getAttribute('data-plan'),
            price: el.getAttribute('data-plan-price') || ''
          };
        }
        el = el.parentNode;
      }
    } catch (e) { /* noop */ }
    return null;
  }

  function wireClicks() {
    document.addEventListener('click', function (ev) {
      try {
        var target = ev.target;
        var a = target && target.closest ? target.closest('a, button') : null;
        if (!a) return;

        // Language switch: lang_from is what this page IS, lang_to what the
        // link leads to (data-lang, stamped by the build's langSwitch()).
        var to = a.getAttribute && a.getAttribute('data-lang');
        if (to) {
          push({ event: 'ck_lang_switch', lang_from: pageLang, lang_to: to });
          return;
        }

        var docs = a.getAttribute && a.getAttribute('data-docs');
        if (docs) {
          push({ event: 'ck_docs_click', docs_dest: docs });
          return;
        }

        var plan = planFromNode(a);
        if (plan) {
          push({ event: 'ck_plan_click', plan_name: plan.name, plan_price: plan.price });
          return;
        }

        /* Everything leaving for the cabinet is a dashboard CTA — whether it
           carries a data-cta hook (header, footer, stamped in the template) or
           was built by app.js and is recognised by its destination. The hook is
           checked FIRST and on its own: a link that is marked as a cabinet CTA
           stays one even if its href is rewritten or stripped by something
           else on the page, and that is the whole point of having a stable id
           rather than matching on the URL. */
        var ctaId = a.getAttribute && a.getAttribute('data-cta');
        if (ctaId || (a.tagName === 'A' && isCabinetLink(a))) {
          push({
            event: 'ck_cta_dashboard',
            cta_id: (ctaId || a.id || 'cabinet-link'),
            page_section: closestSection(a)
          });
        }
      } catch (e) { /* noop */ }
    }, true);
  }

  /* ---- ck_demo_interact: the banner demo's own controls ---- */

  function wireDemo() {
    var SELECT_ACTION = {
      'd-layout': 'layout',
      'd-position': 'position',
      'd-theme': 'theme',
      'd-lang': 'language'
    };

    document.addEventListener('change', function (ev) {
      try {
        var el = ev.target;
        if (!el) return;
        var action = SELECT_ACTION[el.id];
        if (action) { push({ event: 'ck_demo_interact', demo_action: action }); return; }
        if (el.name === 'ck-demo-accent') {
          push({ event: 'ck_demo_interact', demo_action: 'accent' });
        }
      } catch (e) { /* noop */ }
    }, true);

    document.addEventListener('click', function (ev) {
      try {
        var el = ev.target;
        var btn = el && el.closest ? el.closest('#d-again') : null;
        if (btn) push({ event: 'ck_demo_interact', demo_action: 'again' });
      } catch (e) { /* noop */ }
    }, true);

    /* accept / reject / settings happen INSIDE the banner's shadow root, which
       this file deliberately does not reach into. The client already announces
       them: ck:change carries the method the visitor used. */
    document.addEventListener('ck:change', function (ev) {
      try {
        var method = (ev && ev.detail && ev.detail.state && ev.detail.state.method) || '';
        var MAP = {
          accept_all: 'accept',
          reject_all: 'reject',
          save: 'settings',
          withdraw: 'withdraw'
        };
        var action = MAP[method];
        if (action) push({ event: 'ck_demo_interact', demo_action: action });
      } catch (e) { /* noop */ }
    });
  }

  /* ---- ck_faq_open ----
   *
   * `toggle` does not bubble, so a delegated listener on document never sees
   * it; the click on <summary> does. faq_id is the q1..qN anchor app.js
   * already stamps on each <details> — the same fragment on all three
   * languages, so one report row covers a question rather than three. */
  function wireFaq() {
    document.addEventListener('click', function (ev) {
      try {
        var el = ev.target;
        var summary = el && el.closest ? el.closest('summary') : null;
        if (!summary) return;
        var details = summary.parentNode;
        if (!details || details.tagName !== 'DETAILS') return;
        // The click PRECEDES the toggle, so `open` is still the old state:
        // false here means it is about to open.
        if (details.open) return;
        push({ event: 'ck_faq_open', faq_id: details.id || '' });
      } catch (e) { /* noop */ }
    }, true);
  }

  /* ══════════════════════════════════════════════════════════════════
     Boot
     ══════════════════════════════════════════════════════════════════ */

  /* A visitor who decided on an earlier visit has a restored decision before
     this file runs, and no new event will arrive to trigger R1. Both branches
     are therefore checked at load: the state for the container, allowed() for
     the storage write. */
  if (decided()) injectGtm();
  if (allowed('analytics') || allowed('marketing')) storeAttr();

  watchDataLayer();

  decorateAll();

  /* app.js REPLACES the pricing table and the Starter card wholesale when
     GET /v1/public/pricing answers — several hundred milliseconds after this
     file has run — and every plan's «Открыть кабинет» button is built there.
     Those links exist only after that render, so a single pass at load
     decorates the header and footer and misses the four that matter most.
     Re-running on mutation is what keeps them covered even for a visitor who
     opens one in a new tab without ever pressing the mouse on it. */
  try {
    if (typeof MutationObserver === 'function' && document.body) {
      var pending = null;
      new MutationObserver(function () {
        // Coalesced: a wholesale re-render is dozens of mutations, and
        // decorating is a full querySelectorAll each time.
        if (pending !== null) return;
        pending = window.setTimeout(function () {
          pending = null;
          decorateAll();
        }, 0);
      }).observe(document.body, { childList: true, subtree: true });
    }
  } catch (e) { /* noop */ }

  /* The last line of defence, and the one that catches a link added by
     something with no mutation at all: decorated on the way down to the
     click, before the browser reads the href. mousedown/touchstart rather
     than click, because a middle-click or a long-press opens the link
     without ever firing one. */
  ['mousedown', 'touchstart'].forEach(function (type) {
    document.addEventListener(type, function (ev) {
      try {
        var el = ev.target;
        var a = el && el.closest ? el.closest('a[href]') : null;
        if (a && isCabinetLink(a)) decorate(a);
      } catch (e) { /* noop */ }
    }, true);
  });

  wireScanStart();
  wireCheckForms();
  wirePricingView();
  wireClicks();
  wireDemo();
  wireFaq();
}());
