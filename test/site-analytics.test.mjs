/* SPEC-V1.26 §2 — site/analytics.js, the landing page's advertising data layer.
 *
 * WHAT IS ACTUALLY AT RISK HERE
 * Not «does an event fire» — GTM would show that in a week. What no one would
 * notice for months are the two rules the architect put ABOVE the owner's
 * brief (SPEC-V1.26 §0), because breaking either LOOKS EXACTLY LIKE WORKING:
 *
 *   R1  no GTM container before the banner is answered. A container loaded at
 *       page load measures more and looks healthier in every report. The only
 *       symptom is that the product's own site does what the product exists to
 *       prevent.
 *   R2  no attribution in localStorage before consent. Writing it early also
 *       just works, and attribution is even more accurate that way.
 *
 * So the tests that matter most below are the NEGATIVE ones: nothing in the
 * markup, nothing in storage, nothing requested. Each is paired with a
 * positive control in the same fixture — a file that failed to load, or a stub
 * that silently swallowed everything, would otherwise pass every «did not
 * happen» assertion in this file at once.
 *
 * HOW THE FILE IS EXERCISED
 * analytics.js is an IIFE written for a browser, so it is run in a `vm`
 * context against a fake window/document/localStorage, the same technique
 * test/blocking.test.mjs and test/geo-linked.test.mjs use for the client. The
 * stub is deliberately minimal: this suite asserts consent-gating and
 * attribution, not DOM rendering.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import vm from 'node:vm';
import { webcrypto } from 'node:crypto';

import {
  LANGS, SITE_DIR, readTemplate, renderPage,
  renderLawPage, renderLawIndex, readPages,
  VERSIONED_ASSETS, assetHash
} from '../tools/build-site.mjs';

const ANALYTICS = readFileSync(join(SITE_DIR, 'analytics.js'), 'utf8');

/* ══════════════════════════════════════════════════════ the markup contract */

test('every page loads analytics.js, after app.js, with a version stamp', () => {
  const template = readTemplate();

  const pages = [];
  for (const { code } of LANGS) {
    pages.push([`${code} home`, renderPage(template, code)]);
    pages.push([`${code} law index`, renderLawIndex(template, code)]);
    for (const p of readPages(code)) {
      pages.push([`${code} law/${p.slug}`, renderLawPage(template, code, p)]);
    }
  }

  // 3 languages x (home + law index + 4 articles).
  assert.equal(pages.length, 18, `expected 18 pages, built ${pages.length}`);

  for (const [label, html] of pages) {
    const analytics = html.indexOf('/analytics.js');
    const app = html.indexOf('/app.js');
    assert.ok(analytics > -1, `${label} does not load analytics.js`);
    assert.ok(app > -1, `${label} does not load app.js`);
    /* Order is load-bearing: analytics.js reads ConsentKit's state and the
       links app.js has rendered. Loaded first, it would find neither. */
    assert.ok(analytics > app, `${label} loads analytics.js BEFORE app.js`);

    assert.match(html, /<script src="\/analytics\.js\?v=[0-9a-f]{8}"><\/script>/,
      `${label} loads analytics.js without a ?v= stamp — a deploy would serve the cached old file`);
  }
});

test('analytics.js is in VERSIONED_ASSETS and the stamp is its real hash', () => {
  /* Both halves are needed: the list gates which paths may be stamped, and the
     regex in versionAssets() gates which are MATCHED. A path in the list that
     the regex does not match is silently left bare. */
  assert.ok(VERSIONED_ASSETS.includes('/analytics.js'),
    'analytics.js is not in VERSIONED_ASSETS');

  const html = renderPage(readTemplate(), 'en');
  const stamped = html.match(/\/analytics\.js\?v=([0-9a-f]{8})/);
  assert.ok(stamped, 'the rendered page carries no analytics.js version stamp');
  assert.equal(stamped[1], assetHash('/analytics.js'),
    'the stamp on analytics.js is not the hash of the file on disk');
});

