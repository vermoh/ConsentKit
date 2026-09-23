/* SPEC-V1.29 §2 — the landing page's attribution record: first-touch source,
 * last-touch click ids, 90 days.
 *
 * WHAT IS AT RISK
 * Until V1.29 site/analytics.js kept the FIRST record it ever stored and never
 * merged the current address into it. For the visit's source that is right.
 * For click ids it is wrong in the way that costs money: a buyer who came from
 * Meta a week ago and returns through a Google ad is carried to the cabinet
 * with the old fbclid and no gclid, and the Google Ads conversion has nothing
 * to attach to. And a click id with no date cannot be checked against the Ads
 * 90-day window at all.
 *
 * So the rules pinned here are:
 *   - a non-empty click id in the address replaces the stored one, with a new
 *     `<name>_at`; an absent one leaves the stored one alone;
 *   - a click id older than CLICK_TTL_DAYS (or with no date) is gone on READ,
 *     from memory and from links, before any write;
 *   - the visit's source (utm_*, referrer, landing_page, first_seen) is still
 *     first-touch, whole;
 *   - R2 still holds: storage changes only on a consent signal.
 *
 * HOW. The same vm technique as test/site-analytics.test.mjs (and, for the
 * client, test/consent-mode.test.mjs): the IIFE runs against a stub window /
 * document / localStorage. The clock is a Date subclass the test controls, so
 * «a week later» and «91 days later» are exact, not a race with the wall
 * clock.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import vm from 'node:vm';
import { webcrypto } from 'node:crypto';

import { SITE_DIR } from '../tools/build-site.mjs';

const ANALYTICS = readFileSync(join(SITE_DIR, 'analytics.js'), 'utf8');
const ATTR_KEY = 'ck_attr';
const DAY = 24 * 60 * 60 * 1000;
const T0 = Date.parse('2026-09-01T10:00:00.000Z');

/* A Date whose «now» is `clock.now`. Arguments are forwarded untouched, so
   parsing a stored ISO string still works. The holder is mutable, so time can
   pass within one page load. */
function clockAt(clock) {
  return class FakeDate extends Date {
    constructor(...args) {
      if (args.length === 0) super(clock.now);
      else super(...args);
    }
    static now() { return clock.now; }
  };
}

/** A ConsentKit stub: `cats` is the granted set, or null for «not decided». */
function fakeCK(cats) {
  return {
    allowed: (c) => !!(cats && cats[c]),
    getState: () => ({ decided: cats !== null, categories: cats || {} })
  };
}

/* One page load. `storage` is copied in; the returned `store` is what the page
   left behind, and is passed to the next load to chain a scenario. */