test('dataLayer is declared by the first statement of the first script', () => {
  const template = readTemplate();

  for (const { code } of LANGS) {
    for (const [label, html] of [
      [`${code} home`, renderPage(template, code)],
      [`${code} law index`, renderLawIndex(template, code)],
      [`${code} law article`, renderLawPage(template, code, readPages(code)[0])]
    ]) {
      const first = html.indexOf('<script');
      assert.ok(first > -1, `${label} has no script at all`);

      /* The FIRST script element on the page must be the declaration itself.
         Asserting merely "declared before the first push" would pass with the
         theme boot or the vendor client ahead of it — and the vendor client
         pushes Consent Mode at parse time, which is the push that must find
         the array already there. */
      const firstTag = html.slice(first, html.indexOf('</script>', first) + 9);
      assert.match(firstTag, /^<script>window\.dataLayer = window\.dataLayer \|\| \[\];<\/script>$/,
        `${label}'s first script is not the dataLayer declaration: ${firstTag.slice(0, 120)}`);

      // …and it is genuinely ahead of the theme boot and, where the page
      // carries it, the vendor client. The law pages load no client — they
      // have no banner to demo — so its absence is not a failure here.
      assert.ok(first < html.indexOf('ck-site-theme'),
        `${label} declares dataLayer after the theme boot`);
      const client = html.indexOf('/vendor/ck-core.js');
      if (client > -1) {
        assert.ok(first < client, `${label} declares dataLayer after the vendor client`);
      }
    }
  }
});

test('R1: no page mentions googletagmanager.com anywhere in its markup', () => {
  /* The container is injected by script AFTER the first decision, so the
     string must not appear in any rendered byte — not in a <script src>, not
     in a preconnect, not in a noscript iframe, not in a comment. A single
     occurrence would load Google for every visitor before they answered,
     which is the exact behaviour this product is sold to prevent. */
  const template = readTemplate();

  for (const { code } of LANGS) {
    const pages = [
      [`${code} home`, renderPage(template, code)],
      [`${code} law index`, renderLawIndex(template, code)],
      ...readPages(code).map((p) => [`${code} law/${p.slug}`, renderLawPage(template, code, p)])
    ];
    for (const [label, html] of pages) {
      assert.doesNotMatch(html, /googletagmanager\.com/,
        `${label} names googletagmanager.com in its markup — the container must be script-injected after consent`);
    }
  }

  /* The positive control for the assertion above: the string DOES exist in
     analytics.js. Without this, deleting the injection entirely would make
     every «no googletagmanager» assertion pass. */
  assert.match(ANALYTICS, /googletagmanager\.com\/gtm\.js/,
    'analytics.js never loads the GTM container at all');
});

/* ══════════════════════════════════════════════════════════ the event names */

/* The owner's brief owns these names (SPEC-V1.26 §2 reproduces the list).
   Lowercase, ck_-prefixed, and exactly these — a renamed event is a silently
   empty report in the owner's container, which nothing else would catch. */
const SPEC_EVENTS = [
  'ck_scan_start',
  'ck_scan_submit',
  'ck_scan_result',
  'ck_scan_error',
  'ck_pricing_view',
  'ck_plan_click',
  'ck_cta_dashboard',
  'ck_demo_interact',
  'ck_faq_open',
  'ck_lang_switch',
  'ck_docs_click'
];

test('the event names are exactly the ones the brief lists', () => {
  const found = new Set(
    [...ANALYTICS.matchAll(/event: '(ck_[a-z_]+)'/g)].map((m) => m[1])
  );

  for (const name of SPEC_EVENTS) {
    assert.ok(found.has(name), `analytics.js never pushes ${name}`);
  }

  /* Nothing EXTRA either: an event the container has no tag for is dead
     weight, and a typo'd name would otherwise pass the loop above by being an
     extra rather than a missing one. ck_consent_* are the CLIENT's events,
     which this file listens for and never pushes. */
  for (const name of found) {
    assert.ok(SPEC_EVENTS.includes(name),
      `analytics.js pushes ${name}, which the brief does not list`);
  }

  for (const name of SPEC_EVENTS) {
    assert.equal(name, name.toLowerCase(), `${name} is not all lowercase`);
    assert.match(name, /^ck_/, `${name} does not carry the ck_ prefix`);
  }
});

test('the parameter names the brief specifies are the ones used', () => {
  for (const param of [
    'scan_domain', 'has_email', 'user_hash', 'services_found', 'cookies_found',
    'verdict', 'error_code', 'plan_name', 'plan_price', 'cta_id', 'page_section',
    'demo_action', 'faq_id', 'lang_from', 'lang_to', 'docs_dest', 'page_lang'
  ]) {
    assert.ok(ANALYTICS.includes(param), `analytics.js never sets ${param}`);
  }
});

/* ═══════════════════════════════════════════════════════════ the vm harness */

/* A browser, reduced to what analytics.js touches. Returns the window so a
   test can inspect dataLayer, storage and the scripts that were injected. */
function run({
  href = 'https://consentkit.ecomconsult.net/ru/?gclid=TEST123&utm_source=x',
  lang = 'ru',
  storage = {},
  consentKit = null,
  links = [],
  preload = [],
  referrer = 'https://www.google.com/'
} = {}) {
  const store = { ...storage };
  const injected = [];
  const listeners = {};
  const anchors = links.map((href2) => {
    const attrs = new Map([['href', href2]]);
    return {
      tagName: 'A',
      id: '',
      getAttribute: (n) => (attrs.has(n) ? attrs.get(n) : null),
      setAttribute: (n, v) => attrs.set(n, String(v)),
      closest() { return this; }
    };
  });

  const url = new URL(href);
  const g = Object.create(null);

  const head = { appendChild(el) { injected.push(el); return el; } };

  const doc = {
    referrer,
    documentElement: { lang },
    head,
    body: {},
    createElement(tag) {
      const el = { tagName: String(tag).toUpperCase(), async: false, src: '', parentNode: null };
      return el;
    },
    getElementsByTagName() { return []; },
    getElementById() { return null; },
    querySelector() { return null; },
    querySelectorAll(sel) { return sel === 'a[href]' ? anchors : []; },
    addEventListener(name, fn) { (listeners[name] = listeners[name] || []).push(fn); }
  };

  g.window = g;
  g.self = g;
  g.document = doc;
  g.location = { href, search: url.search, pathname: url.pathname, hostname: url.hostname };
  g.URL = URL;
  g.URLSearchParams = URLSearchParams;
  g.TextEncoder = TextEncoder;
  g.crypto = webcrypto;
  g.Date = Date;
  g.Promise = Promise;
  g.Object = Object;
  g.Array = Array;
  g.Number = Number;
  g.String = String;
  g.JSON = JSON;
  g.Uint8Array = Uint8Array;
  g.setTimeout = setTimeout;
  g.clearTimeout = clearTimeout;
  g.localStorage = {
    getItem: (k) => (k in store ? store[k] : null),
    setItem: (k, v) => { store[k] = String(v); },
    removeItem: (k) => { delete store[k]; }
  };
  // Entries already in the array when analytics.js loads — on a real page
  // ck-core.js has pushed its Consent Mode default and, for a returning
  // visitor, the ck_consent_* events, five scripts earlier.
  g.dataLayer = preload.slice();
  if (consentKit) g.ConsentKit = consentKit;
  // MutationObserver / IntersectionObserver are absent on purpose: this suite
  // asserts consent-gating, and analytics.js must degrade rather than throw.

  const ctx = vm.createContext(g);
  vm.runInContext(ANALYTICS, ctx, { filename: 'site/analytics.js' });

  return { g, store, injected, anchors, listeners, dataLayer: g.dataLayer };
}

/** A ConsentKit stub: `cats` is the granted set, or null for «not decided». */
function fakeCK(cats) {
  return {
    allowed: (c) => !!(cats && cats[c]),
    getState: () => ({ decided: cats !== null, categories: cats || {} })
  };
}

const gtmRequested = (injected) =>
  injected.filter((el) => String(el.src || '').includes('googletagmanager.com')).length;

/* The storage key holding the visitor's first source. */
const ATTR_KEY = 'ck_attr';

/* ══════════════════════════════════════════════════════ R1 — the container */

test('R1: an undecided visitor gets no container', () => {
  const { injected, dataLayer } = run({ consentKit: fakeCK(null) });

  assert.equal(gtmRequested(injected), 0,
    'the GTM container was injected before the banner was answered');

  // The positive control: the file ran and is watching. A stub that failed to
  // execute would also inject nothing.
  assert.notEqual(dataLayer.push, Array.prototype.push,
    'analytics.js did not wrap dataLayer.push — it never ran');
});