function load({
  href,
  now = T0,
  storage = {},
  consentKit = fakeCK(null),
  links = ['https://app.ecomconsult.net/'],
  referrer = 'https://www.google.com/'
}) {
  const store = { ...storage };
  const anchors = links.map((h) => {
    const attrs = new Map([['href', h]]);
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
  const doc = {
    referrer,
    documentElement: { lang: 'ru' },
    head: { appendChild(el) { return el; } },
    body: {},
    createElement(tag) { return { tagName: String(tag).toUpperCase(), src: '' }; },
    getElementsByTagName() { return []; },
    getElementById() { return null; },
    querySelector() { return null; },
    querySelectorAll(sel) { return sel === 'a[href]' ? anchors : []; },
    addEventListener() {}
  };

  g.window = g;
  g.self = g;
  g.document = doc;
  g.location = { href, search: url.search, pathname: url.pathname, hostname: url.hostname };
  g.URL = URL;
  g.URLSearchParams = URLSearchParams;
  g.TextEncoder = TextEncoder;
  g.crypto = webcrypto;
  const clock = { now };
  g.Date = clockAt(clock);
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
  g.dataLayer = [];
  if (consentKit) g.ConsentKit = consentKit;

  vm.runInContext(ANALYTICS, vm.createContext(g), { filename: 'site/analytics.js' });

  const saved = () => (store[ATTR_KEY] ? JSON.parse(store[ATTR_KEY]) : undefined);
  const link = (i = 0) => new URL(anchors[i].getAttribute('href'));
  const setNow = (ms) => { clock.now = ms; };
  return { store, saved, link, anchors, setNow, dataLayer: g.dataLayer };
}

const SITE = 'https://consentkit.ecomconsult.net/ru/';

/* ══════════════════════════════════════════════════════ the constant */

test('CLICK_TTL_DAYS is 90 — the Google Ads conversion window', () => {
  /* One constant in each of the three places (landing, cabinet, server),
     each pinned. Changing it here alone would make the landing carry clicks
     the server then refuses, or drop clicks the server would have sent. */
  assert.match(ANALYTICS, /var CLICK_TTL_DAYS = 90;/,
    'CLICK_TTL_DAYS is not the named constant 90');
  assert.equal((ANALYTICS.match(/CLICK_TTL_DAYS/g) || []).length >= 2, true,
    'CLICK_TTL_DAYS is declared but never used');
});

/* ══════════════════════════════════════ SPEC §5, acceptance steps 1–3 */

test('SPEC §5 steps 1–3: organic source, then gclid TEST_A, then TEST_B', () => {
  // 1. Incognito → ?utm_source=organic_test → accept the banner.
  const s1 = load({ href: SITE + '?utm_source=organic_test', now: T0 });
  assert.equal(s1.saved(), undefined, 'written before the banner was answered (R2)');
  s1.dataLayer.push({ event: 'ck_consent_update' });
  s1.dataLayer.push({ event: 'ck_consent_analytics' });
  const r1 = s1.saved();
  assert.ok(r1, 'accepting the banner did not create ck_attr');
  assert.equal(r1.utm_source, 'organic_test');
  assert.equal(r1.gclid, undefined);

  // 2. ?gclid=TEST_A, a day later; consent is already on record.
  const s2 = load({
    href: SITE + '?gclid=TEST_A',
    now: T0 + DAY,
    storage: s1.store,
    consentKit: fakeCK({ analytics: true })
  });
  const r2 = s2.saved();
  assert.equal(r2.gclid, 'TEST_A', 'the first gclid was not recorded');
  assert.equal(r2.gclid_at, new Date(T0 + DAY).toISOString(), 'gclid_at is not the moment of the click');
  assert.equal(r2.utm_source, 'organic_test');

  // 3. ?gclid=TEST_B, a week after that.
  const s3 = load({
    href: SITE + '?gclid=TEST_B',
    now: T0 + 8 * DAY,
    storage: s2.store,
    consentKit: fakeCK({ analytics: true })
  });
  const r3 = s3.saved();
  assert.equal(r3.gclid, 'TEST_B', 'the later gclid did not replace the earlier one — still first-touch');
  assert.equal(r3.gclid_at, new Date(T0 + 8 * DAY).toISOString(), 'gclid_at did not move with the new click');
  assert.ok(Date.parse(r3.gclid_at) > Date.parse(r2.gclid_at));
  assert.equal(r3.utm_source, 'organic_test', 'the first-touch source was lost to the later visit');
  assert.equal(r3.first_seen, r1.first_seen, 'first_seen moved');
});

/* ══════════════════════════════════════════════════════ last-touch rules */

test('an empty or absent click id does not erase a stored one', () => {
  const stored = {
    gclid: 'KEEP', gclid_at: new Date(T0).toISOString(),
    utm_source: 'ads', landing_page: '/ru/', first_seen: new Date(T0).toISOString()
  };
  for (const href of [SITE + '?gclid=', SITE + '?utm_source=newsletter', SITE]) {
    const p = load({
      href,
      now: T0 + 3 * DAY,
      storage: { [ATTR_KEY]: JSON.stringify(stored) },
      consentKit: fakeCK({ analytics: true })
    });
    p.dataLayer.push({ event: 'ck_consent_analytics' });
    assert.deepEqual(p.saved(), stored, `${href}: the stored record changed`);
    assert.equal(p.link().searchParams.get('gclid'), 'KEEP', `${href}: the link lost the stored gclid`);
  }
});

test('a click id older than 90 days disappears on read', () => {
  const at = (days) => new Date(T0 - days * DAY).toISOString();
  const base = { utm_source: 'ads', landing_page: '/ru/', first_seen: at(200) };

  // The boundary, both sides of it.
  const young = load({
    href: SITE, now: T0,
    storage: { [ATTR_KEY]: JSON.stringify({ ...base, gclid: 'YOUNG', gclid_at: at(89) }) },
    consentKit: fakeCK({ analytics: true })
  });
  assert.equal(young.saved().gclid, 'YOUNG', 'an 89-day-old click was dropped');
  assert.equal(young.link().searchParams.get('gclid'), 'YOUNG');

  const old = load({
    href: SITE, now: T0,
    storage: { [ATTR_KEY]: JSON.stringify({ ...base, gclid: 'OLD', gclid_at: at(91) }) },
    consentKit: fakeCK({ analytics: true })
  });
  const r = old.saved();
  assert.equal(r.gclid, undefined, 'a 91-day-old click survived');
  assert.equal(r.gclid_at, undefined, 'the date outlived its click id');
  assert.equal(r.utm_source, 'ads', 'pruning the click took the first-touch source with it');
  assert.equal(old.link().searchParams.get('gclid'), null, 'the link carried an expired click id');
  assert.equal(old.link().searchParams.get('gclid_at'), null);

  // A click id with no date, or a date that is not one, is dropped the same way.
  for (const bad of [{ gclid: 'NODATE' }, { gclid: 'BAD', gclid_at: 'yesterday' }]) {
    const p = load({
      href: SITE, now: T0,
      storage: { [ATTR_KEY]: JSON.stringify({ ...base, ...bad }) },
      consentKit: fakeCK({ analytics: true })
    });
    assert.equal(p.saved().gclid, undefined, `${JSON.stringify(bad)} survived the read`);
    assert.equal(p.link().searchParams.get('gclid'), null);
  }
});

test('R2: an undecided visitor with an expired click keeps storage byte-identical', () => {
  /* Pruning is a READ rule. Cleaning the stored copy is a write, and a write
     still needs consent — the expired id disappears from memory and links
     only, until the next consented write. */
  const raw = JSON.stringify({
    gclid: 'OLD', gclid_at: new Date(T0 - 120 * DAY).toISOString(),
    utm_source: 'ads', first_seen: new Date(T0 - 120 * DAY).toISOString()
  });
  const p = load({ href: SITE, now: T0, storage: { [ATTR_KEY]: raw }, consentKit: fakeCK(null) });
  assert.equal(p.store[ATTR_KEY], raw, 'storage was rewritten without consent');
  assert.equal(p.link().searchParams.get('gclid'), null, 'the expired gclid travelled on the link');
  // Positive control: the file ran and decorated with what is still valid.
  assert.equal(p.link().searchParams.get('utm_source'), 'ads');
});

test('a newer click written by another tab is not overwritten by an older page load', () => {
  /* storeAttr re-reads and re-merges before writing. This page loaded with
     gclid A at T0; before the visitor answered its banner, another tab stored
     gclid B at T0+1h. The later click must survive this page's write. */
  const p = load({ href: SITE + '?gclid=A&utm_source=ads', now: T0 });
  const other = {
    gclid: 'B', gclid_at: new Date(T0 + 3600 * 1000).toISOString(),
    utm_source: 'ads', landing_page: '/ru/', first_seen: new Date(T0 - DAY).toISOString()
  };
  p.store[ATTR_KEY] = JSON.stringify(other);
  p.setNow(T0 + 2 * 3600 * 1000); // the visitor answers the banner an hour after that
  p.dataLayer.push({ event: 'ck_consent_marketing' });
  const r = p.saved();
  assert.equal(r.gclid, 'B', 'the other tab\'s newer click was overwritten');
  assert.equal(r.first_seen, other.first_seen, 'the other tab\'s first source was overwritten');
});

/* ══════════════════════════════════════════════════════ first-touch rules */

test('utm_source from the first visit survives a later visit with utm_source=other', () => {
  const s1 = load({ href: SITE + '?utm_source=first', now: T0, consentKit: fakeCK({ analytics: true }) });
  assert.equal(s1.saved().utm_source, 'first');

  const s2 = load({
    href: SITE + '?utm_source=other&utm_medium=cpc',
    now: T0 + 10 * DAY,
    storage: s1.store,
    consentKit: fakeCK({ analytics: true })
  });
  const r = s2.saved();
  assert.equal(r.utm_source, 'first', 'a later utm_source overwrote the first one');
  /* All or nothing: the first visit had no utm_medium, and the second visit's
     must not be grafted onto it — «first / cpc» is a campaign that never ran. */
  assert.equal(r.utm_medium, undefined, 'a later utm_medium was mixed into the first source');
  assert.equal(r.first_seen, s1.saved().first_seen);
  assert.equal(s2.link().searchParams.get('utm_source'), 'first');
});

/* ══════════════════════════════════════════════════ carrying it to the cabinet */

test('the cabinet link carries gclid and gclid_at', () => {
  const p = load({ href: SITE + '?gclid=TEST_A&utm_source=ads', now: T0 });
  const u = p.link();
  assert.equal(u.searchParams.get('gclid'), 'TEST_A');
  assert.equal(u.searchParams.get('gclid_at'), new Date(T0).toISOString(),
    'the cabinet link does not carry the click date');
  assert.equal(u.searchParams.get('utm_source'), 'ads');
  // R2 control: carried, not stored.
  assert.equal(p.saved(), undefined);
});

test('a link that already carries its own gclid is not given our date for it', () => {
  const p = load({
    href: SITE + '?gclid=OURS',
    now: T0,
    links: ['https://app.ecomconsult.net/?gclid=AUTHORED']
  });
  const u = p.link();
  assert.equal(u.searchParams.get('gclid'), 'AUTHORED');
  assert.equal(u.searchParams.get('gclid_at'), null,
    'the authored gclid was paired with a date that belongs to another click');
});

test('keys outside the whitelist never reach storage or a link', () => {
  const stored = {
    gclid: 'G', gclid_at: new Date(T0).toISOString(),
    utm_source: 'ads', first_seen: new Date(T0).toISOString(), evil: 'x'
  };
  const p = load({
    href: SITE,
    now: T0 + DAY,
    storage: { [ATTR_KEY]: JSON.stringify(stored) },
    consentKit: fakeCK({ analytics: true })
  });
  assert.equal(p.link().searchParams.get('evil'), null, 'a non-whitelisted key was put on the link');
  assert.equal(p.saved().evil, undefined, 'a non-whitelisted key survived the merge');
  assert.equal(p.saved().gclid, 'G');
});