test('R1: the first decision injects the container exactly once', () => {
  const { injected, dataLayer } = run({ consentKit: fakeCK(null) });
  assert.equal(gtmRequested(injected), 0);

  // What the client pushes when the visitor answers.
  dataLayer.push({ event: 'ck_consent_update', ck_consent: { analytics: false } });
  assert.equal(gtmRequested(injected), 1, 'the first decision did not load the container');

  /* A rejection is an answer too: Consent Mode carries the difference from
     here, and a visitor who said no must still not be re-asked by a container
     that never loaded. */
  dataLayer.push({ event: 'ck_consent_update', ck_consent: { analytics: true } });
  dataLayer.push({ event: 'ck_consent_update', ck_consent: { analytics: true } });
  assert.equal(gtmRequested(injected), 1,
    'a second decision injected the container again — GTM would run twice');
});

test('R1: a returning visitor who already decided gets it immediately', () => {
  /* The case a push-wrapper alone would miss entirely: ck-core.js restores the
     stored decision and pushes its events five scripts BEFORE analytics.js
     runs, so by the time this file loads the decision is history. */
  const { injected } = run({ consentKit: fakeCK({ analytics: true, marketing: false }) });
  assert.equal(gtmRequested(injected), 1,
    'a visitor who decided on an earlier visit got no container');
});

test('R1: consent events already in dataLayer when the file loads are not missed', () => {
  /* The hazard a push-wrapper alone cannot cover, isolated: the events are
     ALREADY in the array before analytics.js runs, and this happens on every
     real page — ck-core.js pushes them at init, five scripts earlier.
     ConsentKit is deliberately absent here, so the load-time getState()
     branch cannot satisfy the assertion and ONLY the backlog scan can. */
  const seeded = [
    (function () { return arguments; }('consent', 'default', { wait_for_update: 500 })),
    { event: 'ck_consent_update', ck_consent: { analytics: true } },
    { event: 'ck_consent_analytics' }
  ];

  const { injected, store } = run({ consentKit: null, preload: seeded });

  assert.equal(gtmRequested(injected), 1,
    'the events already in dataLayer were never scanned — a returning visitor gets no container');
  assert.equal(JSON.parse(store[ATTR_KEY]).gclid, 'TEST123',
    'the ck_consent_analytics already in dataLayer did not trigger the storage write');
});

test('R1: the arguments-object entries the client pushes do not crash the scan', () => {
  /* ck-core.js's gtag shim pushes `arguments`, so dataLayer[0] on every real
     page is an arguments object with no `.event`. Anything that destructured
     or assumed an object shape would throw here and take the whole file with
     it. */
  const { dataLayer, injected } = run({ consentKit: fakeCK(null) });

  (function () { dataLayer.push(arguments); }('consent', 'default', { wait_for_update: 500 }));
  dataLayer.push(null);
  dataLayer.push('string');
  dataLayer.push(42);

  assert.equal(gtmRequested(injected), 0, 'a non-event entry triggered the container');

  dataLayer.push({ event: 'ck_consent_update' });
  assert.equal(gtmRequested(injected), 1, 'the real event no longer works after odd entries');
});

/* ══════════════════════════════════════════════ R2 — attribution + storage */

test('R2: nothing is written to storage before consent', () => {
  const { store, anchors } = run({
    consentKit: fakeCK(null),
    links: ['https://app.ecomconsult.net/']
  });

  assert.equal(store[ATTR_KEY], undefined,
    'attribution was written to localStorage before the visitor consented');

  /* The positive control, and the point of R2: the click id IS being carried,
     in memory and on the link — refusing consent costs the visitor nothing
     and costs us no attribution either. */
  assert.match(anchors[0].getAttribute('href'), /gclid=TEST123/,
    'the cabinet link was not decorated — the harness or the decorator is broken');
});

test('R2: consent to analytics writes it; consent to marketing does too', () => {
  for (const event of ['ck_consent_analytics', 'ck_consent_marketing']) {
    const { store, dataLayer } = run({ consentKit: fakeCK(null) });
    assert.equal(store[ATTR_KEY], undefined, `${event}: written too early`);

    dataLayer.push({ event });

    const saved = JSON.parse(store[ATTR_KEY]);
    assert.equal(saved.gclid, 'TEST123', `${event} did not persist the click id`);
    assert.equal(saved.utm_source, 'x');
    assert.ok(saved.first_seen, 'no first_seen recorded');
    assert.ok(saved.landing_page, 'no landing_page recorded');
  }
});

test('R2: a functional-only consent writes nothing', () => {
  /* The event the client pushes for the functional category must NOT be a
     storage trigger — the brief names analytics and marketing only. */
  const { store, dataLayer } = run({ consentKit: fakeCK(null) });
  dataLayer.push({ event: 'ck_consent_functional' });
  assert.equal(store[ATTR_KEY], undefined,
    'functional consent alone persisted advertising attribution');
});

test('R2: an already-consented visitor has it written at load', () => {
  const { store } = run({ consentKit: fakeCK({ analytics: true }) });
  assert.equal(JSON.parse(store[ATTR_KEY]).gclid, 'TEST123',
    'a returning consented visitor had no attribution stored');
});

test('the FIRST source wins — storage is never overwritten', () => {
  /* The campaign that EARNED the visit is the first one. A visitor who
     arrived from an ad in March and returns in May through a newsletter link
     must still be attributed to the ad. */
  const first = { gclid: 'FIRST', utm_source: 'ads', first_seen: '2026-01-01T00:00:00.000Z' };
  const { store, anchors, dataLayer } = run({
    href: 'https://consentkit.ecomconsult.net/ru/?gclid=SECOND&utm_source=newsletter',
    storage: { [ATTR_KEY]: JSON.stringify(first) },
    consentKit: fakeCK({ analytics: true }),
    links: ['https://app.ecomconsult.net/']
  });

  assert.deepEqual(JSON.parse(store[ATTR_KEY]), first,
    'a later visit overwrote the first source in storage');

  // And the link carries the FIRST source too, not the URL's.
  const href = anchors[0].getAttribute('href');
  assert.match(href, /gclid=FIRST/, 'the cabinet link carried the later click id');
  assert.doesNotMatch(href, /SECOND/, 'the cabinet link leaked the later click id');

  dataLayer.push({ event: 'ck_consent_analytics' });
  assert.deepEqual(JSON.parse(store[ATTR_KEY]), first,
    'a consent event overwrote the stored first source');
});

test('an empty referrer is never written into the record or the link', () => {
  /* REGRESSION (found by the Playwright proof, 11.09.2026). A visitor who
     typed the address or came from a mail client has no document.referrer,
     and an unguarded `referrer: ''` put a meaningless `&referrer=` on every
     decorated cabinet link — and into localStorage, where the first-source
     rule then preserved it forever. push() strips empty values; the
     attribution record has to strip them too. */
  const { store, anchors, dataLayer } = run({
    referrer: '',
    consentKit: fakeCK({ analytics: true }),
    links: ['https://app.ecomconsult.net/']
  });

  assert.doesNotMatch(anchors[0].getAttribute('href'), /referrer=/,
    'an empty referrer was appended to the cabinet link');

  dataLayer.push({ event: 'ck_consent_analytics' });
  const saved = JSON.parse(store[ATTR_KEY]);
  assert.equal(saved.referrer, undefined, 'an empty referrer was persisted');
  // The positive control: the real fields are there.
  assert.equal(saved.gclid, 'TEST123');
  assert.ok(saved.landing_page);

  // And a REAL referrer still travels.
  const withRef = run({
    referrer: 'https://www.google.com/',
    consentKit: fakeCK({ analytics: true }),
    links: ['https://app.ecomconsult.net/']
  });
  assert.match(withRef.anchors[0].getAttribute('href'), /referrer=/,
    'a real referrer is no longer carried');
});

test('links rendered after load are decorated too', () => {
  /* REGRESSION (found by the Playwright proof, 11.09.2026). app.js replaces
     the pricing table and the Starter card wholesale when the pricing API
     answers — long after this file has run — and each plan's «Открыть
     кабинет» button is created there. A single decorating pass at load
     covered the header and footer and missed exactly the four links a
     visitor is most likely to click. */
  assert.match(ANALYTICS, /new MutationObserver\([\s\S]{0,400}?decorateAll\(\)/,
    'nothing re-decorates links when the page re-renders');

  // The click-time fallback stays: a mutation-free insertion still gets caught
  // on the way down to the click.
  for (const type of ['mousedown', 'touchstart']) {
    assert.ok(ANALYTICS.includes(`'${type}'`),
      `links are no longer decorated on ${type}`);
  }
});

test('ck_pricing_view can fire on a section taller than the viewport', () => {
  /* REGRESSION (found by the browser proof, 11.09.2026). #pricing is a full
     plan table plus the Starter card — roughly three viewports tall on a
     laptop — so the fraction of the SECTION that can ever be on screen tops
     out near a third. A plain `intersectionRatio >= 0.5` therefore never fired
     on the one section it was written for: a visitor could read the entire
     price list and the event would not happen. A vm test cannot see this (no
     layout), so the rule is asserted on the source instead. */
  assert.match(ANALYTICS, /intersectionRect\.height >= view \* 0\.5/,
    'a tall pricing section can no longer satisfy the visibility rule');

  // The threshold ladder is the other half: with only [0.5] registered, the
  // callback never runs at the ratios where the rule above can judge it.
  const thresholds = ANALYTICS.match(/threshold: \[([^\]]+)\]/);
  assert.ok(thresholds, 'the pricing observer registers no thresholds');
  assert.ok(thresholds[1].split(',').length > 1,
    'the pricing observer still registers a single threshold — a tall section never reports');

  // And the dwell requirement survives: a scroll PAST the prices is not a view.
  assert.match(ANALYTICS, /\}, 1000\);/, 'the one-second dwell is gone');
});

test('ck_cta_dashboard trusts the data-cta hook, not only the href', () => {
  /* REGRESSION (found by the browser proof, 11.09.2026). The event was
     recognised purely by destination, so a cabinet CTA whose href is rewritten
     or stripped by anything else on the page stopped being measurable — which
     defeats the purpose of stamping a stable id on it in the first place. */
  assert.match(ANALYTICS, /if \(ctaId \|\| \(a\.tagName === 'A' && isCabinetLink\(a\)\)\)/,
    'the data-cta hook is no longer sufficient on its own');
});

test('a direct visit stores and decorates nothing', () => {
  const { store, anchors, dataLayer } = run({
    href: 'https://consentkit.ecomconsult.net/ru/',
    consentKit: fakeCK({ analytics: true, marketing: true }),
    links: ['https://app.ecomconsult.net/']
  });

  dataLayer.push({ event: 'ck_consent_analytics' });

  assert.equal(store[ATTR_KEY], undefined,
    'an empty attribution record was persisted — it would then win over a real later source');
  assert.equal(anchors[0].getAttribute('href'), 'https://app.ecomconsult.net/',
    'a link was decorated with nothing');
});

/* ═════════════════════════════════════════════ carrying it to the cabinet */

test('only cabinet links are decorated, and their own query survives', () => {
  const { anchors } = run({
    consentKit: fakeCK(null),
    links: [
      'https://app.ecomconsult.net/?plan=starter#billing',
      'https://consentkit.ecomconsult.net/ru/#pricing',
      'https://github.com/vermoh/ConsentKit',
      'mailto:info@ecomconsult.net'
    ]
  });

  const cabinet = anchors[0].getAttribute('href');
  assert.match(cabinet, /gclid=TEST123/, 'the cabinet link lost the click id');
  assert.match(cabinet, /plan=starter/, 'decorating clobbered the link\'s own query');
  assert.match(cabinet, /#billing$/, 'decorating dropped the link\'s fragment');

  /* Everything else is untouched. A decorator that appended the click id to
     our own pages would put it in the address bar of every internal
     navigation, and on github.com it would leak it to a third party. */
  assert.equal(anchors[1].getAttribute('href'), 'https://consentkit.ecomconsult.net/ru/#pricing');
  assert.equal(anchors[2].getAttribute('href'), 'https://github.com/vermoh/ConsentKit');
  assert.equal(anchors[3].getAttribute('href'), 'mailto:info@ecomconsult.net');
});

/* ═══════════════════════════════════════════════════════════════ sha256 */

test("sha256('A@B.c') === sha256('a@b.c') — one visitor, not two", () => {
  /* The address is a JOIN KEY between our events and the platform's. A capital
     letter typed into the form field must not split one person in two. */
  const src = ANALYTICS.replace(/^\(function \(\) \{/, '').replace(/\}\(\)\);\s*$/, '');
  const g = Object.create(null);
  g.window = g;
  g.crypto = webcrypto;
  g.TextEncoder = TextEncoder;
  g.Promise = Promise;
  g.String = String;
  g.Uint8Array = Uint8Array;

  // Only sha256 is needed, so it is lifted out rather than the whole IIFE run.
  const body = src.match(/function sha256\(str\) \{[\s\S]*?\n  \}/)[0];
  vm.runInContext(body + '; this.__sha256 = sha256;', vm.createContext(g), {
    filename: 'sha256'
  });

  return Promise.all([
    g.__sha256('A@B.c'),
    g.__sha256('a@b.c'),
    g.__sha256('  a@b.c  '),
    g.__sha256('')
  ]).then(([upper, lower, padded, empty]) => {
    assert.equal(upper, lower, 'case is not normalised before hashing');
    assert.equal(padded, lower, 'surrounding whitespace is not trimmed before hashing');
    assert.match(lower, /^[0-9a-f]{64}$/, 'not a hex sha256 digest');
    assert.equal(empty, null, 'an empty address produced a hash — user_hash must be absent instead');
  });
});

/* ═══════════════════════════════════════════════════ push hygiene + honeypot */

test('empty values are stripped from every push, page_lang is on all of them', () => {
  const { dataLayer } = run({ consentKit: fakeCK(null), lang: 'ro' });

  // Reach the push helper the same way the page does — through a real event.
  dataLayer.push({ event: 'ck_consent_update' });
  const ours = dataLayer.filter((e) => e && e.event === 'gtm.js');
  assert.equal(ours.length, 1, 'the container start event was not pushed');

  /* The rule itself is asserted on the source: every push goes through one
     helper, and that helper drops '' / null / undefined. Stated here because
     a GTM variable reading a blank string becomes a «(not set)» row rather
     than an absent dimension. */
  assert.match(ANALYTICS, /if \(v === '' \|\| v === null \|\| v === undefined\) continue;/,
    'the push helper no longer strips empty values');
  assert.match(ANALYTICS, /var out = \{ page_lang: pageLang \};/,
    'page_lang is no longer stamped on every event');
});

test('a filled honeypot silences every event for that form', () => {
  /* app.js already sends the honeypot to the server on every request; this is
     the same signal applied to measurement. Checked at PUSH time rather than
     at bind time, because ck_scan_start fires on the first keystroke and a bot
     may fill the trap after it. */
  assert.match(ANALYTICS, /function pushForm\(form, obj\) \{\s*if \(hpFilled\(form\)\) return;/,
    'form events no longer consult the honeypot before pushing');
  assert.match(ANALYTICS, /input\[name="hp"\]/,
    'the honeypot field is not read');

  // Every scan event goes through pushForm, never the bare push.
  const scanPushes = [...ANALYTICS.matchAll(/(push|pushForm)\(form, \{[\s\S]*?event: '(ck_scan_[a-z_]+)'/g)];
  assert.ok(scanPushes.length >= 4, 'the scan events were not found in the expected shape');
  for (const [, fn, event] of scanPushes) {
    assert.equal(fn, 'pushForm', `${event} bypasses the honeypot guard`);
  }
});

/* ══════════════════════════════════════════════════════════ the constants */

test('the container id is a named constant and appears once', () => {
  assert.match(ANALYTICS, /var GTM_ID = 'GTM-5Q76HZBB';/,
    'the GTM container id is not a named constant');
  assert.equal((ANALYTICS.match(/GTM-5Q76HZBB/g) || []).length, 1,
    'the container id is written out more than once');
});

test('the site copy says analytics waits for the answer', () => {
  /* SPEC-V1.26 §2: the page states plainly what it does to its own visitors.
     Asserted through the dictionaries, so it exists in all three languages
     rather than only the one someone happened to edit. */
  for (const { code } of LANGS) {
    const dict = JSON.parse(
      readFileSync(join(SITE_DIR, 'src', 'i18n', `${code}.json`), 'utf8')
    );
    assert.ok(dict.devOwnAnalytics,
      `${code}.json has no devOwnAnalytics line`);
    assert.ok(dict.devOwnAnalytics.length > 20,
      `the ${code} line is too short to say anything`);
  }

  const html = renderPage(readTemplate(), 'ru');
  assert.ok(html.includes('после вашего ответа баннеру'),
    'the Russian page does not carry the sentence');
});
